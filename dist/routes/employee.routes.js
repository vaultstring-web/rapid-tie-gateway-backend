"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middlewares/auth");
const validate_1 = require("../middlewares/validate");
const employee_controller_1 = __importDefault(require("../controllers/employee.controller"));
const employee_validators_1 = require("../validators/employee.validators");
const router = (0, express_1.Router)();
router.use(auth_1.authenticate, (0, auth_1.authorize)('EMPLOYEE'));
router.get('/dashboard', (req, res, next) => employee_controller_1.default.getDashboard(req, res, next));
router.get('/dsa/requests', (0, validate_1.validate)(employee_validators_1.requestListQuerySchema), (req, res, next) => employee_controller_1.default.getMyRequests(req, res, next));
router.post('/dsa/requests', (0, validate_1.validate)(employee_validators_1.createDsaRequestSchema), (req, res, next) => employee_controller_1.default.createRequest(req, res, next));
router.get('/dsa/requests/:id', (req, res, next) => employee_controller_1.default.getRequest(req, res, next));
router.delete('/dsa/requests/:id', (req, res, next) => employee_controller_1.default.cancelRequest(req, res, next));
router.get('/dsa/rates', (req, res, next) => employee_controller_1.default.getDsaRates(req, res, next));
router.get('/profile', (req, res, next) => employee_controller_1.default.getProfile(req, res, next));
router.put('/profile', (0, validate_1.validate)(employee_validators_1.updateProfileSchema), (req, res, next) => employee_controller_1.default.updateProfile(req, res, next));
exports.default = router;
//# sourceMappingURL=employee.routes.js.map