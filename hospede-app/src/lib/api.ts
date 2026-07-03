import axios from 'axios'

// Usar o IP da máquina na rede local — porta 8000 (Django)
// Emulador Android:  http://10.0.2.2:8000/api
// Dispositivo físico: http://<seu-IP>:8000/api  (ex: 192.168.0.8:8000)

const BASE_URL = 'http://192.168.186.113:8000/api'
//192.168.186.113

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 10000,
})

export interface ResgatarResponse {
  acesso_id: number
  token_resgate: string
  hospede_identificador: string
  status: string
  inicio_reserva: string
  fim_reserva: string
  fechadura: {
    id: number
    nome: string
    esta_online: boolean
  }
}

export async function resgatar(token: string): Promise<ResgatarResponse> {
  const res = await api.post<ResgatarResponse>('/hospede/resgatar/', { token })
  return res.data
}

export async function abrirPorta(token: string): Promise<void> {
  await api.post('/hospede/abrir/', { token })
}
