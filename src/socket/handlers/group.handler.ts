import { Socket } from 'socket.io';

export function setupGroupHandlers(socket: Socket) {
  socket.on('group:join', (data: { conversationId: string }) => {
    socket.join(`conversation:${data.conversationId}`);
  });

  socket.on('group:leave', (data: { conversationId: string }) => {
    socket.leave(`conversation:${data.conversationId}`);
  });
}
