import axios from 'axios';
import config from '../config/config.js';

class LlmService {
  /**
   * Generates a raw text response using the selected LLM provider.
   * @param {string} prompt The text prompt to send
   * @param {'gemini'|'openai'|'ollama'} provider The provider to use
   * @returns {Promise<string>} The model response text
   */
  async generateText(prompt, provider = 'gemini') {
    const selectedProvider = provider.toLowerCase();

    if (selectedProvider === 'openai') {
      return this._callOpenAI(prompt);
    } else if (selectedProvider === 'ollama') {
      return this._callOllama(prompt);
    } else {
      return this._callGemini(prompt);
    }
  }

  /**
   * Generates clean executable code (e.g. AppleScript) without markdown code fences.
   * @param {string} prompt Prompt explaining what the script should do
   * @param {string} language 'applescript' or 'javascript'
   * @param {'gemini'|'openai'|'ollama'} provider The provider to use
   * @returns {Promise<string>} Clean executable script content
   */
  async generateCode(prompt, language = 'applescript', provider = 'gemini') {
    let systemPrompt = '';
    
    if (language === 'bash') {
      systemPrompt = `You are a MacBook system automation engineer.
Your task is to write a valid, executable bash shell script that accomplishes the user request.
You can mix standard bash commands, macOS command line utilities (like 'open', 'osascript', 'sleep'), and the 'agent-desktop' GUI automation CLI tool.

Follow these syntax and structure rules strictly:
1. Output ONLY the raw executable bash script. Every command must start on a new line.
2. Do NOT wrap your output in markdown code fences (like \`\`\`bash or \`\`\`).
3. Do NOT include comments, explanations, markdown formatting, or notes.
4. The output must be directly executable via a bash shell.
5. Escape double quotes and backslashes properly.

Mac Automation Tools available to your script:
1. macOS shell commands:
   - "open -a 'AppName'" (Bring app to frontmost active focus - highly recommended before typing/clicking).
   - "osascript -e 'applescript command'" (For light application commands).
   - "osascript <<EOF
       tell application ...
       end tell
     EOF" (For multiline AppleScript blocks).
   - "sleep N" (Pause execution for N seconds to allow windows/tabs to load).

2. agent-desktop CLI commands (for visual & accessibility UI automation):
   - "npx agent-desktop click <ref_id> --snapshot <snapshot_id>" (Click a UI element via accessibility action).
   - "npx agent-desktop type <ref_id> --snapshot <snapshot_id> 'text'" (Focus and insert text into a target field).
   - "npx agent-desktop press <combo>" (Send key combos like: return, escape, tab, shift+tab, cmd+c, cmd+v, cmd+z).
   - "npx agent-desktop check <ref_id> --snapshot <snapshot_id>" (Check a checkbox or switch).
   - "npx agent-desktop uncheck <ref_id> --snapshot <snapshot_id>" (Uncheck a checkbox).
   - "npx agent-desktop focus <ref_id> --snapshot <snapshot_id>" (Set keyboard focus to a UI element).
   - "npx agent-desktop wait --text 'text_to_wait' --app 'AppName' --timeout 5000" (Wait for text to appear).
   - "npx agent-desktop wait --element <ref_id> --predicate actionable --timeout 5000" (Wait until element is actionable).

Workflow Guidelines:
- If a snapshot_id and UI tree are provided in the System Context:
  - Match UI element names or descriptions to find their @ref IDs (like @e1, @e2, etc.) in the tree.
  - Call "npx agent-desktop <command> <ref_id> --snapshot <snapshot_id>" to click or type.
  - ALWAYS pass the exact --snapshot <snapshot_id> parameter to all agent-desktop element commands.
- If the application is not open, use "open -a 'AppName'" followed by "sleep 3" to launch it first.
- When opening websites in Chrome or Safari, ALWAYS check if any windows exist first. If no windows are open (e.g. fresh launch), create a new window and set the URL of its active tab. If windows already exist, create a new tab and set its URL so you do not overwrite/destroy the user's current tab URL.
  Example Chrome navigation block:
  open -a "Google Chrome"
  sleep 2
  osascript <<EOF
    tell application "Google Chrome"
        if (count of windows) is 0 then
            make new window
            set URL of active tab of window 1 to "https://keep.google.com/"
        else
            tell window 1 to set URL of (make new tab) to "https://keep.google.com/"
        end if
    end tell
  EOF
  sleep 4
  # If the tree shows the search field is @e1 under snapshot s2j8ieqwhxpdcx:
  npx agent-desktop type @e1 --snapshot s2j8ieqwhxpdcx "Shopping List"`;
    } else {
      systemPrompt = `You are a MacBook system automation engineer.
Your task is to write a valid, executable ${language} script that accomplishes the user request.

Follow these syntax and structure rules strictly:
1. Use standard line breaks and proper indentation. Do NOT write the entire script on a single line. Every command must start on a new line.
2. Output ONLY the raw executable code.
3. Do NOT wrap your output in markdown code fences.
4. Do NOT include comments, explanations, markdown formatting, or notes.
5. The output must be directly executable via command line (e.g., via osascript).
6. Escape double quotes and backslashes properly.`;
    }

    const fullPrompt = `${systemPrompt}\n\nUser request:\n${prompt}`;
    const rawResult = await this.generateText(fullPrompt, provider);

    return this._cleanMarkdownFences(rawResult);
  }

  /**
   * Calls the Google Gemini API (gemini-2.5-flash-lite) using direct REST
   */
  async _callGemini(prompt) {
    if (!config.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY is not configured in your .env file. Please add your key to proceed.');
    }

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${config.GEMINI_API_KEY}`;
      const payload = {
        contents: [
          {
            parts: [
              { text: prompt }
            ]
          }
        ]
      };

      const response = await axios.post(url, payload, {
        headers: { 'Content-Type': 'application/json' }
      });

      if (
        response.data &&
        response.data.candidates &&
        response.data.candidates[0] &&
        response.data.candidates[0].content &&
        response.data.candidates[0].content.parts &&
        response.data.candidates[0].content.parts[0]
      ) {
        return response.data.candidates[0].content.parts[0].text.trim();
      }

      throw new Error('Unexpected API response structure from Gemini.');
    } catch (error) {
      const details = error.response ? error.response.data : error.message;
      console.error('[Gemini API Error]', details);
      throw new Error(`Gemini API call failed: ${error.message}`);
    }
  }

  /**
   * Calls the OpenAI ChatGPT API (gpt-4o-mini) using direct REST
   */
  async _callOpenAI(prompt) {
    if (!config.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is not configured in your .env file. Please add your key to proceed.');
    }

    try {
      const url = 'https://api.openai.com/v1/chat/completions';
      const payload = {
        model: 'gpt-4o-mini',
        messages: [
          { role: 'user', content: prompt }
        ],
        temperature: 0.1 // Keep it deterministic for script generation
      };

      const response = await axios.post(url, payload, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.OPENAI_API_KEY}`
        }
      });

      if (
        response.data &&
        response.data.choices &&
        response.data.choices[0] &&
        response.data.choices[0].message
      ) {
        return response.data.choices[0].message.content.trim();
      }

      throw new Error('Unexpected API response structure from OpenAI.');
    } catch (error) {
      const details = error.response ? error.response.data : error.message;
      console.error('[OpenAI API Error]', details);
      throw new Error(`OpenAI API call failed: ${error.message}`);
    }
  }

  /**
   * Calls local Ollama service (defaulting to gemma2 or custom configured model)
   * 
   * Other local models you can run in your .env:
   * - gemma2 (Gemma 2, highly recommended, default)
   * - gemma:2b (Lightweight Gemma model for low resource machines)
   * - llama3 (Llama 3, general-purpose LLM)
   * - mistral (Highly capable 7B model)
   * - qwen2.5 (Strong coding & multilingual capabilities)
   */
  async _callOllama(prompt) {
    const url = `${config.OLLAMA_API_URL}/api/generate`;
    const model = config.OLLAMA_MODEL || 'gemma2';

    try {
      console.log(`[Ollama Service] Requesting local LLM: "${model}" at ${url}`);

      const payload = {
        model: model,
        prompt: prompt,
        stream: false,
        options: {
          temperature: 0.1 // Keep it deterministic for script generation
        }
      };

      const response = await axios.post(url, payload, {
        headers: { 'Content-Type': 'application/json' }
      });

      if (response.data && response.data.response) {
        return response.data.response.trim();
      }

      throw new Error('Unexpected response format from local Ollama service.');
    } catch (error) {
      console.error('[Ollama API Error]', error.message);
      throw new Error(`Local Ollama service failed (Model: ${model}, Endpoint: ${url}). Error: ${error.message}. Ensure Ollama is running and model is pulled: 'ollama pull ${model}'`);
    }
  }

  /**
   * Helper to strip Markdown code fences from the output string.
   */
  _cleanMarkdownFences(text) {
    // If the LLM returned conversational text containing a code block, extract only the code block contents
    const codeBlockRegex = /```(?:bash|applescript|sh|shell|zsh)?\n([\s\S]*?)\n```/i;
    const match = text.match(codeBlockRegex);
    if (match) {
      return match[1].trim();
    }
    
    let clean = text.trim();
    // Strip starting fences
    clean = clean.replace(/^```[a-zA-Z]*\n?/i, '');
    // Strip ending fences
    clean = clean.replace(/\n?```$/, '');
    return clean.trim();
  }
}

export default new LlmService();
