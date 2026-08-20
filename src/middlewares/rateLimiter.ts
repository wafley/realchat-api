import type { Request } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

function createRateLimiter(max: number, keyPrefix: string, scopeKey: (req: Request) => string) {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    max,
    message: {
      success: false,
      message: 'Too many requests, please try again later',
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req: Request) => {
      const ip = ipKeyGenerator(req.ip ?? 'unknown');
      return `${keyPrefix}:${ip}:${scopeKey(req)}`;
    },
  });
}

export const authRateLimiter = createRateLimiter(100, 'auth', (req) => {
  const email = (req.body as { email?: unknown } | undefined)?.email;
  return typeof email === 'string' && email.trim() ? email.trim().toLowerCase() : 'noemail';
});

export const refreshRateLimiter = createRateLimiter(20, 'refresh', (req) => {
  const token = (req.body as { refreshToken?: unknown } | undefined)?.refreshToken;
  return typeof token === 'string' && token ? token.slice(-16) : 'notoken';
});
