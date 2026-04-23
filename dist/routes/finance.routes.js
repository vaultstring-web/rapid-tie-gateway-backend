"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const auth_1 = require("../middlewares/auth");
const validate_1 = require("../middlewares/validate");
const finance_controller_1 = __importDefault(require("../controllers/finance.controller"));
const finance_validators_1 = require("../validators/finance.validators");
const router = (0, express_1.Router)();
const upload = (0, multer_1.default)({ storage: multer_1.default.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
router.use(auth_1.authenticate, (0, auth_1.authorize)('FINANCE_OFFICER'));
router.get('/dashboard', (req, res, next) => finance_controller_1.default.getDashboard(req, res, next));
router.get('/budgets', (0, validate_1.validate)(finance_validators_1.budgetsQuerySchema), (req, res, next) => finance_controller_1.default.getBudgets(req, res, next));
router.get('/disbursements', (0, validate_1.validate)(finance_validators_1.disbursementReadyQuerySchema), (req, res, next) => finance_controller_1.default.getDisbursements(req, res, next));
router.get('/disbursements/ready', (0, validate_1.validate)(finance_validators_1.disbursementReadyQuerySchema), (req, res, next) => finance_controller_1.default.getDisbursements(req, res, next));
router.post('/disbursements/bulk', upload.single('file'), (0, validate_1.validate)(finance_validators_1.bulkDisbursementUploadSchema), (req, res, next) => finance_controller_1.default.uploadBulkDisbursement(req, res, next));
router.get('/disbursements/batches', (0, validate_1.validate)(finance_validators_1.batchesQuerySchema), (req, res, next) => finance_controller_1.default.getBatches(req, res, next));
router.post('/disbursements/batches', (0, validate_1.validate)(finance_validators_1.createBatchSchema), (req, res, next) => finance_controller_1.default.createBatch(req, res, next));
router.get('/disbursements/batches/:id', (req, res, next) => finance_controller_1.default.getBatch(req, res, next));
router.post('/disbursements/batches/:id/process', (0, validate_1.validate)(finance_validators_1.processBatchSchema), (req, res, next) => finance_controller_1.default.processBatch(req, res, next));
router.get('/profile', (req, res, next) => finance_controller_1.default.getProfile(req, res, next));
router.put('/profile', (0, validate_1.validate)(finance_validators_1.updateProfileSchema), (req, res, next) => finance_controller_1.default.updateProfile(req, res, next));
exports.default = router;
//# sourceMappingURL=finance.routes.js.map