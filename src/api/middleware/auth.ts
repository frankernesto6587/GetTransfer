import { FastifyRequest, FastifyReply } from 'fastify';
import { verifyToken, getUserById } from '../../db/repository';

// ── Type augmentation for @fastify/jwt ──
declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { id: number; email: string; role: string };
    user: { id: number; email: string; name: string; role: string; picture: string };
  }
}

// ── Bearer token auth (Odoo /api/reclamar/*) — unchanged ──

export async function bearerAuth(request: FastifyRequest, reply: FastifyReply) {
  const header = request.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return reply.status(401).send({ error: 'Token de autenticacion requerido' });
  }

  const token = header.slice(7);
  const valid = await verifyToken(token);
  if (!valid) {
    return reply.status(401).send({ error: 'Token de autenticacion invalido' });
  }
}

// ── JWT cookie auth (global hook) ──

const PUBLIC_PREFIXES = ['/api/health', '/api/auth/google', '/api/monitor/webhook/', '/docs'];
const BEARER_PREFIXES = ['/api/reclamar'];

export async function jwtAuth(request: FastifyRequest, reply: FastifyReply) {
  const path = request.url.split('?')[0];

  // Skip public routes (Google OAuth flow, health, docs)
  if (PUBLIC_PREFIXES.some(p => path.startsWith(p))) return;
  // Skip routes that use Bearer token auth
  if (BEARER_PREFIXES.some(p => path.startsWith(p))) return;

  // /api/auth/me: try to verify but don't block (returns 401 in route handler)
  // /api/auth/logout: needs cookie to clear but shouldn't block
  const isSoftAuth = path === '/api/auth/me' || path === '/api/auth/logout';

  try {
    // @fastify/jwt reads cookie 'gt_token' automatically and populates request.user
    await request.jwtVerify();

    // Verify user is still active in DB (JWT only validates signature, not DB state)
    const dbUser = await getUserById(request.user.id);
    if (!dbUser || !dbUser.active) {
      // Clear invalid cookie so it doesn't loop
      reply.clearCookie('gt_token', { path: '/' });
      if (isSoftAuth) return;
      return reply.status(401).send({ error: 'Cuenta desactivada' });
    }

    // Enrich request.user with fresh DB data (role may have changed since JWT was issued)
    request.user = {
      id: dbUser.id,
      email: dbUser.email,
      name: dbUser.name,
      role: dbUser.role,
      picture: dbUser.picture,
    };
  } catch {
    if (isSoftAuth) return;
    return reply.status(401).send({ error: 'Sesion invalida o expirada' });
  }
}

// ── Role guard (preHandler) ──

export function requireRole(...roles: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const userRole = request.user?.role;
    // root has access to everything
    if (userRole === 'root') return;
    if (!userRole || !roles.includes(userRole)) {
      return reply.status(403).send({ error: 'No tienes permisos para esta accion' });
    }
  };
}
