import React, { useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native'
import { resgatar, ResgatarResponse } from '../lib/api'

interface Props {
  onResgatado: (dados: ResgatarResponse) => void
}

export function TokenScreen({ onResgatado }: Props) {
  const [token, setToken] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit() {
    const t = token.trim().toUpperCase()
    if (t.length < 4) {
      Alert.alert('Token inválido', 'Digite o token de 12 caracteres recebido do anfitrião.')
      return
    }
    setLoading(true)
    try {
      const dados = await resgatar(t)
      console.log('Dados resgatados:', dados)
      onResgatado(dados)
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? 'Não foi possível validar o token. Verifique a conexão.'
      Alert.alert('Erro', msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.card}>
        {/* Ícone */}
        <View style={styles.iconContainer}>
          <Text style={styles.iconEmoji}>🔑</Text>
        </View>

        <Text style={styles.title}>Acessar Hospedagem</Text>
        <Text style={styles.subtitle}>
          Digite o código de acesso enviado pelo anfitrião para liberar a fechadura.
        </Text>

        <TextInput
          style={styles.input}
          placeholder="Ex: A3F9E2B1C4D7"
          placeholderTextColor="#6b7280"
          value={token}
          onChangeText={setToken}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={12}
          returnKeyType="done"
          onSubmitEditing={handleSubmit}
        />

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={loading}
          activeOpacity={0.8}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Validar Código</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0d1117',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  card: {
    backgroundColor: '#161b22',
    borderRadius: 16,
    padding: 28,
    borderWidth: 1,
    borderColor: '#21262d',
    alignItems: 'center',
  },
  iconContainer: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#1d2b4f',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  iconEmoji: {
    fontSize: 32,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#e6edf3',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#8b949e',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 28,
  },
  input: {
    width: '100%',
    backgroundColor: '#0d1117',
    borderWidth: 1,
    borderColor: '#30363d',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 18,
    color: '#e6edf3',
    letterSpacing: 3,
    textAlign: 'center',
    marginBottom: 16,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  button: {
    width: '100%',
    backgroundColor: '#4f6fd9',
    borderRadius: 10,
    paddingVertical: 15,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
})
