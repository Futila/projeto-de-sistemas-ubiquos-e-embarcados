import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"
import { LoginPage } from "@/pages/LoginPage"
import { RegisterPage } from "@/pages/RegisterPage"
import { DashboardPage } from "@/pages/DashboardPage"
import { ProfilePage } from "@/pages/ProfilePage"
import { ReservasPage } from "@/pages/ReservasPage"
import { FechaduraDetailPage } from "@/pages/FechaduraDetailPage"
import { LogsPage } from "@/pages/LogsPage"
import { AppLayout } from "@/components/layout/AppLayout"

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route
          path="/dashboard"
          element={<AppLayout><DashboardPage /></AppLayout>}
        />
        <Route
          path="/fechaduras/:id"
          element={<AppLayout><FechaduraDetailPage /></AppLayout>}
        />
        <Route
          path="/reservas"
          element={<AppLayout><ReservasPage /></AppLayout>}
        />
        <Route
          path="/logs"
          element={<AppLayout><LogsPage /></AppLayout>}
        />
        <Route
          path="/perfil"
          element={<AppLayout><ProfilePage /></AppLayout>}
        />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App