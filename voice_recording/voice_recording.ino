#include "ESP_I2S.h"
#include "FS.h"
#include "SD.h"

#define SLEEP_TIME 500    // in microseconds
#define RECORDING_LENGTH 7                // in seconds !!!warning longer recordings need more heap memory!!! and it may run out, leading to empty buffers
#define THRESHOLD_SAMPLES 5               // amount of samples that are used to determine if i am speaking

const uint32_t SAMPLERATE = 16000;
const byte ledPin = BUILTIN_LED;
const byte USBPin = 1;
int recording_threshold = 512;    // threshold for activating recording, gets set through webserver and manual calibration

I2SClass i2s;

void recordAudio() {
  static int file_cnt = 0;
  static int dir_cnt = 0;
  static char filename[64];
  uint8_t *wav_buffer;
  size_t wav_size;

  if(dir_cnt >= 1023)
    return;

  if(dir_cnt == 0){
    sprintf(filename, "/directory_%d", dir_cnt);
    File checking_dir = SD.open(filename);
    if(!checking_dir) // when /directory_0 doesnt already exist
      createDir(SD, filename);
    checking_dir.close();
  }

  digitalWrite(ledPin, HIGH);
  Serial.println("RECORDING ... ");
  Serial.printf("Free heap before recording: %d bytes\n", ESP.getFreeHeap());
  
  // Calculate expected buffer size for debugging
  size_t expected_size = RECORDING_LENGTH * SAMPLERATE * 2 + 44; // 16-bit samples + WAV header
  Serial.printf("Expected WAV size: %d bytes\n", expected_size);
  
  // Try recording with detailed debugging
  Serial.printf("Calling i2s.recordWAV(%d seconds, %d Hz)...\n", RECORDING_LENGTH, SAMPLERATE);
  
  unsigned long start_time = millis();
  wav_buffer = i2s.recordWAV(RECORDING_LENGTH, &wav_size);
  unsigned long end_time = millis();
  
  Serial.printf("Recording took %lu ms\n", end_time - start_time);
  Serial.printf("Returned buffer: %p, size: %d\n", (void*)wav_buffer, wav_size);

  if (wav_buffer == NULL) {
    Serial.println("ERROR: recordWAV returned NULL buffer");
    Serial.printf("Free heap after failed recording: %d bytes\n", ESP.getFreeHeap());
    digitalWrite(ledPin, LOW);
    return;
  }
  
  if (wav_size == 0) {
    Serial.println("ERROR: recordWAV returned empty buffer (size = 0)");
    free(wav_buffer);
    digitalWrite(ledPin, LOW);
    return;
  }

  // Check if the buffer contains actual audio data (not all zeros)
  bool has_audio = false;
  for(int i = 44; i < min((int)wav_size, 100); i++) { // Skip WAV header, check first 56 bytes
    if(wav_buffer[i] != 0) {
      has_audio = true;
      break;
    }
  }
  
  if(!has_audio) {
    Serial.println("WARNING: Buffer seems to contain only silence/zeros");
  } else {
    Serial.println("Buffer contains audio data");
  }

  sprintf(filename, "/directory_%d/audio_%d.wav", dir_cnt, file_cnt++);
  Serial.printf("Saving to: %s (Size: %d bytes)\n", filename, wav_size);
  
  File file = SD.open(filename, FILE_WRITE);
  if (!file) {
    Serial.printf("ERROR: Failed to create file %s\n", filename);
    free(wav_buffer);
    digitalWrite(ledPin, LOW);
    return;
  }
  
  size_t bytesWritten = file.write(wav_buffer, wav_size);
  file.close();
  free(wav_buffer);
  
  Serial.printf("COMPLETE => %s (Written: %d/%d bytes)\n", filename, bytesWritten, wav_size);
  
  if (bytesWritten != wav_size) {
    Serial.println("WARNING: Not all data was written to file!");
  }
  
  digitalWrite(ledPin, LOW);

  if(file_cnt >= 1023){
    file_cnt = 0;
    sprintf(filename, "/directory_%d", dir_cnt++);
    createDir(SD, filename);
  }
}

void createDir(fs::FS &fs, const char *path) {
  Serial.printf("Creating Dir: %s\n", path);
  if (fs.mkdir(path)) {
    Serial.println("Dir created");
  } else {
    Serial.println("mkdir failed");
  }
}

void removeDir(fs::FS &fs, const char *path) {
  Serial.printf("Removing Dir: %s\n", path);
  if (fs.rmdir(path)) {
    Serial.println("Dir removed");
  } else {
    Serial.println("rmdir failed");
  }
}

void processSerialCommand(String command) {
  command.trim();
  
  if (command.startsWith("SET_THRESHOLD:")) {
    int threshold = command.substring(14).toInt();
    if (threshold > 0 && threshold <= 4095) {
      recording_threshold = threshold;
      Serial.printf("Threshold set to: %d\n", recording_threshold);
    } else {
      Serial.println("Invalid threshold value (1-4095)");
    }
  }
  else if (command == "START_RECORDING") {
    Serial.println("Manual recording triggered");
    recordAudio();
  }
  else if (command == "GET_SD_INFO") {
    Serial.printf("Total space: %lluMB\n", SD.totalBytes() / (1024 * 1024));
    Serial.printf("Used space: %lluMB\n", SD.usedBytes() / (1024 * 1024));
    Serial.printf("Free space: %lluMB\n", (SD.totalBytes() - SD.usedBytes()) / (1024 * 1024));
  }
  else if (command == "LIST_FILES") {
    listAudioFiles();
  }
  else if (command.startsWith("GET_FILE:")) {
    String filename = command.substring(9);
    sendAudioFile(filename);
  }
  else if (command == "GET_THRESHOLD") {
    Serial.printf("Current threshold: %d\n", recording_threshold);
  }
  else if (command == "STATUS") {
    Serial.println("ESP32 Voice Recorder Ready");
    Serial.printf("Threshold: %d\n", recording_threshold);
    Serial.printf("USB Power: %s\n", digitalRead(USBPin) == HIGH ? "Connected" : "Disconnected");
  }
  else {
    Serial.println("Unknown command");
  }
}

void listAudioFiles() {
  Serial.println("FILE_LIST_START");
  
  // List files in all directories
  for (int dir_cnt = 0; dir_cnt < 1024; dir_cnt++) {
    char dirname[64];
    sprintf(dirname, "/directory_%d", dir_cnt);
    
    File dir = SD.open(dirname);
    if (!dir) break; // No more directories
    
    if (dir.isDirectory()) {
      File file = dir.openNextFile();
      while (file) {
        if (!file.isDirectory()) {
          String fullPath = String(dirname) + "/" + String(file.name());
          Serial.printf("FILE:%s:%lu\n", fullPath.c_str(), file.size());
        }
        file = dir.openNextFile();
      }
    }
    dir.close();
  }
  
  Serial.println("FILE_LIST_END");
}

void sendAudioFile(String filename) {
  File file = SD.open(filename);
  if (!file) {
    Serial.printf("ERROR: File not found: %s\n", filename.c_str());
    return;
  }
  
  Serial.printf("FILE_DATA_START:%s:%lu\n", filename.c_str(), file.size());
  
  // Send file in chunks
  const size_t CHUNK_SIZE = 64;
  uint8_t buffer[CHUNK_SIZE];
  
  while (file.available()) {
    size_t bytesRead = file.read(buffer, CHUNK_SIZE);
    Serial.write(buffer, bytesRead);
  }
  
  file.close();
  Serial.println("\nFILE_DATA_END");
}

void setup() {
  Serial.begin(115200);
  delay(1000); // Give serial time to initialize

  pinMode(ledPin, OUTPUT);
  pinMode(USBPin, INPUT);

  // Initialize I2S with detailed error checking
  Serial.println("Initializing I2S...");
  i2s.setPinsPdmRx(42, 41);
  
  bool i2s_success = i2s.begin(I2S_MODE_PDM_RX, SAMPLERATE,
                               I2S_DATA_BIT_WIDTH_16BIT, I2S_SLOT_MODE_MONO);
  
  if (!i2s_success) {
    Serial.println("ERROR: Failed to initialize I2S!");
    Serial.println("Check:");
    Serial.println("- Microphone connections (pins 42, 41)");
    Serial.println("- Power supply to microphone");
    Serial.println("- Microphone compatibility");
    while(1) { // Stop execution
      digitalWrite(ledPin, HIGH);
      delay(200);
      digitalWrite(ledPin, LOW);
      delay(200);
    }
  } else {
    Serial.println("I2S initialized successfully");
  }

  // Test I2S by reading a few samples
  Serial.println("Testing microphone...");
  for(int i = 0; i < 5; i++) {
    int sample = i2s.read();
    Serial.printf("Sample %d: %d\n", i, sample);
    delay(100);
  }

  // Initialize SD card
  Serial.println("Initializing SD card...");
  if (!SD.begin(21)) {
    Serial.println("ERROR: Failed to mount SD Card!");
    Serial.println("Check:");
    Serial.println("- SD card is inserted");
    Serial.println("- SD card is formatted (FAT32)");
    Serial.println("- CS pin connection (pin 21)");
    while(1) { // Stop execution
      digitalWrite(ledPin, HIGH);
      delay(500);
      digitalWrite(ledPin, LOW);
      delay(500);
    }
  } else {
    Serial.println("SD card initialized successfully");
    Serial.printf("SD Total: %lluMB, Used: %lluMB\n", 
                  SD.totalBytes() / (1024 * 1024), 
                  SD.usedBytes() / (1024 * 1024));
  }

  Serial.println("ESP32 Voice Recorder Ready");
  Serial.printf("Free heap: %d bytes\n", ESP.getFreeHeap());
  delay(500);
}

void loop() {
  delay(1000);
  if ( digitalRead(USBPin) == HIGH){
    // Serial.println("5V over USB detected!");
    // Check for serial commands
    if (Serial.available()) {
      String command = Serial.readStringUntil('\n');
      processSerialCommand(command);
    }
  }
  else{
    //esp_sleep_enable_timer_wakeup(SLEEP_TIME);
    // reading samples, averaging, checking if exceeds threshold
    int sample = 0; // Initialize sample
    for (int i = 0; i < THRESHOLD_SAMPLES; i++){
      int currentSample = i2s.read();
      if (currentSample != -1 && currentSample != 1) { // Check for valid sample first
        sample += currentSample;
      }
    }
    sample = sample / THRESHOLD_SAMPLES; // Calculate average after loop
    
    if (sample >= recording_threshold) {
      recordAudio();
    }
  }
  
  
}