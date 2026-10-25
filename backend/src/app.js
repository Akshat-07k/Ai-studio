// Builds the Express app: middleware -> /api routes -> error handling.
import express from 'express';
import { cors } from './middleware/cors.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { apiRoutes } from './routes/index.js';

export function createApp(services) {
  const app = express();
  app.use(express.json({ limit: '2mb' }));
  app.use(cors(services.config.frontendOrigins));
  app.use('/api', apiRoutes(services));
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
