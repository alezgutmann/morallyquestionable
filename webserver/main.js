class ESP32SerialCommunicator {
    constructor() {
        this.port = null;
        this.reader = null;
        this.writer = null;
        this.isConnected = false;
        this.audioFiles = [];
        this.isRecording = false;
        this.currentAudioLevel = 0;
        
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
        
        // Clear canvas
        this.ctx.fillStyle = '#ffffff';
        this.ctx.fillRect(0, 0, width, height);
        
        // Draw grid lines
        this.ctx.strokeStyle = '#e9ecef';
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
        
        // Draw current audio level
        if (this.currentAudioLevel > 0) {
            const normalizedLevel = Math.min(this.currentAudioLevel / 2048, 1); // Normalize to 0-1
            const barHeight = normalizedLevel * height;
            
            // Draw level bar
            this.ctx.fillStyle = this.isRecording ? '#dc3545' : '#28a745';
            this.ctx.fillRect(width - 50, height - barHeight, 40, barHeight);
            
            // Draw level text
            this.ctx.fillStyle = '#333';
            this.ctx.font = '12px Arial';
            this.ctx.fillText(`${this.currentAudioLevel}`, width - 45, height - barHeight - 5);
        }
        
        // Draw recording indicator
        if (this.isRecording) {
            this.ctx.fillStyle = '#dc3545';
            this.ctx.font = 'bold 16px Arial';
            this.ctx.fillText('● RECORDING', 10, 25);
        }
        
        // Draw threshold line
        const thresholdElement = document.getElementById('threshold');
        if (thresholdElement) {
            const threshold = parseInt(thresholdElement.value);
            const thresholdY = height - (threshold / 2048) * height;
            
            this.ctx.strokeStyle = '#ffc107';
            this.ctx.lineWidth = 2;
            this.ctx.setLineDash([5, 5]);
            this.ctx.beginPath();
            this.ctx.moveTo(0, thresholdY);
            this.ctx.lineTo(width, thresholdY);
            this.ctx.stroke();
            this.ctx.setLineDash([]);
            
            // Threshold label
            this.ctx.fillStyle = '#ffc107';
            this.ctx.font = '12px Arial';
            this.ctx.fillText(`Threshold: ${threshold}`, 10, thresholdY - 5);
        }
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
        if (data.includes('RECORDING')) {
            this.onRecordingStarted();
        } else if (data.includes('COMPLETE')) {
            this.onRecordingCompleted(data);
        } else if (data.includes('5V over USB detected!')) {
            this.onUSBPowerDetected();
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
            html += `
                <div class="audio-file-item">
                    <div class="file-info">
                        <div class="file-name">${file.name}</div>
                        <div class="file-details">Recorded: ${file.timestamp} | Size: ${file.size}</div>
                    </div>
                    <div class="file-controls">
                        <button onclick="requestAudioFile('${file.path || file.name}')" title="Download file from ESP32">
                            📥 Download
                        </button>
                        <button onclick="removeFileFromList(${index})" title="Remove from list">
                            🗑️ Remove
                        </button>
                    </div>
                </div>
            `;
        });
        
        fileListElement.innerHTML = html;
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