# API Reference — AccessControl

> Base URL: `http://localhost:8000/api`  
> Autenticação: Token-based (`Authorization: Token <token>`)  
> Content-Type: `application/json`

---

## Autenticação

### Registrar usuário

```
POST /api/users/
```

**Público** (sem token).

**Request body:**

```json
{
  "first_name": "Fernando",
  "username": "fernando@email.com",
  "email": "fernando@email.com",
  "password": "minhasenha123"
}
```

**Response 201:**

```json
{
  "token": "9f3e2b1a...",
  "user_id": 1,
  "email": "fernando@email.com"
}
```

**Erros:**

- `400` — campos inválidos ou email já cadastrado

---

### Login

```
POST /api/auth/login/
```

**Público** (sem token).

**Request body:**

```json
{
  "username": "fernando@email.com",
  "password": "minhasenha123"
}
```

**Response 200:**

```json
{
  "token": "9f3e2b1a...",
  "user_id": 1,
  "email": "fernando@email.com"
}
```

**Erros:**

- `401` — credenciais inválidas

> O token deve ser salvo pelo cliente e incluído em todas as requisições subsequentes no header `Authorization: Token <token>`.

---

### Perfil do usuário autenticado

```
GET  /api/users/me/
PATCH /api/users/me/
```

**Requer token.**

**Response GET 200:**

```json
{
  "id": 1,
  "first_name": "Fernando",
  "last_name": "Demo",
  "username": "fernando@email.com",
  "email": "fernando@email.com"
}
```

**PATCH body** (campos opcionais):

```json
{
  "first_name": "Novo Nome",
  "email": "novo@email.com",
  "password": "novasenha456"
}
```

> Trocar a senha invalida o token atual e gera um novo automaticamente.

---

## Fechaduras

### Listar fechaduras

```
GET /api/fechaduras/
```

**Requer token.**

**Response 200:**

```json
[
  {
    "id": 1,
    "id_unico": "550e8400-e29b-41d4-a716-446655440000",
    "nome": "Porta Principal - Casa Praia",
    "id_dispositivo": "AA:BB:CC:11:22:01",
    "proprietario": 1,
    "esta_online": true,
    "ultima_comunicacao": "2024-01-15T14:30:00Z",
    "criado_em": "2024-01-01T10:00:00Z"
  }
]
```

---

### Criar fechadura

```
POST /api/fechaduras/
```

**Requer token.**

**Request body:**

```json
{
  "nome": "Porta dos Fundos - Apto 101",
  "id_dispositivo": "AA:BB:CC:11:22:07"
}
```

> `id_dispositivo` deve ser o MAC address do ESP32 — usado como identificador MQTT.  
> Formato recomendado: `AA:BB:CC:DD:EE:FF`

**Response 201:** objeto `Fechadura` completo.

**Erros:**

- `400` — `id_dispositivo` já cadastrado

---

### Detalhe da fechadura

```
GET  /api/fechaduras/{id}/
PUT  /api/fechaduras/{id}/
PATCH /api/fechaduras/{id}/
DELETE /api/fechaduras/{id}/
```

**Requer token.**

---

### Abrir porta

```
POST /api/fechaduras/{id}/abrir/
```

**Requer token.**

Publica o payload `"OPEN"` no tópico MQTT:

```
v1/locks/{id_dispositivo}/commands
```

**Response 200:**

```json
{
  "status": "Comando enviado para v1/locks/AA:BB:CC:11:22:01/commands"
}
```

**Erros:**

- `500` — falha na conexão com o broker MQTT

> Broker: HiveMQ Cloud (`8883`, TLS + autenticação). Configurado via variáveis de ambiente `MQTT_HOST`, `MQTT_PORT`, `MQTT_USER`, `MQTT_PASSWORD` no `settings.py`.  
> O ESP32 subscreve exatamente este tópico e executa a abertura ao receber `"OPEN"`.

---

## Acessos Temporários

### Listar acessos

```
GET /api/acessos/
```

**Requer token.** Retorna todos os acessos, ordenados por `-id`.

**Response 200:**

```json
[
  {
    "id": 1,
    "fechadura": 1,
    "fechadura_nome": "Porta Principal - Casa Praia",
    "hospede_identificador": "hospede@email.com",
    "token_resgate": "A3F9E2B1C4D7",
    "inicio_reserva": "2024-01-10T14:00:00Z",
    "fim_reserva": "2024-01-13T12:00:00Z",
    "status": "ATIVO"
  }
]
```

**Status possíveis:**

| Valor      | Significado                         |
| ---------- | ----------------------------------- |
| `PENDENTE` | Convite criado, token não resgatado |
| `AGENDADO` | Token resgatado, aguardando data    |
| `ATIVO`    | Acesso autorizado (dentro do prazo) |
| `EXPIRADO` | Prazo encerrado                     |
| `REVOGADO` | Cancelado pelo anfitrião            |

---

### Criar acesso

```
POST /api/acessos/
```

**Requer token.**

**Request body:**

```json
{
  "fechadura": 1,
  "hospede_identificador": "hospede@email.com",
  "inicio_reserva": "2024-02-01T14:00:00Z",
  "fim_reserva": "2024-02-05T12:00:00Z"
}
```

> `token_resgate` é gerado automaticamente (12 caracteres hexadecimais maiúsculos, único).

**Response 201:** objeto `AcessoTemporario` completo.

---

### Revogar acesso

```
POST /api/acessos/{id}/revogar/
```

**Requer token.**

Define `status = "REVOGADO"`. Rejeita se o acesso já está `EXPIRADO` ou `REVOGADO`.

**Response 200:** objeto atualizado.

**Erros:**

- `400` — `{"error": "Acesso já encerrado."}`

---

## Histórico de Eventos

### Listar eventos

```
GET /api/eventos/
GET /api/eventos/?fechadura={id}
```

**Requer token.** Read-only. Ordenado por `-timestamp` (mais recente primeiro).

O parâmetro `?fechadura=<id>` filtra eventos de uma fechadura específica.

**Response 200:**

```json
[
  {
    "id": 1,
    "fechadura": 1,
    "fechadura_nome": "Porta Principal - Casa Praia",
    "tipo": "ALERTA_GAS",
    "valor_sensor": "0.0320",
    "descricao": "Nível de gás acima do normal detectado",
    "timestamp": "2024-01-15T11:00:00Z"
  }
]
```

**Tipos de evento:**

| Tipo            | Ícone | Descrição                           |
| --------------- | ----- | ----------------------------------- |
| `ACESSO`        | 🔑    | Abertura de porta                   |
| `ALERTA_GAS`    | ⚠️    | Detecção de gás pelo sensor MQ-2    |
| `ALERTA_FUMACA` | 🔥    | Detecção de fumaça pelo sensor MQ-2 |
| `SISTEMA`       | 📡    | Status do dispositivo (boot, OTA…)  |

> `valor_sensor` — `DecimalField(max_digits=10, decimal_places=4)`. Preserva 4 algarismos significativos end-to-end (firmware → Django → API → frontend).

---

## Contrato MQTT (Firmware ↔ Backend)

| Direção         | Tópico                               | Payload                   |
| --------------- | ------------------------------------ | ------------------------- |
| Backend → ESP32 | `v1/locks/{id_dispositivo}/commands` | `"OPEN"`                  |
| ESP32 → Backend | `v1/locks/{id_dispositivo}/status`   | `"ONLINE"` / `"OFFLINE"`  |
| ESP32 → Backend | `v1/locks/{id_dispositivo}/sensors`  | JSON (ver formato abaixo) |

> `id_dispositivo` = MAC address do ESP32, ex: `AA:BB:CC:11:22:01`  
> O firmware subscreve `v1/locks/{seu_mac}/commands` ao inicializar.  
> O status `"OFFLINE"` é enviado automaticamente pelo broker via **Last Will Testament** quando o ESP32 perde conexão.

### Broker MQTT

**HiveMQ Cloud** — autenticado, com TLS na porta `8883`.

Configuração no servidor (via variáveis de ambiente ou `settings.py`):

```
MQTT_HOST     = <cluster>.s1.eu.hivemq.cloud
MQTT_PORT     = 8883
MQTT_USER     = <usuário>
MQTT_PASSWORD = <senha>
```

### Formato do payload de sensores (`/sensors`)

```json
{
  "tipo":        "SENSOR",
  "gas":         0.0320,
  "temperatura": 25.6700,
  "umidade":     68.3000,
  "alerta_gas":  false
}
```

Em caso de detecção de gás acima do limiar:

```json
{
  "tipo":        "ALERTA_GAS",
  "gas":         0.5124,
  "temperatura": 28.1300,
  "umidade":     72.0000,
  "alerta_gas":  true
}
```

> Todos os valores numéricos têm **4 casas decimais** para compatibilidade com `DecimalField(decimal_places=4)` do modelo `HistoricoEvento`.

---

## Serviço de Recepção de Telemetria (mqtt_subscriber)

O Django não assina tópicos MQTT na API REST. Para processar mensagens do firmware, execute o subscriber como processo separado:

```bash
cd backend
source venv/bin/activate
python manage.py mqtt_subscriber
```

O subscriber:
- Assina `v1/locks/+/status` e `v1/locks/+/sensors`
- Ao receber `status`: atualiza `Fechadura.esta_online` e `ultima_comunicacao`
- Ao receber `sensors`: cria `HistoricoEvento` (`ALERTA_GAS` ou `SISTEMA`)

---

## Exemplos com cURL

```bash
# Login
curl -X POST http://localhost:8000/api/auth/login/ \
  -H "Content-Type: application/json" \
  -d '{"username":"anfitriao@demo.com","password":"demo12345"}'

# Listar fechaduras
curl http://localhost:8000/api/fechaduras/ \
  -H "Authorization: Token SEU_TOKEN"

# Abrir porta (id=1)
curl -X POST http://localhost:8000/api/fechaduras/1/abrir/ \
  -H "Authorization: Token SEU_TOKEN"

# Criar acesso temporário
curl -X POST http://localhost:8000/api/acessos/ \
  -H "Authorization: Token SEU_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "fechadura": 1,
    "hospede_identificador": "hospede@email.com",
    "inicio_reserva": "2024-02-01T14:00:00Z",
    "fim_reserva": "2024-02-05T12:00:00Z"
  }'

# Ver logs de uma fechadura
curl "http://localhost:8000/api/eventos/?fechadura=1" \
  -H "Authorization: Token SEU_TOKEN"
```
