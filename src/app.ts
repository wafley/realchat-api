/**
 * Konfigurasi aplikasi Express: middleware keamanan (helmet, CORS),
 * parsing body/cookie, kompresi, penyajian statis file upload yang
 * dibatasi ekstensi, router API, dan errorHandler global.
 */

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import compression from 'compression';
import path from 'path';
import { env } from './config/env';
import { ALLOWED_MESSAGE_EXTENSIONS } from './config/constants';
import routes from './routes/index';
import { errorHandler } from './middlewares/errorHandler';

const app = express();

// Percayai proxy (mis. nginx) agar req.ip mengambil IP asli klien.
app.set('trust proxy', env.trustProxy);

app.use(helmet());
// Origin CORS berupa daftar dipisah koma di env agar mendukung banyak frontend.
const corsOrigins = env.corsOrigin.split(',').map((s) => s.trim());
app.use(cors({ origin: corsOrigins, credentials: true }));
app.use(compression());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Whitelist ekstensi file yang boleh disajikan secara statis.
const UPLOAD_EXTENSIONS = ALLOWED_MESSAGE_EXTENSIONS;

// Penyajian file upload: tolak ekstensi di luar whitelist (404) sebelum
// static handler, dan set nosniff agar browser tidak menebak tipe konten.
// CORP sengaja dilonggarkan menjadi cross-origin hanya untuk file statis:
// UI mobile (Capacitor WebView) berjalan dari origin http://localhost dan
// memuat gambar dari origin backend, sehingga default helmet same-origin
// membuat gambar gagal tampil di Android WebView. Endpoint API tetap
// menggunakan default helmet.
app.use(
  '/uploads',
  (req: Request, res: Response, next: NextFunction) => {
    const ext = path.extname(req.path).toLowerCase();
    if (!UPLOAD_EXTENSIONS.has(ext)) {
      res.status(404).json({ success: false, message: 'Not found' });
      return;
    }
    next();
  },
  express.static(env.uploadDir, {
    index: false,
    setHeaders: (res) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      // File upload bersifat publik (tanpa auth), sehingga pelonggaran ini
      // tidak mengekspos data tambahan; hanya memungkinkan hotlinking.
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    },
  }),
);

// Semua rute API berada di bawah prefix /api.
app.use('/api', routes);

// Fallback 404 untuk rute yang tidak cocok sama sekali.
app.use((_req: Request, res: Response) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

// errorHandler harus terakhir agar menangkap error dari semua rute.
app.use(errorHandler);

/** Ekspor aplikasi Express; server.ts yang memasangnya ke HTTP server. */
export default app;
