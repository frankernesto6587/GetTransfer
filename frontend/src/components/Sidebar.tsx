import {
  LayoutDashboard,
  ArrowLeftRight,
  BarChart3,
  HelpCircle,
  Settings,
  Users,
  LogOut,
  KeyRound,
  Link,
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

export type View = 'dashboard' | 'transferencias' | 'getcode' | 'confirmar-odoo' | 'reportes' | 'configuracion' | 'usuarios' | 'ayuda'

interface NavItem {
  icon: typeof LayoutDashboard
  label: string
  view: View
  requireAdmin?: boolean
  requireConfirm?: boolean
}

const navItems: NavItem[] = [
  { icon: LayoutDashboard, label: 'Dashboard', view: 'dashboard' },
  { icon: ArrowLeftRight, label: 'Transferencias', view: 'transferencias' },
  { icon: KeyRound, label: 'GetCode', view: 'getcode', requireConfirm: true },
  { icon: Link, label: 'Confirmar Odoo', view: 'confirmar-odoo', requireConfirm: true },
  { icon: BarChart3, label: 'Reportes', view: 'reportes' },
  { icon: Settings, label: 'Configuracion', view: 'configuracion', requireAdmin: true },
  { icon: Users, label: 'Usuarios', view: 'usuarios', requireAdmin: true },
  { icon: HelpCircle, label: 'Ayuda', view: 'ayuda' },
]

interface SidebarProps {
  active: View
  onNavigate: (view: View) => void
}

export function Sidebar({ active, onNavigate }: SidebarProps) {
  const { user, logout, isAdmin, canConfirm } = useAuth()

  const visibleItems = navItems.filter((item) => {
    if (item.requireAdmin && !isAdmin) return false
    if (item.requireConfirm && !canConfirm) return false
    return true
  })

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
        {visibleItems.map((item) => (
          <button
            key={item.view}
            onClick={() => onNavigate(item.view)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg mb-1 transition-colors text-sm cursor-pointer ${
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
      {user && (
        <div className="px-4 py-4 border-t border-border">
          <div className="flex items-center gap-3">
            {user.picture ? (
              <img
                src={user.picture}
                alt={user.name}
                className="w-8 h-8 rounded-full"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-border flex items-center justify-center">
                <span className="text-xs text-secondary font-medium">
                  {user.name?.[0]?.toUpperCase() || '?'}
                </span>
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm text-white truncate">{user.name || user.email}</p>
              <p className="text-xs text-tertiary truncate">{user.role}</p>
            </div>
            <button
              onClick={logout}
              className="p-1.5 rounded-md text-tertiary hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              title="Cerrar sesion"
            >
              <LogOut size={14} />
            </button>
          </div>
        </div>
      )}
    </aside>
  )
}
