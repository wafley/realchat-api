import rateLimit from 'express-rate-limit';

function createRateLimiter(max: number) {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    max,
    message: {
      success: false,
      message: 'Too many requests, please try again later',
    },
    standardHeaders: true,
    legacyHeaders: false,
  });
}

export const authRateLimiter = createRateLimiter(100);

export const refreshRateLimiter = createRateLimiter(20);
