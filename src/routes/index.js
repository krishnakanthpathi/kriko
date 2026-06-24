import express from 'express';
const router = express.Router();

import healthRoutes from './healthRoutes.js';
import ttsRoutes from './ttsRoutes.js';
import assistantRoutes from './assistantRoutes.js';
import chatRoutes from './chatRoutes.js';

// Mount routes
router.use('/health', healthRoutes);
router.use('/tts', ttsRoutes);
router.use('/assistant', assistantRoutes);
router.use('/chat', chatRoutes);

export default router;
