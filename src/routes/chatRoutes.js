import express from 'express';
const router = express.Router();
import chatController from '../controllers/chatController.js';

router.post('/', chatController.chat);
router.get('/models', chatController.getModels);

export default router;
