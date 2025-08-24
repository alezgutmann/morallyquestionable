class ESP32SerialCommunicator {
    constructor() {
        this.port = null;
        this.reader = null;
        this.writer = null;
        this.isConnected = false;
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
        // Update UI to show recording status
    }

    onRecordingCompleted(message) {
        console.log('ESP32 completed recording:', message);
        // Extract filename from message if needed
        const filenameMatch = message.match(/=> (.+\.wav)/);
        if (filenameMatch) {
            const filename = filenameMatch[1];
            console.log('Recorded file:', filename);
        }
    }

    onUSBPowerDetected() {
        console.log('ESP32 detected USB power');
        // Handle USB power detection
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

// Initialize when page loads
document.addEventListener('DOMContentLoaded', function() {
    // Check Web Serial support
    if (!esp32.isWebSerialSupported()) {
        alert('Web Serial API is not supported. Please use Chrome, Edge, or Opera browser.');
        return;
    }

    console.log('ESP32 Serial Communicator initialized');
    
    // You can add auto-connect logic here if needed
    // Or wait for user to click connect button
});