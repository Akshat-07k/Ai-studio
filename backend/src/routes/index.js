// Mounts every route group under /api.
import { Router } from 'express';
import { systemRoutes } from './system.js';
import { imageRoutes } from './image.js';
import { llmRoutes } from './llm.js';
import { chatRoutes } from './chats.js';

export function apiRoutes(services) {
  const api = Router();
  api.use('/', systemRoutes(services)); // /api/health, /api/events, /api/overview, /api/settings
  api.use('/image', imageRoutes(services)); // /api/image/...
  api.use('/llm', llmRoutes(services)); // /api/llm/...
  api.use('/chats', chatRoutes(services)); // /api/chats/...
  return api;
}
