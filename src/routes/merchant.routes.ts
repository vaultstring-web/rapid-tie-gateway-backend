import { Router } from 'express';

const router: Router = Router();

router.get('/test', (_req, res) => {
  res.json({ message: 'Merchant route working!' });
});

export default router;