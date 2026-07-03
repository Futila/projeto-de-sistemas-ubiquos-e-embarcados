import React, { useEffect, useRef, useState } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  ScrollView,
  Alert,
} from 'react-native'
import { Device } from 'react-native-ble-plx'
import {
  scanAndConnect,
  authenticate,
  sendCommand,
  safeDisconnect,
} from '../lib/ble'
import { ResgatarResponse } from '../lib/api'

// ─── Tipos ────────────────────────────────────────────────────────────────────
type Etapa =
  | 'idle'
  | 'scanning'
  | 'connecting'
  | 'authenticating'
  | 'ready'
  | 'opening'
  | 'error'

interface Props {
  dados: ResgatarResponse
  onVoltar: () => void
}

const ETAPA_LABEL: Record<Etapa, string> = {
  idle:           'Pronto para conectar',
  scanning:       'Procurando fechadura...',
  connecting:     'Conectando via Bluetooth...',
  authenticating: 'Autenticando...',
  ready:          'Conectado e autenticado',
  opening:        'Abrindo porta...',
  error:          'Erro de conexão',
}

// =============================================================================
//  BluetoothScreen
//  Fluxo: scan → connect → authenticate → OPEN / LED
// =============================================================================
export function BluetoothScreen({ dados, onVoltar }: Props) {
  const [etapa, setEtapa]         = useState<Etapa>('scanning')
  const [erroMsg, setErroMsg]     = useState('')
  const [ledLigado, setLedLigado] = useState(false)
  const [abrindo_ok, setAbrinuOk] = useState(false)
  const deviceRef                  = useRef<Device | null>(null)

  // Inicia o fluxo de conexão automaticamente ao montar
  useEffect(() => {
    conectar()
    return () => {
      safeDisconnect(deviceRef.current)
    }
  }, [])

  async function conectar() {
    setEtapa('scanning')
    setErroMsg('')
    setAbrinuOk(false)

    try {
      // 1. Scan + connect
      const device = await scanAndConnect()
      deviceRef.current = device
      setEtapa('authenticating')

      // 2. Autenticação com token_resgate
      const autorizado = await authenticate(device, dados.token_resgate)
      if (!autorizado) {
        setEtapa('error')
        setErroMsg('Token rejeitado pela fechadura. Verifique se a reserva está ativa.')
        return
      }

      setEtapa('ready')
    } catch (err: any) {
      setEtapa('error')
      setErroMsg(err.message ?? 'Falha desconhecida.')
    }
  }

  async function handleAbrir() {
    if (!deviceRef.current || etapa !== 'ready') return
    setEtapa('opening')
    try {
      await sendCommand(deviceRef.current, 'OPEN')
      setAbrinuOk(true)
      setEtapa('ready')
      setTimeout(() => setAbrinuOk(false), 3000)
    } catch (err: any) {
      Alert.alert('Erro', err.message ?? 'Falha ao enviar comando.')
      setEtapa('ready')
    }
  }

  async function handleLed() {
    if (!deviceRef.current || etapa !== 'ready') return
    const novoEstado = !ledLigado
    try {
      await sendCommand(deviceRef.current, novoEstado ? 'LED_ON' : 'LED_OFF')
      setLedLigado(novoEstado)
    } catch (err: any) {
      Alert.alert('Erro', err.message ?? 'Falha ao controlar LED.')
    }
  }

  const carregando = ['scanning', 'connecting', 'authenticating', 'opening'].includes(etapa)

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.iconWrapper}>
          <Text style={styles.iconEmoji}>📡</Text>
        </View>
        <Text style={styles.titulo}>{dados.fechadura.nome}</Text>
        <Text style={styles.subtitulo}>Acesso via Bluetooth</Text>
      </View>

      {/* Card de status da conexão */}
      <View style={[styles.statusCard, etapa === 'error' && styles.statusCardError]}>
        {carregando && (
          <ActivityIndicator color="#79c0ff" size="small" style={styles.spinner} />
        )}
        {etapa === 'ready' && !abrindo_ok && (
          <Text style={styles.statusIconOk}>✅</Text>
        )}
        {etapa === 'error' && (
          <Text style={styles.statusIconErr}>⚠️</Text>
        )}
        <Text style={[
          styles.statusLabel,
          etapa === 'ready' && styles.statusLabelOk,
          etapa === 'error' && styles.statusLabelErr,
        ]}>
          {ETAPA_LABEL[etapa]}
        </Text>
        {etapa === 'error' && (
          <Text style={styles.erroDetalhe}>{erroMsg}</Text>
        )}
      </View>

      {/* Botões de ação (visíveis apenas quando ready) */}
      {etapa === 'ready' && (
        <View style={styles.acoes}>
          {/* Abrir porta */}
          <TouchableOpacity
            style={[styles.btnAbrir, abrindo_ok && styles.btnAbrirOk]}
            onPress={handleAbrir}
            activeOpacity={0.8}
          >
            <Text style={styles.btnEmoji}>{abrindo_ok ? '✅' : '🚪'}</Text>
            <Text style={styles.btnTexto}>
              {abrindo_ok ? 'Porta Aberta!' : 'Abrir Porta'}
            </Text>
          </TouchableOpacity>

          {/* Controle do LED */}
          <TouchableOpacity
            style={[styles.btnLed, ledLigado && styles.btnLedOn]}
            onPress={handleLed}
            activeOpacity={0.8}
          >
            <Text style={styles.btnEmoji}>{ledLigado ? '💡' : '🔦'}</Text>
            <Text style={[styles.btnTexto, styles.btnTextoSecundario]}>
              {ledLigado ? 'Desligar LED' : 'Ligar LED'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Botão de nova tentativa em caso de erro */}
      {etapa === 'error' && (
        <TouchableOpacity style={styles.btnRetry} onPress={conectar} activeOpacity={0.8}>
          <Text style={styles.btnRetryTexto}>🔄  Tentar novamente</Text>
        </TouchableOpacity>
      )}

      {/* Voltar */}
      <TouchableOpacity style={styles.btnVoltar} onPress={onVoltar}>
        <Text style={styles.btnVoltarTexto}>← Voltar para o acesso</Text>
      </TouchableOpacity>

    </ScrollView>
  )
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: '#0d1117',
  },
  container: {
    padding: 24,
    paddingTop: 48,
    alignItems: 'center',
    minHeight: '100%',
  },

  // Header
  header: {
    alignItems: 'center',
    marginBottom: 28,
  },
  iconWrapper: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: '#161b22',
    borderWidth: 1,
    borderColor: '#21262d',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  iconEmoji: {
    fontSize: 40,
  },
  titulo: {
    fontSize: 20,
    fontWeight: '700',
    color: '#e6edf3',
    textAlign: 'center',
    marginBottom: 6,
  },
  subtitulo: {
    fontSize: 13,
    color: '#8b949e',
    fontWeight: '500',
  },

  // Status card
  statusCard: {
    width: '100%',
    backgroundColor: '#161b22',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#21262d',
    padding: 20,
    alignItems: 'center',
    gap: 10,
    marginBottom: 20,
  },
  statusCardError: {
    borderColor: '#4a1a1a',
    backgroundColor: '#1a0d0d',
  },
  spinner: {
    marginBottom: 4,
  },
  statusIconOk: {
    fontSize: 28,
  },
  statusIconErr: {
    fontSize: 28,
  },
  statusLabel: {
    fontSize: 15,
    color: '#79c0ff',
    fontWeight: '600',
    textAlign: 'center',
  },
  statusLabelOk: {
    color: '#3fb950',
  },
  statusLabelErr: {
    color: '#f85149',
  },
  erroDetalhe: {
    fontSize: 13,
    color: '#8b949e',
    textAlign: 'center',
    lineHeight: 19,
    marginTop: 4,
  },

  // Ações
  acoes: {
    width: '100%',
    gap: 12,
    marginBottom: 16,
  },
  btnAbrir: {
    backgroundColor: '#238636',
    borderRadius: 14,
    paddingVertical: 22,
    alignItems: 'center',
    shadowColor: '#2ea043',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  btnAbrirOk: {
    backgroundColor: '#1a6b2a',
  },
  btnLed: {
    backgroundColor: '#21262d',
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#30363d',
  },
  btnLedOn: {
    backgroundColor: '#2d2a14',
    borderColor: '#d29922',
  },
  btnEmoji: {
    fontSize: 32,
    marginBottom: 6,
  },
  btnTexto: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  btnTextoSecundario: {
    color: '#e6edf3',
    fontWeight: '600',
  },

  // Retry
  btnRetry: {
    width: '100%',
    backgroundColor: '#21262d',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#30363d',
  },
  btnRetryTexto: {
    color: '#79c0ff',
    fontSize: 15,
    fontWeight: '600',
  },

  // Voltar
  btnVoltar: {
    paddingVertical: 12,
  },
  btnVoltarTexto: {
    color: '#8b949e',
    fontSize: 14,
    textDecorationLine: 'underline',
  },
})
