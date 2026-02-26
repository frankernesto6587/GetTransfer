import {
  LayoutDashboard,
  ArrowLeftRight,
  BarChart3,
  ClipboardCheck,
  HelpCircle,
  Settings,
  User,
} from 'lucide-react'

export type View = 'dashboard' | 'transferencias' | 'confirmar' | 'reportes' | 'configuracion' | 'ayuda'

const navItems: { icon: typeof LayoutDashboard; label: string; view: View }[] = [
  { icon: LayoutDashboard, label: 'Dashboard', view: 'dashboard' },
  { icon: ArrowLeftRight, label: 'Transferencias', view: 'transferencias' },
  { icon: ClipboardCheck, label: 'Confirmar', view: 'confirmar' },
  { icon: BarChart3, label: 'Reportes', view: 'reportes' },
  { icon: Settings, label: 'Configuracion', view: 'configuracion' },
  { icon: HelpCircle, label: 'Ayuda', view: 'ayuda' },
]

interface SidebarProps {
  active: View
  onNavigate: (view: View) => void
}

export function Sidebar({ active, onNavigate }: SidebarProps) {
  return (
    <aside className="fixed left-0 top-0 bottom-0 w-[260px] bg-surface border-r border-border flex flex-col">
      {/* Logo */}
      <div className="px-6 py-6 flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-gold flex items-center justify-center">
          <span className="font-headline text-xl font-bold text-page">G</span>
        </div>
        <span className="font-headline text-lg font-semibold tracking-wide text-white">
          GETTRANSFER
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 mt-4">
        {navItems.map((item) => (
          <button
            key={item.view}
            onClick={() => onNavigate(item.view)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg mb-1 transition-colors text-sm ${
              active === item.view
                ? 'bg-gold-dim text-gold'
                : 'text-secondary hover:text-white hover:bg-white/5'
            }`}
          >
            <item.icon size={18} />
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      {/* User section */}
      <div className="px-4 py-4 border-t border-border flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-border flex items-center justify-center">
          <User size={14} className="text-secondary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-white truncate">Admin</p>
          <p className="text-xs text-tertiary truncate">BANDEC</p>
        </div>
      </div>
    </aside>
  )
}
