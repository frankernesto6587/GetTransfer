import { Settings, Database, Globe, Bell } from 'lucide-react'

export function ConfiguracionView() {
  return (
    <div className="p-8 max-w-[1400px]">
      <div className="mb-8">
        <h1 className="font-headline text-3xl font-bold text-white">Configuración</h1>
        <p className="text-secondary mt-1">Ajustes del sistema</p>
      </div>

      <div className="space-y-4">
        <div className="rounded-xl border border-border bg-surface p-6">
          <div className="flex items-center gap-3 mb-4">
            <Database size={20} className="text-gold" />
            <h3 className="font-headline text-lg font-semibold text-white">Base de Datos</h3>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <span className="text-xs text-tertiary uppercase tracking-wider">Motor</span>
              <p className="text-sm text-white mt-1">PostgreSQL</p>
            </div>
            <div>
              <span className="text-xs text-tertiary uppercase tracking-wider">Puerto</span>
              <p className="text-sm font-mono text-white mt-1">5433</p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-surface p-6">
          <div className="flex items-center gap-3 mb-4">
            <Globe size={20} className="text-gold" />
            <h3 className="font-headline text-lg font-semibold text-white">API</h3>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <span className="text-xs text-tertiary uppercase tracking-wider">URL Base</span>
              <p className="text-sm font-mono text-white mt-1">http://localhost:3000</p>
            </div>
            <div>
              <span className="text-xs text-tertiary uppercase tracking-wider">Estado</span>
              <p className="text-sm text-emerald-400 mt-1">Activo</p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-surface p-6">
          <div className="flex items-center gap-3 mb-4">
            <Settings size={20} className="text-gold" />
            <h3 className="font-headline text-lg font-semibold text-white">Scraper</h3>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <span className="text-xs text-tertiary uppercase tracking-wider">Banco</span>
              <p className="text-sm text-white mt-1">BANDEC — Virtual BANDEC</p>
            </div>
            <div>
              <span className="text-xs text-tertiary uppercase tracking-wider">Motor</span>
              <p className="text-sm text-white mt-1">Playwright (Chromium)</p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-surface p-6">
          <div className="flex items-center gap-3 mb-4">
            <Bell size={20} className="text-gold" />
            <h3 className="font-headline text-lg font-semibold text-white">Notificaciones</h3>
          </div>
          <p className="text-sm text-secondary">Próximamente — alertas por nuevas transferencias</p>
        </div>
      </div>
    </div>
  )
}
