import { Router } from 'express';

const router: Router = Router();

router.get('/test', (_req, res) => {
  res.json({ message: 'Event route working!' });
});

export default router;