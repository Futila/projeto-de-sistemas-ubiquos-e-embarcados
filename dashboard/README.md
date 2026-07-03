# Dashboard Web — Painel do Anfitrião

Painel web para o anfitrião gerenciar fechaduras, confirmar reservas e acompanhar sensores/logs em tempo real. Fala apenas com a API REST do Django — nunca diretamente com o broker MQTT ou com o ESP32.

## Stack

- React 19 + TypeScript + Vite
- Tailwind CSS v4 (`src/index.css`)
- Shadcn UI (estilo `radix-nova`, componentes em `src/components/ui/`)
- React Router v7, React Hook Form + Zod
- Lucide React (ícones), Axios (HTTP)

## Instalação

```bash
cd dashboard
npm install
```

## Rodando em desenvolvimento

```bash
npm run dev       # http://localhost:5173
```

## Build de produção

```bash
npm run build     # tsc -b && vite build → gera dist/
npm run preview   # Serve o build localmente
```

## Lint

```bash
npm run lint
```

## Configuração da API

A URL base da API está em `src/lib/api.ts`:

```ts
baseURL: "http://localhost:8000/api";
```

Altere essa constante antes do build para apontar para outro ambiente (ex.: backend em produção).

## Telas principais

`/login`, `/register`, `/dashboard` (status online/offline das fechaduras), `/fechaduras/:id` (detalhe + histórico de eventos), `/reservas` (gestão de acessos temporários), `/logs` (eventos e alertas de sensores), `/perfil`.

Um interceptador Axios injeta automaticamente o token de autenticação em todas as requisições após o login.
