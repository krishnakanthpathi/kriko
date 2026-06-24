import ttsService from '../services/ttsService.js';

class TtsController {
  /**
   * Generates text-to-speech audio and streams it to the client.
   * Handles both GET (query parameters) and POST (body parameters).
   */
  async generateSpeech(req, res, next) {
    try {
      const data = req.method === 'POST' ? req.body : req.query;
      const { text, voice, speed, langCode } = data;

      if (!text) {
        return res.status(400).json({
          success: false,
          error: { message: 'Text parameter is required.' }
        });
      }

      const result = await ttsService.generateSpeech({
        text,
        voice,
        speed: parseFloat(speed) || 1.0,
        langCode
      });

      console.log(`[TTS Controller] Generated via ${result.method}. Streaming file: ${result.filePath}`);

      // Set headers and stream the audio file
      res.setHeader('Content-Type', result.mimeType);
      res.setHeader('X-TTS-Method', result.method);
      res.sendFile(result.filePath, (err) => {
        if (err) {
          console.error('[TTS Controller] Error sending file:', err.message);
          if (!res.headersSent) {
            res.status(500).send('Error streaming audio.');
          }
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Exposes standard voices that the client UI can list.
   */
  getVoices(req, res) {
    res.status(200).json([
      { id: 'af_heart', name: 'Bella (US Female)', lang: 'US English', code: 'a' },
      { id: 'af_bella', name: 'Nicole (US Female)', lang: 'US English', code: 'a' },
      { id: 'am_adam', name: 'Adam (US Male)', lang: 'US English', code: 'a' },
      { id: 'am_michael', name: 'Michael (US Male)', lang: 'US English', code: 'a' },
      { id: 'bf_emma', name: 'Emma (UK Female)', lang: 'UK English', code: 'b' },
      { id: 'bm_george', name: 'George (UK Male)', lang: 'UK English', code: 'b' }
    ]);
  }
}

export default new TtsController();
