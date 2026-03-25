import { Router } from 'express';

const router: Router = Router();

router.get('/test', (_req, res) => {
  res.json({ message: 'Approver route working!' });
});

export default router;