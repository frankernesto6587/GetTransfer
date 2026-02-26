import { FastifyRequest, FastifyReply } from 'fastify';
import { verifyToken } from '../../db/repository';

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
