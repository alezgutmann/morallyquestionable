#include "ESP_I2S.h"
#include "FS.h"
#include "SD.h"
#include <WiFi.h>
#include <WebServer.h>

#define SLEEP_TIME 500    // in microseconds
#define RECORDING_LENGTH 7               // in seconds 
#define THRESHOLD_SAMPLES 5               // amount of samples that are used to determine if i am speaking

const uint32_t SAMPLERATE = 16000;
const byte ledPin = BUILTIN_LED;
const byte USBPin = D1;

// WiFi AP/Webserver
const char* ap_ssid = "ESP32-Recorder";
const char* ap_password = "esp32pass";
WebServer server(80);
int recording_threshold = 512;    // threshold for activating recording, gets set through webserver and manual calibration

I2SClass i2s;

// Globale Recorder-Parameter (gemäß Architektur)
static int current_rec_number = 0;
static int current_dir_number = 0;
static bool new_rec_flag = true;  // ist das ein neues recording oder Fortsetzung?
static bool usb_connected = false;

void recordAudio() {
  static char filename[64];
  uint8_t *wav_buffer;
  size_t wav_size;

  if(current_dir_number >= 1024)
    return;

  if(current_dir_number == 0 && current_rec_number == 0){
    sprintf(filename, "/dir%d", current_dir_number);
    File checking_dir = SD.open(filename);
    if(!checking_dir) // when /dir0 doesnt already exist
      createDir(SD, filename);
    checking_dir.close();
  }

  digitalWrite(ledPin, HIGH);
  Serial.print("RECORDING ... \n");
  wav_buffer = i2s.recordWAV(RECORDING_LENGTH, &wav_size);

  // Namenskonvention: /dir{current_dir_number}/rec{current_rec_number}_nrf{new_rec_flag}.wav
  sprintf(filename, "/dir%d/rec%d_nrf%d.wav", current_dir_number, current_rec_number, new_rec_flag ? 1 : 0);
  File file = SD.open(filename, FILE_WRITE);
  file.write(wav_buffer, wav_size);
  file.close();
  free(wav_buffer);
  Serial.printf("COMPLETE => %s\n", filename);
  digitalWrite(ledPin, LOW);

  current_rec_number++;
  new_rec_flag = false;  // Nächste Aufnahme ist Fortsetzung

  if(current_rec_number >= 1024){
    current_rec_number = 0;
    current_dir_number++;
    if(current_dir_number < 1024){
      sprintf(filename, "/dir%d", current_dir_number);
      createDir(SD, filename);
    }
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
  else if (command == "START_STREAM") {
    Serial.println("STREAM_STARTED");
  }
  else if (command == "STOP_STREAM") {
    Serial.println("STREAM_STOPPED");
  }
  else if (command == "GET_LEVEL") {
    // Read current audio level and send it
    int sample = abs(i2s.read());
    if (sample != -1 && sample != 1) {
      Serial.printf("LEVEL:%d\n", sample);
    }
  }
  else {
    Serial.println("Unknown command");
  }
}

void listAudioFiles() {
  Serial.println("FILE_LIST_START");
  
  // List files in all directories
  for (int d = 0; d < 1024; d++) {
    char dirname[64];
    sprintf(dirname, "/dir%d", d);
    
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

void startWifiAP(){
  // WiFi Access Point starten
  WiFi.softAP(ap_ssid, ap_password);
  IPAddress IP = WiFi.softAPIP();
  Serial.print("AP IP address: ");
  Serial.println(IP);

  // Webserver-Routen
  server.on("/", []() {
    server.send(200, "text/plain", "ESP32 Voice Recorder Webserver\n\nBefehle:\n/status\n/threshold\n/start_recording\n/set_threshold?value=XXX\n");
  });
  server.on("/status", []() {
    String msg = "ESP32 Voice Recorder Ready\n";
    msg += "Threshold: " + String(recording_threshold) + "\n";
    msg += "USB Power: " + String(digitalRead(USBPin) == HIGH ? "Connected" : "Disconnected") + "\n";
    msg += "current_dir_number: " + String(current_dir_number) + "\n";
    msg += "current_rec_number: " + String(current_rec_number) + "\n";
    msg += "new_rec_flag: " + String(new_rec_flag ? 1 : 0) + "\n";
    server.send(200, "text/plain", msg);
  });
  server.on("/threshold", []() {
    server.send(200, "text/plain", String(recording_threshold));
  });
  server.on("/start_recording", []() {
    recordAudio();
    server.send(200, "text/plain", "Recording started.");
  });
  server.on("/set_threshold", []() {
    if (server.hasArg("value")) {
      int t = server.arg("value").toInt();
      if (t > 0 && t <= 4095) {
        recording_threshold = t;
        server.send(200, "text/plain", "Threshold set to: " + String(t));
        return;
      }
    }
    server.send(400, "text/plain", "Invalid threshold value");
  });
  server.begin();
}

void stopWifiAP(){
  server.stop(); // Webserver stoppen
  WiFi.softAPdisconnect(true); // Access Point deaktivieren
  Serial.println("Webserver und AP gestoppt.");
}

void setup() {
  Serial.begin(115200);

  pinMode(ledPin, OUTPUT);
  pinMode(USBPin, INPUT);

  i2s.setPinsPdmRx(42, 41);
  if (!i2s.begin(I2S_MODE_PDM_RX, SAMPLERATE,
                 I2S_DATA_BIT_WIDTH_16BIT, I2S_SLOT_MODE_MONO)) {
    Serial.println("Can't find microphone!");
  }

  if (!SD.begin(21)) {
    Serial.println("Failed to mount SD Card!");
  }

  Serial.println("ESP32 Voice Recorder Ready");
  delay(500);
}

void loop() {
  
  if (digitalRead(USBPin) == HIGH){

    // Beim ersten Mal USB-Connection den Access-Point starten
    if (usb_connected == false){
      usb_connected = true;
      startWifiAP();
    }

    server.handleClient();
    
    // Serial-Kommandos weiterhin möglich
    if (Serial.available()) {
      String command = Serial.readStringUntil('\n');
      processSerialCommand(command);
      digitalWrite(ledPin, HIGH);
    }
  }
  else{

    // Sobald USB-Verbindung nicht mehr besteht Access Point runterfahren (aber nur beim ersten Mal)
    if (usb_connected == true){
      usb_connected = false;
      stopWifiAP();
    }

    Serial.println("Sleep branch taken!");
    // Samples aufnehmen und Durchschnitt berechnen
    int sample = 0;
    for (int i = 0; i < THRESHOLD_SAMPLES; i++){
      int reading = abs(i2s.read());  // abs() weil Audio-Samples negativ sein können
      if (reading != 1) {  // -1/1 sind Fehlerwerte
        sample += reading;
      }
    }
    sample /= THRESHOLD_SAMPLES;  // Durchschnitt nach der Schleife
    // Wurde threshold überschritten?
    if (sample >= recording_threshold) {
      recordAudio();
    } else {
      new_rec_flag = true;  // Keine Aufnahme -> nächste ist neues Recording
      //kurz schlafen, da ich gerade nicht spreche
      esp_sleep_enable_timer_wakeup(SLEEP_TIME);
      esp_light_sleep_start();
    }
  }
}