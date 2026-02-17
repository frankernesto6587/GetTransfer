import dotenv from 'dotenv';
dotenv.config();

import Fastify from 'fastify';
import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { transferenciaRoutes } from './routes/transferencias';
import { confirmarRoutes } from './routes/confirmar';
import { prisma } from '../db/repository';

const PORT = parseInt(process.env.API_PORT || '3000', 10);

async function main() {
  const app = Fastify({ logger: true });

  await app.register(cors, { origin: true });
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

  await app.register(transferenciaRoutes);
  await app.register(confirmarRoutes);

  app.get('/api/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

  try {
    await app.listen({ port: PORT, host: '0.0.0.0' });
    console.log(`API corriendo en http://localhost:${PORT}`);
    console.log(`Swagger docs en http://localhost:${PORT}/docs`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }

  const shutdown = async () => {
    await app.close();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch(console.error);
