import config from '../config/config.js';

class HealthController {
  getHealth(req, res, next) {
    try {
      res.status(200).json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        environment: {
          platform: process.platform,
          isMac: config.IS_MACOS,
          port: config.PORT,
          useKokoro: config.USE_KOKORO,
          kokoroUrl: config.KOKORO_API_URL,
          keysConfigured: {
            gemini: !!config.GEMINI_API_KEY,
            openai: !!config.OPENAI_API_KEY
          }
        }
      });
    } catch (error) {
      next(error);
    }
  }
}

export default new HealthController();
