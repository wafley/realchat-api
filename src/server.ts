import http from 'http';
import app from './app';
import { env } from './config/env';
import { initializeSocket } from './socket/index';
import { resetOnlineStatus } from './socket/resetPresence';

const logError = (label: string, err: unknown) => console.error(`[${label}]`, err);

process.on('unhandledRejection', (reason) => {
  logError('Unhandled promise rejection', reason);
});

process.on('uncaughtException', (err) => {
  logError('Uncaught exception', err);
  if (env.nodeEnv === 'production') process.exit(1);
});

async function bootstrap() {
  await resetOnlineStatus();

  const server = http.createServer(app);
  initializeSocket(server);

  server.listen(env.port, '0.0.0.0', () => {
    console.log(`Server running on port ${env.port} in ${env.nodeEnv} mode`);
  });
}

void bootstrap();
