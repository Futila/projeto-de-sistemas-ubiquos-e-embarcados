# Firmware — ESP32 (Sistema de Controle de Acesso IoT)

Firmware do microcontrolador ESP32 para o sistema de controle de acesso do TCC.

---

## Hardware necessário

| Componente                          | Quantidade | Observação                                                |
| ------------------------------------ | ---------- | ---------------------------------------------------------- |
| ESP32 DevKit v1 (ou similar)        | 1          | Qualquer variante com Wi-Fi                                 |
| Sensor de gás/fumaça MQ-5           | 1          | Módulo com comparador onboard; o firmware usa a saída AO    |
| Sensor temperatura/umidade DHT22    | 1          | Pode usar DHT11 (menor precisão)                            |
| Acoplador óptico PC817               | 1          | Isolamento galvânico entre ESP32 (3,3V) e fechadura (12V)   |
| Solenoide de porta / trava elétrica | 1          | Alimentada separadamente (12V)                              |
| Fonte 12V / 1A para o solenoide     | 1          | —                                                            |
| Jumpers e protoboard                | —          | Montagem                                                     |

Ver `docs/images/esquema-conexao.svg` (na raiz do repositório) para o diagrama completo de conexão, e `docs/problemas-e-solucoes.md` para o histórico de correções de hardware/firmware.

---

## Mapeamento de pinos

```
ESP32 GPIO 23  →  entrada do acoplador óptico PC817 → aciona a fechadura solenoide (12V)
ESP32 GPIO 34  →  AO (analógico) do sensor MQ-5  [ADC1_CH6, entrada apenas]
ESP32 GPIO 27  →  DATA do sensor DHT22
ESP32 GPIO  2  →  LED interno (status MQTT)
ESP32  3.3V    →  VCC do DHT22
ESP32  GND     →  GND do DHT22 e do lado de controle do acoplador óptico
5V/12V externo →  VCC do MQ-5 e alimentação da fechadura (lado isolado do acoplador)
```

> **Atenção:** o GPIO 34 do ESP32 é somente entrada — não conecte saídas nele.
> O acoplador óptico separa eletricamente o circuito de controle (3,3V) do circuito de
> alimentação da fechadura (12V), protegendo o ESP32 contra transientes elétricos.
>
> **Nota de consistência:** o módulo MQ-5 usado possui comparador onboard (saída digital
> DO), mas o firmware atual lê o pino em modo analógico (`analogRead`) e compara com
> `GAS_THRESHOLD`. Isso funciona (o módulo também expõe a saída AO), mas é uma divergência
> entre a descrição da monografia e a implementação — ver `docs/problemas-e-solucoes.md`.

---

## Bibliotecas (Arduino IDE)

Instale pelo menu **Sketch → Include Library → Manage Libraries**:

| Biblioteca              | Autor           | Versão testada |
| ------------------------ | --------------- | -------------- |
| PubSubClient            | Nick O'Leary    | ≥ 2.8          |
| DHT sensor library      | Adafruit        | ≥ 1.4          |
| Adafruit Unified Sensor | Adafruit        | ≥ 1.1          |
| ArduinoJson             | Benoit Blanchon | ≥ 6.21         |

BLE e NVS (`Preferences`) já vêm inclusos no ESP32 Arduino Core — não precisam de instalação separada.

---

## Configuração antes de gravar

1. Copie `main/secrets.h.example` para `main/secrets.h`
2. Edite `main/secrets.h` com seus dados reais:

```cpp
// Wi-Fi
const char* WIFI_SSID     = "SUA_REDE_WIFI";
const char* WIFI_PASSWORD = "SUA_SENHA_WIFI";

// HiveMQ Cloud — Dashboard > Clusters > seu cluster > Overview
const char* MQTT_HOST     = "SEU_CLUSTER.s1.eu.hivemq.cloud";
const char* MQTT_USER     = "SEU_USUARIO_HIVEMQ";
const char* MQTT_PASSWORD = "SUA_SENHA_HIVEMQ";
```

`secrets.h` não é versionado (está no `.gitignore`) — cada pessoa que clonar o repositório mantém suas próprias credenciais localmente. `main.ino` inclui esse arquivo via `#include "secrets.h"`.

3. No Arduino IDE, selecione **Tools → Partition Scheme → "Huge APP (3MB No OTA/1MB SPIFFS)"** — o firmware (Wi-Fi TLS + MQTT + BLE + JSON) ocupa ~1,77 MB e não cabe no esquema padrão.

---

## Como obter o `id_dispositivo` (MAC Address)

1. Grave o firmware no ESP32
2. Abra o **Serial Monitor** (115200 baud)
3. O MAC aparecerá assim no boot:

```
=== MQTT ID DISPOSITIVO ===
AA:BB:CC:DD:EE:FF
Cadastre este MAC em Fechadura.id_dispositivo no Django.
===========================
```

4. Acesse o painel Django (ou Admin) e cadastre/edite a `Fechadura` com esse MAC exato no campo `id_dispositivo`

---

## Contrato MQTT implementado

| Direção         | Tópico                    | Payload                  |
| --------------- | ------------------------- | ------------------------ |
| Backend → ESP32 | `v1/locks/{MAC}/commands` | `"OPEN"`                 |
| ESP32 → Backend | `v1/locks/{MAC}/status`   | `"ONLINE"` / `"OFFLINE"` |
| ESP32 → Backend | `v1/locks/{MAC}/sensors`  | JSON (ver abaixo)        |

### Exemplo de payload de sensores

```json
{
  "tipo": "SENSOR",
  "gas": 0.032,
  "temperatura": 25.67,
  "umidade": 68.3,
  "alerta_gas": false
}
```

Em alerta de gás:

```json
{
  "tipo": "ALERTA_GAS",
  "gas": 0.5124,
  "temperatura": 28.13,
  "umidade": 72.0,
  "alerta_gas": true
}
```

> Os valores têm **4 casas decimais** para atender o campo `DecimalField(decimal_places=4)` do Django (`HistoricoEvento.valor_sensor`).

---

## Comportamento de emergência

Se o sensor MQ-5 retornar um valor ≥ `GAS_THRESHOLD` (padrão: 2000/4095):

1. O firmware **abre o relé/acoplador óptico imediatamente**, sem esperar resposta do servidor
2. Publica `tipo: "ALERTA_GAS"` no tópico de sensores
3. O Django subscriber recebe o alerta e cria um `HistoricoEvento` do tipo `ALERTA_GAS`
4. O dashboard exibe o alerta em tempo real

---

## Execução do MQTT Subscriber (Django)

Para que o Django receba a telemetria do ESP32, execute em segundo plano:

```bash
cd backend
source venv/bin/activate
python manage.py mqtt_subscriber
```

Este comando mantém uma conexão MQTT persistente e:

- Atualiza `Fechadura.esta_online` e `ultima_comunicacao` ao receber status
- Cria registros em `HistoricoEvento` para alertas e telemetria de temperatura
