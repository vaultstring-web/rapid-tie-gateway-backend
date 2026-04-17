"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendVerificationEmail = sendVerificationEmail;
const nodemailer_1 = __importDefault(require("nodemailer"));
async function sendVerificationEmail(email, token, type = 'VERIFICATION', firstName) {
    const sendRealEmail = process.env.NODE_ENV === 'production' || process.env.SEND_REAL_EMAIL === 'true';
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
    }
    else if (type === 'RESET') {
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
    }
    else if (type === 'RESET_CONFIRMATION') {
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
            const transporter = nodemailer_1.default.createTransport({
                host: process.env.SMTP_HOST,
                port: parseInt(process.env.SMTP_PORT || '465', 10),
                secure: process.env.SMTP_SECURE === 'true',
                auth: {
                    user: process.env.SMTP_USER,
                    pass: process.env.SMTP_PASS,
                },
                tls: {
                    rejectUnauthorized: false,
                },
            });
            await transporter.sendMail({
                from: `"${process.env.APP_NAME || 'App'}" <${process.env.SMTP_FROM_EMAIL}>`,
                to: email,
                subject,
                text,
                html,
            });
            console.log(`✅ Email sent to ${email}`);
        }
        catch (error) {
            console.error('❌ Failed to send email:', error);
            throw new Error('Failed to send email. Check SMTP configuration.');
        }
    }
    else {
        console.log('\n=================================');
        console.log(`📧 EMAIL (${type}) - DEV MODE`);
        console.log('=================================');
        console.log(`To: ${email}`);
        if (token)
            console.log(`Link: ${process.env.FRONTEND_URL}/${type === 'VERIFICATION' ? 'verify-email' : 'reset-password'}?token=${token}`);
        console.log('=================================\n');
    }
}
//# sourceMappingURL=email.js.map