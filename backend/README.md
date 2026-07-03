# Backend — API Django (Sistema de Controle de Acesso IoT)

API REST em Django + Django REST Framework que atua como **Servidor Interceptador**: valida regras de negócio (a reserva está ativa? o token é válido?) antes de publicar qualquer comando MQTT para o ESP32. Nenhum cliente (dashboard, app) fala diretamente com o broker MQTT.

---

## Instalação

```bash
cd backend
python -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

`requirements.txt`:

```
Django==5.2.12
django-cors-headers==4.9.0
djangorestframework==3.17.0
paho-mqtt==2.1.0
```

## Variáveis de ambiente (obrigatórias para o MQTT funcionar)

`backend/setup/settings.py` lê as credenciais do broker MQTT de variáveis de ambiente — os valores padrão no código são apenas placeholders, exporte as suas antes de rodar:

```bash
export MQTT_HOST="SEU_CLUSTER.s1.eu.hivemq.cloud"
export MQTT_PORT=8883
export MQTT_USER="seu_usuario"
export MQTT_PASSWORD="sua_senha"
```

Sem essas variáveis, o servidor Django sobe normalmente, mas qualquer ação que publique no MQTT (abrir fechadura, sincronizar token BLE) falhará ao tentar conectar no broker.

## Banco de dados

SQLite para desenvolvimento (`backend/db.sqlite3`, criado automaticamente):

```bash
python manage.py migrate          # Cria/atualiza as tabelas
python manage.py createsuperuser  # Cria o primeiro usuário admin
python manage.py seed_data        # (opcional) popula dados de demonstração
```

## Rodando o servidor

```bash
python manage.py runserver        # API em http://localhost:8000
```

## MQTT Subscriber (telemetria)

Para receber dados dos sensores e o status online/offline do ESP32, rode em um segundo terminal:

```bash
source venv/bin/activate
python manage.py mqtt_subscriber
```

Esse processo mantém conexão MQTT persistente e:

- Atualiza `Fechadura.esta_online` e `ultima_comunicacao`
- Cria registros em `HistoricoEvento` para alertas de gás e telemetria

## Modelos principais

| Modelo | Descrição |
| --- | --- |
| `Fechadura` | Twin digital do ESP32. `id_dispositivo` = MAC address (chave usada nos tópicos MQTT) |
| `AcessoTemporario` | Token de acesso do hóspede, com validade (`inicio_reserva`/`fim_reserva`) e ciclo de vida `PENDENTE → AGENDADO → ATIVO → EXPIRADO / REVOGADO` |
| `HistoricoEvento` | Log de auditoria e telemetria de sensores, valores com 4 casas decimais |

`signals.py` publica `SET_BLE_TOKEN`/`CLEAR_BLE_TOKEN` via MQTT automaticamente quando um `AcessoTemporario` é salvo, mantendo o token BLE do ESP32 sincronizado.

## Endpoints principais

| Método | Endpoint | Descrição |
| --- | --- | --- |
| `POST` | `/api/users/` | Cadastro de usuário |
| `POST` | `/api/auth/login/` | Login (retorna Token) |
| `GET` | `/api/users/me/` | Perfil do usuário autenticado |
| `GET/POST` | `/api/fechaduras/` | Listar/criar fechaduras |
| `POST` | `/api/fechaduras/{id}/abrir/` | Abrir fechadura (publica MQTT) |
| `POST` | `/api/fechaduras/{id}/sincronizar_ble/` | Reenvia o token BLE manualmente |
| `GET/POST` | `/api/acessos/` | Listar/criar acessos temporários |
| `POST` | `/api/hospede/resgatar/` | Hóspede resgata token de acesso |
| `POST` | `/api/hospede/abrir/` | Hóspede abre a porta pelo app |
| `GET` | `/api/eventos/` | Histórico de eventos e sensores |

Referência completa (payloads, respostas, contrato MQTT): [`../docs/api.md`](../docs/api.md).

### Teste rápido via cURL

```bash
curl -X POST http://localhost:8000/api/auth/login/ \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "sua_senha"}'

curl -X POST http://localhost:8000/api/fechaduras/1/abrir/ \
  -H "Authorization: Token SEU_TOKEN"
```

## Testes automatizados

```bash
python manage.py test access_control
```
