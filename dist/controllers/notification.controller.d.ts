import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middlewares/auth';
export declare const setIoInstance: (ioInstance: any) => void;
export declare class NotificationController {
    list(req: AuthRequest, res: Response, next: NextFunction): Promise<void>;
    markRead(req: AuthRequest, res: Response, next: NextFunction): Promise<void>;
    markAllRead(req: AuthRequest, res: Response, next: NextFunction): Promise<void>;
    deleteOne(req: AuthRequest, res: Response, next: NextFunction): Promise<void>;
    deleteAllRead(req: AuthRequest, res: Response, next: NextFunction): Promise<void>;
    createNotification(userId: string, type: string, title: string, message: string, data?: any): Promise<void>;
    sendEventReminders(req: AuthRequest, res: Response, next: NextFunction): Promise<void>;
    sendEventNotification(req: AuthRequest, res: Response, next: NextFunction): Promise<void>;
    getPreferences(req: AuthRequest, res: Response, next: NextFunction): Promise<void>;
    updatePreferences(req: AuthRequest, res: Response, next: NextFunction): Promise<void>;
    shouldSendNotification(userId: string): Promise<boolean>;
    getDigest(req: AuthRequest, res: Response, next: NextFunction): Promise<void>;
}
declare const notificationController: NotificationController;
export declare const list: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
export declare const getNotifications: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
export declare const markRead: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
export declare const markAsRead: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
export declare const markAllRead: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
export declare const markAllAsRead: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
export declare const deleteOne: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
export declare const deleteNotification: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
export declare const deleteAllRead: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
export declare const sendEventReminders: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
export declare const sendEventNotification: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
export declare const getPreferences: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
export declare const getNotificationPreferences: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
export declare const updatePreferences: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
export declare const updateNotificationPreferences: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
export declare const getNotificationDigest: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
export declare const createNotification: (userId: string, type: string, title: string, message: string, data?: any) => Promise<void>;
export declare const shouldSendNotification: (userId: string) => Promise<boolean>;
export default notificationController;
//# sourceMappingURL=notification.controller.d.ts.map