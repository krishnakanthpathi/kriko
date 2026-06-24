import assistantService from '../services/assistantService.js';

class AssistantController {
  async createReminder(req, res, next) {
    try {
      const { title, body } = req.body;
      if (!title) {
        return res.status(400).json({ success: false, error: 'Title is required for reminder creation.' });
      }
      
      const output = await assistantService.createReminder({ title, body });
      res.status(200).json({ success: true, message: 'Reminder created successfully.', output });
    } catch (error) {
      next(error);
    }
  }

  async setVolume(req, res, next) {
    try {
      const { level } = req.body;
      if (level === undefined) {
        return res.status(400).json({ success: false, error: 'Volume level is required.' });
      }
      
      const output = await assistantService.setVolume({ level });
      res.status(200).json({ success: true, output });
    } catch (error) {
      next(error);
    }
  }

  async getVolume(req, res, next) {
    try {
      const output = await assistantService.getVolume();
      res.status(200).json({ success: true, level: parseInt(output, 10) || 50 });
    } catch (error) {
      next(error);
    }
  }

  async openApp(req, res, next) {
    try {
      const { appName } = req.body;
      if (!appName) {
        return res.status(400).json({ success: false, error: 'appName is required.' });
      }
      
      const output = await assistantService.openApplication({ appName });
      res.status(200).json({ success: true, output });
    } catch (error) {
      next(error);
    }
  }

  async listApps(req, res, next) {
    try {
      const output = await assistantService.listRunningApps();
      res.status(200).json({ success: true, runningApps: output });
    } catch (error) {
      next(error);
    }
  }

  async speak(req, res, next) {
    try {
      const { text } = req.body;
      if (!text) {
        return res.status(400).json({ success: false, error: 'Text is required.' });
      }
      
      const output = await assistantService.sayText({ text });
      res.status(200).json({ success: true, output });
    } catch (error) {
      next(error);
    }
  }

  async dumpAccessibilityTree(req, res, next) {
    try {
      const tree = await assistantService.dumpAccessibilityTree();
      res.status(200).json({ success: true, tree });
    } catch (error) {
      next(error);
    }
  }
}

export default new AssistantController();
