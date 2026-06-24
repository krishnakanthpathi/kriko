import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import axios from 'axios';
import config from '../config/config.js';

class TtsService {
  /**
   * Generates a speech file from text using either Kokoro API or macOS 'say' fallback.
   * @param {object} params
   * @param {string} params.text Text to speak
   * @param {string} [params.voice] Voice identifier
   * @param {number} [params.speed] Speed modifier (0.5 to 2.0)
   * @param {string} [params.langCode] Language code (e.g. 'a' for American English)
   * @returns {Promise<{ filePath: string, mimeType: string, method: string }>} Path to the output audio file
   */
  async generateSpeech({ text, voice = 'af_heart', speed = 1.0, langCode = 'a' }) {
    if (!text || text.trim() === '') {
      throw new Error('Text parameter is required for TTS generation.');
    }

    // Clear old audio files to prevent temp directory from bloating
    this._cleanupTempFiles();

    // 1. IF KOKORO API IS ENABLED (Configured in .env)
    if (config.USE_KOKORO) {
      try {
        console.log(`[TTS] Connecting to Kokoro API at ${config.KOKORO_API_URL}/tts...`);
        const filename = `kokoro-${Date.now()}.wav`;
        const filePath = path.join(config.TEMP_AUDIO_DIR, filename);

        const response = await axios.post(`${config.KOKORO_API_URL}/tts`, {
          text: text,
          voice: voice,
          speed: parseFloat(speed) || 1.0,
          lang_code: langCode
        }, {
          responseType: 'arraybuffer',
          timeout: 10000 // 10s timeout
        });

        // Write retrieved audio buffer to disk
        fs.writeFileSync(filePath, response.data);
        
        return {
          filePath,
          mimeType: 'audio/wav',
          method: 'Kokoro API'
        };
      } catch (error) {
        console.error('[TTS] Kokoro API failed. Falling back to Apple macOS native TTS.', error.message);
        // Fall back to Apple TTS
      }
    }

    // 2. APPLE NATIVE TTS FALLBACK (Active path by default / as fallback)
    console.log('[TTS] Using Apple macOS native "say" utility fallback.');
    const filename = `apple-${Date.now()}.m4a`;
    const filePath = path.join(config.TEMP_AUDIO_DIR, filename);

    if (!config.IS_MACOS) {
      console.log(`[TTS Simulation] Generating simulated speech for: "${text}"`);
      // Create a dummy file for testing on non-macOS systems
      fs.writeFileSync(filePath, 'Simulated audio buffer');
      return {
        filePath,
        mimeType: 'audio/m4a',
        method: 'Apple TTS Simulation'
      };
    }

    // Escape text for shell execution
    const escapedText = text.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    
    // Construct command using the 'say' utility to output as m4a format
    // Adjust speed. Default macOS speaking rate is ~175-185 wpm.
    // Standard scale: speed=1.0 is default, speed=1.5 is faster, etc.
    const wpm = Math.round(180 * (parseFloat(speed) || 1.0));
    
    // Convert voice to standard macOS voice if available
    // macOS default voices: Samantha, Daniel, Karen, Siri
    let macOSVoice = '';
    if (voice && voice.toLowerCase().includes('bella')) {
      macOSVoice = '-v Samantha';
    } else if (voice && voice.toLowerCase().includes('emma')) {
      macOSVoice = '-v Karen'; // Australian English
    } else {
      macOSVoice = ''; // Use system default
    }

    const command = `say ${macOSVoice} -r ${wpm} -o "${filePath}" "${escapedText}"`;
    
    return new Promise((resolve, reject) => {
      exec(command, (error) => {
        if (error) {
          console.error('[TTS Apple Error]', error.message);
          reject(new Error(`Apple macOS 'say' failed: ${error.message}`));
        } else {
          resolve({
            filePath,
            mimeType: 'audio/m4a',
            method: 'Apple Native TTS'
          });
        }
      });
    });
  }

  /**
   * Helper to delete temporary audio files older than 5 minutes to manage disk usage.
   */
  _cleanupTempFiles() {
    try {
      const files = fs.readdirSync(config.TEMP_AUDIO_DIR);
      const now = Date.now();
      const maxAge = 5 * 60 * 1000; // 5 minutes in milliseconds

      for (const file of files) {
        // Skip gitkeep or config files
        if (file.startsWith('.')) continue;

        const filePath = path.join(config.TEMP_AUDIO_DIR, file);
        const stat = fs.statSync(filePath);
        if (now - stat.mtimeMs > maxAge) {
          fs.unlinkSync(filePath);
          console.log(`[TTS Cleanup] Deleted old temporary file: ${file}`);
        }
      }
    } catch (error) {
      console.error('[TTS Cleanup Error]', error.message);
    }
  }
}

export default new TtsService();
