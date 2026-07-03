import { useEffect, useState } from "react"
import { useNavigate, Link } from "react-router-dom"
import { Wifi, WifiOff, Loader2, DoorOpen, Plus, Search, Activity, Lock, CalendarCheck } from "lucide-react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import api from "@/lib/api"

const novaFechaduraSchema = z.object({
  nome: z.string().min(2, "Nome deve ter pelo menos 2 caracteres."),
  id_dispositivo: z.string().min(4, "Informe o MAC/ID do dispositivo."),
})
type NovaFechaduraValues = z.infer<typeof novaFechaduraSchema>

type StatusFilter = "todos" | "online" | "offline"

interface Fechadura {
  id: number
  id_unico: string
  nome: string
  id_dispositivo: string
  esta_online: boolean
  ultima_comunicacao: string | null
}

interface AcessoTemporario {
  id: number
  status: string
  inicio_reserva: string
  fim_reserva: string
}

export function DashboardPage() {
  const navigate = useNavigate()
  const [fechaduras, setFechaduras] = useState<Fechadura[]>([])
  const [acessos, setAcessos] = useState<AcessoTemporario[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [abrindo, setAbrindo] = useState<number | null>(null)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("todos")
  const [dialogOpen, setDialogOpen] = useState(false)

  useEffect(() => {
    if (!localStorage.getItem("authToken")) {
      navigate("/login")
      return
    }
    Promise.all([
      api.get<Fechadura[]>("/fechaduras/"),
      api.get<AcessoTemporario[]>("/acessos/"),
    ]).then(([fRes, aRes]) => {
      setFechaduras(fRes.data)
      setAcessos(aRes.data)
    }).catch(() => setError("Não foi possível carregar os dados."))
      .finally(() => setLoading(false))
  }, [navigate])

  async function fetchFechaduras() {
    setLoading(true)
    try {
      const response = await api.get<Fechadura[]>("/fechaduras/")
      setFechaduras(response.data)
    } catch {
      setError("Não foi possível carregar as fechaduras.")
    } finally {
      setLoading(false)
    }
  }

  async function abrirFechadura(id: number) {
    setAbrindo(id)
    try {
      await api.post(`/fechaduras/${id}/abrir/`)
    } catch {
      alert("Erro ao enviar comando de abertura.")
    } finally {
      setAbrindo(null)
    }
  }

  const filtered = fechaduras.filter((f) => {
    const matchSearch =
      f.nome.toLowerCase().includes(search.toLowerCase()) ||
      f.id_dispositivo.toLowerCase().includes(search.toLowerCase())
    const matchStatus =
      statusFilter === "todos" ||
      (statusFilter === "online" && f.esta_online) ||
      (statusFilter === "offline" && !f.esta_online)
    return matchSearch && matchStatus
  })

  const totalOnline = fechaduras.filter((f) => f.esta_online).length
  const reservasAtivas = acessos.filter((a) => a.status === "ATIVO").length

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      {/* Cards de resumo */}
      {!loading && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <SummaryCard
            icon={<Lock className="h-5 w-5 text-primary" />}
            label="Fechaduras"
            value={`${totalOnline} / ${fechaduras.length}`}
            sub="online agora"
          />
          <SummaryCard
            icon={<Activity className="h-5 w-5 text-emerald-400" />}
            label="Dispositivos Online"
            value={String(totalOnline)}
            sub={totalOnline === fechaduras.length ? "Todos conectados" : `${fechaduras.length - totalOnline} desconectado(s)`}
          />
          <SummaryCard
            icon={<CalendarCheck className="h-5 w-5 text-violet-400" />}
            label="Reservas Ativas"
            value={String(reservasAtivas)}
            sub="hóspedes com acesso agora"
          />
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Fechaduras</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {loading
              ? "Carregando..."
              : `${totalOnline} de ${fechaduras.length} online`}
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Nova Fechadura
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Adicionar fechadura</DialogTitle>
            </DialogHeader>
            <NovaFechaduraForm
              onSuccess={() => {
                setDialogOpen(false)
                fetchFechaduras()
              }}
            />
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome ou ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-2">
          {(["todos", "online", "offline"] as StatusFilter[]).map((s) => (
            <Button
              key={s}
              variant={statusFilter === s ? "default" : "outline"}
              size="sm"
              onClick={() => setStatusFilter(s)}
              className="capitalize"
            >
              {s}
            </Button>
          ))}
        </div>
      </div>

      {error && (
        <div className="mb-6 rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="rounded-full bg-muted p-4 mb-4">
            <Search className="h-8 w-8 text-muted-foreground" />
          </div>
          <p className="font-medium">Nenhuma fechadura encontrada</p>
          <p className="text-sm text-muted-foreground mt-1">
            {search || statusFilter !== "todos"
              ? "Tente ajustar os filtros."
              : "Adicione sua primeira fechadura clicando em Nova Fechadura."}
          </p>
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((fechadura) => (
            <FechaduraCard
              key={fechadura.id}
              fechadura={fechadura}
              abrindo={abrindo === fechadura.id}
              onAbrir={() => abrirFechadura(fechadura.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function FechaduraCard({
  fechadura,
  abrindo,
  onAbrir,
}: {
  fechadura: Fechadura
  abrindo: boolean
  onAbrir: () => void
}) {
  const ultimaComunicacao = fechadura.ultima_comunicacao
    ? new Date(fechadura.ultima_comunicacao).toLocaleString("pt-BR")
    : "Nunca"

  return (
    <Link to={`/fechaduras/${fechadura.id}`} className="block group">
      <Card className="transition-shadow hover:shadow-md group-hover:border-primary/50">
        <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
          <CardTitle className="text-base font-semibold leading-snug pr-2">
            {fechadura.nome}
          </CardTitle>
          <Badge
            variant={fechadura.esta_online ? "default" : "secondary"}
            className="shrink-0"
          >
            {fechadura.esta_online ? (
              <><Wifi className="h-3 w-3 mr-1" />Online</>
            ) : (
              <><WifiOff className="h-3 w-3 mr-1" />Offline</>
            )}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <p className="text-xs text-muted-foreground">ID do Dispositivo</p>
            <p className="text-sm font-mono truncate">{fechadura.id_dispositivo}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Última comunicação</p>
            <p className="text-sm">{ultimaComunicacao}</p>
          </div>
         {
          <Button
            size="sm"
            className="w-full"
            disabled={!fechadura.esta_online || abrindo}
            onClick={(e) => { e.preventDefault(); onAbrir() }}
          >
            {abrindo ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <DoorOpen className="h-4 w-4 mr-2" />
            )}
            {abrindo ? "Abrindo..." : "Abrir porta"}
          </Button>
          } 
        </CardContent>
      </Card>
    </Link>
  )
}

function NovaFechaduraForm({ onSuccess }: { onSuccess: () => void }) {
  const [serverError, setServerError] = useState<string | null>(null)
  const form = useForm<NovaFechaduraValues>({
    resolver: zodResolver(novaFechaduraSchema),
    defaultValues: { nome: "", id_dispositivo: "" },
  })

  async function onSubmit(data: NovaFechaduraValues) {
    setServerError(null)
    try {
      await api.post("/fechaduras/", data)
      onSuccess()
    } catch (err: any) {
      const detail = err?.response?.data?.id_dispositivo?.[0]
        ?? err?.response?.data?.detail
        ?? err?.response?.data?.non_field_errors?.[0]
        ?? "Erro ao criar fechadura. Verifique os dados e tente novamente."
      setServerError(detail)
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-2">
        <FormField
          control={form.control}
          name="nome"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nome</FormLabel>
              <FormControl>
                <Input placeholder="Ex: Porta Principal - Apto 201" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="id_dispositivo"
          render={({ field }) => (
            <FormItem>
              <FormLabel>ID do Dispositivo (MAC)</FormLabel>
              <FormControl>
                <Input placeholder="Ex: AA:BB:CC:DD:EE:FF" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {serverError && (
          <p className="text-sm text-destructive">{serverError}</p>
        )}
        <Button
          type="submit"
          className="w-full"
          disabled={form.formState.isSubmitting}
        >
          {form.formState.isSubmitting ? "Salvando..." : "Adicionar Fechadura"}
        </Button>
      </form>
    </Form>
  )
}

function SummaryCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode
  label: string
  value: string
  sub: string
}) {
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm text-muted-foreground">{label}</p>
          {icon}
        </div>
        <p className="text-3xl font-bold">{value}</p>
        <p className="text-xs text-muted-foreground mt-1">{sub}</p>
      </CardContent>
    </Card>
  )
}
