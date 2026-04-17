// services/qrcode.service.ts
import QRCode from 'qrcode';
import crypto from 'crypto';
import { prisma } from '../server';

const QR_SECRET = process.env.QR_SECRET || 'your-super-secret-qr-key';

export class QRCodeService {
  // Generate HMAC signature for QR code
  static generateSignature(data: string): string {
    return crypto
      .createHmac('sha256', QR_SECRET)
      .update(data)
      .digest('hex');
  }

  // Verify QR code signature
  static verifySignature(data: string, signature: string): boolean {
    const expectedSignature = this.generateSignature(data);
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
  }

  // Generate signed QR code for a ticket
  static async generateSignedQRCode(ticketId: string, role?: string): Promise<{ qrCode: string; signature: string; qrImage: string }> {
    const payload = JSON.stringify({
      ticketId,
      role: role || 'PUBLIC',
      timestamp: Date.now(),
      expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days expiry
    });
    
    const signature = this.generateSignature(payload);
    const qrData = `${payload}|${signature}`;
    
    const qrImage = await QRCode.toDataURL(qrData, {
      errorCorrectionLevel: 'H',
      margin: 2,
      width: 300,
    });
    
    return { qrCode: qrData, signature, qrImage };
  }

  // Generate role-specific QR code (with different permissions)
  static async generateRoleSpecificQRCode(
    ticketId: string, 
    role: string,
    permissions: string[]
  ): Promise<{ qrCode: string; signature: string; qrImage: string }> {
    const payload = JSON.stringify({
      ticketId,
      role,
      permissions,
      timestamp: Date.now(),
      expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
    });
    
    const signature = this.generateSignature(payload);
    const qrData = `${payload}|${signature}`;
    
    const qrImage = await QRCode.toDataURL(qrData, {
      errorCorrectionLevel: 'H',
      margin: 2,
      width: 300,
    });
    
    return { qrCode: qrData, signature, qrImage };
  }

  // Decode and verify QR code
  static decodeAndVerify(qrData: string): { isValid: boolean; data?: any; role?: string } {
    try {
      const lastPipeIndex = qrData.lastIndexOf('|');
      if (lastPipeIndex === -1) {
        return { isValid: false };
      }
      
      const payload = qrData.substring(0, lastPipeIndex);
      const signature = qrData.substring(lastPipeIndex + 1);
      
      const isValid = this.verifySignature(payload, signature);
      if (!isValid) {
        return { isValid: false };
      }
      
      const data = JSON.parse(payload);
      return { isValid: true, data, role: data.role };
    } catch (error) {
      return { isValid: false };
    }
  }

  // Regenerate QR code for a ticket
  static async regenerateQRCode(ticketId: string, role?: string): Promise<any> {
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      include: { event: true, tier: true, order: true },
    });
    
    if (!ticket) {
      throw new Error('Ticket not found');
    }
    
    const { qrCode, signature, qrImage } = await this.generateSignedQRCode(ticketId, role);
    
    await prisma.ticket.update({
      where: { id: ticketId },
      data: {
        qrCode,
        qrCodeData: JSON.stringify({ qrImage, signature, role: role || 'PUBLIC' }),
      },
    });
    
    return {
      ticketId,
      qrCode,
      signature,
      qrImage,
      attendeeName: ticket.attendeeName,
      eventName: ticket.event.name,
      tierName: ticket.tier.name,
    };
  }

  // Regenerate QR codes for all tickets in an event
  static async regenerateEventQRCodes(eventId: string, role?: string): Promise<{ total: number; tickets: any[] }> {
    const tickets = await prisma.ticket.findMany({
      where: { eventId },
      include: { event: true, tier: true, order: true },
    });
    
    const regenerated = [];
    for (const ticket of tickets) {
      const result = await this.regenerateQRCode(ticket.id, role);
      regenerated.push(result);
    }
    
    return { total: tickets.length, tickets: regenerated };
  }
}

export default QRCodeService;