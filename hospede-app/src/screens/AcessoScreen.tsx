import React, { useState, useEffect } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Alert,
  ScrollView,
} from 'react-native'
import * as Network from 'expo-network'
import { ResgatarResponse, abrirPorta } from '../lib/api'
import { BluetoothScreen } from './BluetoothScreen'

interface Props {
  dados: ResgatarResponse
  onSair: () => void
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  ATIVO:     { label: 'Ativo',     color: '#3fb950', bg: '#1a3a1a' },
  AGENDADO:  { label: 'Agendado',  color: '#79c0ff', bg: '#1a2a3a' },
  PENDENTE:  { label: 'Pendente',  color: '#d29922', bg: '#2d2316' },
  EXPIRADO:  { label: 'Expirado',  color: '#8b949e', bg: '#21262d' },
  REVOGADO:  { label: 'Revogado',  color: '#f85149', bg: '#3a1a1a' },
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function isWithinPeriod(inicio: string, fim: string): boolean {
  const agora = Date.now()
  return agora >= new Date(inicio).getTime() && agora <= new Date(fim).getTime()
}

export function AcessoScreen({ dados, onSair }: Props) {
  const [abrindo, setAbrindo]         = useState(false)
  const [abrindo_ok, setAbrinuOk]     = useState(false)
  const [temInternet, setTemInternet]  = useState(true)
  const [showBluetooth, setShowBluetooth] = useState(false)

  const podeAbrir = isWithinPeriod(dados.inicio_reserva, dados.fim_reserva)
  const statusCfg = STATUS_CONFIG[dados.status] ?? STATUS_CONFIG['PENDENTE']

  // Verifica conectividade ao montar e ao voltar da tela BLE
  useEffect(() => {
    verificarInternet()
  }, [showBluetooth])

  async function verificarInternet() {
    try {
      const state = await Network.getNetworkStateAsync()
      setTemInternet(!!(state.isConnected && state.isInternetReachable))
    } catch {
      setTemInternet(false)
    }
  }

  // Se tela BLE está ativa, renderiza ela em vez do conteúdo normal
  if (showBluetooth) {
    return <BluetoothScreen dados={dados} onVoltar={() => setShowBluetooth(false)} />
  }

  async function handleAbrir() {
    setAbrindo(true)
    setAbrinuOk(false)
    try {
      await abrirPorta(dados.token_resgate)
      setAbrinuOk(true)
      setTimeout(() => setAbrinuOk(false), 3000)
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? 'Não foi possível enviar o comando. Verifique sua conexão.'
      Alert.alert('Erro', msg)
    } finally {
      setAbrindo(false)
    }
  }

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.container}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.lockIcon}>
          <Text style={styles.lockEmoji}>{dados.fechadura.esta_online ? '🔓' : '🔒'}</Text>
        </View>
        <Text style={styles.fechaduraNome}>{dados.fechadura.nome}</Text>
        <View style={[styles.statusBadge, { backgroundColor: statusCfg.bg }]}>
          <View style={[styles.statusDot, { backgroundColor: statusCfg.color }]} />
          <Text style={[styles.statusText, { color: statusCfg.color }]}>{statusCfg.label}</Text>
        </View>
      </View>

      {/* Info */}
      <View style={styles.infoCard}>
        <InfoRow label="Hóspede" value={dados.hospede_identificador} />
        <Divider />
        <InfoRow label="Check-in" value={formatDate(dados.inicio_reserva)} />
        <Divider />
        <InfoRow label="Check-out" value={formatDate(dados.fim_reserva)} />
        <Divider />
        <InfoRow
          label="Dispositivo"
          value={dados.fechadura.esta_online ? 'Online' : 'Offline'}
          valueColor={dados.fechadura.esta_online ? '#3fb950' : '#f85149'}
        />
      </View>

      {/* Botão abrir via internet */}
      {podeAbrir && temInternet && dados.fechadura.esta_online ? (
        <TouchableOpacity
          style={[styles.openButton, (abrindo || abrindo_ok) && styles.openButtonActive]}
          onPress={handleAbrir}
          disabled={abrindo}
          activeOpacity={0.8}
        >
          {abrindo ? (
            <ActivityIndicator color="#fff" size="large" />
          ) : abrindo_ok ? (
            <>
              <Text style={styles.openButtonEmoji}>✅</Text>
              <Text style={styles.openButtonText}>Porta Aberta!</Text>
            </>
          ) : (
            <>
              <Text style={styles.openButtonEmoji}>🚪</Text>
              <Text style={styles.openButtonText}>Abrir Porta</Text>
            </>
          )}
        </TouchableOpacity>
      ) : podeAbrir ? (
        /* Fechadura offline ou sem internet — informa mas oferece BLE */
        <View style={styles.notAvailableBox}>
          <Text style={styles.notAvailableText}>
            {!temInternet
              ? '📵  Sem conexão com a internet.'
              : '⚠️  Fechadura offline — não é possível abrir remotamente agora.'}
          </Text>
        </View>
      ) : (
        /* Fora do período da reserva */
        <View style={styles.notAvailableBox}>
          <Text style={styles.notAvailableText}>
            {Date.now() < new Date(dados.inicio_reserva).getTime()
              ? `🗓  Reserva começa em ${formatDate(dados.inicio_reserva)}`
              : '⏱  Prazo da reserva encerrado.'}
          </Text>
        </View>
      )}

      {/* Botão Bluetooth — exibido dentro do período, independente da internet */}
      {podeAbrir && (
        <TouchableOpacity
          style={styles.bleButton}
          onPress={() => setShowBluetooth(true)}
          activeOpacity={0.8}
        >
          <Text style={styles.bleButtonEmoji}>📡</Text>
          <Text style={styles.bleButtonText}>
            {temInternet ? 'Abrir via Bluetooth' : 'Abrir via Bluetooth (offline)'}
          </Text>
        </TouchableOpacity>
      )}

      {/* Sair */}
      <TouchableOpacity style={styles.sairButton} onPress={onSair}>
        <Text style={styles.sairText}>Usar outro código</Text>
      </TouchableOpacity>
    </ScrollView>
  )
}

function InfoRow({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={[styles.infoValue, valueColor ? { color: valueColor } : undefined]}>{value}</Text>
    </View>
  )
}

function Divider() {
  return <View style={styles.divider} />
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
  header: {
    alignItems: 'center',
    marginBottom: 28,
  },
  lockIcon: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: '#161b22',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#21262d',
  },
  lockEmoji: {
    fontSize: 40,
  },
  fechaduraNome: {
    fontSize: 20,
    fontWeight: '700',
    color: '#e6edf3',
    textAlign: 'center',
    marginBottom: 12,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 13,
    fontWeight: '600',
  },
  infoCard: {
    width: '100%',
    backgroundColor: '#161b22',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#21262d',
    marginBottom: 24,
    overflow: 'hidden',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  infoLabel: {
    color: '#8b949e',
    fontSize: 14,
  },
  infoValue: {
    color: '#e6edf3',
    fontSize: 14,
    fontWeight: '500',
    maxWidth: '60%',
    textAlign: 'right',
  },
  divider: {
    height: 1,
    backgroundColor: '#21262d',
    marginHorizontal: 0,
  },
  openButton: {
    width: '100%',
    backgroundColor: '#238636',
    borderRadius: 14,
    paddingVertical: 22,
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#2ea043',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  openButtonActive: {
    backgroundColor: '#1a6b2a',
  },
  openButtonEmoji: {
    fontSize: 36,
    marginBottom: 6,
  },
  openButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  notAvailableBox: {
    width: '100%',
    backgroundColor: '#1f1a14',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#4a3728',
    padding: 18,
    marginBottom: 16,
  },
  notAvailableText: {
    color: '#d29922',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  sairButton: {
    paddingVertical: 12,
  },
  sairText: {
    color: '#8b949e',
    fontSize: 14,
    textDecorationLine: 'underline',
  },
  bleButton: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#161b22',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#30363d',
    paddingVertical: 16,
    marginBottom: 12,
  },
  bleButtonEmoji: {
    fontSize: 20,
  },
  bleButtonText: {
    color: '#79c0ff',
    fontSize: 15,
    fontWeight: '600',
  },
})
