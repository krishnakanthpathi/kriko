import { exec } from 'child_process';
import config from '../config/config.js';
import assistantService from './assistantService.js';

class ClipboardObserver {
  constructor() {
    this._pollingInterval = null;
    this._lastClipboardText = '';
    this._isExecuting = false;
  }

  /**
   * Start background clipboard polling
   */
  start() {
    if (!config.IS_MACOS) {
      console.log('[Clipboard Observer] Simulation: Disabled (not on macOS)');
      return;
    }

    if (this._pollingInterval) return;

    console.log('\x1b[35m%s\x1b[0m', '[Clipboard Observer] Background voice gateway observer active. Listening for trigger phrases: "Kriko", "okay Kriko", "ok Kriko".');

    // Initialize with current clipboard contents to avoid running historical clips on start
    this._getClipboardText().then(text => {
      this._lastClipboardText = text;
    });

    this._pollingInterval = setInterval(async () => {
      if (this._isExecuting) return; // Prevent concurrent executions if polling fires while running

      try {
        const text = await this._getClipboardText();
        if (text && text !== this._lastClipboardText) {
          this._lastClipboardText = text;
          await this._processText(text);
        }
      } catch (error) {
        console.error('[Clipboard Observer] Error in poll loop:', error.message);
      }
    }, 600);
  }

  /**
   * Stop polling
   */
  stop() {
    if (this._pollingInterval) {
      clearInterval(this._pollingInterval);
      this._pollingInterval = null;
    }
  }

  /**
   * Read plain text from the macOS pasteboard
   */
  _getClipboardText() {
    return new Promise((resolve) => {
      exec('pbpaste', (err, stdout) => {
        if (err) resolve('');
        else resolve(stdout.trim());
      });
    });
  }

  /**
   * Process clipboard text and match voice dictation triggers
   */
  async _processText(text) {
    // Matches: "Kriko [command]", "okay Kriko [command]", "ok Kriko [command]", "hey Kriko [command]"
    // Case-insensitive, optional punctuation
    const triggerRegex = /^(?:okay\s+kriko|ok\s+kriko|hey\s+kriko|kriko)\b[\s,:]*(.*)$/i;
    const match = text.match(triggerRegex);

    if (match) {
      const command = match[1].trim();
      if (!command) return;

      console.log('\x1b[35m%s\x1b[0m', `[Clipboard Observer] Voice trigger matched! Command: "${command}"`);
      this._isExecuting = true;

      try {
        // 1. Give voice feedback that the command was received
        await assistantService.sayText({ text: `Executing task: ${command}` });

        // 2. Execute the action dynamically (defaults to local Ollama configured model)
        const result = await assistantService.executeDynamicAction({
          instruction: command,
          provider: 'ollama'
        });

        console.log('\x1b[32m%s\x1b[0m', `[Clipboard Observer] Dynamic execution successful:`, result.output);

        // 3. Vocalize success output
        await assistantService.sayText({ text: `Task complete. ${result.output || ''}` });
      } catch (error) {
        console.error('\x1b[31m%s\x1b[0m', `[Clipboard Observer] Execution failed:`, error.message);
        try {
          await assistantService.sayText({ text: `Task failed: ${error.message}` });
        } catch (e) {}
      } finally {
        this._isExecuting = false;
      }
    }
  }
}

export default new ClipboardObserver();
