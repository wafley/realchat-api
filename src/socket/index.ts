import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import db from '../db/index';
import { users } from '../db/schema/users';
import { eq } from 'drizzle-orm';

const onlineUsers = new Map<string, Set<string>>();

export function getOnlineUsers() {
  return onlineUsers;
}

export function initializeSocket(server: HttpServer) {
  const io = new Server(server, {
    cors: {
      origin: env.corsOrigin.split(',').map((s) => s.trim()),
      credentials: true,
    },
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error('Authentication required'));
    }

    try {
      const decoded = jwt.verify(token, env.jwtAccessSecret) as { userId: string };
      (socket as Socket & { userId: string }).userId = decoded.userId;
      next();
    } catch {
      next(new Error('Invalid or expired token'));
    }
  });

  io.on('connection', async (socket) => {
    const userId = (socket as Socket & { userId: string }).userId;
    console.log(`User ${userId} connected (socket: ${socket.id})`);

    await db.update(users).set({ isOnline: true }).where(eq(users.id, userId));

    socket.join(`user:${userId}`);

    socket.on('disconnect', async () => {
      console.log(`User ${userId} disconnected (socket: ${socket.id})`);
      await db
        .update(users)
        .set({ isOnline: false, lastSeenAt: new Date() })
        .where(eq(users.id, userId));
    });
  });

  return io;
}
