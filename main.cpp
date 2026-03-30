#include <WiFi.h>
#include <WebServer.h>
#include <Wire.h>
#include <VL53L1X.h>
#include "FS.h"
#include <LittleFS.h>

const char* ssid     = "OrionTelekom_EAAA-2.4G";
const char* password = "HWTCC921EAAA";

WebServer server(80);
VL53L1X sensor;

int           brojacKorpi        = 0;
bool          korpaJeTu          = false;
int           trenutnaUdaljenost = 0;
unsigned long poslednjeBrojanje  = 0;

const int           GRANICA_DETEKCIJE   = 1500;
const int           HISTEREZIS          = 300;
const int           BROJ_UZORAKA        = 5;
const unsigned long PAUZA_IZMEDJU_KORPI = 10000;

// ─── Senzor ──────────────────────────────────────────────────────────────────

int procitajPrecizno() {
  long suma = 0;
  for (int i = 0; i < BROJ_UZORAKA; i++) {
    suma += sensor.read();
    delay(10);
  }
  return suma / BROJ_UZORAKA;
}

// ─── Pomocna: serviranje fajla ───────────────────────────────────────────────

void serviranjeFajla(const char* putanja, const char* contentType) {
  if (LittleFS.exists(putanja)) {
    File f = LittleFS.open(putanja, "r");
    server.streamFile(f, contentType);
    f.close();
  } else {
    server.send(404, "text/plain", "Not found");
  }
}

// ─── API: GET /api/data ───────────────────────────────────────────────────────

void handleApi() {
  unsigned long proteklo  = millis() - poslednjeBrojanje;
  bool          blokirano = (proteklo < PAUZA_IZMEDJU_KORPI);
  unsigned long preostalo = blokirano ? (PAUZA_IZMEDJU_KORPI - proteklo) : 0;

  String json = "{";
  json += "\"brojac\":";      json += String(brojacKorpi);
  json += ",\"udaljenost\":"; json += String(trenutnaUdaljenost);
  json += ",\"blokirano\":";  json += blokirano ? "true" : "false";
  json += ",\"preostaloMs\":"; json += String(preostalo);
  json += "}";

  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.send(200, "application/json", json);
}

// ─── API: POST /api/reset ─────────────────────────────────────────────────────

void handleReset() {
  brojacKorpi       = 0;
  korpaJeTu         = false;
  poslednjeBrojanje = 0;
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.send(200, "application/json", "{\"ok\":true}");
  Serial.println("RESETOVAN BROJAC");
}

// ─── Setup ───────────────────────────────────────────────────────────────────

void setup() {
  pinMode(LED_BUILTIN, OUTPUT);
  Serial.begin(115200);

  WiFi.begin(ssid, password);
  Serial.print("Spajam se na WiFi");
  while (WiFi.status() != WL_CONNECTED) { delay(500); Serial.print("."); }
  Serial.println("\nIP: " + WiFi.localIP().toString());

  if (!LittleFS.begin()) {
    Serial.println("LittleFS greska!");
    while (1);
  }
  Serial.println("LittleFS OK");

  Wire.begin(21, 22);
  if (!sensor.init()) { Serial.println("VL53L1X greska!"); while (1); }
  sensor.setDistanceMode(VL53L1X::Long);
  sensor.setMeasurementTimingBudget(100000);
  sensor.setROICenter(199);
  sensor.setROISize(4, 4);
  sensor.startContinuous(100);

  // HTML/CSS/JS fajlovi
  server.on("/", HTTP_GET, []() {
    serviranjeFajla("/index.html", "text/html");
  });
  server.on("/index.html", HTTP_GET, []() {
    serviranjeFajla("/index.html", "text/html");
  });
  server.on("/style.css", HTTP_GET, []() {
    serviranjeFajla("/style.css", "text/css");
  });
  server.on("/script.js", HTTP_GET, []() {
    serviranjeFajla("/script.js", "application/javascript");
  });

  // API
  server.on("/api/data",  HTTP_GET,  handleApi);
  server.on("/api/reset", HTTP_POST, handleReset);

  server.begin();
  Serial.println("HTTP server pokrenut");
}

// ─── Loop ────────────────────────────────────────────────────────────────────

void loop() {
  server.handleClient();
  trenutnaUdaljenost = procitajPrecizno();

  bool vremeIsteklo = (millis() - poslednjeBrojanje >= PAUZA_IZMEDJU_KORPI);

  if (trenutnaUdaljenost > 50 && trenutnaUdaljenost <= GRANICA_DETEKCIJE) {
    if (!korpaJeTu && vremeIsteklo) {
      delay(100);
      if (procitajPrecizno() <= GRANICA_DETEKCIJE) {
        brojacKorpi++;
        korpaJeTu         = true;
        poslednjeBrojanje = millis();
        digitalWrite(LED_BUILTIN, HIGH);
        Serial.println("KORPA #" + String(brojacKorpi));
      }
    }
  } else if (trenutnaUdaljenost > (GRANICA_DETEKCIJE + HISTEREZIS)) {
    if (korpaJeTu) {
      korpaJeTu = false;
      digitalWrite(LED_BUILTIN, LOW);
    }
  }
}