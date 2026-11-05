import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { setTimeout } from 'node:timers/promises';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';

const execute = promisify(execFile);

export default async function setup() {
  // Always create an isolated database. Never reset a user's DATABASE_URL.
  let stopDatabase: () => Promise<void>;
  if (process.env.TEST_DB_ENGINE === 'pglite') {
    const port = await new Promise<number>(resolve => {
      const server = createServer();
      server.listen(0, '127.0.0.1', () => {
        const address = server.address();
        if (!address || typeof address === 'string') throw new Error('No test port');
        server.close(() => resolve(address.port));
      });
    });
    const database = await PGlite.create();
    const server = new PGLiteSocketServer({ db: database, port, host: '127.0.0.1' });
    await server.start();
    stopDatabase = async () => { await server.stop(); await database.close(); };
    process.env.DATABASE_POOL_SIZE = '1';
    process.env.DATABASE_URL = `postgresql://postgres:postgres@127.0.0.1:${port}/postgres`;
  } else {
    const containerName = `announcements-test-${randomUUID()}`;
    await execute('docker', ['run', '--detach', '--rm', '--name', containerName,
      '--publish', '127.0.0.1::5432', '--env', 'POSTGRES_PASSWORD=test-password',
      '--env', 'POSTGRES_DB=announcements_test', 'postgres:17']);
    stopDatabase = async () => { await execute('docker', ['rm', '--force', containerName]); };
    try {
      const { stdout } = await execute('docker', ['port', containerName, '5432/tcp']);
      const port = stdout.trim().split(':').at(-1);
      process.env.DATABASE_URL = `postgresql://postgres:test-password@127.0.0.1:${port}/announcements_test`;
      process.env.DATABASE_POOL_SIZE = '10';
      let ready = false;
      for (let attempt = 0; attempt < 30; attempt++) {
        try {
          await execute('docker', ['exec', containerName, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres']);
          ready = true;
          break;
        } catch { await setTimeout(1000); }
      }
      if (!ready) throw new Error('Test PostgreSQL did not become ready within 30 seconds.');
    } catch (error) {
      await stopDatabase();
      throw error;
    }
  }
  try {
    await execute(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], {
      env: process.env,
    });
  } catch (error) {
    await stopDatabase();
    throw error;
  }
  return stopDatabase;
}
