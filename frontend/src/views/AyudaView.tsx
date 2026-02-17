import { HelpCircle, Terminal, Database, BarChart3 } from 'lucide-react'

const sections = [
  {
    icon: Terminal,
    title: 'Scraping',
    items: [
      { cmd: 'pnpm scrape:month', desc: 'Ejecutar scraping del mes actual (con navegador visible)' },
      { cmd: 'pnpm scrape:month:headless', desc: 'Scraping en modo headless (sin ventana)' },
    ],
  },
  {
    icon: Database,
    title: 'Base de Datos',
    items: [
      { cmd: 'docker compose up -d', desc: 'Iniciar PostgreSQL' },
      { cmd: 'pnpm db:push', desc: 'Sincronizar schema de Prisma' },
      { cmd: 'pnpm db:studio', desc: 'Abrir Prisma Studio (GUI)' },
    ],
  },
  {
    icon: BarChart3,
    title: 'API y Frontend',
    items: [
      { cmd: 'pnpm dev', desc: 'Iniciar API Fastify (puerto 3000)' },
      { cmd: 'cd frontend && pnpm dev', desc: 'Iniciar frontend (puerto 5173)' },
    ],
  },
]

export function AyudaView() {
  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="font-headline text-3xl font-bold text-white">Ayuda</h1>
        <p className="text-secondary mt-1">Referencia rápida de comandos y uso</p>
      </div>

      <div className="space-y-4">
        {sections.map((section) => (
          <div key={section.title} className="rounded-xl border border-border bg-surface p-6">
            <div className="flex items-center gap-3 mb-4">
              <section.icon size={20} className="text-gold" />
              <h3 className="font-headline text-lg font-semibold text-white">{section.title}</h3>
            </div>
            <div className="space-y-3">
              {section.items.map((item) => (
                <div key={item.cmd} className="flex items-start gap-4">
                  <code className="text-sm font-mono text-gold bg-gold/10 px-2 py-1 rounded shrink-0">
                    {item.cmd}
                  </code>
                  <span className="text-sm text-secondary pt-1">{item.desc}</span>
                </div>
              ))}
            </div>
          </div>
        ))}

        <div className="rounded-xl border border-border bg-surface p-6">
          <div className="flex items-center gap-3 mb-4">
            <HelpCircle size={20} className="text-gold" />
            <h3 className="font-headline text-lg font-semibold text-white">Flujo Típico</h3>
          </div>
          <ol className="space-y-2 text-sm text-secondary list-decimal list-inside">
            <li>Levantar PostgreSQL: <code className="font-mono text-gold/80">docker compose up -d</code></li>
            <li>Ejecutar scraping: <code className="font-mono text-gold/80">pnpm scrape:month</code></li>
            <li>Iniciar API: <code className="font-mono text-gold/80">pnpm dev</code></li>
            <li>Iniciar frontend: <code className="font-mono text-gold/80">cd frontend && pnpm dev</code></li>
            <li>Abrir <code className="font-mono text-gold/80">http://localhost:5173</code> en el navegador</li>
          </ol>
        </div>
      </div>
    </div>
  )
}
