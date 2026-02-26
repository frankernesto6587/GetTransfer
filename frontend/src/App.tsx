import { useState } from 'react'
import { Sidebar } from './components/Sidebar'
import type { View } from './components/Sidebar'
import { DashboardView } from './views/DashboardView'
import { TransferenciasView } from './views/TransferenciasView'
import { ConfirmarView } from './views/ConfirmarView'
import { ReportesView } from './views/ReportesView'
import { ConfigView } from './views/ConfigView'
import { AyudaView } from './views/AyudaView'

const views: Record<View, React.FC> = {
  dashboard: DashboardView,
  transferencias: TransferenciasView,
  confirmar: ConfirmarView,
  reportes: ReportesView,
  configuracion: ConfigView,
  ayuda: AyudaView,
}

export function App() {
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
