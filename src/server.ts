/**
 * Entry point aplikasi: membuat HTTP server dari app Express,
 * menginisialisasi Socket.IO di atasnya, lalu mulai mendengarkan koneksi.
 * Juga memasang penanganan error tingkat proses (unhandledRejection/uncaughtException).
 */

import http from 'http';
import app from './app';
import { env } from './config/env';
import { initializeSocket } from './socket/index';
import { resetOnlineStatus } from './socket/resetPresence';

/** Helper kecil untuk mencetak error berlabel ke console. */
const logError = (label: string, err: unknown) => console.error(`[${label}]`, err);

// Rejection promise yang tidak tertangani hanya dicatat agar proses tetap hidup.
process.on('unhandledRejection', (reason) => {
  logError('Unhandled promise rejection', reason);
});

// Exception yang tidak tertangani dicatat; di production proses dihentikan
// karena state sudah tidak bisa dipercaya.
process.on('uncaughtException', (err) => {
  logError('Uncaught exception', err);
  if (env.nodeEnv === 'production') process.exit(1);
});

/**
 * Menyalakan server: reset status online pengguna lama, buat HTTP server,
 * pasang Socket.IO, lalu listen di semua interface (0.0.0.0).
 */
async function bootstrap() {
  await resetOnlineStatus();

  const server = http.createServer(app);
  initializeSocket(server);

  server.listen(env.port, '0.0.0.0', () => {
    console.log(`Server running on port ${env.port} in ${env.nodeEnv} mode`);
  });
}

// void: sengaja tidak menunggu; error sudah ditangani handler proses di atas.
void bootstrap();
