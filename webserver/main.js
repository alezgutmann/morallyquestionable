class ESP32SerialCommunicator {
    constructor() {
        this.port = null;
        this.reader = null;
        this.writer = null;
        this.isConnected = false;
        this.audioFiles = [];
        this.isRecording = false;
        this.currentAudioLevel = 0;
        this.isStreaming = false;
        this.streamInterval = null;
        
        // Audio waveform buffer for visualization
        this.waveformBuffer = [];
        this.maxWaveformSamples = 200; // Number of samples to display
        
        // Initialize audio visualization
        this.initializeAudioVisualization();
    }

    // Initialize audio canvas and visualization
    initializeAudioVisualization() {
        this.canvas = document.getElementById('audioCanvas');
        this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
        
        if (this.ctx) {
            // Start animation loop for live visualization
            this.animateAudioLevel();
        }
    }

    // Animate the audio level visualization
    animateAudioLevel() {
        const animate = () => {
            this.drawAudioVisualization();
            requestAnimationFrame(animate);
        };
        animate();
    }

    // Draw audio visualization on canvas
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
        
        // Horizontal grid lines
        for (let i = 0; i <= 10; i++) {
            const y = (height / 10) * i;
            this.ctx.beginPath();
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(width, y);
            this.ctx.stroke();
        }
        
        // Vertical grid lines
        for (let i = 0; i <= 20; i++) {
            const x = (width / 20) * i;
            this.ctx.beginPath();
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, height);
            this.ctx.stroke();
        }
        
        // Draw center line
        this.ctx.strokeStyle = '#3a3a5e';
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        this.ctx.moveTo(0, centerY);
        this.ctx.lineTo(width, centerY);
        this.ctx.stroke();
        
        // Draw waveform from buffer
        if (this.waveformBuffer.length > 1) {
            const stepX = width / this.maxWaveformSamples;
            
            // Draw filled waveform area
            this.ctx.beginPath();
            this.ctx.moveTo(0, centerY);
            
            for (let i = 0; i < this.waveformBuffer.length; i++) {
                const x = i * stepX;
                const normalizedLevel = Math.min(this.waveformBuffer[i] / 4096, 1);
                const y = centerY - (normalizedLevel * (height / 2 - 10));
                
                if (i === 0) {
                    this.ctx.moveTo(x, y);
                } else {
                    this.ctx.lineTo(x, y);
                }
            }
            
            // Mirror the waveform (bottom half)
            for (let i = this.waveformBuffer.length - 1; i >= 0; i--) {
                const x = i * stepX;
                const normalizedLevel = Math.min(this.waveformBuffer[i] / 4096, 1);
                const y = centerY + (normalizedLevel * (height / 2 - 10));
                this.ctx.lineTo(x, y);
            }
            
            this.ctx.closePath();
            
            // Gradient fill for waveform
            const gradient = this.ctx.createLinearGradient(0, 0, 0, height);
            gradient.addColorStop(0, this.isRecording ? 'rgba(220, 53, 69, 0.8)' : 'rgba(40, 167, 69, 0.8)');
            gradient.addColorStop(0.5, this.isRecording ? 'rgba(220, 53, 69, 0.3)' : 'rgba(40, 167, 69, 0.3)');
            gradient.addColorStop(1, this.isRecording ? 'rgba(220, 53, 69, 0.8)' : 'rgba(40, 167, 69, 0.8)');
            this.ctx.fillStyle = gradient;
            this.ctx.fill();
            
            // Draw waveform outline
            this.ctx.strokeStyle = this.isRecording ? '#dc3545' : '#28a745';
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            for (let i = 0; i < this.waveformBuffer.length; i++) {
                const x = i * stepX;
                const normalizedLevel = Math.min(this.waveformBuffer[i] / 4096, 1);
                const y = centerY - (normalizedLevel * (height / 2 - 10));
                
                if (i === 0) {
                    this.ctx.moveTo(x, y);
                } else {
                    this.ctx.lineTo(x, y);
                }
            }
            this.ctx.stroke();
            
            // Bottom outline
            this.ctx.beginPath();
            for (let i = 0; i < this.waveformBuffer.length; i++) {
                const x = i * stepX;
                const normalizedLevel = Math.min(this.waveformBuffer[i] / 4096, 1);
                const y = centerY + (normalizedLevel * (height / 2 - 10));
                
                if (i === 0) {
                    this.ctx.moveTo(x, y);
                } else {
                    this.ctx.lineTo(x, y);
                }
            }
            this.ctx.stroke();
        }
        
        // Draw threshold lines (upper and lower)
        const thresholdElement = document.getElementById('threshold');
        if (thresholdElement) {
            const threshold = parseInt(thresholdElement.value);
            const normalizedThreshold = Math.min(threshold / 4096, 1);
            const thresholdYTop = centerY - (normalizedThreshold * (height / 2 - 10));
            const thresholdYBottom = centerY + (normalizedThreshold * (height / 2 - 10));
            
            this.ctx.strokeStyle = '#ffc107';
            this.ctx.lineWidth = 2;
            this.ctx.setLineDash([5, 5]);
            
            // Upper threshold line
            this.ctx.beginPath();
            this.ctx.moveTo(0, thresholdYTop);
            this.ctx.lineTo(width, thresholdYTop);
            this.ctx.stroke();
            
            // Lower threshold line
            this.ctx.beginPath();
            this.ctx.moveTo(0, thresholdYBottom);
            this.ctx.lineTo(width, thresholdYBottom);
            this.ctx.stroke();
            
            this.ctx.setLineDash([]);
            
            // Threshold label
            this.ctx.fillStyle = '#ffc107';
            this.ctx.font = 'bold 12px Arial';
            this.ctx.fillText(`Threshold: ${threshold}`, 10, thresholdYTop - 8);
        }
        
        // Draw current level indicator on the right
        if (this.currentAudioLevel > 0) {
            const normalizedLevel = Math.min(this.currentAudioLevel / 4096, 1);
            const barHeight = normalizedLevel * (height / 2 - 10);
            
            // Level bar background
            this.ctx.fillStyle = '#2a2a4e';
            this.ctx.fillRect(width - 35, 10, 25, height - 20);
            
            // Level bar (centered)
            this.ctx.fillStyle = this.isRecording ? '#dc3545' : '#28a745';
            this.ctx.fillRect(width - 35, centerY - barHeight, 25, barHeight * 2);
            
            // Level text
            this.ctx.fillStyle = '#fff';
            this.ctx.font = '10px Arial';
            this.ctx.fillText(`${this.currentAudioLevel}`, width - 33, 25);
        }
        
        // Draw recording indicator
        if (this.isRecording) {
            this.ctx.fillStyle = '#dc3545';
            this.ctx.font = 'bold 16px Arial';
            this.ctx.fillText('● RECORDING', 10, 25);
        }
        
        // Draw streaming indicator
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
    
    // Add sample to waveform buffer
    addWaveformSample(level) {
        this.waveformBuffer.push(level);
        
        // Remove oldest samples if buffer is full
        while (this.waveformBuffer.length > this.maxWaveformSamples) {
            this.waveformBuffer.shift();
        }
    }
    
    // Start streaming audio levels from ESP32
    async startStreaming() {
        if (!this.isConnected) {
            console.log('Not connected to ESP32');
            return;
        }
        
        this.isStreaming = true;
        await this.sendCommand('START_STREAM');
        
        // Request audio levels at regular intervals
        this.streamInterval = setInterval(async () => {
            if (this.isConnected && this.isStreaming) {
                try {
                    await this.sendCommand('GET_LEVEL');
                } catch (error) {
                    console.error('Error requesting level:', error);
                }
            }
        }, 50); // 20 samples per second
        
        console.log('Audio streaming started');
    }
    
    // Stop streaming audio levels
    async stopStreaming() {
        this.isStreaming = false;
        
        if (this.streamInterval) {
            clearInterval(this.streamInterval);
            this.streamInterval = null;
        }
        
        if (this.isConnected) {
            await this.sendCommand('STOP_STREAM');
        }
        
        console.log('Audio streaming stopped');
    }

    // Check if Web Serial API is supported
    isWebSerialSupported() {
        return 'serial' in navigator;
    }

    // Connect to ESP32
    async connect() {
        if (!this.isWebSerialSupported()) {
            throw new Error('Web Serial API is not supported in this browser. Use Chrome, Edge, or Opera.');
        }

        try {
            // Request a port and open the connection
            this.port = await navigator.serial.requestPort();
            
            // Open the serial port with ESP32 default settings
            await this.port.open({
                baudRate: 115200,  // Match your ESP32 Serial.begin(115200)
                dataBits: 8,
                stopBits: 1,
                parity: 'none'
            });

            // Set up reader and writer
            this.reader = this.port.readable.getReader();
            this.writer = this.port.writable.getWriter();
            this.isConnected = true;

            console.log('Connected to ESP32!');
            
            // Start reading data
            this.startReading();
            
            // Auto-query status after connection (with small delay for ESP32 to be ready)
            setTimeout(async () => {
                if (this.isConnected) {
                    await this.sendCommand('STATUS');
                    await this.sendCommand('GET_THRESHOLD');
                }
            }, 500);
            
            return true;
        } catch (error) {
            console.error('Error connecting to ESP32:', error);
            throw error;
        }
    }

    // Start reading data from ESP32
    async startReading() {
        try {
            while (this.isConnected && this.reader) {
                const { value, done } = await this.reader.read();
                if (done) break;

                // Convert received data to string
                const textDecoder = new TextDecoder();
                const receivedText = textDecoder.decode(value);
                
                // Handle received data
                this.handleReceivedData(receivedText);
            }
        } catch (error) {
            console.error('Error reading from ESP32:', error);
            if (this.isConnected) {
                this.disconnect();
            }
        }
    }

    // Handle data received from ESP32
    handleReceivedData(data) {
        console.log('Received from ESP32:', data);
        
        // Update UI or handle specific commands
        const outputElement = document.querySelector('.ausgabe');
        if (outputElement) {
            outputElement.textContent += data;
            outputElement.scrollTop = outputElement.scrollHeight;
        }

        // Parse audio level data (if ESP32 sends it)
        const levelMatch = data.match(/LEVEL:(\d+)/);
        if (levelMatch) {
            this.currentAudioLevel = parseInt(levelMatch[1]);
            this.updateLevelIndicator(this.currentAudioLevel);
            
            // Add to waveform buffer for visualization
            if (this.isStreaming) {
                this.addWaveformSample(this.currentAudioLevel);
            }
        }

        // Handle file listing
        if (data.includes('FILE_LIST_START')) {
            this.audioFiles = []; // Clear existing list
            this.isReceivingFileList = true;
        } else if (data.includes('FILE_LIST_END')) {
            this.isReceivingFileList = false;
            this.updateFileList();
        } else if (this.isReceivingFileList && data.startsWith('FILE:')) {
            // Parse file info: FILE:path:size
            const parts = data.split(':');
            if (parts.length >= 3) {
                const filePath = parts[1];
                const fileSize = parseInt(parts[2]) || 0;
                this.addFileFromList(filePath, fileSize);
            }
        }

        // Handle file data transfer
        if (data.startsWith('FILE_DATA_START:')) {
            // Parse: FILE_DATA_START:filename:size
            const parts = data.split(':');
            if (parts.length >= 3) {
                this.currentDownload = {
                    filename: parts[1],
                    size: parseInt(parts[2]),
                    data: new Uint8Array(0)
                };
                console.log(`Starting download: ${this.currentDownload.filename}`);
            }
        } else if (data.includes('FILE_DATA_END')) {
            if (this.currentDownload) {
                this.processDownloadedFile();
            }
        }

        // Parse specific messages from your ESP32
        if (data.includes('RECORDING ...')) {
            this.onRecordingStarted();
        } else if (data.includes('COMPLETE =>')) {
            this.onRecordingCompleted(data);
            // Parse dir/rec from completed filename
            const pathMatch = data.match(/dir(\d+)\/rec(\d+)_nrf(\d)/);
            if (pathMatch) {
                const dirNum = parseInt(pathMatch[1]);
                const recNum = parseInt(pathMatch[2]);
                const nrf = pathMatch[3] === '1';
                this.updateRecorderStatus(dirNum, recNum + 1, false, true); // Nach Recording: nrf wird false
            }
        } else if (data.includes('5V over USB detected!')) {
            this.onUSBPowerDetected();
        }
        
        // Parse threshold response
        const thresholdMatch = data.match(/(?:Current )?[Tt]hreshold:?\s*(\d+)/);
        if (thresholdMatch) {
            const threshold = parseInt(thresholdMatch[1]);
            const thresholdSlider = document.getElementById('threshold');
            const thresholdValue = document.getElementById('threshold-value');
            if (thresholdSlider) thresholdSlider.value = threshold;
            if (thresholdValue) thresholdValue.textContent = threshold;
        }
        
        // Parse USB status
        const usbMatch = data.match(/USB Power: (\w+)/);
        if (usbMatch) {
            this.updateRecorderStatus(undefined, undefined, undefined, usbMatch[1] === 'Connected');
        }
    }

    // Add file from ESP32 file list
    addFileFromList(filePath, fileSize) {
        const filename = filePath.split('/').pop(); // Get just the filename
        const fileInfo = {
            name: filename,
            path: filePath,
            timestamp: 'From ESP32',
            size: this.formatFileSize(fileSize)
        };
        
        this.audioFiles.push(fileInfo);
    }

    // Format file size for display
    formatFileSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    // Process downloaded audio file
    processDownloadedFile() {
        if (!this.currentDownload) return;
        
        try {
            // Create blob from downloaded data
            const blob = new Blob([this.currentDownload.data], { type: 'audio/wav' });
            const url = URL.createObjectURL(blob);
            
            // Create download link
            const link = document.createElement('a');
            link.href = url;
            link.download = this.currentDownload.filename;
            link.style.display = 'none';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            // Clean up
            URL.revokeObjectURL(url);
            console.log(`Downloaded: ${this.currentDownload.filename}`);
            
        } catch (error) {
            console.error('Error processing downloaded file:', error);
        }
        
        this.currentDownload = null;
    }

    // Update the level indicator bar
    updateLevelIndicator(level) {
        const indicator = document.getElementById('level-indicator');
        const valueDisplay = document.getElementById('level-value');
        
        if (indicator && valueDisplay) {
            const percentage = Math.min((level / 2048) * 100, 100);
            indicator.style.width = percentage + '%';
            valueDisplay.textContent = level;
        }
    }

    // Send data to ESP32
    async sendCommand(command) {
        if (!this.isConnected || !this.writer) {
            throw new Error('Not connected to ESP32');
        }

        try {
            const textEncoder = new TextEncoder();
            const data = textEncoder.encode(command + '\n');
            await this.writer.write(data);
            console.log('Sent to ESP32:', command);
        } catch (error) {
            console.error('Error sending to ESP32:', error);
            throw error;
        }
    }

    // Disconnect from ESP32
    async disconnect() {
        try {
            // Stop streaming first
            if (this.isStreaming) {
                await this.stopStreaming();
            }
            
            this.isConnected = false;
            
            if (this.reader) {
                await this.reader.cancel();
                await this.reader.releaseLock();
                this.reader = null;
            }
            
            if (this.writer) {
                await this.writer.releaseLock();
                this.writer = null;
            }
            
            if (this.port) {
                await this.port.close();
                this.port = null;
            }
            
            console.log('Disconnected from ESP32');
        } catch (error) {
            console.error('Error disconnecting:', error);
        }
    }

    // Event handlers for ESP32 messages
    onRecordingStarted() {
        console.log('ESP32 started recording');
        this.isRecording = true;
        
        // Add visual indicator
        const statusElement = document.querySelector('#connection-status');
        if (statusElement) {
            statusElement.innerHTML = 'Connected <span class="recording-indicator">● REC</span>';
        }
    }

    onRecordingCompleted(message) {
        console.log('ESP32 completed recording:', message);
        this.isRecording = false;
        
        // Remove recording indicator
        const statusElement = document.querySelector('#connection-status');
        if (statusElement) {
            statusElement.innerHTML = 'Connected';
        }
        
        // Extract filename from message if needed
        const filenameMatch = message.match(/=> (.+\.wav)/);
        if (filenameMatch) {
            const filename = filenameMatch[1];
            console.log('Recorded file:', filename);
            this.addAudioFile(filename);
        }
    }

    onUSBPowerDetected() {
        console.log('ESP32 detected USB power');
        // Handle USB power detection
    }

    // Add a new audio file to the list
    addAudioFile(filename) {
        const fileInfo = {
            name: filename,
            timestamp: new Date().toLocaleString(),
            size: 'Unknown' // Could be retrieved from ESP32 if needed
        };
        
        this.audioFiles.unshift(fileInfo); // Add to beginning of array
        this.updateFileList();
    }

    // Update the file list display
    updateFileList() {
        const fileListElement = document.getElementById('file-list');
        if (!fileListElement) return;
        
        if (this.audioFiles.length === 0) {
            fileListElement.innerHTML = '<p>No recorded files yet. Start recording to see files here.</p>';
            return;
        }
        
        let html = '';
        this.audioFiles.forEach((file, index) => {
            // Parse new_rec_flag from filename (e.g., rec0_nrf1.wav)
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
                        <div class="file-details">Path: ${file.path || '-'} | Size: ${file.size}</div>
                    </div>
                    <div class="file-controls">
                        <button onclick="requestAudioFile('${file.path || file.name}')" title="Download file from ESP32">
                            Download
                        </button>
                        <button onclick="removeFileFromList(${index})" title="Remove from list">
                            Remove
                        </button>
                    </div>
                </div>
            `;
        });
        
        fileListElement.innerHTML = html;
    }
    
    // Update recorder status display
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
}

// Global ESP32 communicator instance
const esp32 = new ESP32SerialCommunicator();

// UI Functions
async function connectToESP32() {
    try {
        await esp32.connect();
        updateConnectionStatus(true);
    } catch (error) {
        alert('Failed to connect to ESP32: ' + error.message);
        updateConnectionStatus(false);
    }
}

async function disconnectFromESP32() {
    await esp32.disconnect();
    updateConnectionStatus(false);
}

function updateConnectionStatus(connected) {
    const statusElement = document.querySelector('#connection-status');
    if (statusElement) {
        statusElement.textContent = connected ? 'Connected' : 'Disconnected';
        statusElement.className = connected ? 'connected' : 'disconnected';
    }
}

// Example functions to interact with your ESP32
async function setRecordingThreshold(threshold) {
    try {
        await esp32.sendCommand(`SET_THRESHOLD:${threshold}`);
    } catch (error) {
        console.error('Failed to set threshold:', error);
    }
}

async function triggerRecording() {
    try {
        await esp32.sendCommand('START_RECORDING');
    } catch (error) {
        console.error('Failed to trigger recording:', error);
    }
}

async function getSDCardInfo() {
    try {
        await esp32.sendCommand('GET_SD_INFO');
    } catch (error) {
        console.error('Failed to get SD card info:', error);
    }
}

async function getStatus() {
    try {
        await esp32.sendCommand('STATUS');
    } catch (error) {
        console.error('Failed to get status:', error);
    }
}

async function getThreshold() {
    try {
        await esp32.sendCommand('GET_THRESHOLD');
    } catch (error) {
        console.error('Failed to get threshold:', error);
    }
}

// Audio file management functions
async function refreshAudioList() {
    try {
        await esp32.sendCommand('LIST_FILES');
    } catch (error) {
        console.error('Failed to refresh audio list:', error);
    }
}

function clearAudioDisplay() {
    esp32.audioFiles = [];
    esp32.updateFileList();
    console.log('Audio file list cleared');
}

// Audio streaming functions
async function startAudioStream() {
    try {
        await esp32.startStreaming();
        document.getElementById('btn-start-stream').disabled = true;
        document.getElementById('btn-stop-stream').disabled = false;
    } catch (error) {
        console.error('Failed to start streaming:', error);
    }
}

async function stopAudioStream() {
    try {
        await esp32.stopStreaming();
        document.getElementById('btn-start-stream').disabled = false;
        document.getElementById('btn-stop-stream').disabled = true;
    } catch (error) {
        console.error('Failed to stop streaming:', error);
    }
}

function clearWaveform() {
    esp32.waveformBuffer = [];
    esp32.currentAudioLevel = 0;
    console.log('Waveform cleared');
}

async function requestAudioFile(filename) {
    try {
        await esp32.sendCommand(`GET_FILE:${filename}`);
        console.log(`Requested file: ${filename}`);
    } catch (error) {
        console.error('Failed to request file:', error);
    }
}

function removeFileFromList(index) {
    esp32.audioFiles.splice(index, 1);
    esp32.updateFileList();
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', function() {
    // Check Web Serial support
    if (!esp32.isWebSerialSupported()) {
        alert('Web Serial API is not supported. Please use Chrome, Edge, or Opera browser.');
        return;
    }

    console.log('ESP32 Serial Communicator initialized');
    
    // Initialize the file list display
    esp32.updateFileList();
    
    // You can add auto-connect logic here if needed
    // Or wait for user to click connect button
});