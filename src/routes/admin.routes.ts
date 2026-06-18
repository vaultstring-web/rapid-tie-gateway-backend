// routes/admin.routes.ts
import { Router } from 'express';
import { authenticate, authorize } from '../middlewares/auth';
import { 
  getAdminDashboard, 
  clearAdminCache,
  getSystemHealthOnly,
  createEmployee,
  updateEmployee,
  getAllEmployees,
  getEmployeeById,
  deleteEmployee,
  suspendUser,
  reactivateUser,
} from '../controllers/admin.controller';

const router: Router = Router();

// Apply authentication and admin authorization to all admin routes
router.use(authenticate);
router.use(authorize('ADMIN'));

// GET /api/admin/dashboard - Admin dashboard with all metrics
router.get('/dashboard', getAdminDashboard);

// GET /api/admin/health - System health only
router.get('/health', getSystemHealthOnly);

// DELETE /api/admin/cache - Clear admin dashboard cache
router.delete('/cache', clearAdminCache);

// ======================
// 👥 User Management Routes
// ======================

// POST /api/admin/users/:userId/suspend - Suspend a user
router.post('/users/:userId/suspend', suspendUser);

// POST /api/admin/users/:userId/reactivate - Reactivate a suspended user
router.post('/users/:userId/reactivate', reactivateUser);

// ======================
// 👥 Employee Management Routes
// ======================

// GET /api/admin/employees - List all employees (paginated)
router.get('/employees', getAllEmployees);

// POST /api/admin/employees - Create new employee profile
router.post('/employees', createEmployee);

// GET /api/admin/employees/:id - Get employee by ID
router.get('/employees/:id', getEmployeeById);

// PUT /api/admin/employees/:id - Update employee profile
router.put('/employees/:id', updateEmployee);

// DELETE /api/admin/employees/:id - Delete employee profile
router.delete('/employees/:id', deleteEmployee);

export default router;