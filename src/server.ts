import http from 'http';
import app from './app';
import { env } from './config/env';
import { initializeSocket } from './socket/index';

const server = http.createServer(app);
const io = initializeSocket(server);

server.listen(env.port, '0.0.0.0', () => {
  console.log(`Server running on port ${env.port} in ${env.nodeEnv} mode`);
});
