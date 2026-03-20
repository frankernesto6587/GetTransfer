import dotenv from 'dotenv';
dotenv.config();

import path from 'path';
import fs from 'fs';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { transferenciaRoutes } from './routes/transferencias';
import { getcodeRoutes } from './routes/getcode';
import { confirmarOdooRoutes } from './routes/confirmar-odoo';
import { confirmarOdooLegacyRoutes } from './routes/confirmar-odoo-legacy';
import { transferenciasOdooRoutes } from './routes/transferencias-odoo';
import { reclamarRoutes } from './routes/reclamar';
import { tokenRoutes } from './routes/token';
import { monitorRoutes } from './routes/monitor';
import { statementRoutes } from './routes/statements';
import { authRoutes } from './routes/auth';
import { userRoutes } from './routes/users';
import { jwtAuth } from './middleware/auth';
import { prisma } from '../db/repository';
import { monitorService } from '../monitor/monitor-service';

const PORT = parseInt(process.env.API_PORT || '3000', 10);

async function main() {
  const app = Fastify({
    logger: {
      transport: {
        target: 'pino-pretty',
        options: {
          translateTime: 'HH:MM:ss',
          ignore: 'pid,hostname',
        },
      },
    },
  });

  // Plugins
  await app.register(cors, {
    origin: process.env.FRONTEND_URL || true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  });
  await app.register(cookie);
  await app.register(jwt, {
    secret: process.env.JWT_SECRET || 'dev-secret-change-in-production',
    cookie: { cookieName: 'gt_token', signed: false },
  });
  await app.register(swagger, {
    openapi: {
      info: {
        title: 'GetTransfer API',
        description: 'API para consultar transferencias BANDEC',
        version: '1.0.0',
      },
    },
  });
  await app.register(swaggerUi, { routePrefix: '/docs' });
  await app.register(multipart, { limits: { fileSize: 50 * 1024 * 1024 } });

  // Reset confirmaciones (temporal, sin auth - eliminar después de usar)
  app.post('/api/confirmar-odoo/reset-confirmaciones', async () => {
    const { resetAllConfirmaciones } = await import('../db/repository');
    const total = await resetAllConfirmaciones();
    return { success: true, total_reseteados: total };
  });

  // Global auth hook
  app.addHook('onRequest', jwtAuth);

  // Routes
  await app.register(authRoutes);
  await app.register(userRoutes);
  await app.register(transferenciaRoutes);
  await app.register(getcodeRoutes);
  await app.register(confirmarOdooRoutes);
  await app.register(confirmarOdooLegacyRoutes);
  await app.register(transferenciasOdooRoutes);
  await app.register(reclamarRoutes);
  await app.register(tokenRoutes);
  await app.register(monitorRoutes);
  await app.register(statementRoutes);

  app.get('/api/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

  // Serve frontend static files in production
  const distPath = path.join(__dirname, '../../frontend/dist');
  if (fs.existsSync(distPath)) {
    await app.register(fastifyStatic, {
      root: distPath,
      prefix: '/',
      wildcard: false,
    });
    // SPA fallback: non-API routes serve index.html
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith('/api/')) {
        return reply.status(404).send({ error: 'Not found' });
      }
      return reply.sendFile('index.html');
    });
  }

  try {
    await app.listen({ port: PORT, host: '0.0.0.0' });
    console.log(`API corriendo en http://localhost:${PORT}`);
    console.log(`Swagger docs en http://localhost:${PORT}/docs`);

    // Start monitor service
    monitorService.start().catch(err =>
      console.error('[Monitor] Error al iniciar:', err.message)
    );

  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }

  const shutdown = async () => {
    monitorService.stop();
    await app.close();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch(console.error);
