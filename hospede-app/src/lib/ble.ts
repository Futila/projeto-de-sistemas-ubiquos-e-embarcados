/**
 * ble.ts — Utilitários de comunicação BLE com o ESP32 (SmartLock)
 *
 * Fluxo de uso:
 *   1. bleManager.startDeviceScan  → encontra ESP32 pelo Service UUID
 *   2. device.connect()            → conecta
 *   3. discoverAllServicesAndCharacteristics()
 *   4. escreve token em AUTH_CHAR  → ESP32 responde via STATUS_CHAR (notify)
 *   5. se "AUTHORIZED": escreve "OPEN" / "LED_ON" / "LED_OFF" em COMMAND_CHAR
 *
 * UUIDs devem coincidir com os definidos em firmware/main/main.ino.
 */

import { BleManager, Device, Characteristic, BleError, State } from 'react-native-ble-plx'
import { Buffer } from 'buffer'
import { PermissionsAndroid, Platform } from 'react-native'

// ─── UUIDs (espelho exato do firmware) ───────────────────────────────────────
export const BLE_SERVICE_UUID  = '12345678-1234-1234-1234-123456789abc'
export const BLE_AUTH_UUID     = '12345678-1234-1234-1234-123456789001'
export const BLE_COMMAND_UUID  = '12345678-1234-1234-1234-123456789002'
export const BLE_STATUS_UUID   = '12345678-1234-1234-1234-123456789003'

// ─── Timeouts ────────────────────────────────────────────────────────────────
const SCAN_TIMEOUT_MS = 15_000
const AUTH_TIMEOUT_MS = 10_000

// ─── Singleton do BleManager ─────────────────────────────────────────────────
// Deve ser criado uma única vez durante o ciclo de vida do app.
export const bleManager = new BleManager()

// ─── Helpers de codificação ──────────────────────────────────────────────────
export const encode = (str: string): string =>
  Buffer.from(str, 'utf-8').toString('base64')

export const decode = (b64: string): string =>
  Buffer.from(b64, 'base64').toString('utf-8')

// =============================================================================
//  requestBlePermissions
//  Solicita permissões de Bluetooth em runtime (obrigatório Android 12+).
//  Android < 12 requer ACCESS_FINE_LOCATION para varredura BLE.
// =============================================================================
export async function requestBlePermissions(): Promise<void> {
  if (Platform.OS !== 'android') return

  const apiLevel = Platform.Version as number

  if (apiLevel >= 31) {
    // Android 12+ (API 31+): BLUETOOTH_SCAN + BLUETOOTH_CONNECT
    const result = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
    ])
    const scanOk    = result['android.permission.BLUETOOTH_SCAN']    === 'granted'
    const connectOk = result['android.permission.BLUETOOTH_CONNECT'] === 'granted'
    if (!scanOk || !connectOk) {
      throw new Error(
        'Permissões de Bluetooth negadas. Acesse Configurações → Aplicativos → hospede-app → Permissões e habilite o Bluetooth.',
      )
    }
  } else {
    // Android < 12: localização necessária para scan BLE
    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    )
    if (result !== 'granted') {
      throw new Error(
        'Permissão de localização negada (necessária para Bluetooth no Android < 12).',
      )
    }
  }
}

// =============================================================================
//  waitForBlePoweredOn
//  Aguarda o adaptador BLE estar ligado antes de iniciar o scan.
// =============================================================================
function waitForBlePoweredOn(): Promise<void> {
  return new Promise((resolve, reject) => {
    const subscription = bleManager.onStateChange((state) => {
      if (state === State.PoweredOn) {
        subscription.remove()
        resolve()
      } else if (state === State.PoweredOff) {
        subscription.remove()
        reject(new Error('Bluetooth está desligado. Ative o Bluetooth e tente novamente.'))
      } else if (state === State.Unauthorized) {
        subscription.remove()
        reject(new Error('Aplicativo não autorizado a usar Bluetooth. Verifique as permissões.'))
      }
    }, true) // true = emite o estado atual imediatamente
  })
}

// =============================================================================
//  scanAndConnect
//  Solicita permissões → aguarda BLE ligado → escaneia → conecta ao SmartLock.
// =============================================================================
export async function scanAndConnect(): Promise<Device> {
  await requestBlePermissions()
  await waitForBlePoweredOn()

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      bleManager.stopDeviceScan()
      reject(new Error('Nenhuma fechadura encontrada. Verifique se o Bluetooth está ativado e se você está próximo ao dispositivo.'))
    }, SCAN_TIMEOUT_MS)

    bleManager.startDeviceScan(
      [BLE_SERVICE_UUID],
      { allowDuplicates: false },
      async (error: BleError | null, device: Device | null) => {
        if (error) {
          clearTimeout(timer)
          bleManager.stopDeviceScan()
          reject(new Error(`Erro no scan BLE: ${error.message}`))
          return
        }

        if (device && device.name?.startsWith('SmartLock-')) {
          clearTimeout(timer)
          bleManager.stopDeviceScan()
          try {
            const connected = await device.connect()
            await connected.discoverAllServicesAndCharacteristics()
            resolve(connected)
          } catch (connErr: any) {
            reject(new Error(`Falha ao conectar: ${connErr.message}`))
          }
        }
      },
    )
  })
}

// =============================================================================
//  authenticate
//  Escreve o token_resgate na característica AUTH e aguarda a notificação
//  de STATUS. Retorna true se "AUTHORIZED", false se "DENIED".
// =============================================================================
export async function authenticate(device: Device, token: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      subscription.remove()
      reject(new Error('Tempo esgotado aguardando resposta de autenticação.'))
    }, AUTH_TIMEOUT_MS)

    // Monitora notificações na característica STATUS antes de escrever
    const subscription = device.monitorCharacteristicForService(
      BLE_SERVICE_UUID,
      BLE_STATUS_UUID,
      (error: BleError | null, characteristic: Characteristic | null) => {
        if (error) {
          clearTimeout(timer)
          subscription.remove()
          reject(new Error(`Erro ao monitorar STATUS: ${error.message}`))
          return
        }
        if (!characteristic?.value) return

        const resposta = decode(characteristic.value)
        clearTimeout(timer)
        subscription.remove()
        resolve(resposta === 'AUTHORIZED')
      },
    )

    // Escreve token na característica AUTH
    device
      .writeCharacteristicWithResponseForService(BLE_SERVICE_UUID, BLE_AUTH_UUID, encode(token))
      .catch((err: any) => {
        clearTimeout(timer)
        subscription.remove()
        reject(new Error(`Falha ao enviar token: ${err.message}`))
      })
  })
}

// =============================================================================
//  sendCommand
//  Envia um comando ("OPEN" | "LED_ON" | "LED_OFF") à característica COMMAND.
// =============================================================================
export async function sendCommand(
  device: Device,
  command: 'OPEN' | 'LED_ON' | 'LED_OFF',
): Promise<void> {
  await device.writeCharacteristicWithResponseForService(
    BLE_SERVICE_UUID,
    BLE_COMMAND_UUID,
    encode(command),
  )
}

// =============================================================================
//  safeDisconnect
//  Desconecta sem lançar erro (útil em cleanup de useEffect).
// =============================================================================
export async function safeDisconnect(device: Device | null): Promise<void> {
  if (!device) return
  try {
    const isConnected = await device.isConnected()
    if (isConnected) await device.cancelConnection()
  } catch {
    // ignora erros de desconexão
  }
}
