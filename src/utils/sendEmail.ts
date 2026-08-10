import nodemailer from 'nodemailer';
import { env } from '../config/env';

const auth = env.smtpUser && env.smtpPass ? { user: env.smtpUser, pass: env.smtpPass } : undefined;

const transporter = nodemailer.createTransport({
  host: env.smtpHost,
  port: env.smtpPort,
  secure: false,
  ...(auth ? { auth } : {}),
});

export async function sendVerificationEmail(to: string, token: string) {
  if (!env.smtpUser || !env.smtpPass) throw new Error('SMTP is not configured');

  const verificationUrl = `${env.frontendUrl}/verify-email?token=${token}`;

  await transporter.sendMail({
    from: `"RealChat" <${env.smtpUser}>`,
    to,
    subject: 'Verify your RealChat account',
    html: `
      <h2>Welcome to RealChat!</h2>
      <p>Click the link below to verify your email address:</p>
      <a href="${verificationUrl}" style="display:inline-block;padding:12px 24px;background:#3b82f6;color:#fff;text-decoration:none;border-radius:6px;">Verify Email</a>
      <p>This link expires in 48 hours.</p>
    `,
  });
}

export async function sendResetPasswordEmail(to: string, token: string) {
  if (!env.smtpUser || !env.smtpPass) throw new Error('SMTP is not configured');

  const resetUrl = `${env.frontendUrl}/reset-password?token=${token}`;

  await transporter.sendMail({
    from: `"RealChat" <${env.smtpUser}>`,
    to,
    subject: 'Reset your RealChat password',
    html: `
      <h2>Password Reset Request</h2>
      <p>Click the link below to reset your password:</p>
      <a href="${resetUrl}" style="display:inline-block;padding:12px 24px;background:#3b82f6;color:#fff;text-decoration:none;border-radius:6px;">Reset Password</a>
      <p>This link expires in 1 hour.</p>
    `,
  });
}
