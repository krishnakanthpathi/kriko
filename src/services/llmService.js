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
    const systemPrompt = `You are a MacBook system automation engineer.
Your task is to write a valid, executable ${language} script that accomplishes the user request.

Follow these syntax and structure rules strictly:
1. Use standard line breaks and proper indentation. Do NOT write the entire script on a single line. Every command must start on a new line.
2. Output ONLY the raw executable code.
3. Do NOT wrap your output in markdown code fences (like \`\`\`${language} or \`\`\`).
4. Do NOT include comments, explanations, markdown formatting, or notes.
5. The output must be directly executable via command line (e.g., via osascript).
6. Escape double quotes and backslashes properly.

Mac Automation Guidelines:
- Browser Navigation (Google Chrome):
  To open a URL in Chrome, activate the app, check if a window exists, and set the URL of the active tab. Wait for load:
  tell application "Google Chrome"
      activate
      if (count of windows) is 0 then
          make new window
      end if
      set URL of active tab of window 1 to "https://keep.google.com/"
  end tell
  delay 5
- Web App UI Interactivity (like Google Keep):
  Browser DOM elements are not easily targetable via AppleScript UI process elements. Instead, use keyboard shortcuts or keyboard tab navigation:
  - In Google Keep, typing "c" or "n" opens a new note.
  - To enter text, use:
    tell application "System Events"
        keystroke "Note content here"
    end tell
  - To navigate menus (like setting alarms/reminders), use keystrokes of tab (key code 48), return (key code 36), or keyboard shortcuts.
- Always include "delay" commands (e.g. "delay 1", "delay 3", "delay 5") after opening applications or tabs to give the system time to load elements before sending keystrokes.`;

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
    let clean = text.trim();
    // Strip starting fences
    clean = clean.replace(/^```[a-zA-Z]*\n?/i, '');
    // Strip ending fences
    clean = clean.replace(/\n?```$/, '');
    return clean.trim();
  }
}

export default new LlmService();
