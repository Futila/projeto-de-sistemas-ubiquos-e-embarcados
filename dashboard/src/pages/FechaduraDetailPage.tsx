import { useEffect, useState } from "react"
import { useNavigate, useParams, Link } from "react-router-dom"
import {
  Wifi, WifiOff, Loader2, DoorOpen, ArrowLeft,
  ShieldAlert, Flame, Activity, KeyRound, Clock, AlertTriangle,
} from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import api from "@/lib/api"

interface Fechadura {
  id: number
  id_unico: string
  nome: string
  id_dispositivo: string
  esta_online: boolean
  ultima_comunicacao: string | null
  criado_em: string
}

interface AcessoTemporario {
  id: number
  fechadura: number
  fechadura_nome: string
  hospede_identificador: string
  token_resgate: string
  inicio_reserva: string
  fim_reserva: string
  status: string
}

interface HistoricoEvento {
  id: number
  fechadura: number
  tipo: string
  valor_sensor: string | null
  descricao: string
  timestamp: string
}

const STATUS_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  ATIVO:     { label: "Ativo",     variant: "default" },
  AGENDADO:  { label: "Agendado",  variant: "outline" },
  PENDENTE:  { label: "Pendente",  variant: "secondary" },
  EXPIRADO:  { label: "Expirado",  variant: "secondary" },
  REVOGADO:  { label: "Revogado",  variant: "destructive" },
}

const TIPO_ICONS: Record<string, React.ReactNode> = {
  ACESSO:       <KeyRound className="h-4 w-4 text-indigo-400" />,
  ALERTA_GAS:   <ShieldAlert className="h-4 w-4 text-amber-400" />,
  ALERTA_FUMACA: <Flame className="h-4 w-4 text-red-400" />,
  SISTEMA:      <Activity className="h-4 w-4 text-sky-400" />,
}

const TIPO_LABELS: Record<string, string> = {
  ACESSO: "Acesso",
  ALERTA_GAS: "Alerta de Gás",
  ALERTA_FUMACA: "Alerta de Fumaça",
  SISTEMA: "Sistema",
}

export function FechaduraDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [fechadura, setFechadura] = useState<Fechadura | null>(null)
  const [acessos, setAcessos] = useState<AcessoTemporario[]>([])
  const [eventos, setEventos] = useState<HistoricoEvento[]>([])
  const [loading, setLoading] = useState(true)
  const [abrindo, setAbrindo] = useState(false)
  const [revogando, setRevogando] = useState<number | null>(null)
  const [confirmRevoke, setConfirmRevoke] = useState<{ open: boolean; acesso: AcessoTemporario | null }>({ open: false, acesso: null })
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!localStorage.getItem("authToken")) {
      navigate("/login")
      return
    }
    Promise.all([
      api.get<Fechadura>(`/fechaduras/${id}/`),
      api.get<AcessoTemporario[]>(`/acessos/?fechadura=${id}`),
      api.get<HistoricoEvento[]>(`/eventos/?fechadura=${id}`),
    ])
      .then(([fRes, aRes, eRes]) => {
        setFechadura(fRes.data)
        setAcessos(aRes.data)
        setEventos(eRes.data)
      })
      .catch(() => setError("Não foi possível carregar os dados da fechadura."))
      .finally(() => setLoading(false))
  }, [id, navigate])

  async function abrirPorta() {
    if (!fechadura) return
    setAbrindo(true)
    try {
      await api.post(`/fechaduras/${fechadura.id}/abrir/`)
    } catch {
      // sem feedback — pode-se adicionar toast futuramente
    } finally {
      setAbrindo(false)
    }
  }

  function pedirRevogacao(acesso: AcessoTemporario) {
    setConfirmRevoke({ open: true, acesso })
  }

  async function confirmarRevogacao() {
    if (!confirmRevoke.acesso) return
    const acessoId = confirmRevoke.acesso.id
    setConfirmRevoke({ open: false, acesso: null })
    setRevogando(acessoId)
    try {
      const res = await api.post<AcessoTemporario>(`/acessos/${acessoId}/revogar/`)
      setAcessos((prev) => prev.map((a) => (a.id === acessoId ? res.data : a)))
    } catch {
      // sem feedback — pode-se adicionar toast futuramente
    } finally {
      setRevogando(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error || !fechadura) {
    return (
      <div className="p-6">
        <p className="text-destructive">{error ?? "Fechadura não encontrada."}</p>
        <Button variant="outline" className="mt-4" asChild>
          <Link to="/dashboard">Voltar</Link>
        </Button>
      </div>
    )
  }

  const ultimaComunicacao = fechadura.ultima_comunicacao
    ? new Date(fechadura.ultima_comunicacao).toLocaleString("pt-BR")
    : "Nunca"

  const criadoEm = new Date(fechadura.criado_em).toLocaleDateString("pt-BR")

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">

      {/* Modal de confirmação de revogação */}
      <Dialog open={confirmRevoke.open} onOpenChange={(open) => !open && setConfirmRevoke({ open: false, acesso: null })}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-1">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/15 shrink-0">
                <AlertTriangle className="h-5 w-5 text-destructive" />
              </div>
              <DialogTitle>Revogar acesso</DialogTitle>
            </div>
            <DialogDescription>
              Esta ação encerrará permanentemente o acesso de{" "}
              <span className="font-semibold text-foreground">
                {confirmRevoke.acesso?.hospede_identificador}
              </span>
              . Ela não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setConfirmRevoke({ open: false, acesso: null })}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={confirmarRevogacao}>
              Revogar acesso
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start gap-4 mb-6">
        <Button variant="outline" size="icon" asChild className="shrink-0 self-start">
          <Link to="/dashboard">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold truncate">{fechadura.nome}</h1>
            <Badge variant={fechadura.esta_online ? "default" : "secondary"}>
              {fechadura.esta_online
                ? <><Wifi className="h-3 w-3 mr-1" />Online</>
                : <><WifiOff className="h-3 w-3 mr-1" />Offline</>}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1 font-mono truncate">
            {fechadura.id_dispositivo}
          </p>
        </div>
        <Button disabled={!fechadura.esta_online || abrindo} onClick={abrirPorta} className="shrink-0 self-start sm:self-auto">
          {abrindo
            ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Abrindo...</>
            : <><DoorOpen className="h-4 w-4 mr-2" />Abrir porta</>}
        </Button>
      </div>

      {/* Info cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <InfoCard label="Última comunicação" value={ultimaComunicacao} icon={<Clock className="h-4 w-4 text-muted-foreground" />} />
        <InfoCard label="Cadastrada em" value={criadoEm} icon={<Activity className="h-4 w-4 text-muted-foreground" />} />
        <InfoCard label="Acessos" value={String(acessos.length)} icon={<KeyRound className="h-4 w-4 text-muted-foreground" />} />
      </div>

      {/* Tabs */}
      <Tabs defaultValue="eventos">
        <TabsList className="mb-4">
          <TabsTrigger value="eventos">Histórico de Eventos</TabsTrigger>
          <TabsTrigger value="acessos">Acessos ({acessos.length})</TabsTrigger>
        </TabsList>

        {/* Eventos tab */}
        <TabsContent value="eventos">
          {eventos.length === 0 ? (
            <EmptyState message="Nenhum evento registrado para esta fechadura." />
          ) : (
            <Card className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-36">Tipo</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead className="w-28 text-right hidden sm:table-cell">Sensor</TableHead>
                    <TableHead className="w-44 text-right">Data/Hora</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {eventos.map((ev) => (
                    <TableRow key={ev.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {TIPO_ICONS[ev.tipo]}
                          <span className="text-xs font-medium">{TIPO_LABELS[ev.tipo] ?? ev.tipo}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{ev.descricao}</TableCell>
                      <TableCell className="text-right font-mono text-sm hidden sm:table-cell">
                        {ev.valor_sensor != null ? ev.valor_sensor : "—"}
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(ev.timestamp).toLocaleString("pt-BR")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>

        {/* Acessos tab */}
        <TabsContent value="acessos">
          {acessos.length === 0 ? (
            <EmptyState message="Nenhum acesso cadastrado para esta fechadura." />
          ) : (
            <Card className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Hóspede</TableHead>
                    <TableHead className="hidden sm:table-cell w-28">Token</TableHead>
                    <TableHead className="hidden md:table-cell w-36">Início</TableHead>
                    <TableHead className="hidden md:table-cell w-36">Fim</TableHead>
                    <TableHead className="w-24 text-center">Status</TableHead>
                    <TableHead className="w-20" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {acessos.map((ac) => {
                    const s = STATUS_LABELS[ac.status] ?? { label: ac.status, variant: "outline" as const }
                    const canRevoke = ac.status !== "EXPIRADO" && ac.status !== "REVOGADO"
                    return (
                      <TableRow key={ac.id}>
                        <TableCell className="text-sm truncate max-w-[160px]">{ac.hospede_identificador}</TableCell>
                        <TableCell className="font-mono text-xs hidden sm:table-cell">{ac.token_resgate}</TableCell>
                        <TableCell className="text-xs text-muted-foreground hidden md:table-cell">
                          {new Date(ac.inicio_reserva).toLocaleDateString("pt-BR")}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground hidden md:table-cell">
                          {new Date(ac.fim_reserva).toLocaleDateString("pt-BR")}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant={s.variant}>{s.label}</Badge>
                        </TableCell>
                        <TableCell>
                          {canRevoke && (
                            <Button
                              size="sm"
                              variant="destructive"
                              disabled={revogando === ac.id}
                              onClick={() => pedirRevogacao(ac)}
                            >
                              {revogando === ac.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "Revogar"}
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}

function InfoCard({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-1 pt-4 px-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</CardTitle>
          {icon}
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <p className="text-sm font-semibold">{value}</p>
      </CardContent>
    </Card>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
      <Activity className="h-8 w-8 mb-3 opacity-30" />
      <p className="text-sm">{message}</p>
    </div>
  )
}
