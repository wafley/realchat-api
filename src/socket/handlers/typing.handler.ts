import { Server, Socket } from 'socket.io';

export function setupTypingHandlers(io: Server, socket: Socket) {
  const userId = (socket as Socket & { userId: string }).userId;

  socket.on('typing:start', (data: { conversationId: string }) => {
    socket.to(`conversation:${data.conversationId}`).emit('typing:start', {
      conversationId: data.conversationId,
      userId,
    });
  });

  socket.on('typing:stop', (data: { conversationId: string }) => {
    socket.to(`conversation:${data.conversationId}`).emit('typing:stop', {
      conversationId: data.conversationId,
      userId,
    });
  });
}
