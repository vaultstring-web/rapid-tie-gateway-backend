import { Router } from 'express';

const router: Router = Router();

router.post('/test', (_req, res) => {
  res.json({ message: 'Webhook route working!' });
});

export default router;