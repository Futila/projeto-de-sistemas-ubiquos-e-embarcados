import { useEffect, useState } from "react"
import { useNavigate, Link } from "react-router-dom"
import { Loader2, ShieldAlert, Flame, KeyRound, Activity, Search, SlidersHorizontal } from "lucide-react"

import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import api from "@/lib/api"

interface HistoricoEvento {
  id: number
  fechadura: number
  fechadura_nome: string
  tipo: string
  valor_sensor: string | null
  descricao: string
  timestamp: string
}

type TipoFilter = "TODOS" | "ACESSO" | "ALERTA_GAS" | "ALERTA_FUMACA" | "SISTEMA"

const TIPO_CONFIG: Record<string, { label: string; icon: React.ReactNode; badge: "default" | "secondary" | "destructive" | "outline" }> = {
  ACESSO:        { label: "Acesso",        icon: <KeyRound className="h-4 w-4 text-indigo-400" />,  badge: "outline" },
  ALERTA_GAS:    { label: "Alerta de Gás", icon: <ShieldAlert className="h-4 w-4 text-amber-400" />, badge: "default" },
  ALERTA_FUMACA: { label: "Alerta de Fumaça", icon: <Flame className="h-4 w-4 text-red-400" />,    badge: "destructive" },
  SISTEMA:       { label: "Sistema",       icon: <Activity className="h-4 w-4 text-sky-400" />,     badge: "secondary" },
}

const TIPO_FILTERS: { value: TipoFilter; label: string }[] = [
  { value: "TODOS", label: "Todos" },
  { value: "ALERTA_GAS", label: "Alertas de Gás" },
  { value: "ALERTA_FUMACA", label: "Alertas de Fumaça" },
  { value: "ACESSO", label: "Acessos" },
  { value: "SISTEMA", label: "Sistema" },
]

export function LogsPage() {
  const navigate = useNavigate()
  const [eventos, setEventos] = useState<HistoricoEvento[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [tipoFilter, setTipoFilter] = useState<TipoFilter>("TODOS")

  useEffect(() => {
    if (!localStorage.getItem("authToken")) {
      navigate("/login")
      return
    }
    api.get<HistoricoEvento[]>("/eventos/")
      .then((res) => setEventos(res.data))
      .catch(() => setError("Não foi possível carregar os eventos."))
      .finally(() => setLoading(false))
  }, [navigate])

  const alertCount = eventos.filter((e) => e.tipo === "ALERTA_GAS" || e.tipo === "ALERTA_FUMACA").length

  const filtered = eventos.filter((ev) => {
    const matchTipo = tipoFilter === "TODOS" || ev.tipo === tipoFilter
    const matchSearch =
      !search ||
      ev.descricao.toLowerCase().includes(search.toLowerCase()) ||
      ev.fechadura_nome.toLowerCase().includes(search.toLowerCase())
    return matchTipo && matchSearch
  })

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      <div className="flex items-start justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">Logs de Eventos</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {loading ? "Carregando..." : `${eventos.length} eventos registrados`}
            {alertCount > 0 && (
              <span className="ml-2 text-amber-400 font-medium">
                · {alertCount} alerta{alertCount > 1 ? "s" : ""}
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Summary badges */}
      {!loading && (
        <div className="flex flex-wrap gap-3 mb-6">
          {Object.entries(TIPO_CONFIG).map(([tipo, cfg]) => {
            const count = eventos.filter((e) => e.tipo === tipo).length
            return (
              <button
                key={tipo}
                onClick={() => setTipoFilter(tipoFilter === tipo as TipoFilter ? "TODOS" : tipo as TipoFilter)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm transition-colors ${
                  tipoFilter === tipo
                    ? "bg-primary/10 border-primary/40 text-foreground"
                    : "bg-card border-border text-muted-foreground hover:border-muted-foreground/50"
                }`}
              >
                {cfg.icon}
                <span>{cfg.label}</span>
                <span className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">{count}</span>
              </button>
            )
          })}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por descrição ou fechadura..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {TIPO_FILTERS.map(({ value, label }) => (
            <Button
              key={value}
              variant={tipoFilter === value ? "default" : "outline"}
              size="sm"
              onClick={() => setTipoFilter(value)}
            >
              {label}
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
        <div className="flex flex-col items-center justify-center py-20 text-center text-muted-foreground">
          <SlidersHorizontal className="h-8 w-8 mb-3 opacity-30" />
          <p className="text-sm">Nenhum evento encontrado com os filtros atuais.</p>
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <Card className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-36">Tipo</TableHead>
                <TableHead className="w-48 hidden sm:table-cell">Fechadura</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead className="w-24 text-right hidden md:table-cell">Sensor</TableHead>
                <TableHead className="w-44 text-right">Data/Hora</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((ev) => {
                const cfg = TIPO_CONFIG[ev.tipo]
                return (
                  <TableRow key={ev.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {cfg?.icon}
                        <Badge variant={cfg?.badge ?? "outline"} className="text-xs">
                          {cfg?.label ?? ev.tipo}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <Link
                        to={`/fechaduras/${ev.fechadura}`}
                        className="text-sm text-primary hover:underline truncate block max-w-[180px]"
                      >
                        {ev.fechadura_nome}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{ev.descricao}</TableCell>
                    <TableCell className="text-right font-mono text-sm hidden md:table-cell">
                      {ev.valor_sensor != null ? ev.valor_sensor : "—"}
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(ev.timestamp).toLocaleString("pt-BR")}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  )
}
