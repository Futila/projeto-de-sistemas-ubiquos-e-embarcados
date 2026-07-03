import React, { useState, useEffect } from 'react'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaView, StyleSheet, ActivityIndicator, View } from 'react-native'
import { TokenScreen } from './src/screens/TokenScreen'
import { AcessoScreen } from './src/screens/AcessoScreen'
import { ResgatarResponse, resgatar } from './src/lib/api'
import { saveToken, loadToken, clearToken } from './src/lib/storage'

export default function App() {
  const [acesso, setAcesso] = useState<ResgatarResponse | null>(null)
  const [loading, setLoading] = useState(true)

  // On startup: try to restore saved token and re-validate with the server
  useEffect(() => {
    async function restoreSession() {
      try {
        const savedToken = await loadToken()
        if (savedToken) {
          const dados = await resgatar(savedToken)
          // Only restore if the access is still valid (not expired/revoked)
          if (dados.status !== 'EXPIRADO' && dados.status !== 'REVOGADO') {
            setAcesso(dados)
          } else {
            await clearToken()
          }
        }
      } catch {
        // Token invalid or network error — start fresh
        await clearToken()
      } finally {
        setLoading(false)
      }
    }
    restoreSession()
  }, [])

  async function handleResgatado(dados: ResgatarResponse) {
    await saveToken(dados.token_resgate)
    setAcesso(dados)
  }

  async function handleSair() {
    await clearToken()
    setAcesso(null)
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar style="light" />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4f6fd9" />
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />
      {acesso ? (
        <AcessoScreen dados={acesso} onSair={handleSair} />
      ) : (
        <TokenScreen onResgatado={handleResgatado} />
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#0d1117',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
})

