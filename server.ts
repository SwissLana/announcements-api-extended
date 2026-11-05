import app from './app.ts';
import prisma from './prisma/client.ts';
import { config } from './src/config.ts';

await prisma.$connect();
const server = app.listen(config.port, '127.0.0.1', () => {
  console.log(`API: http://localhost:${config.port}\nSwagger: http://localhost:${config.port}/api-docs`);
});
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    server.close(async () => { await prisma.$disconnect(); });
  });
}
