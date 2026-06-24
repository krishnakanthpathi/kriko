import express from 'express';
const router = express.Router();
import healthController from '../controllers/healthController.js';

router.get('/', healthController.getHealth);

export default router;
