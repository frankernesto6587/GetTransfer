import {
  LayoutDashboard,
  ArrowLeftRight,
  BarChart3,
  HelpCircle,
  Settings,
  Users,
  LogOut,
  KeyRound,
  Link as LinkIcon,
  Database,
  Clock,
  FileUp,
} from 'lucide-react'
import { Link, useMatchRoute } from '@tanstack/react-router'
import { useAuth } from '../contexts/AuthContext'

interface NavItem {
  icon: typeof LayoutDashboard
  label: string
  to: string
  requireAdmin?: boolean
  requireConfirm?: boolean
}

const navItems: NavItem[] = [
  { icon: LayoutDashboard, label: 'Dashboard', to: '/' },
  { icon: ArrowLeftRight, label: 'Transferencias', to: '/transferencias' },
  { icon: KeyRound, label: 'GetCode', to: '/getcode', requireConfirm: true },
  { icon: LinkIcon, label: 'Confirmar Odoo', to: '/confirmar-odoo', requireConfirm: true },
  { icon: Clock, label: 'Odoo Legacy', to: '/confirmar-odoo-legacy', requireConfirm: true },
  { icon: Database, label: 'Transferencias Odoo', to: '/transferencias-odoo', requireConfirm: true },
  { icon: BarChart3, label: 'Reportes', to: '/reportes' },
  { icon: FileUp, label: 'Estados de Cuenta', to: '/estados-cuenta', requireAdmin: true },
  { icon: Settings, label: 'Configuracion', to: '/configuracion', requireAdmin: true },
  { icon: Users, label: 'Usuarios', to: '/usuarios', requireAdmin: true },
  { icon: HelpCircle, label: 'Ayuda', to: '/ayuda' },
]

interface SidebarProps {
  open: boolean
  onClose: () => void
}

export function Sidebar({ open, onClose }: SidebarProps) {
  const { user, logout, isAdmin, canConfirm } = useAuth()
  const matchRoute = useMatchRoute()

  const visibleItems = navItems.filter((item) => {
    if (item.requireAdmin && !isAdmin) return false
    if (item.requireConfirm && !canConfirm) return false
    return true
  })

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 bg-black/60 z-40 md:hidden"
          onClick={onClose}
        />
      )}

      <aside className={`fixed left-0 top-0 bottom-0 w-[260px] bg-surface border-r border-border flex flex-col z-50 transition-transform duration-200 ${
        open ? 'translate-x-0' : '-translate-x-full'
      } md:translate-x-0`}>
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
          {visibleItems.map((item) => {
            const isActive = item.to === '/'
              ? matchRoute({ to: '/', fuzzy: false })
              : matchRoute({ to: item.to, fuzzy: true })

            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={onClose}
                className={`w-full flex items-center gap-3 px-3 py-3 md:py-2.5 rounded-lg mb-1 transition-colors text-sm ${
                  isActive
                    ? 'bg-gold-dim text-gold'
                    : 'text-secondary hover:text-white hover:bg-white/5'
                }`}
              >
                <item.icon size={18} />
                <span>{item.label}</span>
              </Link>
            )
          })}
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
                className="p-1.5 rounded-md text-tertiary hover:text-white hover:bg-white/10 transition-colors cursor-pointer min-w-[44px] min-h-[44px] flex items-center justify-center"
                title="Cerrar sesion"
              >
                <LogOut size={14} />
              </button>
            </div>
          </div>
        )}
      </aside>
    </>
  )
}
