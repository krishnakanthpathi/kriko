import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEMO_DIR = path.join(__dirname, '../demonstrations');

// Ensure demonstrations directory exists
if (!fs.existsSync(DEMO_DIR)) {
  fs.mkdirSync(DEMO_DIR, { recursive: true });
}

class DemonstrationService {
  constructor() {
    this._isRecording = false;
    this._currentIntent = '';
    this._steps = [];
    this._activeSnapshot = null; // Stores the latest snapshot data { snapshot_id, tree }
    this._trackerInterval = null;
    this._lastState = {
      appName: '',
      elRole: '',
      elName: '',
      elVal: ''
    };
  }

  isRecording() {
    return this._isRecording;
  }

  getCurrentIntent() {
    return this._currentIntent;
  }

  startRecording(intentName) {
    this._isRecording = true;
    this._currentIntent = intentName.trim().toLowerCase().replace(/\s+/g, '_');
    this._steps = [];
    this._activeSnapshot = null;
    this._lastState = { appName: '', elRole: '', elName: '', elVal: '' };

    console.log(`[Demonstration Service] Started recording demonstration for intent: "${this._currentIntent}"`);
    
    // Start background tracking of physical user actions
    this._startBackgroundTracking();
  }

  stopRecording() {
    if (!this._isRecording) return null;

    // Stop background tracking
    this._stopBackgroundTracking();

    // Check if there is a final unsaved typing state
    if (this._lastState && (this._lastState.elRole.includes('Text') || this._lastState.elRole.includes('TextField')) && this._lastState.elVal) {
      console.log(`[AX Tracker] Flushing final typing state: "${this._lastState.elVal}"`);
      this._steps.push({
        action: 'type',
        targetValue: this._lastState.elVal,
        elementQuery: { role: this._lastState.elRole, name: this._lastState.elName },
        timestamp: new Date().toISOString()
      });
    }

    const savedIntent = this._currentIntent;
    const savedSteps = [...this._steps];

    this._isRecording = false;
    this._currentIntent = '';
    this._steps = [];
    this._activeSnapshot = null;

    if (savedSteps.length > 0) {
      this._saveToFile(savedIntent, savedSteps);
      console.log(`[Demonstration Service] Saved demonstration "${savedIntent}" with ${savedSteps.length} steps.`);
      return { intent: savedIntent, stepsCount: savedSteps.length };
    }

    console.log(`[Demonstration Service] Stopped recording demonstration. No steps recorded.`);
    return null;
  }

  setActiveSnapshot(snapshotId, tree) {
    this._activeSnapshot = { snapshotId, tree };
  }

  getActiveSnapshot() {
    return this._activeSnapshot;
  }

  /**
   * Background tracking methods to poll user focus changes on macOS
   */
  _startBackgroundTracking() {
    if (this._trackerInterval) clearInterval(this._trackerInterval);
    
    this._trackerInterval = setInterval(async () => {
      try {
        const state = await this._fetchAXState();
        if (!state) return;

        // 1. Detect application change
        if (state.appName && state.appName !== this._lastState.appName) {
          console.log(`[AX Tracker] Application change detected: "${state.appName}"`);
          if (state.appName !== 'System Events' && state.appName !== 'Terminal' && state.appName !== 'Antigravity IDE') {
            this._steps.push({
              action: 'launch',
              appName: state.appName,
              timestamp: new Date().toISOString()
            });
            // Try to capture initial element layout map of the newly focused app
            await this._captureAppSnapshot(state.appName);
          }
        }

        // 2. Detect element changes
        if (state.elRole && (state.elRole !== this._lastState.elRole || state.elName !== this._lastState.elName)) {
          // If user moved away from a text element that had content, record it as a typing event
          const isPrevText = this._lastState.elRole.includes('Text') || this._lastState.elRole.includes('TextField');
          if (isPrevText && this._lastState.elVal) {
            console.log(`[AX Tracker] Recorded text entry: "${this._lastState.elVal}" inside element "${this._lastState.elName}"`);
            this._steps.push({
              action: 'type',
              targetValue: this._lastState.elVal,
              elementQuery: { role: this._lastState.elRole, name: this._lastState.elName },
              timestamp: new Date().toISOString()
            });
          }

          // If new focused element is a button/menu item/checkbox/disclosure, treat it as a click action
          const isClickable = state.elRole.includes('Button') || 
                            state.elRole.includes('Menu') || 
                            state.elRole.includes('Check') || 
                            state.elRole.includes('Toggle') ||
                            state.elRole.includes('Link');
                            
          if (isClickable && state.elName && state.elName !== 'missing value') {
            console.log(`[AX Tracker] Recorded click/activation: ${state.elRole} "${state.elName}"`);
            this._steps.push({
              action: 'click',
              elementQuery: { role: state.elRole, name: state.elName },
              timestamp: new Date().toISOString()
            });
          }
        }

        // Update active values
        this._lastState = state;
      } catch (error) {
        // Silent error
      }
    }, 1200);
  }

  _stopBackgroundTracking() {
    if (this._trackerInterval) {
      clearInterval(this._trackerInterval);
      this._trackerInterval = null;
    }
  }

  /**
   * Run AppleScript to retrieve the frontmost focused UI component attributes
   */
  _fetchAXState() {
    return new Promise((resolve) => {
      const script = `
        tell application "System Events"
          try
            set frontApp to name of first process whose frontmost is true
            tell process frontApp
              try
                set focusedEl to value of attribute "AXFocusedUIElement"
                set elRole to role of focusedEl as string
                set elName to name of focusedEl as string
                try
                  set elVal to value of focusedEl as string
                on error
                  set elVal to ""
                end try
                return frontApp & "|" & elRole & "|" & elName & "|" & elVal
              on error
                return frontApp & "|none|none|"
              end try
            end tell
          on error
            return "none|none|none|"
          end try
        end tell
      `;

      exec(`osascript -e '${script.replace(/'/g, "'\\''")}'`, (err, stdout, stderr) => {
        if (err || !stdout) {
          resolve(null);
          return;
        }
        const parts = stdout.trim().split('|');
        if (parts.length >= 4) {
          resolve({
            appName: parts[0] === 'none' ? '' : parts[0],
            elRole: parts[1] === 'none' ? '' : parts[1],
            elName: parts[2] === 'none' ? '' : parts[2],
            elVal: parts[3] || ''
          });
        } else {
          resolve(null);
        }
      });
    });
  }

  /**
   * Take background snapshot of the app layout
   */
  _captureAppSnapshot(appName) {
    return new Promise((resolve) => {
      exec(`npx agent-desktop snapshot --app "${appName}" --skeleton -i --compact`, (err, stdout) => {
        if (!err && stdout) {
          try {
            const res = JSON.parse(stdout);
            if (res.ok && res.data) {
              this._activeSnapshot = {
                snapshotId: res.data.snapshot_id,
                tree: res.data.tree
              };
            }
          } catch (e) {}
        }
        resolve();
      });
    });
  }

  /**
   * Translates a script with volatile @ref IDs into a semantic step description and records it.
   */
  recordScriptAction(instruction, scriptOutput) {
    if (!this._isRecording) return;

    console.log(`[Demonstration Service] Recording action for: "${instruction}"`);

    // Parse commands out of the generated script
    const stepsFound = this._parseStepsFromScript(scriptOutput);
    
    for (const step of stepsFound) {
      this._steps.push(step);
    }
  }

  /**
   * Helper to parse npx agent-desktop commands from a generated script
   * and convert them into semantic step queries.
   */
  _parseStepsFromScript(script) {
    const lines = script.split('\n');
    const parsedSteps = [];

    for (const line of lines) {
      const trimmed = line.trim();
      
      // Look for agent-desktop commands
      // e.g. npx agent-desktop click @e2 --snapshot s2j8ieqwhxpdcx
      if (trimmed.includes('agent-desktop')) {
        const parts = trimmed.split(/\s+/);
        
        // Extract command (click, type, check, uncheck, focus, select, toggle)
        let cmdIndex = parts.findIndex(p => 
          ['click', 'double-click', 'right-click', 'type', 'check', 'uncheck', 'focus', 'select', 'toggle'].includes(p)
        );

        if (cmdIndex !== -1) {
          const action = parts[cmdIndex];
          const refId = parts[cmdIndex + 1]; // e.g. @e2
          
          let targetValue = '';
          // If action is type, extract the string value (if present)
          if (action === 'type') {
            const rawText = parts.slice(cmdIndex + 2).join(' ');
            // Extract text in quotes or use raw text up to options (starts with --)
            const optionIndex = rawText.indexOf('--');
            let textParam = optionIndex !== -1 ? rawText.substring(0, optionIndex) : rawText;
            targetValue = textParam.replace(/['"]/g, '').trim();
          }

          // Search active snapshot for the element role/name
          let elementQuery = null;
          if (this._activeSnapshot && refId && refId.startsWith('@')) {
            const node = this._findNodeByRef(this._activeSnapshot.tree, refId);
            if (node) {
              elementQuery = {
                role: node.role || '',
                name: node.name || node.title || node.value || '',
                value: node.value || ''
              };
            }
          }

          parsedSteps.push({
            action,
            refId,
            targetValue,
            elementQuery: elementQuery || { refId },
            rawCommand: trimmed
          });
        }
      } else if (trimmed.startsWith('open -a') || trimmed.includes('do shell script "open -a')) {
        // Record application launches
        const appMatch = trimmed.match(/open -a\s+["']?([^"'\n]+)["']?/i);
        if (appMatch) {
          parsedSteps.push({
            action: 'launch',
            appName: appMatch[1],
            rawCommand: trimmed
          });
        }
      }
    }

    return parsedSteps;
  }

  /**
   * Recursively search accessibility tree for a node matching the refId
   */
  _findNodeByRef(node, refId) {
    if (!node) return null;
    
    // Check various potential keys for ref ID
    if (node.ref_id === refId || node['@ref'] === refId || node.ref === refId || node.id === refId) {
      return node;
    }

    if (node.children && Array.isArray(node.children)) {
      for (const child of node.children) {
        const found = this._findNodeByRef(child, refId);
        if (found) return found;
      }
    }

    return null;
  }

  /**
   * Retrieve all saved demonstrations.
   */
  getDemonstrations() {
    try {
      if (!fs.existsSync(DEMO_DIR)) return [];
      const files = fs.readdirSync(DEMO_DIR);
      return files
        .filter(f => f.endsWith('.json'))
        .map(f => {
          const content = fs.readFileSync(path.join(DEMO_DIR, f), 'utf-8');
          return JSON.parse(content);
        });
    } catch (error) {
      console.error('[Demonstration Service] Failed to list demonstrations:', error.message);
      return [];
    }
  }

  /**
   * Matches the user instruction text semantic similarity to search for a stored demonstration.
   */
  getMatchingDemonstration(instruction) {
    const normalized = instruction.toLowerCase();
    const demos = this.getDemonstrations();

    // Basic heuristic: check if any keywords or the intent name are present in the instruction
    for (const demo of demos) {
      const intentNameWords = demo.intent.replace(/_/g, ' ');
      if (normalized.includes(intentNameWords) || normalized.includes(demo.intent)) {
        return demo;
      }
      
      // Keyword matching (e.g. keep + reminder -> google_keep_reminder)
      if (demo.intent === 'google_keep_reminder' && 
         (normalized.includes('keep') && (normalized.includes('remind') || normalized.includes('note') || normalized.includes('assessment')))) {
        return demo;
      }

      if (demo.intent === 'open_safari' && normalized.includes('safari')) {
        return demo;
      }
    }

    return null;
  }

  _saveToFile(intent, steps) {
    const filePath = path.join(DEMO_DIR, `${intent}.json`);
    const payload = {
      intent,
      created_at: new Date().toISOString(),
      steps
    };
    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf-8');
  }
}

export default new DemonstrationService();
