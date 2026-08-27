import { OAuth2Client } from 'google-auth-library';
import crypto, { randomUUID } from 'crypto';
import { env } from '../../config/env';
import * as repository from './auth.repository';
import { generateAccessToken, generateRefreshToken } from '../../utils/generateToken';
import jwt from 'jsonwebtoken';

const googleClient = new OAuth2Client(
  env.googleClientId,
  env.googleClientSecret,
  env.googleRedirectUri,
);

/** Build Google OAuth consent screen URL. */
export function getGoogleAuthUrl() {
  return googleClient.generateAuthUrl({
    access_type: 'offline',
    scope: ['openid', 'email', 'profile'],
    prompt: 'consent',
  });
}

/** Exchange authorization code, verify Google user, find or create local user, issue tokens. */
export async function handleGoogleCallback(code: string) {
  const { tokens } = await googleClient.getToken(code);
  const ticket = await googleClient.verifyIdToken({
    idToken: tokens.id_token!,
    audience: env.googleClientId,
  });

  const payload = ticket.getPayload()!;
  const googleId = payload.sub;
  const email = payload.email!;
  const fullName = payload.name ?? undefined;
  const avatarUrl = payload.picture ?? undefined;

  let user = await repository.findUserByProviderId('google', googleId);

  if (!user) {
    const existingByEmail = await repository.findUserByEmail(email);

    if (existingByEmail) {
      user = existingByEmail;
    } else {
      const baseUsername = email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
      let username = baseUsername;
      let counter = 1;
      while (await repository.findUserByUsername(username)) {
        username = `${baseUsername}${counter}`;
        counter++;
      }

      user = await repository.createUser({
        username,
        email,
        fullName,
        avatarUrl,
        provider: 'google',
        providerId: googleId,
      });

      await repository.updateVerifiedStatus(user.id);
    }
  }

  const accessToken = generateAccessToken({ userId: user.id }, user.tokenVersion);
  const refreshToken = generateRefreshToken({ userId: user.id });
  const refreshPayload = jwt.decode(refreshToken) as { jti: string; exp: number };

  await repository.saveRefreshToken({
    userId: user.id,
    token: refreshToken,
    jti: refreshPayload.jti,
    familyId: randomUUID(),
    parentJti: null,
    expiredAt: new Date(refreshPayload.exp * 1000),
  });

  return {
    accessToken,
    refreshToken,
    user: { id: user.id, username: user.username, email: user.email },
  };
}
