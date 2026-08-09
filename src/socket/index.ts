import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import db from '../db/index';
import { users } from '../db/schema/users';
import { conversationMembers } from '../db/schema/conversationMembers';
import { eq } from 'drizzle-orm';

let io: Server;

export function getIO(): Server {
  if (!io) throw new Error('Socket.IO not initialized');
  return io;
}

const onlineUsers = new Map<string, Set<string>>();

export function getOnlineUsers() {
  return onlineUsers;
}

export function initializeSocket(server: HttpServer) {
  io = new Server(server, {
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

    try {
      await db.update(users).set({ isOnline: true }).where(eq(users.id, userId));
      socket.join(`user:${userId}`);

      const memberships = await db
        .select({ conversationId: conversationMembers.conversationId })
        .from(conversationMembers)
        .where(eq(conversationMembers.userId, userId));
      for (const membership of memberships) {
        socket.join(`conversation:${membership.conversationId}`);
      }

      const [
        { setupPresenceHandlers },
        { setupMessageHandlers },
        { setupTypingHandlers },
        { setupGroupHandlers },
      ] = await Promise.all([
        import('./handlers/presence.handler'),
        import('./handlers/message.handler'),
        import('./handlers/typing.handler'),
        import('./handlers/group.handler'),
      ]);
      await setupPresenceHandlers(io, socket);
      setupMessageHandlers(io, socket);
      setupTypingHandlers(io, socket);
      setupGroupHandlers(socket);
    } catch (err) {
      console.error(`Failed to set up socket for user ${userId}:`, err);
    }

    socket.on('disconnect', async () => {
      console.log(`User ${userId} disconnected (socket: ${socket.id})`);
      try {
        const remaining = onlineUsers.get(userId)?.size ?? 0;
        if (remaining === 0) {
          await db
            .update(users)
            .set({ isOnline: false, lastSeenAt: new Date() })
            .where(eq(users.id, userId));
        }
      } catch (err) {
        console.error(`Failed to mark user ${userId} offline:`, err);
      }
    });
  });

  return io;
}
