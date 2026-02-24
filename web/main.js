// ESP32 HTTP Communicator — kommuniziert per fetch() mit dem ESP32 Access Point
class ESP32Controller {
    constructor() {
        // Base URL des ESP32 (wird automatisch erkannt wenn Seite vom ESP32 kommt)
        this.baseUrl = window.location.origin; // z.B. http://192.168.4.1
        this.isConnected = false;
        this.audioFiles = [];
        this.isRecording = false;
        this.currentAudioLevel = 0;
        this.isStreaming = false;
        this.streamInterval = null;
        this.statusInterval = null;

        // Audio waveform buffer for visualization
        this.waveformBuffer = [];
        this.maxWaveformSamples = 200;

        // Initialize audio visualization
        this.initializeAudioVisualization();
    }

    // ===== Audio Visualization =====

    initializeAudioVisualization() {
        this.canvas = document.getElementById('audioCanvas');
        this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
        if (this.ctx) {
            this.animateAudioLevel();
        }
    }

    animateAudioLevel() {
        const animate = () => {
            this.drawAudioVisualization();
            requestAnimationFrame(animate);
        };
        animate();
    }

    drawAudioVisualization() {
        if (!this.ctx) return;

        const width = this.canvas.width;
        const height = this.canvas.height;
        const centerY = height / 2;

        // Clear canvas
        this.ctx.fillStyle = '#1a1a2e';
        this.ctx.fillRect(0, 0, width, height);

        // Draw grid lines
        this.ctx.strokeStyle = '#2a2a4e';
        this.ctx.lineWidth = 1;
        for (let i = 0; i <= 10; i++) {
            const y = (height / 10) * i;
            this.ctx.beginPath();
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(width, y);
            this.ctx.stroke();
        }
        for (let i = 0; i <= 20; i++) {
            const x = (width / 20) * i;
            this.ctx.beginPath();
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, height);
            this.ctx.stroke();
        }

        // Center line
        this.ctx.strokeStyle = '#3a3a5e';
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        this.ctx.moveTo(0, centerY);
        this.ctx.lineTo(width, centerY);
        this.ctx.stroke();

        // Draw waveform from buffer
        if (this.waveformBuffer.length > 1) {
            const stepX = width / this.maxWaveformSamples;

            // Filled waveform area
            this.ctx.beginPath();
            this.ctx.moveTo(0, centerY);
            for (let i = 0; i < this.waveformBuffer.length; i++) {
                const x = i * stepX;
                const normalizedLevel = Math.min(this.waveformBuffer[i] / 4096, 1);
                const y = centerY - (normalizedLevel * (height / 2 - 10));
                if (i === 0) this.ctx.moveTo(x, y);
                else this.ctx.lineTo(x, y);
            }
            for (let i = this.waveformBuffer.length - 1; i >= 0; i--) {
                const x = i * stepX;
                const normalizedLevel = Math.min(this.waveformBuffer[i] / 4096, 1);
                const y = centerY + (normalizedLevel * (height / 2 - 10));
                this.ctx.lineTo(x, y);
            }
            this.ctx.closePath();

            const gradient = this.ctx.createLinearGradient(0, 0, 0, height);
            gradient.addColorStop(0, this.isRecording ? 'rgba(220, 53, 69, 0.8)' : 'rgba(40, 167, 69, 0.8)');
            gradient.addColorStop(0.5, this.isRecording ? 'rgba(220, 53, 69, 0.3)' : 'rgba(40, 167, 69, 0.3)');
            gradient.addColorStop(1, this.isRecording ? 'rgba(220, 53, 69, 0.8)' : 'rgba(40, 167, 69, 0.8)');
            this.ctx.fillStyle = gradient;
            this.ctx.fill();

            // Upper outline
            this.ctx.strokeStyle = this.isRecording ? '#dc3545' : '#28a745';
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            for (let i = 0; i < this.waveformBuffer.length; i++) {
                const x = i * stepX;
                const normalizedLevel = Math.min(this.waveformBuffer[i] / 4096, 1);
                const y = centerY - (normalizedLevel * (height / 2 - 10));
                if (i === 0) this.ctx.moveTo(x, y);
                else this.ctx.lineTo(x, y);
            }
            this.ctx.stroke();

            // Lower outline
            this.ctx.beginPath();
            for (let i = 0; i < this.waveformBuffer.length; i++) {
                const x = i * stepX;
                const normalizedLevel = Math.min(this.waveformBuffer[i] / 4096, 1);
                const y = centerY + (normalizedLevel * (height / 2 - 10));
                if (i === 0) this.ctx.moveTo(x, y);
                else this.ctx.lineTo(x, y);
            }
            this.ctx.stroke();
        }

        // Threshold lines
        const thresholdElement = document.getElementById('threshold');
        if (thresholdElement) {
            const threshold = parseInt(thresholdElement.value);
            const normalizedThreshold = Math.min(threshold / 4096, 1);
            const thresholdYTop = centerY - (normalizedThreshold * (height / 2 - 10));
            const thresholdYBottom = centerY + (normalizedThreshold * (height / 2 - 10));

            this.ctx.strokeStyle = '#ffc107';
            this.ctx.lineWidth = 2;
            this.ctx.setLineDash([5, 5]);
            this.ctx.beginPath();
            this.ctx.moveTo(0, thresholdYTop);
            this.ctx.lineTo(width, thresholdYTop);
            this.ctx.stroke();
            this.ctx.beginPath();
            this.ctx.moveTo(0, thresholdYBottom);
            this.ctx.lineTo(width, thresholdYBottom);
            this.ctx.stroke();
            this.ctx.setLineDash([]);
            this.ctx.fillStyle = '#ffc107';
            this.ctx.font = 'bold 12px Arial';
            this.ctx.fillText(`Threshold: ${threshold}`, 10, thresholdYTop - 8);
        }

        // Current level indicator on the right
        if (this.currentAudioLevel > 0) {
            const normalizedLevel = Math.min(this.currentAudioLevel / 4096, 1);
            const barHeight = normalizedLevel * (height / 2 - 10);
            this.ctx.fillStyle = '#2a2a4e';
            this.ctx.fillRect(width - 35, 10, 25, height - 20);
            this.ctx.fillStyle = this.isRecording ? '#dc3545' : '#28a745';
            this.ctx.fillRect(width - 35, centerY - barHeight, 25, barHeight * 2);
            this.ctx.fillStyle = '#fff';
            this.ctx.font = '10px Arial';
            this.ctx.fillText(`${this.currentAudioLevel}`, width - 33, 25);
        }

        // Recording indicator
        if (this.isRecording) {
            this.ctx.fillStyle = '#dc3545';
            this.ctx.font = 'bold 16px Arial';
            this.ctx.fillText('● RECORDING', 10, 25);
        }

        // Streaming indicator
        if (this.isStreaming) {
            this.ctx.fillStyle = '#17a2b8';
            this.ctx.font = 'bold 12px Arial';
            this.ctx.fillText('● LIVE', width - 80, 25);
        } else if (this.isConnected) {
            this.ctx.fillStyle = '#6c757d';
            this.ctx.font = '12px Arial';
            this.ctx.fillText('○ PAUSED', width - 80, 25);
        }
    }

    addWaveformSample(level) {
        this.waveformBuffer.push(level);
        while (this.waveformBuffer.length > this.maxWaveformSamples) {
            this.waveformBuffer.shift();
        }
    }

    updateLevelIndicator(level) {
        const indicator = document.getElementById('level-indicator');
        const valueDisplay = document.getElementById('level-value');
        if (indicator && valueDisplay) {
            const percentage = Math.min((level / 2048) * 100, 100);
            indicator.style.width = percentage + '%';
            valueDisplay.textContent = level;
        }
    }

    // ===== HTTP API Kommunikation =====

    async apiFetch(path, options = {}) {
        try {
            const resp = await fetch(this.baseUrl + path, {
                ...options,
                signal: AbortSignal.timeout(options.timeout || 15000)
            });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            return resp;
        } catch (err) {
            console.error(`API Fehler ${path}:`, err);
            throw err;
        }
    }

    async apiJson(path, options = {}) {
        const resp = await this.apiFetch(path, options);
        return resp.json();
    }

    // Verbindung testen (einfach /api/status abrufen)
    async connect() {
        try {
            const data = await this.apiJson('/api/status');
            this.isConnected = true;
            this.log('Verbunden mit ESP32');
            this.applyStatusData(data);

            // Regelmäßig Status abfragen (alle 5 Sek)
            this.statusInterval = setInterval(() => this.fetchStatus(), 5000);
            return true;
        } catch (err) {
            this.isConnected = false;
            throw new Error('ESP32 nicht erreichbar. Bist du mit dem WLAN "ESP32-Recorder" verbunden?');
        }
    }

    async disconnect() {
        this.isConnected = false;
        if (this.statusInterval) { clearInterval(this.statusInterval); this.statusInterval = null; }
        if (this.streamInterval) { clearInterval(this.streamInterval); this.streamInterval = null; }
        this.isStreaming = false;
        this.log('Verbindung getrennt');
    }

    // ===== API Actions =====

    async fetchStatus() {
        try {
            const data = await this.apiJson('/api/status');
            this.applyStatusData(data);
        } catch (err) {
            if (this.isConnected) {
                this.isConnected = false;
                updateConnectionStatus(false);
                this.log('Verbindung verloren');
            }
        }
    }

    applyStatusData(data) {
        // Threshold-Slider synchronisieren
        const slider = document.getElementById('threshold');
        const valSpan = document.getElementById('threshold-value');
        if (slider && data.threshold !== undefined) {
            slider.value = data.threshold;
            if (valSpan) valSpan.textContent = data.threshold;
        }

        // Recorder-Status anzeigen
        this.updateRecorderStatus(
            data.current_dir_number,
            data.current_rec_number,
            data.new_rec_flag,
            data.usb_connected
        );
    }

    async setThreshold(value) {
        const data = await this.apiJson('/api/threshold?value=' + value, { method: 'POST' });
        this.log('Threshold gesetzt: ' + data.threshold);
        return data;
    }

    async getThreshold() {
        const data = await this.apiJson('/api/threshold');
        const slider = document.getElementById('threshold');
        const valSpan = document.getElementById('threshold-value');
        if (slider) slider.value = data.threshold;
        if (valSpan) valSpan.textContent = data.threshold;
        this.log('Threshold: ' + data.threshold);
        return data;
    }

    async triggerRecording() {
        this.isRecording = true;
        this.log('Recording gestartet...');
        const statusEl = document.querySelector('#connection-status');
        if (statusEl) statusEl.innerHTML = 'Connected <span class="recording-indicator">● REC</span>';

        try {
            // Recording dauert RECORDING_LENGTH Sekunden, daher langer Timeout
            const data = await this.apiJson('/api/record', { method: 'POST', timeout: 30000 });
            this.log('Recording abgeschlossen');
            this.applyStatusData(data);
        } catch (err) {
            this.log('Recording Fehler: ' + err.message);
        } finally {
            this.isRecording = false;
            if (statusEl && this.isConnected) statusEl.innerHTML = 'Connected';
        }
    }

    async getSDCardInfo() {
        const data = await this.apiJson('/api/status');
        this.log(`SD-Karte: ${data.sd_total_mb} MB total, ${data.sd_used_mb} MB belegt, ${data.sd_free_mb} MB frei`);
    }

    async fetchFileList() {
        const files = await this.apiJson('/api/files');
        this.audioFiles = files.map(f => ({
            name: f.path.split('/').pop(),
            path: f.path,
            timestamp: 'SD-Karte',
            size: this.formatFileSize(f.size),
            sizeBytes: f.size
        }));
        this.updateFileList();
        this.log(files.length + ' Dateien gefunden');
    }

    async downloadFile(filePath) {
        try {
            const resp = await this.apiFetch('/api/download?path=' + encodeURIComponent(filePath), { timeout: 60000 });
            const blob = await resp.blob();
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = filePath.split('/').pop();
            link.style.display = 'none';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            this.log('Download: ' + filePath);
        } catch (err) {
            this.log('Download Fehler: ' + err.message);
        }
    }

    // ===== Audio Level Streaming (Polling) =====

    async startStreaming() {
        if (!this.isConnected) {
            this.log('Nicht verbunden');
            return;
        }
        this.isStreaming = true;

        this.streamInterval = setInterval(async () => {
            if (!this.isConnected || !this.isStreaming) return;
            try {
                const data = await this.apiJson('/api/level', { timeout: 2000 });
                this.currentAudioLevel = data.level;
                this.updateLevelIndicator(data.level);
                this.addWaveformSample(data.level);
            } catch (err) {
                // Ignoriere einzelne Fehler beim Streaming
            }
        }, 100); // ~10 Samples pro Sekunde

        this.log('Live-Ansicht gestartet');
    }

    async stopStreaming() {
        this.isStreaming = false;
        if (this.streamInterval) {
            clearInterval(this.streamInterval);
            this.streamInterval = null;
        }
        this.log('Live-Ansicht gestoppt');
    }

    // ===== UI Helpers =====

    formatFileSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    updateFileList() {
        const fileListElement = document.getElementById('file-list');
        if (!fileListElement) return;

        if (this.audioFiles.length === 0) {
            fileListElement.innerHTML = '<p>Keine Dateien gefunden. Starte eine Aufnahme oder lade die Liste neu.</p>';
            return;
        }

        let html = '';
        this.audioFiles.forEach((file, index) => {
            const nrfMatch = file.name.match(/_nrf(\d)/);
            const isNewRecording = nrfMatch ? nrfMatch[1] === '1' : null;
            const itemClass = isNewRecording === true ? 'new-recording' :
                              isNewRecording === false ? 'continuation' : '';
            const nrfBadge = isNewRecording === true ?
                '<span class="nrf-badge new">NEU</span>' :
                isNewRecording === false ?
                '<span class="nrf-badge cont">FORTS.</span>' : '';

            html += `
                <div class="audio-file-item ${itemClass}">
                    <div class="file-info">
                        <div class="file-name">${file.name}${nrfBadge}</div>
                        <div class="file-details">Pfad: ${file.path || '-'} | Größe: ${file.size}</div>
                    </div>
                    <div class="file-controls">
                        <button class="download-btn" onclick="downloadFile('${file.path}')" title="Herunterladen">
                            Download
                        </button>
                        <button onclick="removeFileFromList(${index})" title="Aus Liste entfernen">
                            Entfernen
                        </button>
                    </div>
                </div>
            `;
        });

        fileListElement.innerHTML = html;
    }

    updateRecorderStatus(dirNum, recNum, nrf, usbConnected) {
        const dirEl = document.getElementById('current-dir');
        const recEl = document.getElementById('current-rec');
        const nrfEl = document.getElementById('new-rec-flag');
        const usbEl = document.getElementById('usb-status');

        if (dirEl && dirNum !== undefined) dirEl.textContent = dirNum;
        if (recEl && recNum !== undefined) recEl.textContent = recNum;
        if (nrfEl && nrf !== undefined) {
            nrfEl.textContent = nrf ? '1 (Neues Recording)' : '0 (Fortsetzung)';
            nrfEl.style.color = nrf ? '#28a745' : '#17a2b8';
        }
        if (usbEl && usbConnected !== undefined) {
            usbEl.textContent = usbConnected ? 'Ja' : 'Nein';
            usbEl.style.color = usbConnected ? '#28a745' : '#dc3545';
        }
    }

    log(msg) {
        console.log('[ESP32]', msg);
        const el = document.querySelector('.ausgabe');
        if (el) {
            const ts = new Date().toLocaleTimeString();
            el.textContent += `[${ts}] ${msg}\n`;
            el.scrollTop = el.scrollHeight;
        }
    }
}

// ===== Globale Instanz & UI-Funktionen =====
const esp32 = new ESP32Controller();

async function connectToESP32() {
    try {
        await esp32.connect();
        updateConnectionStatus(true);
    } catch (err) {
        alert(err.message);
        updateConnectionStatus(false);
    }
}

async function disconnectFromESP32() {
    await esp32.disconnect();
    updateConnectionStatus(false);
}

function updateConnectionStatus(connected) {
    const el = document.querySelector('#connection-status');
    if (el) {
        el.textContent = connected ? 'Connected' : 'Disconnected';
        el.className = connected ? 'connected' : 'disconnected';
    }
}

function setThreshold() {
    const val = document.getElementById('threshold').value;
    esp32.setThreshold(val).catch(err => console.error('Threshold setzen fehlgeschlagen:', err));
}

async function triggerRecording() {
    try { await esp32.triggerRecording(); } catch (err) { console.error(err); }
}

async function getSDCardInfo() {
    try { await esp32.getSDCardInfo(); } catch (err) { console.error(err); }
}

async function getStatus() {
    try { await esp32.fetchStatus(); esp32.log('Status aktualisiert'); } catch (err) { console.error(err); }
}

async function getThreshold() {
    try { await esp32.getThreshold(); } catch (err) { console.error(err); }
}

async function refreshAudioList() {
    try { await esp32.fetchFileList(); } catch (err) { console.error(err); }
}

function clearAudioDisplay() {
    esp32.audioFiles = [];
    esp32.updateFileList();
}

async function startAudioStream() {
    try {
        await esp32.startStreaming();
        document.getElementById('btn-start-stream').disabled = true;
        document.getElementById('btn-stop-stream').disabled = false;
    } catch (err) { console.error(err); }
}

async function stopAudioStream() {
    try {
        await esp32.stopStreaming();
        document.getElementById('btn-start-stream').disabled = false;
        document.getElementById('btn-stop-stream').disabled = true;
    } catch (err) { console.error(err); }
}

function clearWaveform() {
    esp32.waveformBuffer = [];
    esp32.currentAudioLevel = 0;
}

async function downloadFile(path) {
    try { await esp32.downloadFile(path); } catch (err) { console.error(err); }
}

function removeFileFromList(index) {
    esp32.audioFiles.splice(index, 1);
    esp32.updateFileList();
}

// ===== Initialisierung =====
document.addEventListener('DOMContentLoaded', function() {
    esp32.updateFileList();

    // Threshold-Slider Display aktualisieren
    const slider = document.getElementById('threshold');
    if (slider) {
        slider.addEventListener('input', function() {
            document.getElementById('threshold-value').textContent = this.value;
        });
    }

    // Automatisch verbinden (Seite kommt vom ESP32)
    connectToESP32();
});
