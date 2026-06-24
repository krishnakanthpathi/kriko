import axios from 'axios';
import config from '../config/config.js';

class HealthController {
  async getHealth(req, res, next) {
    try {
      let ollamaActive = false;
      try {
        const url = config.OLLAMA_API_URL || 'http://127.0.0.1:11434';
        const response = await axios.get(url, { timeout: 800 });
        // Ollama usually returns 200 with a text like "Ollama is running"
        if (response.status === 200) {
          ollamaActive = true;
        }
      } catch (error) {
        // Local Ollama service is not running or unreachable
      }

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
            openai: !!config.OPENAI_API_KEY,
            ollama: ollamaActive
          }
        }
      });
    } catch (error) {
      next(error);
    }
  }
}

export default new HealthController();
