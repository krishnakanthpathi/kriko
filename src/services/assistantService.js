import { exec } from 'child_process';
import config from '../config/config.js';
import llmService from './llmService.js';

class AssistantService {
  /**
   * Run a raw command line instruction.
   * @param {string} command Command to run
   * @returns {Promise<{stdout: string, stderr: string}>}
   */
  _execPromise(command) {
    return new Promise((resolve, reject) => {
      exec(command, (error, stdout, stderr) => {
        if (error) {
          reject(error);
        } else {
          resolve({ stdout, stderr });
        }
      });
    });
  }

  /**
   * Run AppleScript via osascript command.
   * Supports simulation mode on non-macOS systems.
   * @param {string} script AppleScript content
   * @returns {Promise<string>} Output of the execution
   */
  async runAppleScript(script) {
    console.log('\x1b[36m%s\x1b[0m', `[AppleScript Execute]\n${script}\n`);
    
    if (!config.IS_MACOS) {
      console.log('\x1b[33m%s\x1b[0m', '[Simulation] Running AppleScript simulation on non-macOS platform.');
      return 'Simulation: Success';
    }

    try {
      // Escape the script for double quotes and pass via standard input to osascript to avoid command line length limits
      const process = exec('osascript');
      return new Promise((resolve, reject) => {
        let stdout = '';
        let stderr = '';
        
        process.stdout.on('data', (data) => { stdout += data; });
        process.stderr.on('data', (data) => { stderr += data; });
        
        process.on('close', (code) => {
          if (code === 0) {
            resolve(stdout.trim());
          } else {
            const err = new Error(stderr.trim() || `AppleScript exited with code ${code}`);
            err.code = code;
            reject(err);
          }
        });
        
        process.stdin.write(script);
        process.stdin.end();
      });
    } catch (error) {
      console.error('[AppleScript Error]', error.message);
      throw error;
    }
  }

  /**
   * Escapes double quotes and backslashes for AppleScript strings
   */
  _escape(str) {
    if (!str) return '';
    return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }

  /**
   * Creates a reminder in the macOS Reminders app.
   */
  async createReminder({ title, body = '' }) {
    const escapedTitle = this._escape(title);
    const escapedBody = this._escape(body);
    const script = `tell application "Reminders" to make new reminder with properties {name:"${escapedTitle}", body:"${escapedBody}"}`;
    return this.runAppleScript(script);
  }

  /**
   * Sets the MacBook master system volume (0-100).
   */
  async setVolume({ level }) {
    const vol = Math.min(Math.max(parseInt(level, 10) || 0, 0), 100);
    const script = `set volume output volume ${vol}`;
    await this.runAppleScript(script);
    return `Volume set to ${vol}%`;
  }

  /**
   * Returns current MacBook volume.
   */
  async getVolume() {
    const script = `output volume of (get volume settings)`;
    const result = await this.runAppleScript(script);
    return result || '50'; // Fallback
  }

  /**
   * Launches or activates an application on macOS.
   */
  async openApplication({ appName }) {
    const escapedApp = this._escape(appName);
    const script = `tell application "${escapedApp}" to activate`;
    await this.runAppleScript(script);
    return `${appName} opened successfully`;
  }

  /**
   * Lists the names of all running user application processes.
   */
  async listRunningApps() {
    const script = `tell application "System Events" to get name of every process whose background only is false`;
    const result = await this.runAppleScript(script);
    return result.split(',').map(app => app.trim());
  }

  /**
   * Speaks text out loud directly using the Macbook's built-in sound system.
   */
  async sayText({ text }) {
    if (!config.IS_MACOS) {
      console.log(`[Simulation Speaking] "${text}"`);
      return `Spoke: "${text}"`;
    }
    await this._execPromise(`say "${this._escape(text)}"`);
    return `Spoke: "${text}"`;
  }

  /**
   * Dumps accessibility tree hierarchy using 'agent-desktop' CLI.
   */
  async dumpAccessibilityTree() {
    if (!config.IS_MACOS) {
      console.log('[Simulation] Dumping simulation accessibility tree');
      return {
        role: "AXApplication",
        title: "Simulation Finder",
        children: [
          { role: "AXWindow", title: "Simulation Window", children: [] }
        ]
      };
    }

    try {
      // Execute local node agent-desktop package or binary
      const { stdout } = await this._execPromise('npx agent-desktop dump --json');
      return JSON.parse(stdout);
    } catch (error) {
      console.warn('agent-desktop CLI failed or is not configured. Falling back to basic AppleScript window list.', error.message);
      // Fallback: Dump list of open windows via standard AppleScript
      const script = `
        tell application "System Events"
          set appList to every process whose background only is false
          set winList to {}
          repeat with p in appList
            try
              set winNames to name of every window of p
              if length of winNames > 0 then
                copy {name: name of p, windows: winNames} to end of winList
              end if
            end try
          end repeat
          return winList
        end tell
      `;
      try {
        const fallbackRaw = await this.runAppleScript(script);
        return { source: "AppleScript Fallback", structure: fallbackRaw };
      } catch (innerError) {
        return { error: "Failed to fetch accessibility context.", details: innerError.message };
      }
    }
  }

  /**
   * Executes user requests dynamically by writing AppleScripts on the fly
   * utilizing the LLM, with an automatic self-healing/retry loop on script failure.
   */
  async executeDynamicAction({ instruction, provider = 'gemini' }) {
    let script = '';
    let attempts = 2;
    let currentError = null;

    // Get current system context to inject into prompt for better script writing
    let systemContext = '';
    try {
      const runningApps = await this.listRunningApps();
      const currentVol = await this.getVolume();
      systemContext = `Current active user apps: ${runningApps.join(', ')}. Current sound volume level: ${currentVol}%.`;
    } catch (e) {
      systemContext = 'System state retrieval unavailable.';
    }

    while (attempts > 0) {
      try {
        let prompt = `System Context: ${systemContext}\nGoal: Write an AppleScript to do the following: "${instruction}"`;
        
        if (currentError) {
          prompt += `\n\nYour previous AppleScript failed.
Failed Script:
\`\`\`applescript
${script}
\`\`\`
Error returned:
"${currentError.message}"

Please fix the error and provide a corrected, working AppleScript. Make sure to escape strings correctly and follow syntax rules.`;
        }

        // Generate the code using LLM Service
        script = await llmService.generateCode(prompt, 'applescript', provider);
        
        // Execute the script
        const output = await this.runAppleScript(script);
        
        return {
          success: true,
          script,
          output,
          attemptsUsed: 3 - attempts
        };
      } catch (error) {
        console.warn(`[Self-Healing] Execution failed. Attempts remaining: ${attempts - 1}. Error: ${error.message}`);
        currentError = error;
        attempts--;
      }
    }

    throw new Error(`Failed to dynamically execute action after retries. Last error: ${currentError.message}. Last generated script:\n${script}`);
  }
}

export default new AssistantService();
