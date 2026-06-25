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
   * Retrieves detailed macOS system context including running apps, frontmost app,
   * active tab URL/title in Chrome/Safari, and system volume.
   */
  async getDetailedSystemContext() {
    let context = '';
    try {
      const runningApps = await this.listRunningApps();
      const currentVol = await this.getVolume();
      context += `Master Sound Volume: ${currentVol}%\n`;
      context += `Running Apps: ${runningApps.join(', ')}\n`;

      const frontmostScript = `
        tell application "System Events"
          set frontmostApp to name of first process whose frontmost is true
          return frontmostApp
        end tell
      `;
      let frontmostApp = '';
      try {
        frontmostApp = await this.runAppleScript(frontmostScript);
        context += `Active (Frontmost) Application: "${frontmostApp}"\n`;
      } catch (e) { }

      if (runningApps.includes('Google Chrome')) {
        const chromeScript = `
          tell application "Google Chrome"
            if (count of windows) > 0 then
              set activeTab to active tab of window 1
              return (URL of activeTab) & " - " & (title of activeTab)
            else
              return "No windows open"
            end if
          end tell
        `;
        try {
          const chromeTab = await this.runAppleScript(chromeScript);
          context += `Google Chrome Active Tab: ${chromeTab}\n`;
        } catch (e) { }
      }

      if (runningApps.includes('Safari')) {
        const safariScript = `
          tell application "Safari"
            if (count of windows) > 0 then
              set activeTab to current tab of window 1
              return (URL of activeTab) & " - " & (name of activeTab)
            else
              return "No windows open"
            end if
          end tell
        `;
        try {
          const safariTab = await this.runAppleScript(safariScript);
          context += `Safari Active Tab: ${safariTab}\n`;
        } catch (e) { }
      }

      if (frontmostApp && frontmostApp !== 'System Events' && frontmostApp !== 'Terminal') {
        const escapedApp = this._escape(frontmostApp);
        let snapshotLoaded = false;
        
        try {
          console.log(`[Detailed System Context] Capturing agent-desktop snapshot for app: ${escapedApp}`);
          const { stdout } = await this._execPromise(`npx agent-desktop snapshot --app "${escapedApp}" --skeleton -i --compact`);
          const res = JSON.parse(stdout);
          if (res.ok && res.data) {
            context += `Active App UI Accessibility Tree Snapshot (Ref IDs map to elements in this window):\n`;
            context += `Snapshot ID: "${res.data.snapshot_id}"\n`;
            context += `Tree: ${JSON.stringify(res.data.tree, null, 2)}\n`;
            snapshotLoaded = true;
          }
        } catch (e) {
          console.warn(`[Detailed System Context] agent-desktop snapshot failed for ${escapedApp}:`, e.message);
        }

        if (!snapshotLoaded) {
          const a11yScript = `
            tell application "System Events"
              tell process "${escapedApp}"
                if (count of windows) > 0 then
                  set win to window 1
                  set winTitle to name of win
                  set elementList to {}
                  try
                    set uiEls to UI elements of win
                    repeat with el in uiEls
                      try
                        set elRole to role of el
                        set elName to name of el
                        if elName is not missing value and elName is not "" then
                          copy (elRole & " '" & elName & "'") to end of elementList
                        end if
                      end try
                    end repeat
                  end try
                  set oldDelims to AppleScript's text item delimiters
                  set AppleScript's text item delimiters to ", "
                  set elementString to elementList as string
                  set AppleScript's text item delimiters to oldDelims
                  return "Window '" & winTitle & "' UI elements: " & elementString
                else
                  return "No open windows"
                end if
              end tell
            end tell
          `;
          try {
            const a11ySummary = await this.runAppleScript(a11yScript);
            context += `${a11ySummary}\n`;
          } catch (e) { }
        }
      }
    } catch (error) {
      context += `System state error: ${error.message}\n`;
    }
    return context;
  }

  /**
   * Run bash shell script.
   * Supports simulation mode on non-macOS systems.
   * @param {string} script Bash script content
   * @returns {Promise<string>} Output of the execution
   */
  async runShellScript(script) {
    console.log('\x1b[36m%s\x1b[0m', `[Shell Execute]\n${script}\n`);
    
    if (!config.IS_MACOS) {
      console.log('\x1b[33m%s\x1b[0m', '[Simulation] Running Shell script simulation.');
      return 'Simulation: Success';
    }

    try {
      return new Promise((resolve, reject) => {
        const process = exec('/bin/bash');
        let stdout = '';
        let stderr = '';
        
        process.stdout.on('data', (data) => { stdout += data; });
        process.stderr.on('data', (data) => { stderr += data; });
        
        process.on('close', (code) => {
          if (code === 0) {
            resolve(stdout.trim());
          } else {
            const err = new Error(stderr.trim() || `Shell script exited with code ${code}`);
            err.code = code;
            reject(err);
          }
        });
        
        process.stdin.write(script);
        process.stdin.end();
      });
    } catch (error) {
      console.error('[Shell Script Error]', error.message);
      throw error;
    }
  }

  /**
   * Executes user requests dynamically by writing bash shell scripts on the fly
   * utilizing the LLM, with an automatic self-healing/retry loop on script failure.
   */
  async executeDynamicAction({ instruction, provider = 'gemini' }) {
    let script = '';
    let attempts = 2;
    let currentError = null;

    // Get current system context to inject into prompt for better script writing
    let systemContext = '';
    try {
      systemContext = await this.getDetailedSystemContext();
    } catch (e) {
      systemContext = 'System state retrieval unavailable.';
    }

    while (attempts > 0) {
      try {
        let prompt = `System Context:\n${systemContext}\nGoal: Write a bash shell script (mixing terminal, osascript, and agent-desktop commands) to do: "${instruction}"`;

        if (currentError) {
          prompt += `\n\nYour previous bash script failed.
Failed Script:
\`\`\`bash
${script}
\`\`\`
Error returned:
"${currentError.message}"

Please fix the error and provide a corrected, working bash script. Make sure to escape strings correctly and follow shell syntax.`;
        }

        // Generate the code using LLM Service
        script = await llmService.generateCode(prompt, 'bash', provider);

        // Execute the script
        const output = await this.runShellScript(script);

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
