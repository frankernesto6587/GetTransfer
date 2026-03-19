import {
  createRouter,
  createRoute,
  createRootRoute,
} from '@tanstack/react-router'
import { RootLayout } from './App'
import { DashboardView } from './views/DashboardView'
import { TransferenciasView } from './views/TransferenciasView'
import { GetCodeView } from './views/GetCodeView'
import { ConfirmarOdooView } from './views/ConfirmarOdooView'
import { ConfirmarOdooLegacyView } from './views/ConfirmarOdooLegacyView'
import { TransferenciasOdooView } from './views/TransferenciasOdooView'
import { ReportesView } from './views/ReportesView'
import { ConfigView } from './views/ConfigView'
import { UsuariosView } from './views/UsuariosView'
import { AyudaView } from './views/AyudaView'

// ── Root route ──
const rootRoute = createRootRoute({
  component: RootLayout,
})

// ── Routes ──
const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: DashboardView,
})

const transferenciasRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/transferencias',
  component: TransferenciasView,
  validateSearch: (search: Record<string, unknown>) => ({
    page: Number(search.page) || 1,
    nombre: (search.nombre as string) || '',
    fechaDesde: (search.fechaDesde as string) || '',
    fechaHasta: (search.fechaHasta as string) || '',
    desde: (search.desde as string) || '',
    hasta: (search.hasta as string) || '',
    canal: (search.canal as string) || '',
    ci: (search.ci as string) || '',
    cuenta: (search.cuenta as string) || '',
    refOrigen: (search.refOrigen as string) || '',
    codigo: (search.codigo as string) || '',
    estado: (search.estado as string) || '',
  }),
})

const getCodeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/getcode',
  component: GetCodeView,
})

const confirmarOdooRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/confirmar-odoo',
  component: ConfirmarOdooView,
})

const confirmarOdooLegacyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/confirmar-odoo-legacy',
  component: ConfirmarOdooLegacyView,
})

const transferenciasOdooRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/transferencias-odoo',
  component: TransferenciasOdooView,
  validateSearch: (search: Record<string, unknown>) => ({
    page: Number(search.page) || 1,
    fechaDesde: (search.fechaDesde as string) || '',
    fechaHasta: (search.fechaHasta as string) || '',
    nombre: (search.nombre as string) || '',
    ci: (search.ci as string) || '',
    cuenta: (search.cuenta as string) || '',
    canal: (search.canal as string) || '',
    refOrigen: (search.refOrigen as string) || '',
    gtCodigo: (search.gtCodigo as string) || '',
    transferCode: (search.transferCode as string) || '',
    desde: (search.desde as string) || '',
    hasta: (search.hasta as string) || '',
    paymentType: (search.paymentType as string) || '',
  }),
})

const reportesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/reportes',
  component: ReportesView,
})

const configRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/configuracion',
  component: ConfigView,
})

const usuariosRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/usuarios',
  component: UsuariosView,
})

const ayudaRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/ayuda',
  component: AyudaView,
})

// ── Route tree ──
const routeTree = rootRoute.addChildren([
  dashboardRoute,
  transferenciasRoute,
  getCodeRoute,
  confirmarOdooRoute,
  confirmarOdooLegacyRoute,
  transferenciasOdooRoute,
  reportesRoute,
  configRoute,
  usuariosRoute,
  ayudaRoute,
])

export const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
