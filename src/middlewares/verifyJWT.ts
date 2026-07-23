import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import db from '../db/index';
import { users } from '../db/schema/users';
import { eq } from 'drizzle-orm';

export interface AuthRequest extends Request {
  userId?: string;
}

export async function verifyJWT(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ success: false, message: 'Access token is required' });
    return;
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, env.jwtAccessSecret) as { userId: string };

    const [user] = await db
      .select({ isVerified: users.isVerified })
      .from(users)
      .where(eq(users.id, decoded.userId))
      .limit(1);

    if (!user) {
      res.status(401).json({ success: false, message: 'User not found' });
      return;
    }

    if (!user.isVerified) {
      res
        .status(401)
        .json({
          success: false,
          message: 'Please verify your email before accessing this resource',
        });
      return;
    }

    req.userId = decoded.userId;
    next();
  } catch {
    res.status(401).json({ success: false, message: 'Invalid or expired access token' });
  }
}
