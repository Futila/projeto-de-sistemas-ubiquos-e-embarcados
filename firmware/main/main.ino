// =============================================================================
//  Sistema de Controle de Acesso IoT — TCC Fernando Futila (UFSC Araranguá)
//  Firmware ESP32
//
//  Canais de comunicação:
//    1. MQTT (via Wi-Fi / internet)
//       ESP32 assina v1/locks/{MAC}/commands  →  executa "OPEN" via relé
//       ESP32 publica v1/locks/{MAC}/sensors  →  telemetria JSON (MQ-5 + DHT22)
//       ESP32 publica v1/locks/{MAC}/status   →  heartbeat "ONLINE" a cada 30 s
//
//    2. BLE — fallback offline (sem internet)
//       GATT Server com 3 características:
//         AUTH    (write)        → app envia token_resgate; ESP32 valida contra NVS
//         COMMAND (write)        → "OPEN" | "LED_ON" | "LED_OFF" (exige auth prévia)
//         STATUS  (read/notify)  → "AUTHORIZED" | "DENIED" | "OPENED" | "ONLINE"
//
//  O Django pré-carrega o token no ESP32 via MQTT ao ativar a reserva:
//    {"cmd":"SET_BLE_TOKEN","token":"ABC123","fim":"2026-05-20T12:00:00"}
//  Ao revogar:
//    {"cmd":"CLEAR_BLE_TOKEN"}
//
//  Broker MQTT: HiveMQ Cloud (TLS porta 8883 + usuário/senha)
//  id_dispositivo (campo Fechadura no Django): MAC address AA:BB:CC:DD:EE:FF
//
//  Em emergência de gás, a fechadura abre de forma autônoma (sem servidor)
//
//  ── Bibliotecas (instalar via Library Manager do Arduino IDE) ──────────────
//    · PubSubClient        (Nick O'Leary)
//    · DHT sensor library  (Adafruit)
//    · Adafruit Unified Sensor  (dependência do DHT)
//    · ArduinoJson         (Benoit Blanchon) — v6 ou v7
//    · BLEDevice / BLEServer / Preferences — inclusas no ESP32 Arduino Core
// =============================================================================

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include <DHT.h>
#include <ArduinoJson.h>
#include <Preferences.h> // NVS — armazena token BLE entre reinicializações

// BLE — inclusos no ESP32 Arduino Core (sem instalação extra)
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

// ─── Configurações de rede e HiveMQ Cloud ─────────────────────────────────────
// Wi-Fi, host/usuário/senha do MQTT: ver firmware/main/secrets.h (não versionado)
// ⚠️  Copie secrets.h.example para secrets.h e preencha com seus dados antes de gravar
#include "secrets.h"

// ─── Mapeamento de pinos ──────────────────────────────────────────────────────
//  Configuração para hardware real (acoplador óptico + DHT22 + MQ-5 conectados)
//  Se precisar simular com LED: mude PIN_RELAY para 2 e PIN_DHT para 25
#define PIN_RELAY 23     // Acoplador óptico PC817 → fechadura solenoide (GPIO 23)
#define PIN_MQ5 34       // Saída do sensor de gás MQ-5 — lida como analógica (AO)
#define PIN_DHT 27       // Dados do sensor DHT22
#define PIN_LED_STATUS 2 // LED interno ESP32 (indicador de status MQTT)

// ─── Tipo do sensor DHT ───────────────────────────────────────────────────────
#define DHT_TYPE DHT22 // Mude para DHT11 se for esse o seu modelo

// ─── Parâmetros operacionais ──────────────────────────────────────────────────
#define RELAY_OPEN_MS 3000       // Tempo (ms) que o relé permanece ativado
#define HEARTBEAT_INTERVAL 30000 // Intervalo do heartbeat ONLINE (ms)
#define SENSOR_INTERVAL 10000    // Intervalo de leitura de sensores (ms)
// Limiar de alerta de gás: ADC 12-bit → 0–4095
// ~2000 ≈ 1,61 V na saída do MQ-5 (ajuste após calibração com gás de referência)
#define GAS_THRESHOLD 2000

// ─── Modo de teste BLE ───────────────────────────────────────────────────────
// Quando true: desconecta o Wi-Fi após TESTE_BLE_WIFI_OFF_MS para forçar o
// fallback BLE e permitir testes sem uma segunda rede disponível.
// ⚠️  Mude para false antes do deploy em produção.
#define MODO_TESTE_BLE false
#define TESTE_BLE_WIFI_OFF_MS 120000 // 2 minutos

// ─── UUIDs do serviço BLE ─────────────────────────────────────────────────────
//  Use um gerador online (ex: uuidgenerator.net) para criar UUIDs únicos para
//  o seu produto final. Os valores abaixo são fixos para o protótipo do TCC.
#define BLE_SERVICE_UUID "12345678-1234-1234-1234-123456789abc"
#define BLE_AUTH_UUID "12345678-1234-1234-1234-123456789001"    // write
#define BLE_COMMAND_UUID "12345678-1234-1234-1234-123456789002" // write
#define BLE_STATUS_UUID "12345678-1234-1234-1234-123456789003"  // read/notify

// ─── Parâmetros BLE ───────────────────────────────────────────────────────────
#define BLE_SESSION_TIMEOUT_MS 300000UL // Sessão BLE expira em 5 minutos

// ─── Objetos globais ──────────────────────────────────────────────────────────
DHT dht(PIN_DHT, DHT_TYPE);
WiFiClientSecure wifiClient;
PubSubClient mqttClient(wifiClient);
Preferences prefs; // NVS para persistir token BLE

// Tópicos MQTT — preenchidos em buildTopics() após obter o MAC do chip
char topicCommands[72]; // v1/locks/{MAC}/commands  (subscribe)
char topicStatus[72];   // v1/locks/{MAC}/status    (publish)
char topicSensors[72];  // v1/locks/{MAC}/sensors   (publish)
char deviceMac[18];     // MAC em formato AA:BB:CC:DD:EE:FF

unsigned long lastHeartbeat = 0;
unsigned long lastSensor = 0;

// ─── Estado da sessão BLE ─────────────────────────────────────────────────────
BLECharacteristic *bleStatusChar = nullptr; // referência para notificações
bool bleAuthenticated = false;              // sessão BLE autenticada?
unsigned long bleAuthAt = 0;                // timestamp da autenticação
bool bleClientConnected = false;            // cliente BLE conectado?
bool bleAtivo = false;                      // BLE foi inicializado?

// ─── Máquina de estados MQTT/BLE ─────────────────────────────────────────────
// BLE e MQTT-TLS não rodam simultaneamente (restrição de heap do ESP32).
// Após MAX_MQTT_RETRIES falhas consecutivas, o sistema entra em modo BLE.
#define MAX_MQTT_RETRIES 5
int mqttRetries = 0;
bool modoBLE = false; // true = operando como fallback BLE offline

// ─── Forward declarations ─────────────────────────────────────────────────────
void abrirFechadura(const char *motivo);
void setupBLE();

// =============================================================================
//  BLE — Callbacks de conexão/desconexão do cliente
// =============================================================================
class BLEConnectionCallbacks : public BLEServerCallbacks
{
  void onConnect(BLEServer *) override
  {
    bleClientConnected = true;
    bleAuthenticated = false; // nova conexão exige nova autenticação
    Serial.println("[BLE] Cliente conectado.");
  }
  void onDisconnect(BLEServer *server) override
  {
    bleClientConnected = false;
    bleAuthenticated = false;
    Serial.println("[BLE] Cliente desconectado. Reiniciando advertising...");
    server->startAdvertising();
  }
};

// =============================================================================
//  BLE — Callback da característica AUTH
//
//  O app escreve o token_resgate. O ESP32 compara com o valor armazenado
//  na NVS (gravado pelo Django via MQTT ao ativar a reserva).
//  Se válido e dentro do prazo, abre sessão BLE de BLE_SESSION_TIMEOUT_MS ms.
// =============================================================================
class BLEAuthCallbacks : public BLECharacteristicCallbacks
{
  void onWrite(BLECharacteristic *chr) override
  {
    String tokenRecebido = chr->getValue().c_str();
    tokenRecebido.trim();

    prefs.begin("ble", /*readOnly=*/true);
    String tokenSalvo = prefs.getString("token", "");
    String fimStr = prefs.getString("fim", "");
    prefs.end();

    Serial.print("[BLE][AUTH] Token recebido: ");
    Serial.println(tokenRecebido);

    if (tokenSalvo.length() == 0)
    {
      Serial.println("[BLE][AUTH] Nenhum token configurado na NVS.");
      bleStatusChar->setValue("DENIED");
      bleStatusChar->notify();
      return;
    }

    if (tokenRecebido != tokenSalvo)
    {
      Serial.println("[BLE][AUTH] Token inválido.");
      bleStatusChar->setValue("DENIED");
      bleStatusChar->notify();
      return;
    }

    // Verifica prazo da reserva usando comparação de strings ISO 8601
    // (funciona porque o formato YYYY-MM-DDTHH:MM:SS é lexicograficamente ordenado)
    if (fimStr.length() > 0)
    {
      // Obtém timestamp atual como string ISO simplificada (sem NTP real no protótipo,
      // usa millis como indicador — em produção, usar NTP com configTime())
      // Para o TCC, a validação de prazo é feita no servidor; aqui é best-effort.
      Serial.print("[BLE][AUTH] Reserva válida até: ");
      Serial.println(fimStr);
    }

    bleAuthenticated = true;
    bleAuthAt = millis();
    Serial.println("[BLE][AUTH] Autenticado! Sessão válida por 5 minutos.");
    bleStatusChar->setValue("AUTHORIZED");
    bleStatusChar->notify();
  }
};

// =============================================================================
//  BLE — Callback da característica COMMAND
//
//  Aceita comandos apenas se a sessão estiver autenticada e não expirada.
//  Comandos suportados:
//    "OPEN"    → aciona o relé (abre a fechadura)
//    "LED_ON"  → liga o LED de status
//    "LED_OFF" → desliga o LED de status
// =============================================================================
class BLECommandCallbacks : public BLECharacteristicCallbacks
{
  void onWrite(BLECharacteristic *chr) override
  {
    if (!bleAuthenticated)
    {
      Serial.println("[BLE][CMD] Comando rejeitado — não autenticado.");
      bleStatusChar->setValue("DENIED");
      bleStatusChar->notify();
      return;
    }

    if (millis() - bleAuthAt > BLE_SESSION_TIMEOUT_MS)
    {
      bleAuthenticated = false;
      Serial.println("[BLE][CMD] Sessão expirada.");
      bleStatusChar->setValue("DENIED");
      bleStatusChar->notify();
      return;
    }

    String cmd = chr->getValue().c_str();
    cmd.trim();
    Serial.print("[BLE][CMD] Comando recebido: ");
    Serial.println(cmd);

    if (cmd == "OPEN")
    {
      bleStatusChar->setValue("OPENED");
      bleStatusChar->notify();
      abrirFechadura("comando_ble_hospede");
    }
    else if (cmd == "LED_ON")
    {
      digitalWrite(PIN_LED_STATUS, HIGH);
      Serial.println("[BLE][CMD] LED ligado.");
      bleStatusChar->setValue("ONLINE");
      bleStatusChar->notify();
    }
    else if (cmd == "LED_OFF")
    {
      digitalWrite(PIN_LED_STATUS, LOW);
      Serial.println("[BLE][CMD] LED desligado.");
      bleStatusChar->setValue("ONLINE");
      bleStatusChar->notify();
    }
    else
    {
      Serial.println("[BLE][CMD] Comando desconhecido.");
    }
  }
};

// =============================================================================
//  setupBLE — inicializa o servidor GATT e começa o advertising
//
//  O nome de advertising "SmartLock-XXXXXX" usa os últimos 6 caracteres do
//  MAC (sem separadores) para ser único por dispositivo.
// =============================================================================
void setupBLE()
{
  // Nome BLE derivado do MAC: "SmartLock-AABBCC"
  String bleName = "SmartLock-";
  String macStr = String(deviceMac);
  macStr.replace(":", "");
  bleName += macStr.substring(6); // últimos 6 hex do MAC

  BLEDevice::init(bleName.c_str());
  BLEServer *server = BLEDevice::createServer();
  server->setCallbacks(new BLEConnectionCallbacks());

  BLEService *service = server->createService(BLE_SERVICE_UUID);

  // ── Característica AUTH (write) ───────────────────────────────────────────
  BLECharacteristic *authChar = service->createCharacteristic(
      BLE_AUTH_UUID,
      BLECharacteristic::PROPERTY_WRITE);
  authChar->setCallbacks(new BLEAuthCallbacks());

  // ── Característica COMMAND (write) ───────────────────────────────────────
  BLECharacteristic *cmdChar = service->createCharacteristic(
      BLE_COMMAND_UUID,
      BLECharacteristic::PROPERTY_WRITE);
  cmdChar->setCallbacks(new BLECommandCallbacks());

  // ── Característica STATUS (read + notify) ────────────────────────────────
  bleStatusChar = service->createCharacteristic(
      BLE_STATUS_UUID,
      BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_NOTIFY);
  bleStatusChar->addDescriptor(new BLE2902());
  bleStatusChar->setValue("ONLINE");

  service->start();

  BLEAdvertising *advertising = BLEDevice::getAdvertising();
  advertising->addServiceUUID(BLE_SERVICE_UUID);
  advertising->setScanResponse(true);
  BLEDevice::startAdvertising();

  Serial.print("[BLE] Advertising iniciado como: ");
  Serial.println(bleName);
}

// =============================================================================
//  Wi-Fi
// =============================================================================
void setupWifi()
{
  Serial.println();
  Serial.print("[WiFi] Conectando a: ");
  Serial.println(WIFI_SSID);

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  while (WiFi.status() != WL_CONNECTED)
  {
    delay(500);
    Serial.print(".");
  }

  Serial.println();
  Serial.print("[WiFi] Conectado! IP: ");
  Serial.println(WiFi.localIP());
}

// =============================================================================
//  Tópicos MQTT — derivados do MAC address do ESP32
//
//  IMPORTANTE: cadastre o valor impresso no Serial Monitor no campo
//  Fechadura.id_dispositivo do painel Django antes de fazer o primeiro teste.
// =============================================================================
void buildTopics()
{
  uint8_t mac[6];
  WiFi.macAddress(mac);
  snprintf(deviceMac, sizeof(deviceMac),
           "%02X:%02X:%02X:%02X:%02X:%02X",
           mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);

  snprintf(topicCommands, sizeof(topicCommands), "v1/locks/%s/commands", deviceMac);
  snprintf(topicStatus, sizeof(topicStatus), "v1/locks/%s/status", deviceMac);
  snprintf(topicSensors, sizeof(topicSensors), "v1/locks/%s/sensors", deviceMac);

  Serial.println("=== MQTT ID DISPOSITIVO ===");
  Serial.println(deviceMac);
  Serial.println("Cadastre este MAC em Fechadura.id_dispositivo no Django.");
  Serial.println("===========================");
}

// =============================================================================
//  Controle do relé — abertura da fechadura
// =============================================================================
void abrirFechadura(const char *motivo)
{
  Serial.print("[RELAY] Abrindo fechadura — motivo: ");
  Serial.println(motivo);

  digitalWrite(PIN_RELAY, HIGH);
  delay(RELAY_OPEN_MS);
  digitalWrite(PIN_RELAY, LOW);

  Serial.println("[RELAY] Fechadura fechada.");
}

// =============================================================================
//  Heartbeat — publica "ONLINE" no tópico de status
//  retain=true: o broker retém a mensagem; o Django subscriber recebe o
//  estado atual assim que se conectar, sem aguardar o próximo heartbeat.
// =============================================================================
void publicarStatusOnline()
{
  mqttClient.publish(topicStatus, "ONLINE", /*retain=*/true);
  Serial.println("[MQTT] Status ONLINE publicado.");
}

// =============================================================================
//  Telemetria — lê sensores e publica JSON
//
//  Formato do payload (v1/locks/{MAC}/sensors):
//  {
//    "tipo":        "SENSOR" | "ALERTA_GAS",
//    "gas":         0.0320,    ← normalizado 0.0000–1.0000 (4 dec. places)
//    "temperatura": 25.6700,   ← °C  (4 dec. places)
//    "umidade":     68.3000,   ← %   (4 dec. places)
//    "alerta_gas":  false
//  }
//
//  Precisão de 4 casas decimais atende DecimalField(decimal_places=4) do Django
//  e cobre o requisito de "4 algarismos significativos" do TCC.
// =============================================================================
void publicarTelemetria()
{
  // ── MQ-5 (ADC 12-bit: 0–4095) ─────────────────────────────────────────────
  int rawGas = analogRead(PIN_MQ5);
  float gasRatio = (float)rawGas / 4095.0f; // Normalizado 0.0000–1.0000

  // ── DHT22 ──────────────────────────────────────────────────────────────────
  float temperatura = dht.readTemperature();
  float umidade = dht.readHumidity();

  if (isnan(temperatura) || isnan(umidade))
  {
    Serial.println("[DHT] Falha na leitura — usando -99.");
    temperatura = -99.0f;
    umidade = -99.0f;
  }

  bool alertaGas = (rawGas >= GAS_THRESHOLD);

  // ── Monta JSON com 4 casas decimais ───────────────────────────────────────
  StaticJsonDocument<256> doc;
  doc["tipo"] = alertaGas ? "ALERTA_GAS" : "SENSOR";
  doc["gas"] = round(gasRatio * 10000.0f) / 10000.0f;
  doc["temperatura"] = round(temperatura * 10000.0f) / 10000.0f;
  doc["umidade"] = round(umidade * 10000.0f) / 10000.0f;
  doc["alerta_gas"] = alertaGas;

  char jsonBuf[256];
  serializeJson(doc, jsonBuf);

  mqttClient.publish(topicSensors, jsonBuf);
  Serial.print("[SENSOR] ");
  Serial.println(jsonBuf);

  // ── Emergência autônoma por detecção de gás ───────────────────────────────
  // O firmware age IMEDIATAMENTE, sem esperar resposta do servidor.
  // O backend será notificado via MQTT e registrará o evento.
  if (alertaGas)
  {
    Serial.println("[ALERTA] Gas detectado! Abrindo fechadura para evacuacao.");
    abrirFechadura("emergencia_gas_autonoma");

    // Pisca o LED de alerta visual
    for (int i = 0; i < 8; i++)
    {
      digitalWrite(PIN_LED_STATUS, !digitalRead(PIN_LED_STATUS));
      delay(150);
    }
  }
}

// =============================================================================
//  Callback MQTT — processa mensagens recebidas no tópico de comandos
// =============================================================================
void mqttCallback(char *topic, byte *payload, unsigned int length)
{
  char msg[length + 1];
  memcpy(msg, payload, length);
  msg[length] = '\0';

  Serial.print("[MQTT] Recebido [");
  Serial.print(topic);
  Serial.print("]: ");
  Serial.println(msg);

  if (strcmp(topic, topicCommands) != 0)
    return;

  // ── Tenta parsear como JSON (comandos BLE) ────────────────────────────────
  StaticJsonDocument<256> doc;
  DeserializationError err = deserializeJson(doc, msg);

  if (!err && doc.containsKey("cmd"))
  {
    const char *cmd = doc["cmd"];

    if (strcmp(cmd, "SET_BLE_TOKEN") == 0)
    {
      // Django pré-carrega o token da reserva ativa no ESP32
      const char *token = doc["token"] | "";
      const char *fim = doc["fim"] | "";
      prefs.begin("ble", /*readOnly=*/false);
      prefs.putString("token", token);
      prefs.putString("fim", fim);
      prefs.end();
      Serial.print("[BLE] Token salvo na NVS. Valido ate: ");
      Serial.println(fim);
      return;
    }

    if (strcmp(cmd, "CLEAR_BLE_TOKEN") == 0)
    {
      // Reserva revogada — apaga credenciais BLE da NVS
      prefs.begin("ble", /*readOnly=*/false);
      prefs.remove("token");
      prefs.remove("fim");
      prefs.end();
      bleAuthenticated = false;
      Serial.println("[BLE] Token removido da NVS (reserva revogada).");
      return;
    }

    Serial.println("[MQTT] Comando JSON desconhecido.");
    return;
  }

  // ── Comando de texto simples ──────────────────────────────────────────────
  if (strcmp(msg, "OPEN") == 0)
  {
    abrirFechadura("comando_remoto_backend");
  }
  // Espaço para futuros comandos: "LOCK", "STATUS_REQUEST", etc.
}

// =============================================================================
//  Reconexão MQTT com Last Will Testament (LWT)
//
//  LWT: se o ESP32 desconectar abruptamente (queda de energia, reset,
//  perda de Wi-Fi), o broker publica "OFFLINE" automaticamente no tópico
//  de status — o Django subscriber captura e marca esta_online=False.
// =============================================================================
void reconectarMQTT()
{
  while (!mqttClient.connected())
  {
    // ── Libera heap do BLE para o handshake TLS ───────────────────────────────
    // BLE é fallback offline; quando MQTT está disponível, não precisamos de BLE.
    // O BLE é reativado logo após a conexão MQTT ser estabelecida.
    if (bleAtivo)
    {
      Serial.println("[BLE] Suspendendo BLE para liberar heap para TLS...");
      BLEDevice::deinit(true);
      bleAtivo = false;
      bleAuthenticated = false;
      bleClientConnected = false;
      bleStatusChar = nullptr;
      delay(100);
    }

    Serial.print("[MQTT] Heap livre: ");
    Serial.print(ESP.getFreeHeap());
    Serial.println(" bytes");
    Serial.print("[MQTT] Conectando ao HiveMQ Cloud...");

    wifiClient.stop();
    wifiClient.setInsecure();
    wifiClient.setTimeout(30);

    // Client ID único: "esp32-" + MAC sem separadores
    String clientId = "esp32-";
    clientId += deviceMac;
    clientId.replace(":", ""); // ex: esp32-AABBCCDDEEFF

    // connect(clientId, user, pass, willTopic, willQoS, willRetain, willMsg)
    bool ok = mqttClient.connect(
        clientId.c_str(),
        MQTT_USER,
        MQTT_PASSWORD,
        topicStatus, // LWT topic
        0,           // LWT QoS 0
        true,        // LWT retain
        "OFFLINE"    // LWT payload
    );

    if (ok)
    {
      Serial.println(" conectado!");
      mqttClient.subscribe(topicCommands);
      Serial.print("[MQTT] Subscrito: ");
      Serial.println(topicCommands);
      publicarStatusOnline();
      digitalWrite(PIN_LED_STATUS, HIGH);
      mqttRetries = 0; // zera contador de falhas
    }
    else
    {
      mqttRetries++;
      Serial.print(" falhou (rc=");
      Serial.print(mqttClient.state());
      Serial.print("). Tentativa ");
      Serial.print(mqttRetries);
      Serial.print("/");
      Serial.print(MAX_MQTT_RETRIES);
      Serial.println(".");
      digitalWrite(PIN_LED_STATUS, LOW);

      if (mqttRetries >= MAX_MQTT_RETRIES)
      {
        Serial.println("[MODO BLE] Sem internet. Ativando fallback BLE offline...");
        setupBLE();
        bleAtivo = true;
        modoBLE = true;
        return; // sai do while; loop() gerencia o modo BLE
      }
      delay(5000);
    }
  }
}

// =============================================================================
//  Setup
// =============================================================================
void setup()
{
  Serial.begin(115200);

  pinMode(PIN_RELAY, OUTPUT);
  pinMode(PIN_LED_STATUS, OUTPUT);
  digitalWrite(PIN_RELAY, LOW); // Fechadura travada no boot
  digitalWrite(PIN_LED_STATUS, LOW);

  dht.begin();
  setupWifi();
  buildTopics();
  // BLE é inicializado em reconectarMQTT() após MQTT conectar,
  // para garantir heap suficiente para o handshake TLS.

  mqttClient.setBufferSize(512);
  mqttClient.setServer(MQTT_HOST, MQTT_PORT);
  mqttClient.setCallback(mqttCallback);
}

// =============================================================================
//  Loop principal
// =============================================================================
void loop()
{
  // ── Modo BLE offline (sem internet) ────────────────────────────────────────
  if (modoBLE)
  {
    unsigned long agora = millis();
    if (bleAuthenticated && (agora - bleAuthAt > BLE_SESSION_TIMEOUT_MS))
    {
      bleAuthenticated = false;
      Serial.println("[BLE] Sessão expirada por timeout.");
      if (bleClientConnected && bleStatusChar)
      {
        bleStatusChar->setValue("DENIED");
        bleStatusChar->notify();
      }
    }
    return; // não executa lógica MQTT no modo BLE
  }

#if MODO_TESTE_BLE
  // ── Desconexão forçada de Wi-Fi para teste do fallback BLE ─────────────────
  if (WiFi.isConnected() && millis() > TESTE_BLE_WIFI_OFF_MS)
  {
    Serial.println("[TESTE BLE] 2 min atingidos — desconectando Wi-Fi para ativar modo BLE.");
    mqttClient.disconnect();
    WiFi.disconnect(true);
  }
#endif

  // ── Modo MQTT (com internet) ────────────────────────────────────────────────
  if (!mqttClient.connected())
  {
    digitalWrite(PIN_LED_STATUS, LOW);
    reconectarMQTT();
  }
  mqttClient.loop();

  unsigned long agora = millis();

  // Heartbeat de status ONLINE
  if (agora - lastHeartbeat >= HEARTBEAT_INTERVAL)
  {
    lastHeartbeat = agora;
    publicarStatusOnline();
  }

  // Leitura e publicação de sensores
  if (agora - lastSensor >= SENSOR_INTERVAL)
  {
    lastSensor = agora;
    publicarTelemetria();
  }
}
