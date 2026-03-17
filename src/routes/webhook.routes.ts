import { Router } from 'express';

const router = Router();

router.post('/test', (req, res) => {
  res.json({ message: 'Webhook route working!' });
});

export default router;