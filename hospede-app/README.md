# App do Hóspede — React Native / Expo

App mobile do hóspede: resgate do token de acesso, abertura da porta pela internet (via API REST → Django → MQTT) e fallback de abertura via **Bluetooth (BLE)** direto no ESP32 quando não há internet no local.

## Instalação

```bash
cd hospede-app
npm install
```

## Rodando em modo desenvolvimento (Expo Go)

```bash
npm start            # ou: expo start
npm run android      # Abre no emulador/dispositivo Android
npm run ios          # Abre no simulador iOS
```

> ⚠️ O **BLE não funciona no Expo Go** — é preciso um Development Build (ver abaixo) para testar o fallback offline.

## Configurar URL do backend

Edite `src/lib/api.ts` e ajuste `BASE_URL` para o IP da máquina onde o Django está rodando (não use `localhost` — no celular físico ele aponta para o próprio celular):

```ts
const BASE_URL = "http://192.168.X.X:8000/api"; // IP da sua máquina na rede local
```

Celular e computador precisam estar na mesma rede Wi-Fi.

## Development Build (com BLE)

Requer conta no [Expo](https://expo.dev) e EAS CLI instalado (`npm install -g eas-cli`).

```bash
eas login                          # Login com conta Expo
npm run build:dev                  # eas build --profile development --platform android
npm run build:preview              # eas build --profile preview --platform android
```

Após instalar o APK no dispositivo Android:

```bash
npx expo start --dev-client        # Conecta com o APK instalado
```

| Perfil (`eas.json`) | Tipo | Uso |
| --- | --- | --- |
| `development` | APK (debug) | Hot reload + BLE |
| `preview` | APK | Testes internos, sem dev tools |
| `production` | AAB | Publicação na Play Store |

`.npmrc` já vem com `legacy-peer-deps=true` — necessário para o servidor de build da EAS não travar em conflitos de *peer dependency*.

## Funcionalidades

- Login / Cadastro
- Resgate de token de acesso (código de 12 dígitos)
- Abertura de porta via internet (REST → Django → MQTT)
- Abertura via **Bluetooth BLE** offline, sem internet:
  - Service UUID: `12345678-1234-1234-1234-123456789abc`
  - Advertising: `SmartLock-{6 últimos dígitos do MAC}`
  - `src/lib/ble.ts` — scan, connect, authenticate, sendCommand, disconnect
  - `src/screens/BluetoothScreen.tsx` — fluxo scan → connect → auth → abrir
- Detecção automática de ausência de internet (`expo-network`) — o app oferece o modo BLE quando fica offline
- Token persistido com `expo-secure-store`, revalidado a cada abertura do app
