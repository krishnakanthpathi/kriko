import express from 'express';
const router = express.Router();
import assistantController from '../controllers/assistantController.js';

router.post('/reminder', assistantController.createReminder);
router.post('/volume', assistantController.setVolume);
router.get('/volume', assistantController.getVolume);
router.post('/open-app', assistantController.openApp);
router.get('/running-apps', assistantController.listApps);
router.post('/speak', assistantController.speak);
router.get('/accessibility-tree', assistantController.dumpAccessibilityTree);

router.post('/teach/start', assistantController.startTeaching);
router.post('/teach/stop', assistantController.stopTeaching);
router.get('/teach/status', assistantController.getTeachStatus);

export default router;
