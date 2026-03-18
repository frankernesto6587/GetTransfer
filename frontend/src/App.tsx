import { useState } from 'react'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { Sidebar } from './components/Sidebar'
import type { View } from './components/Sidebar'
import { LoginView } from './views/LoginView'
import { DashboardView } from './views/DashboardView'
import { TransferenciasView } from './views/TransferenciasView'
import { GetCodeView } from './views/GetCodeView'
import { ConfirmarOdooView } from './views/ConfirmarOdooView'
import { TransferenciasOdooView } from './views/TransferenciasOdooView'
import { ReportesView } from './views/ReportesView'
import { ConfigView } from './views/ConfigView'
import { AyudaView } from './views/AyudaView'
import { UsuariosView } from './views/UsuariosView'

const views: Record<View, React.FC> = {
  dashboard: DashboardView,
  transferencias: TransferenciasView,
  getcode: GetCodeView,
  'confirmar-odoo': ConfirmarOdooView,
  'transferencias-odoo': TransferenciasOdooView,
  reportes: ReportesView,
  configuracion: ConfigView,
  usuarios: UsuariosView,
  ayuda: AyudaView,
}

function AuthenticatedApp() {
  const [active, setActive] = useState<View>('dashboard')
  const ActiveView = views[active]

  return (
    <div className="flex h-screen">
      <Sidebar active={active} onNavigate={setActive} />
      <main className="ml-[260px] flex-1 overflow-y-auto">
        <ActiveView />
      </main>
    </div>
  )
}

function AppContent() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen bg-page flex items-center justify-center">
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 border-2 border-gold border-t-transparent rounded-full animate-spin" />
          <span className="text-secondary text-sm">Cargando...</span>
        </div>
      </div>
    )
  }

  if (!user) return <LoginView />

  return <AuthenticatedApp />
}

export function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}
