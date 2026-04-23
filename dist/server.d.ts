import { Server as SocketServer } from 'socket.io';
import { PrismaClient } from '@prisma/client';
declare const prisma: PrismaClient<import("@prisma/client").Prisma.PrismaClientOptions, never, import("@prisma/client/runtime/library").DefaultArgs>;
declare const io: SocketServer<import("socket.io").DefaultEventsMap, import("socket.io").DefaultEventsMap, import("socket.io").DefaultEventsMap, any>;
declare const emitSalesUpdate: (eventId: string) => Promise<void>;
declare const emitNotification: (userId: string, notification: any) => void;
export { io, prisma, emitSalesUpdate, emitNotification };
//# sourceMappingURL=server.d.ts.map