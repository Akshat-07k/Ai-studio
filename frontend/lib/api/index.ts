// One entry point for talking to the backend, grouped like the backend's route files.
import { systemApi } from './system';
import { imageApi } from './image';
import { llmApi } from './llm';
import { chatsApi } from './chats';

export const api = { system: systemApi, image: imageApi, llm: llmApi, chats: chatsApi };

export { API_URL } from './client';
export { imageUrl, inputImageUrl } from './image';
export type { Overview } from './system';
