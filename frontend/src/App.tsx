import { useState } from 'react'
import { Outlet } from '@tanstack/react-router'
import { Menu } from 'lucide-react'
import { useAuth } from './contexts/AuthContext'
import { Sidebar } from './components/Sidebar'
import { LoginView } from './views/LoginView'

export function RootLayout() {
  const { user, loading } = useAuth()
  const [sidebarOpen, setSidebarOpen] = useState(false)

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

  return (
    <div className="flex h-screen">
      {/* Mobile header */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-14 bg-surface border-b border-border z-40 flex items-center px-4 gap-3">
        <button
          onClick={() => setSidebarOpen(true)}
          className="p-2 rounded-lg text-secondary hover:text-white hover:bg-white/10 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
        >
          <Menu size={20} />
        </button>
        <div className="w-8 h-8 rounded-lg bg-gold flex items-center justify-center">
          <span className="font-headline text-sm font-bold text-page">G</span>
        </div>
        <span className="font-headline text-base font-semibold tracking-wide text-white">
          GETTRANSFER
        </span>
      </div>

      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main className="md:ml-[260px] flex-1 overflow-y-auto pt-14 md:pt-0">
        <Outlet />
      </main>
    </div>
  )
}
