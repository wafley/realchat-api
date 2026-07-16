import { Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import { env } from '../config/env';

export function initializeSocket(server: HttpServer) {
  const io = new Server(server, {
    cors: {
      origin: env.corsOrigin,
      credentials: true,
    },
  });

  io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.id}`);
  });

  return io;
}
