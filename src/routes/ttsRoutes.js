import express from 'express';
const router = express.Router();
import ttsController from '../controllers/ttsController.js';

router.post('/', ttsController.generateSpeech);
router.get('/', ttsController.generateSpeech);
router.get('/voices', ttsController.getVoices);

export default router;
