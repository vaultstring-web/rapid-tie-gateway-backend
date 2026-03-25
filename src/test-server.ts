import express from 'express';
import merchantRoutes from './routes/merchant.routes';

const app = express();
const port = 3001;

app.use('/api/merchant', merchantRoutes);

app.get('/health', (_req, res) => {
  res.json({ status: 'OK', message: 'Test server working!' });
});

app.listen(port, () => {
  console.log(`✅ Test server running at http://localhost:${port}`);
});