import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Plus, Ban, Loader2, KeyRound, Search, X, Pencil, AlertTriangle } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import api from "@/lib/api"

interface Fechadura {
  id: number
  nome: string
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

const STATUS_LABEL: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  PENDENTE: { label: "Pendente", variant: "secondary" },
  AGENDADO: { label: "Agendado", variant: "outline" },
  ATIVO: { label: "Ativo", variant: "default" },
  EXPIRADO: { label: "Expirado", variant: "secondary" },
  REVOGADO: { label: "Revogado", variant: "destructive" },
}

const novoAcessoSchema = z
  .object({
    fechadura: z.string().min(1, "Selecione uma fechadura."),
    hospede_identificador: z.string().email("E-mail do hóspede inválido."),
    inicio_reserva: z.string().min(1, "Informe o início da reserva."),
    fim_reserva: z.string().min(1, "Informe o fim da reserva."),
  })
  .refine((d) => new Date(d.fim_reserva) > new Date(d.inicio_reserva), {
    message: "O fim deve ser após o início.",
    path: ["fim_reserva"],
  })

type NovoAcessoValues = z.infer<typeof novoAcessoSchema>

export function ReservasPage() {
  const navigate = useNavigate()
  const [acessos, setAcessos] = useState<AcessoTemporario[]>([])
  const [fechaduras, setFechaduras] = useState<Fechadura[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [acessoEditando, setAcessoEditando] = useState<AcessoTemporario | null>(null)
  const [revogando, setRevogando] = useState<number | null>(null)
  const [confirmRevoke, setConfirmRevoke] = useState<{ open: boolean; acesso: AcessoTemporario | null }>({ open: false, acesso: null })

  const [filterStatus, setFilterStatus] = useState<string>("TODOS")
  const [filterFechadura, setFilterFechadura] = useState<string>("TODAS")
  const [filterSearch, setFilterSearch] = useState<string>("")

  const acessosFiltrados = acessos.filter((a) => {
    const matchStatus = filterStatus === "TODOS" || a.status === filterStatus
    const matchFechadura = filterFechadura === "TODAS" || String(a.fechadura) === filterFechadura
    const matchSearch =
      filterSearch.trim() === "" ||
      a.hospede_identificador.toLowerCase().includes(filterSearch.toLowerCase())
    return matchStatus && matchFechadura && matchSearch
  })

  const hasActiveFilters =
    filterStatus !== "TODOS" || filterFechadura !== "TODAS" || filterSearch.trim() !== ""

  function clearFilters() {
    setFilterStatus("TODOS")
    setFilterFechadura("TODAS")
    setFilterSearch("")
  }

  useEffect(() => {
    if (!localStorage.getItem("authToken")) {
      navigate("/login")
      return
    }
    Promise.all([
      api.get<AcessoTemporario[]>("/acessos/"),
      api.get<Fechadura[]>("/fechaduras/"),
    ]).then(([acessosRes, fechadurasRes]) => {
      setAcessos(acessosRes.data)
      setFechaduras(fechadurasRes.data)
    }).finally(() => setLoading(false))
  }, [navigate])

  function abrirEdicao(acesso: AcessoTemporario) {
    setAcessoEditando(acesso)
    setEditDialogOpen(true)
  }

  function pedirRevogacao(acesso: AcessoTemporario) {
    setConfirmRevoke({ open: true, acesso })
  }

  async function confirmarRevogacao() {
    if (!confirmRevoke.acesso) return
    const id = confirmRevoke.acesso.id
    setConfirmRevoke({ open: false, acesso: null })
    setRevogando(id)
    try {
      const res = await api.post<AcessoTemporario>(`/acessos/${id}/revogar/`)
      setAcessos((prev) => prev.map((a) => (a.id === id ? res.data : a)))
    } catch {
      // sem feedback — pode-se adicionar toast futuramente
    } finally {
      setRevogando(null)
    }
  }

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">

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
              </span>{" "}
              à fechadura. Ela não pode ser desfeita.
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

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold">Reservas</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Gerencie as chaves digitais dos hóspedes
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Nova Reserva
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Criar nova reserva</DialogTitle>
            </DialogHeader>
            <NovaReservaForm
              fechaduras={fechaduras}
              onSuccess={(novo) => {
                setAcessos((prev) => [novo, ...prev])
                setDialogOpen(false)
              }}
            />
          </DialogContent>
        </Dialog>

        {/* Dialog de edição */}
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Editar reserva</DialogTitle>
            </DialogHeader>
            {acessoEditando && (
              <EditarReservaForm
                acesso={acessoEditando}
                fechaduras={fechaduras}
                onSuccess={(atualizado) => {
                  setAcessos((prev) => prev.map((a) => (a.id === atualizado.id ? atualizado : a)))
                  setEditDialogOpen(false)
                }}
              />
            )}
          </DialogContent>
        </Dialog>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por hóspede..."
            value={filterSearch}
            onChange={(e) => setFilterSearch(e.target.value)}
            className="pl-8"
          />
        </div>

        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="TODOS">Todos os status</SelectItem>
            {Object.entries(STATUS_LABEL).map(([key, { label }]) => (
              <SelectItem key={key} value={key}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterFechadura} onValueChange={setFilterFechadura}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Fechadura" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="TODAS">Todas as fechaduras</SelectItem>
            {fechaduras.map((f) => (
              <SelectItem key={f.id} value={String(f.id)}>{f.nome}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="text-muted-foreground">
            <X className="h-4 w-4 mr-1" />
            Limpar
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : acessosFiltrados.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="rounded-full bg-muted p-4 mb-4">
            <KeyRound className="h-8 w-8 text-muted-foreground" />
          </div>
          <p className="font-medium">
            {acessos.length === 0 ? "Nenhuma reserva cadastrada" : "Nenhuma reserva encontrada"}
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            {acessos.length === 0
              ? "Crie uma reserva para gerar a chave do hóspede."
              : "Tente ajustar os filtros para encontrar o que procura."}
          </p>
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Hóspede</TableHead>
                <TableHead>Fechadura</TableHead>
                <TableHead className="hidden sm:table-cell">Período</TableHead>
                <TableHead className="hidden md:table-cell">Token</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {acessosFiltrados.map((acesso) => {
                const statusInfo = STATUS_LABEL[acesso.status] ?? { label: acesso.status, variant: "secondary" as const }
                const canRevoke = !["EXPIRADO", "REVOGADO"].includes(acesso.status)
                const canEdit = !["EXPIRADO", "REVOGADO"].includes(acesso.status)
                return (
                  <TableRow key={acesso.id}>
                    <TableCell className="font-medium max-w-[140px] truncate">{acesso.hospede_identificador}</TableCell>
                    <TableCell className="max-w-[120px] truncate">{acesso.fechadura_nome}</TableCell>
                    <TableCell className="text-sm text-muted-foreground hidden sm:table-cell whitespace-nowrap">
                      <span>{formatDate(acesso.inicio_reserva)}</span>
                      <span className="mx-1">→</span>
                      <span>{formatDate(acesso.fim_reserva)}</span>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">
                        {acesso.token_resgate}
                      </code>
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                    </TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={!canEdit}
                        onClick={() => abrirEdicao(acesso)}
                        title="Editar reserva"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={!canRevoke || revogando === acesso.id}
                        onClick={() => pedirRevogacao(acesso)}
                        className="text-destructive hover:text-destructive"
                        title="Revogar acesso"
                      >
                        {revogando === acesso.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Ban className="h-4 w-4" />
                        )}
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

// Converte ISO string para o formato aceito pelo input datetime-local
function toDatetimeLocal(iso: string) {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function ReservaFormFields({ fechaduras, form }: { fechaduras: Fechadura[]; form: ReturnType<typeof useForm<NovoAcessoValues>> }) {
  return (
    <>
      <FormField
        control={form.control}
        name="fechadura"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Fechadura</FormLabel>
            <Select onValueChange={field.onChange} value={field.value}>
              <FormControl>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a fechadura" />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                {fechaduras.map((f) => (
                  <SelectItem key={f.id} value={String(f.id)}>
                    {f.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="hospede_identificador"
        render={({ field }) => (
          <FormItem>
            <FormLabel>E-mail do Hóspede</FormLabel>
            <FormControl>
              <Input type="email" placeholder="hospede@email.com" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <div className="grid grid-cols-2 gap-3">
        <FormField
          control={form.control}
          name="inicio_reserva"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Início</FormLabel>
              <FormControl>
                <Input type="datetime-local" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="fim_reserva"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Fim</FormLabel>
              <FormControl>
                <Input type="datetime-local" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
    </>
  )
}

function NovaReservaForm({
  fechaduras,
  onSuccess,
}: {
  fechaduras: Fechadura[]
  onSuccess: (acesso: AcessoTemporario) => void
}) {
  const [serverError, setServerError] = useState<string | null>(null)
  const form = useForm<NovoAcessoValues>({
    resolver: zodResolver(novoAcessoSchema),
    defaultValues: { fechadura: "", hospede_identificador: "", inicio_reserva: "", fim_reserva: "" },
  })

  async function onSubmit(data: NovoAcessoValues) {
    setServerError(null)
    try {
      const res = await api.post<AcessoTemporario>("/acessos/", {
        ...data,
        fechadura: Number(data.fechadura),
      })
      onSuccess(res.data)
    } catch {
      setServerError("Erro ao criar reserva. Verifique os dados e tente novamente.")
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-2">
        <ReservaFormFields fechaduras={fechaduras} form={form} />
        {serverError && <p className="text-sm text-destructive">{serverError}</p>}
        <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? "Criando..." : "Criar Reserva"}
        </Button>
      </form>
    </Form>
  )
}

function EditarReservaForm({
  acesso,
  fechaduras,
  onSuccess,
}: {
  acesso: AcessoTemporario
  fechaduras: Fechadura[]
  onSuccess: (acesso: AcessoTemporario) => void
}) {
  const [serverError, setServerError] = useState<string | null>(null)
  const form = useForm<NovoAcessoValues>({
    resolver: zodResolver(novoAcessoSchema),
    defaultValues: {
      fechadura: String(acesso.fechadura),
      hospede_identificador: acesso.hospede_identificador,
      inicio_reserva: toDatetimeLocal(acesso.inicio_reserva),
      fim_reserva: toDatetimeLocal(acesso.fim_reserva),
    },
  })

  async function onSubmit(data: NovoAcessoValues) {
    setServerError(null)
    try {
      const res = await api.patch<AcessoTemporario>(`/acessos/${acesso.id}/`, {
        ...data,
        fechadura: Number(data.fechadura),
      })
      onSuccess(res.data)
    } catch {
      setServerError("Erro ao salvar as alterações. Verifique os dados e tente novamente.")
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-2">
        <ReservaFormFields fechaduras={fechaduras} form={form} />
        {serverError && <p className="text-sm text-destructive">{serverError}</p>}
        <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? "Salvando..." : "Salvar Alterações"}
        </Button>
      </form>
    </Form>
  )
}
