import { Request, Response, NextFunction } from 'express';
import { env } from '../../config/env';
import * as googleService from './google.service';

/** Redirect user to Google OAuth consent screen. */
export function googleAuth(_req: Request, res: Response) {
  const url = googleService.getGoogleAuthUrl();
  res.redirect(url);
}

/** Handle Google OAuth callback, issue tokens, redirect back to FE. */
export async function googleCallback(req: Request, res: Response, next: NextFunction) {
  try {
    const code = req.query.code as string;
    if (!code) {
      res.redirect(`${env.frontendUrl}/login?error=google_cancelled`);
      return;
    }

    const result = await googleService.handleGoogleCallback(code);

    const params = new URLSearchParams({
      token: result.accessToken,
      refreshToken: result.refreshToken,
      user: JSON.stringify(result.user),
    });

    res.redirect(`${env.frontendUrl}/auth/callback?${params.toString()}`);
  } catch (error) {
    console.error('Google OAuth error:', error);
    res.redirect(`${env.frontendUrl}/login?error=google_failed`);
  }
}
