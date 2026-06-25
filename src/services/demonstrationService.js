import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

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
    console.log(`[Demonstration Service] Started recording demonstration for intent: "${this._currentIntent}"`);
  }

  stopRecording() {
    if (!this._isRecording) return null;

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
