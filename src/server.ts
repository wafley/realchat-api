import http from 'http';
import app from './app';
import { env } from './config/env';

const server = http.createServer(app);

server.listen(env.port, () => {
  console.log(`Server running on port ${env.port} in ${env.nodeEnv} mode`);
});
