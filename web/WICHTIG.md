# Webserver auf dem ESP32

Der Webserver läuft direkt auf dem ESP32 und wird von der SD-Karte geladen.
Die gesamte Rendering-Logik läuft im Browser (Client-Side). Der ESP32 liefert nur
die statischen Dateien und eine JSON API.

## Setup: Dateien auf die SD-Karte kopieren

Erstelle auf der SD-Karte einen Ordner `/web/` und kopiere diese 3 Dateien hinein:

```
SD-Karte/
├── web/
│   ├── index.html
│   ├── style.css
│   └── main.js
├── dir0/
│   ├── rec0_nrf1.wav
│   └── ...
```

## Benutzung

1. ESP32 einschalten (mit USB-Verbindung, damit der AP startet)
2. Mit dem WLAN **ESP32-Recorder** verbinden (Passwort: `esp32pass`)
3. Im Browser öffnen: **http://192.168.4.1**
4. Die Webseite verbindet sich automatisch mit der ESP32 API

## API Endpoints

| Endpoint              | Methode | Beschreibung                         |
|-----------------------|---------|--------------------------------------|
| `/`                   | GET     | Liefert index.html von SD            |
| `/style.css`          | GET     | Liefert style.css von SD             |
| `/main.js`            | GET     | Liefert main.js von SD               |
| `/api/status`         | GET     | JSON: Threshold, Dir/Rec, SD-Info    |
| `/api/threshold`      | GET     | JSON: aktueller Threshold            |
| `/api/threshold?value=X` | POST | Threshold setzen (1-4095)            |
| `/api/record`         | POST    | Aufnahme starten (blockiert ~7 Sek)  |
| `/api/level`          | GET     | JSON: aktuelles Audio-Level          |
| `/api/files`          | GET     | JSON: Liste aller WAV-Dateien        |
| `/api/download?path=X`| GET    | WAV-Datei herunterladen              |

## Lokales Testen (ohne ESP32)

Zum Testen der Oberfläche ohne ESP32 Hardware:
```
cd webserver
python -m http.server 8000
```
Dann http://localhost:8000 öffnen. API-Endpoints werden Fehler liefern, aber das UI ist sichtbar.
