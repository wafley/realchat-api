import http from 'http';
import app from './app.js';
import { env } from './config/env.js';

const server = http.createServer(app);

server.listen(env.port, () => {
  console.log(`Server running on port ${env.port} in ${env.nodeEnv} mode`);
});