#include <Arduino.h>
#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <WiFiManager.h>
#include <DHT.h>
#include <ArduinoJson.h>

// =================================================================
// CONFIGURAZIONE NODO
//   1 = Cucina Gas      (MQ-2)        -> room: kitchen , sensor: mq2
//   2 = Cucina Qualità  (DHT22+MQ-135)-> room: kitchen , sensor: mq135
//   3 = Bedroom Qualità (DHT22+MQ-135)-> room: bedroom , sensor: mq135
// =================================================================
#define NODE_TYPE 1

// Raspberry Pi Zero
const char* SERVER_IP = "192.168.1.100";
const int   SERVER_PORT = 5001;

// Deve corrispondere a INGEST_TOKEN nella configurazione del server:
//   sudo grep INGEST_TOKEN /opt/hermes/shared/hermes.env
// Senza questo, chiunque sia collegato al WiFi di casa puo' inviare letture
// false, incluso un finto allarme gas. Lasciare vuoto solo in sviluppo.
const char* DEVICE_TOKEN = "";

#define MQ_PIN A0
#define DHT_PIN D2
#define DHT_TYPE DHT22

#if (NODE_TYPE >= 2)
  DHT dht(DHT_PIN, DHT_TYPE);
#endif

unsigned long lastSendTime = 0;
const unsigned long SEND_INTERVAL = 30000;

String getRoomName() {
  switch (NODE_TYPE) {
    case 1:
    case 2: return "kitchen";
    case 3: return "bedroom";
    default: return "unknown";
  }
}

String getSensorName() {
  switch (NODE_TYPE) {
    case 1: return "mq2";
    case 2:
    case 3: return "mq135";
    default: return "unknown";
  }
}

void sendSensorData() {
  if (WiFi.status() != WL_CONNECTED) return;

  StaticJsonDocument<256> doc;
  doc["room"] = getRoomName();
  doc["sensor"] = getSensorName();

  #if (NODE_TYPE == 1)
    doc["gas"] = analogRead(MQ_PIN);
  #else
    float t = dht.readTemperature();
    float h = dht.readHumidity();
    if (isnan(t) || isnan(h)) {
      Serial.println("DHT read failed, skipping send");
      return;
    }
    doc["temperature"] = t;
    doc["humidity"] = h;
    doc["aq"] = analogRead(MQ_PIN);
  #endif

  WiFiClient client;
  HTTPClient http;

  String serverUrl = "http://" + String(SERVER_IP) + ":" + String(SERVER_PORT) + "/api/air-quality/data";
  http.begin(client, serverUrl);
  http.addHeader("Content-Type", "application/json");
  if (strlen(DEVICE_TOKEN) > 0) {
    http.addHeader("X-Hermes-Token", DEVICE_TOKEN);
  }

  String jsonOutput;
  serializeJson(doc, jsonOutput);
  int status = http.POST(jsonOutput);
  http.end();

  Serial.print("POST ");
  Serial.print(serverUrl);
  Serial.print(" -> ");
  Serial.println(status);
}

void setup() {
  Serial.begin(115200);

  #if (NODE_TYPE >= 2)
    dht.begin();
  #endif

  WiFiManager wifiManager;
  String apName = "Hermes-Setup-" + getRoomName() + "-" + getSensorName();
  if (!wifiManager.autoConnect(apName.c_str())) {
    ESP.restart();
  }
}

void loop() {
  unsigned long currentMillis = millis();
  if (currentMillis - lastSendTime >= SEND_INTERVAL) {
    lastSendTime = currentMillis;
    sendSensorData();
  }
}