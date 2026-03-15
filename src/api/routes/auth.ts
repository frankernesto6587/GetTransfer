import { FastifyInstance } from 'fastify';
import * as repo from '../../db/repository';

const ROOT_EMAIL = process.env.ROOT_EMAIL || '';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

export async function authRoutes(app: FastifyInstance) {

  // GET /api/auth/google — redirect to Google consent screen
  app.get('/api/auth/google', async (_request, reply) => {
    if (!GOOGLE_CLIENT_ID) {
      return reply.status(500).send({ error: 'GOOGLE_CLIENT_ID no configurado' });
    }

    const params = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      redirect_uri: `${FRONTEND_URL}/api/auth/google/callback`,
      response_type: 'code',
      scope: 'openid email profile',
      access_type: 'offline',
      prompt: 'select_account',
    });

    return reply.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
  });

  // GET /api/auth/google/callback — exchange code, create/find user, set JWT cookie
  app.get('/api/auth/google/callback', async (request, reply) => {
    const { code } = request.query as { code?: string };
    if (!code) {
      return reply.redirect(`${FRONTEND_URL}?error=no_code`);
    }

    // Exchange authorization code for tokens
    let tokens: { access_token?: string };
    try {
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: GOOGLE_CLIENT_ID,
          client_secret: GOOGLE_CLIENT_SECRET,
          redirect_uri: `${FRONTEND_URL}/api/auth/google/callback`,
          grant_type: 'authorization_code',
        }),
      });
      tokens = await tokenRes.json() as { access_token?: string };
    } catch {
      return reply.redirect(`${FRONTEND_URL}?error=token_failed`);
    }

    if (!tokens.access_token) {
      return reply.redirect(`${FRONTEND_URL}?error=token_failed`);
    }

    // Get user profile from Google
    let googleUser: { email?: string; name?: string; picture?: string };
    try {
      const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      googleUser = await userRes.json() as { email?: string; name?: string; picture?: string };
    } catch {
      return reply.redirect(`${FRONTEND_URL}?error=token_failed`);
    }

    const email = googleUser.email || '';
    const name = googleUser.name || '';
    const picture = googleUser.picture || '';

    if (!email) {
      return reply.redirect(`${FRONTEND_URL}?error=token_failed`);
    }

    // Find or create user
    let user = await repo.getUserByEmail(email);

    if (!user) {
      // Root email always gets access without invitation
      if (email === ROOT_EMAIL) {
        user = await repo.createUser({ email, name, picture, role: 'root' });
      } else {
        // Check for invitation
        const invitation = await repo.getInvitationByEmail(email);
        if (!invitation || invitation.usedAt) {
          return reply.redirect(`${FRONTEND_URL}?error=no_invitation`);
        }
        user = await repo.createUser({ email, name, picture, role: invitation.role });
        await repo.markInvitationUsed(email);
      }
    } else {
      // Existing user
      if (!user.active) {
        // Root is always reactivated
        if (email === ROOT_EMAIL) {
          user = await repo.updateUser(user.id, { active: true, role: 'root', name, picture });
        } else {
          // Check if there's a new invitation to reactivate
          const invitation = await repo.getInvitationByEmail(email);
          if (invitation && !invitation.usedAt) {
            user = await repo.updateUser(user.id, { active: true, role: invitation.role, name, picture });
            await repo.markInvitationUsed(email);
          } else {
            return reply.redirect(`${FRONTEND_URL}?error=account_disabled`);
          }
        }
      } else {
        // Active user — ensure root email always has root role
        if (email === ROOT_EMAIL && user.role !== 'root') {
          await repo.updateUser(user.id, { role: 'root' });
          user.role = 'root';
        }
        // Update name/picture from Google in case they changed
        if (user.name !== name || user.picture !== picture) {
          user = await repo.updateUser(user.id, { name, picture });
        }
      }
    }

    // Sign JWT and set cookie
    const token = await reply.jwtSign(
      { id: user.id, email: user.email, role: user.role },
      { expiresIn: '7d' }
    );

    reply.setCookie('gt_token', token, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 60 * 60,
    });

    return reply.redirect(FRONTEND_URL);
  });

  // GET /api/auth/me — return current user
  app.get('/api/auth/me', async (request, reply) => {
    // request.user is populated by the global jwtAuth hook
    if (!request.user) {
      return reply.status(401).send({ error: 'No autenticado' });
    }
    return {
      id: request.user.id,
      email: request.user.email,
      name: request.user.name,
      picture: request.user.picture,
      role: request.user.role,
    };
  });

  // POST /api/auth/logout — clear cookie
  app.post('/api/auth/logout', async (_request, reply) => {
    reply.clearCookie('gt_token', { path: '/' });
    return { ok: true };
  });
}
