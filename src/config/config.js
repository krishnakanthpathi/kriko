import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from the root .env file
dotenv.config({ path: path.join(__dirname, '../../.env') });

const config = {
  PORT: process.env.PORT || 3000,
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
  OLLAMA_API_URL: process.env.OLLAMA_API_URL || 'http://127.0.0.1:11434',
  OLLAMA_MODEL: process.env.OLLAMA_MODEL || 'gemma2',
  USE_KOKORO: process.env.USE_KOKORO === 'true',
  KOKORO_API_URL: process.env.KOKORO_API_URL || 'http://100.105.203.102:8998',
  TEMP_AUDIO_DIR: path.join(__dirname, '../../temp_audio'),
  IS_MACOS: process.platform === 'darwin'
};

// Ensure temporary audio directory exists
if (!fs.existsSync(config.TEMP_AUDIO_DIR)) {
  fs.mkdirSync(config.TEMP_AUDIO_DIR, { recursive: true });
}

// Log status warnings for API keys
if (!config.GEMINI_API_KEY) {
  console.warn('\x1b[33m%s\x1b[0m', 'Warning: GEMINI_API_KEY is not set in .env. Gemini model calls will fail.');
}
if (!config.OPENAI_API_KEY) {
  console.warn('\x1b[33m%s\x1b[0m', 'Warning: OPENAI_API_KEY is not set in .env. OpenAI/ChatGPT model calls will fail.');
}
if (!config.IS_MACOS) {
  console.warn('\x1b[31m%s\x1b[0m', 'Warning: Platform is not macOS. AppleScript and native TTS fallback will be simulated.');
}

export default config;
