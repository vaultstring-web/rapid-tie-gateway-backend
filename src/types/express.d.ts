import { User } from "../prisma"; // or wherever your Prisma User type is

declare global {
  namespace Express {
    interface Request {
      user?: User; // Optional, because user may not exist if not logged in
    }
  }
}