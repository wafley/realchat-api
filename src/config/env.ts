import 'dotenv/config';
import { z } from 'zod';

const envSchema = z
  .object({
    PORT: z.coerce.number().default(3000),
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    DATABASE_URL: z.string().url(),
    JWT_ACCESS_SECRET: z.string().min(1),
    JWT_REFRESH_SECRET: z.string().min(1),
    JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
    JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
    FRONTEND_URL: z.string().url().default('http://localhost:5173'),
    CORS_ORIGIN: z.string().default('http://localhost:5173'),
    UPLOAD_DIR: z.string().default('uploads'),
    MAX_FILE_SIZE: z.coerce.number().default(5242880),
    MESSAGE_RATE_PER_SECOND: z.coerce.number().int().min(1).default(20),
    MESSAGE_RATE_PER_MINUTE: z.coerce.number().int().min(1).default(120),
    TYPING_THROTTLE_MS: z.coerce.number().int().min(1).default(500),
    TRUST_PROXY: z.coerce.number().int().min(0).default(0),
    SMTP_HOST: z.string().default('smtp.gmail.com'),
    SMTP_PORT: z.coerce.number().default(587),
    SMTP_USER: z.string().default(''),
    SMTP_PASS: z.string().default(''),
  })
  .superRefine((data, ctx) => {
    if (data.NODE_ENV === 'production' && (!data.SMTP_USER || !data.SMTP_PASS)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['SMTP_USER'],
        message: 'SMTP_USER and SMTP_PASS are required in production',
      });
    }
  });

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = {
  port: parsed.data.PORT,
  nodeEnv: parsed.data.NODE_ENV,
  databaseUrl: parsed.data.DATABASE_URL,
  jwtAccessSecret: parsed.data.JWT_ACCESS_SECRET,
  jwtRefreshSecret: parsed.data.JWT_REFRESH_SECRET,
  jwtAccessExpiresIn: parsed.data.JWT_ACCESS_EXPIRES_IN,
  jwtRefreshExpiresIn: parsed.data.JWT_REFRESH_EXPIRES_IN,
  frontendUrl: parsed.data.FRONTEND_URL,
  corsOrigin: parsed.data.CORS_ORIGIN,
  uploadDir: parsed.data.UPLOAD_DIR,
  maxFileSize: parsed.data.MAX_FILE_SIZE,
  messageRatePerSecond: parsed.data.MESSAGE_RATE_PER_SECOND,
  messageRatePerMinute: parsed.data.MESSAGE_RATE_PER_MINUTE,
  typingThrottleMs: parsed.data.TYPING_THROTTLE_MS,
  trustProxy: parsed.data.TRUST_PROXY,
  smtpHost: parsed.data.SMTP_HOST,
  smtpPort: parsed.data.SMTP_PORT,
  smtpUser: parsed.data.SMTP_USER,
  smtpPass: parsed.data.SMTP_PASS,
};
