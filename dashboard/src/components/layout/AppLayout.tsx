import { useState } from "react"
import { NavLink, useNavigate } from "react-router-dom"
import { Lock, LayoutDashboard, User, LogOut, CalendarDays, ScrollText, Menu, X } from "lucide-react"
import { cn } from "@/lib/utils"

const navItems = [
  { to: "/dashboard", icon: LayoutDashboard, label: "Fechaduras" },
  { to: "/reservas", icon: CalendarDays, label: "Reservas" },
  { to: "/logs", icon: ScrollText, label: "Logs" },
  { to: "/perfil", icon: User, label: "Meu Perfil" },
]

function NavItems({ onNavigate, onLogout }: { onNavigate?: () => void; onLogout: () => void }) {
  return (
    <>
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
              )
            }
          >
            <Icon className="h-4 w-4" />
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="px-3 py-4 border-t border-sidebar-border">
        <button
          onClick={onLogout}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground transition-colors"
        >
          <LogOut className="h-4 w-4" />
          Sair
        </button>
      </div>
    </>
  )
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate()
  const [mobileOpen, setMobileOpen] = useState(false)

  function handleLogout() {
    localStorage.removeItem("authToken")
    navigate("/login")
  }

  const logoBlock = (
    <div className="flex items-center gap-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sidebar-primary/20">
        <Lock className="h-5 w-5 text-sidebar-primary" />
      </div>
      <div>
        <p className="font-semibold text-sm text-sidebar-foreground">AccessControl</p>
        <p className="text-xs text-sidebar-foreground/50">Painel do Anfitrião</p>
      </div>
    </div>
  )

  return (
    <div className="flex h-screen overflow-hidden bg-background">

      {/* ── Desktop sidebar ─────────────────────────────── */}
      <aside className="hidden md:flex w-64 shrink-0 flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
        <div className="px-6 py-5 border-b border-sidebar-border">{logoBlock}</div>
        <NavItems onLogout={handleLogout} />
      </aside>

      {/* ── Mobile backdrop ──────────────────────────────── */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* ── Mobile drawer ────────────────────────────────── */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border transition-transform duration-200 ease-in-out md:hidden",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex items-center justify-between px-4 py-4 border-b border-sidebar-border">
          {logoBlock}
          <button
            onClick={() => setMobileOpen(false)}
            className="ml-2 text-sidebar-foreground/60 hover:text-sidebar-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <NavItems onNavigate={() => setMobileOpen(false)} onLogout={handleLogout} />
      </aside>

      {/* ── Content area ─────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Mobile top bar */}
        <header className="md:hidden flex items-center gap-3 px-4 py-3 border-b border-sidebar-border bg-sidebar shrink-0">
          <button
            onClick={() => setMobileOpen(true)}
            className="text-sidebar-foreground/70 hover:text-sidebar-foreground"
            aria-label="Abrir menu"
          >
            <Menu className="h-6 w-6" />
          </button>
          <div className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-sidebar-primary" />
            <span className="font-semibold text-sm text-sidebar-foreground">AccessControl</span>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  )
}

