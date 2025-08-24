#include "ESP_I2S.h"
#include "FS.h"
#include "SD.h"

#define SLEEP_TIME 500    // in microseconds
#define RECORDING_LENGTH 1                // in seconds 
#define THRESHOLD_SAMPLES 5               // amount of samples that are used to determine if i am speaking

const uint32_t SAMPLERATE = 16000;
const byte ledPin = BUILTIN_LED;
const byte USBPin = 10;
const int recording_threshold = 512;    // threshold for activating recording, gets set through webserver and manual calibration

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
  Serial.print("RECORDING ... ");
  wav_buffer = i2s.recordWAV(RECORDING_LENGTH, &wav_size);

  sprintf(filename, "/directory_%d/audio_%d.wav", dir_cnt, file_cnt++);
  File file = SD.open(filename, FILE_WRITE);
  file.write(wav_buffer, wav_size);
  file.close();
  free(wav_buffer);
  Serial.printf("COMPLETE => %s\n", filename);
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

  Serial.printf("Total space: %lluMB\n", SD.totalBytes() / (1024 * 1024));
  Serial.printf("Used space: %lluMB\n", SD.usedBytes() / (1024 * 1024));

  delay(500);
}

void loop() {
  if ( digitalRead(USBPin) == HIGH){
    Serial.println("5V over USB detected!");
  }
  else{
    esp_sleep_enable_timer_wakeup(SLEEP_TIME);
    // reading samples, averaging, checking if exceeds threshold
    int sample;
    for (int i = 0; i < THRESHOLD_SAMPLES; i++){
      sample += i2s.read() / THRESHOLD_SAMPLES; // division for averaging purposes
      if (sample >= recording_threshold && sample != -1 && sample != 1) {
        recordAudio();
      }
    }
  }
  
  
}