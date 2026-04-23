"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendVerificationEmail = sendVerificationEmail;
exports.sendTicketConfirmationEmail = sendTicketConfirmationEmail;
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
async function sendTicketConfirmationEmail(params) {
    const sendRealEmail = process.env.NODE_ENV === 'production' || process.env.SEND_REAL_EMAIL === 'true';
    const ticketListHtml = params.tickets.map(ticket => `
    <div style="border: 2px solid #4CAF50; padding: 15px; margin-bottom: 15px; border-radius: 10px;">
      <h3>Ticket #${ticket.id.slice(-8)}</h3>
      <p><strong>Attendee:</strong> ${ticket.attendeeName}</p>
      <div style="background: white; padding: 10px; text-align: center;">
        <img src="${ticket.qrCode}" alt="QR Code" style="width: 150px;"/>
      </div>
      <p><strong>Status:</strong> Valid for entry</p>
    </div>
  `).join('');
    const subject = `Your Tickets for ${params.eventName} - Order #${params.orderNumber}`;
    const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; }
        .header { background: #4CAF50; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; }
        .ticket { border: 2px solid #4CAF50; margin: 15px 0; padding: 15px; border-radius: 10px; }
        .footer { background: #f4f4f4; padding: 10px; text-align: center; font-size: 12px; }
        .info-box { background: #e3f2fd; padding: 15px; margin: 20px 0; border-radius: 5px; }
        .total { font-size: 18px; font-weight: bold; color: #4CAF50; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>🎫 Your Tickets Are Ready!</h1>
      </div>
      <div class="content">
        <h2>Hello ${params.customerName},</h2>
        <p>Thank you for your purchase! Your tickets are attached below.</p>
        
        <div class="info-box">
          <h3>Order Summary</h3>
          <p><strong>Order Number:</strong> ${params.orderNumber}</p>
          <p><strong>Event:</strong> ${params.eventName}</p>
          <p><strong>Date:</strong> ${new Date(params.eventDate).toLocaleString()}</p>
          <p><strong>Venue:</strong> ${params.eventVenue}</p>
          <p class="total"><strong>Total Paid:</strong> MWK ${params.totalAmount.toLocaleString()}</p>
        </div>
        
        <h3>Your Tickets (${params.tickets.length})</h3>
        ${ticketListHtml}
        
        <div style="background: #fff3cd; padding: 15px; margin-top: 20px; border-radius: 5px;">
          <h3>⚠️ Important Information</h3>
          <ul>
            <li>Please have your QR code ready for scanning at the entrance</li>
            <li>Do not share your QR codes with anyone</li>
            <li>Arrive at least 30 minutes before the event starts</li>
            <li>Each ticket can only be scanned once</li>
          </ul>
        </div>
      </div>
      <div class="footer">
        <p>Need help? Contact us at support@events.com</p>
        <p>© ${new Date().getFullYear()} Event Ticketing System</p>
      </div>
    </body>
    </html>
  `;
    const text = `
    Your Tickets for ${params.eventName}
    
    Order #: ${params.orderNumber}
    Customer: ${params.customerName}
    Event: ${params.eventName}
    Date: ${new Date(params.eventDate).toLocaleString()}
    Venue: ${params.eventVenue}
    Total: MWK ${params.totalAmount.toLocaleString()}
    
    Tickets (${params.tickets.length}):
    ${params.tickets.map(t => `- ${t.attendeeName} (Ticket #${t.id.slice(-8)})`).join('\n')}
    
    Important: Please have your QR codes ready for scanning at the entrance.
  `;
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
                from: `"${process.env.APP_NAME || 'Events'}" <${process.env.SMTP_FROM_EMAIL}>`,
                to: params.email,
                subject,
                html,
                text,
            });
            console.log(`✅ Ticket confirmation email sent to ${params.email}`);
        }
        catch (error) {
            console.error('❌ Failed to send ticket email:', error);
            throw new Error('Failed to send ticket confirmation email');
        }
    }
    else {
        console.log('\n=================================');
        console.log('📧 TICKET CONFIRMATION EMAIL (DEV MODE)');
        console.log('=================================');
        console.log(`To: ${params.email}`);
        console.log(`Subject: ${subject}`);
        console.log(`\nTicket Details:`);
        params.tickets.forEach(t => {
            console.log(`  - ${t.attendeeName}: ${t.qrCode.substring(0, 50)}...`);
        });
        console.log('=================================\n');
    }
}
//# sourceMappingURL=email.js.map