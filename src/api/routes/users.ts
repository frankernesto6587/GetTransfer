import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireRole } from '../middleware/auth';
import * as repo from '../../db/repository';

const ROOT_EMAIL = process.env.ROOT_EMAIL || '';
const VALID_ROLES = ['admin', 'confirmer', 'viewer'] as const;

export async function userRoutes(app: FastifyInstance) {
  // All routes require admin (or root, which is handled inside requireRole)
  app.addHook('preHandler', requireRole('admin'));

  // ── Users ──

  app.get('/api/users', async () => {
    return repo.getAllUsers();
  });

  app.put('/api/users/:id/role', async (request, reply) => {
    const { id } = request.params as { id: string };
    const schema = z.object({ role: z.enum(VALID_ROLES) });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Rol invalido. Opciones: admin, confirmer, viewer' });
    }

    const numId = parseInt(id, 10);
    if (isNaN(numId)) return reply.status(400).send({ error: 'ID invalido' });

    // Cannot change root's role
    const target = await repo.getUserById(numId);
    if (!target) return reply.status(404).send({ error: 'Usuario no encontrado' });
    if (target.email === ROOT_EMAIL) {
      return reply.status(403).send({ error: 'No se puede cambiar el rol del usuario root' });
    }

    // Cannot change own role
    if (request.user?.id === numId) {
      return reply.status(400).send({ error: 'No puedes cambiar tu propio rol' });
    }

    return repo.updateUser(numId, { role: parsed.data.role });
  });

  app.delete('/api/users/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const numId = parseInt(id, 10);
    if (isNaN(numId)) return reply.status(400).send({ error: 'ID invalido' });

    // Cannot deactivate root
    const target = await repo.getUserById(numId);
    if (!target) return reply.status(404).send({ error: 'Usuario no encontrado' });
    if (target.email === ROOT_EMAIL) {
      return reply.status(403).send({ error: 'No se puede desactivar al usuario root' });
    }

    // Cannot deactivate self
    if (request.user?.id === numId) {
      return reply.status(400).send({ error: 'No puedes desactivarte a ti mismo' });
    }

    // Delete associated invitation so the email can be re-invited
    const invitation = await repo.getInvitationByEmail(target.email);
    if (invitation) {
      await repo.deleteInvitation(invitation.id);
    }

    return repo.deactivateUser(numId);
  });

  // ── Invitations ──

  app.get('/api/invitations', async () => {
    return repo.getAllInvitations();
  });

  app.post('/api/invitations', async (request, reply) => {
    const schema = z.object({
      email: z.string().email('Email invalido'),
      role: z.enum(VALID_ROLES),
    });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0]?.message || 'Datos invalidos' });
    }

    // Check if user already exists and is active
    const existingUser = await repo.getUserByEmail(parsed.data.email);
    if (existingUser && existingUser.active) {
      return reply.status(409).send({ error: 'Este email ya tiene una cuenta activa' });
    }

    // Check if invitation already exists
    const existingInvitation = await repo.getInvitationByEmail(parsed.data.email);
    if (existingInvitation) {
      return reply.status(409).send({ error: 'Ya existe una invitacion para este email' });
    }

    const invitedBy = request.user!.id;
    return repo.createInvitation(parsed.data.email, parsed.data.role, invitedBy);
  });

  app.delete('/api/invitations/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const numId = parseInt(id, 10);
    if (isNaN(numId)) return reply.status(400).send({ error: 'ID invalido' });

    try {
      await repo.deleteInvitation(numId);
      return { ok: true };
    } catch {
      return reply.status(404).send({ error: 'Invitacion no encontrada' });
    }
  });
}
