// routes/admin/userManagement.routes.ts
import { Router } from 'express';
import { authenticate } from '../../middlewares/auth';
import { 
  getAllUsers,
  getUserById,
  updateUserRole,
  toggleAccountStatus,
  resetUserPassword,
  deleteUser,
  clearUserCache,
  getUserAttendanceHistory,
} from '../../controllers/admin/userManagement.controller';

const router: Router = Router();

// Apply authentication to all admin routes
router.use(authenticate);

// IMPORTANT: Put specific routes BEFORE parameterized routes
// DELETE /api/admin/users/cache - Clear user cache (must come before /:id)
router.delete('/users/cache', clearUserCache);

// GET /api/admin/users - List all users
router.get('/users', getAllUsers);

// GET /api/admin/users/:id/attendance - Get user attendance history
router.get('/users/:id/attendance', getUserAttendanceHistory);

// GET /api/admin/users/:id - Get user details
router.get('/users/:id', getUserById);

// PUT /api/admin/users/:id/role - Update user role
router.put('/users/:id/role', updateUserRole);

// POST /api/admin/users/:id/toggle-status - Toggle account status
router.post('/users/:id/toggle-status', toggleAccountStatus);

// POST /api/admin/users/:id/reset-password - Reset user password
router.post('/users/:id/reset-password', resetUserPassword);

// DELETE /api/admin/users/:id - Delete user
router.delete('/users/:id', deleteUser);

export default router;