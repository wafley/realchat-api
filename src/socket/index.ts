import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import db from '../db/index';
import { users } from '../db/schema/users';
import { conversationMembers } from '../db/schema/conversationMembers';
import { eq } from 'drizzle-orm';
import { onlineUsers } from './onlineUsers';
import { setupMessageHandlers, catchUpMessageDelivery } from './handlers/message.handler';
import { setupTypingHandlers } from './handlers/typing.handler';
import { setupGroupHandlers } from './handlers/group.handler';

let io: Server;

export function getIO(): Server {
  if (!io) throw new Error('Socket.IO not initialized');
  return io;
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

  io.on('connection', (socket) => {
    const userId = (socket as Socket & { userId: string }).userId;
    console.log(`User ${userId} connected (socket: ${socket.id})`);

    // Register event handlers synchronously BEFORE any async (DB) work,
    // otherwise events emitted right after 'connect' are dropped by the server.
    setupMessageHandlers(io, socket);
    setupTypingHandlers(io, socket);
    setupGroupHandlers(socket);

    // Track this socket before any async work so fast disconnects are caught
    // by the single disconnect listener below.
    if (!onlineUsers.has(userId)) {
      onlineUsers.set(userId, new Set());
    }
    onlineUsers.get(userId)!.add(socket.id);

    let userConversations: string[] = [];

    void (async () => {
      try {
        await db.update(users).set({ isOnline: true }).where(eq(users.id, userId));
        socket.join(`user:${userId}`);

        const memberships = await db
          .select({ conversationId: conversationMembers.conversationId })
          .from(conversationMembers)
          .where(eq(conversationMembers.userId, userId));
        userConversations = memberships.map((membership) => membership.conversationId);
        for (const membership of memberships) {
          socket.join(`conversation:${membership.conversationId}`);
        }

        // Emit presence only after this socket has joined its conversation
        // rooms, so the event reaches every member (including this socket).
        if (onlineUsers.get(userId)?.size === 1 && socket.connected) {
          for (const conversationId of userConversations) {
            io.to(`conversation:${conversationId}`).emit('presence:online', { userId });
          }
          void catchUpMessageDelivery(io, userId).catch((err) => {
            console.error(`Failed to run delivery catch-up for user ${userId}:`, err);
          });
        }

        // If the socket already disconnected while the async work was running,
        // the disconnect listener marked the user offline. Ensure that offline
        // state survives a race against the isOnline write above.
        if ((onlineUsers.get(userId)?.size ?? 0) === 0) {
          await db
            .update(users)
            .set({ isOnline: false, lastSeenAt: new Date() })
            .where(eq(users.id, userId));
        }
      } catch (err) {
        console.error(`Failed to set up socket for user ${userId}:`, err);
      }
    })();

    socket.on('disconnect', () => {
      console.log(`User ${userId} disconnected (socket: ${socket.id})`);
      const sockets = onlineUsers.get(userId);
      if (!sockets) {
        return;
      }
      sockets.delete(socket.id);
      if (sockets.size > 0) {
        return;
      }

      onlineUsers.delete(userId);
      const now = new Date();
      for (const conversationId of userConversations) {
        io.to(`conversation:${conversationId}`).emit('presence:offline', {
          userId,
          lastSeenAt: now.toISOString(),
        });
      }
      void db
        .update(users)
        .set({ isOnline: false, lastSeenAt: now })
        .where(eq(users.id, userId))
        .catch((err) => {
          console.error(`Failed to mark user ${userId} offline:`, err);
        });
    });
  });

  return io;
}
