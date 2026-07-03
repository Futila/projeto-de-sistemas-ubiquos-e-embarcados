# Copilot Instructions

## Project Overview

TCC (Undergraduate Thesis) in Computer Engineering at UFSC Araranguá. An IoT smart access control system for short-term rental properties. The system manages electronic locks (ESP32) with temporary digital keys for guests.

---

## Architecture: Interceptor/Comandante Pattern

**Critical design rule:** The frontend NEVER communicates with MQTT directly. All access goes through Django.

```
React (Dashboard) → REST API (Django) → MQTT Broker (HiveMQ) → ESP32 (Firmware)
```

- Django validates business rules (is the reservation active? is the token valid?) before publishing MQTT commands.
- MQTT topic pattern: `v1/locks/{id_dispositivo}/commands`
- `id_dispositivo` is the ESP32's MAC address — it must match exactly between the firmware, the MQTT subscription, and the `Fechadura.id_dispositivo` field in the database.

---

## Running the Project

### Backend (Django)

```bash
cd backend
source venv/bin/activate
python manage.py runserver        # API at http://localhost:8000
python manage.py migrate          # Apply migrations
python manage.py makemigrations   # After model changes
```

Run a single test:
```bash
python manage.py test access_control.tests.TestClassName.test_method_name
```

Manual API test (trigger lock open):
```bash
curl -X POST http://127.0.0.1:8000/api/fechaduras/1/abrir/
```

### Frontend Dashboard

```bash
cd dashboard
npm run dev     # Dev server at http://localhost:5173
npm run build   # Production build (tsc -b && vite build)
npm run lint    # ESLint
```

---

## Backend Conventions (`backend/`)

- Django app: `access_control/` — all models, views, serializers, and URLs live here.
- URL prefix: all API routes are under `/api/` (e.g., `/api/fechaduras/`).
- ViewSets use DRF's `DefaultRouter`; custom actions use `@action(detail=True, methods=['post'])`.
- Current permission policy: `AllowAny` (dev only — intended to be replaced with JWT auth).
- DB: SQLite3 for development, PostgreSQL for production.
- CORS allows `localhost:5173` (Vite) and `localhost:3000`.

### Key Models

| Model | Purpose |
|---|---|
| `Fechadura` | Digital twin of the ESP32 hardware. `id_dispositivo` is the MQTT routing key. |
| `AcessoTemporario` | Manages guest access tokens. Enforces temporal validity via `inicio_reserva`/`fim_reserva`. |
| `HistoricoEvento` | Audit log and sensor telemetry. |

**`AcessoTemporario` status flow:**
`PENDENTE` → `AGENDADO` → `ATIVO` → `EXPIRADO` / `REVOGADO`

- Token resgate: 12-char uppercase hex, auto-generated.
- A guest "claims" a token by matching their authenticated email to `hospede_identificador`, which transitions status from `PENDENTE` to `AGENDADO`.

**Sensor precision requirement:** `HistoricoEvento.valor_sensor` uses `DecimalField(max_digits=10, decimal_places=4)` — at least 4 significant digits must be preserved across the entire data pipeline (firmware → MQTT payload → API → DB → dashboard display).

---

## Frontend Conventions (`dashboard/`)

- Framework: React 19 + TypeScript + Vite.
- CSS: Tailwind CSS v4 (configured via `src/index.css`, not `tailwind.config.js`).
- Component library: **Shadcn UI** with `radix-nova` style, `neutral` base color, CSS variables enabled.
- Icons: `lucide-react`.
- Path alias `@/` maps to `src/` (configured in `tsconfig.app.json` and `vite.config.ts`).
- Shadcn components live in `src/components/ui/`. Add new ones via `npx shadcn add <component>`.
- Utility function `cn()` is in `src/lib/utils.ts` — use it for conditional class merging (`clsx` + `tailwind-merge`).

---

## Hardware / Firmware (`firmware/`)

- ESP32 with C++ (Arduino Framework).
- The firmware's MQTT Client ID and subscription topic must use exactly the value stored in `Fechadura.id_dispositivo`.
- Emergency behavior: on gas leak detection, the lock deactivates autonomously on the firmware side (no server command required).
- Sensors: MQ-2 (gas/smoke), DHT11/22 (temperature). Values are published as JSON with 4 significant digits.
