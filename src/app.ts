import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import compression from 'compression';
import path from 'path';
import { env } from './config/env';
import routes from './routes/index';
import { errorHandler } from './middlewares/errorHandler';

const app = express();

app.set('trust proxy', env.trustProxy);

app.use(helmet());
const corsOrigins = env.corsOrigin.split(',').map((s) => s.trim());
app.use(cors({ origin: corsOrigins, credentials: true }));
app.use(compression());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

const UPLOAD_IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);

app.use(
  '/uploads',
  (req: Request, res: Response, next: NextFunction) => {
    const ext = path.extname(req.path).toLowerCase();
    if (!UPLOAD_IMAGE_EXTENSIONS.has(ext)) {
      res.status(404).json({ success: false, message: 'Not found' });
      return;
    }
    next();
  },
  express.static(env.uploadDir, {
    index: false,
    setHeaders: (res) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
    },
  }),
);

app.use('/api', routes);

app.use((_req: Request, res: Response) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

app.use(errorHandler);

export default app;
