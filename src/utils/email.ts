// utils/email.ts
import nodemailer from 'nodemailer';

export interface SendEmailParams {
  email: string;
  token: string;
  type: 'VERIFICATION' | 'RESET' | 'RESET_CONFIRMATION';
  firstName?: string;
}

export async function sendVerificationEmail(
  email: string, 
  token: string, 
  type: 'VERIFICATION' | 'RESET' | 'RESET_CONFIRMATION' = 'VERIFICATION',
  firstName?: string
): Promise<void> {

  // Determine if we should actually send email
  const sendRealEmail = process.env.NODE_ENV === 'production' || process.env.SEND_REAL_EMAIL === 'true';

  // Compose email content
  let subject = '';
  let html = '';
  let text = '';

  if (type === 'VERIFICATION') {
    const verifyLink = `${process.env.FRONTEND_URL}/verify-email?token=${token}`;
    subject = 'Verify Your Email Address';
    html = `
      <h1>Email Verification</h1>
      <p>Hello ${firstName || 'User'},</p>
      <p>Click the link below to verify your email:</p>
      <a href="${verifyLink}">${verifyLink}</a>
      <p>This link expires in 24 hours.</p>
    `;
    text = `Verify your email: ${verifyLink}`;
  } else if (type === 'RESET') {
    const resetLink = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;
    subject = 'Password Reset Request';
    html = `
      <h1>Reset Your Password</h1>
      <p>Hello ${firstName || 'User'},</p>
      <p>Click the link below to reset your password:</p>
      <a href="${resetLink}">${resetLink}</a>
      <p>This link expires in 1 hour.</p>
      <p>If you didn't request this, ignore this email.</p>
    `;
    text = `Reset your password: ${resetLink}`;
  } else if (type === 'RESET_CONFIRMATION') {
    subject = 'Password Reset Confirmation';
    html = `
      <h1>Password Changed Successfully</h1>
      <p>Hello ${firstName || 'User'},</p>
      <p>Your password has been successfully changed.</p>
      <p>If you did not make this change, contact support immediately.</p>
    `;
    text = 'Your password has been successfully changed.';
  }

  if (sendRealEmail) {
    try {
      // Configure SMTP transporter
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '465', 10),
        secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
        tls: {
        rejectUnauthorized: false, // ✅ Issues with SMTP configuration so BYPASS SSL ERROR
        },
      });

      // Send email
      await transporter.sendMail({
        from: `"${process.env.APP_NAME || 'App'}" <${process.env.SMTP_FROM_EMAIL}>`,
        to: email,
        subject,
        text,
        html,
      });

      console.log(`✅ Email sent to ${email}`);
    } catch (error) {
      console.error('❌ Failed to send email:', error);
      // Still throw so calling code knows it failed
      throw new Error('Failed to send email. Check SMTP configuration.');
    }
  } else {
    // Development: log email to console
    console.log('\n=================================');
    console.log(`📧 EMAIL (${type}) - DEV MODE`);
    console.log('=================================');
    console.log(`To: ${email}`);
    if (token) console.log(`Link: ${process.env.FRONTEND_URL}/${type === 'VERIFICATION' ? 'verify-email' : 'reset-password'}?token=${token}`);
    console.log('=================================\n');
  }
}