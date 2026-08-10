interface Bucket {
  count: number;
  resetAt: number;
}

export function createFixedWindowLimiter(options: { windowMs: number; max: number }) {
  const buckets = new Map<string, Bucket>();

  const prune = () => {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
  };

  const allow = (key: string): boolean => {
    const now = Date.now();
    const bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + options.windowMs });
      return true;
    }

    if (bucket.count < options.max) {
      bucket.count += 1;
      return true;
    }

    return false;
  };

  return { allow, prune };
}

export function createMessageRateLimiter(options: { perSecond: number; perMinute: number }) {
  const perSecondLimiter = createFixedWindowLimiter({ windowMs: 1000, max: options.perSecond });
  const perMinuteLimiter = createFixedWindowLimiter({ windowMs: 60_000, max: options.perMinute });

  const interval = setInterval(() => {
    perSecondLimiter.prune();
    perMinuteLimiter.prune();
  }, 60_000);
  interval.unref();

  return {
    allow(userId: string): boolean {
      return perSecondLimiter.allow(userId) && perMinuteLimiter.allow(userId);
    },
  };
}
