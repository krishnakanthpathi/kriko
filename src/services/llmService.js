import axios from 'axios';
import config from '../config/config.js';

class LlmService {
  /**
   * Generates a raw text response using the selected LLM provider.
   * @param {string} prompt The text prompt to send
   * @param {'gemini'|'openai'} provider The provider to use
   * @returns {Promise<string>} The model response text
   */
  async generateText(prompt, provider = 'gemini') {
    const selectedProvider = provider.toLowerCase();

    if (selectedProvider === 'openai') {
      return this._callOpenAI(prompt);
    } else {
      return this._callGemini(prompt);
    }
  }

  /**
   * Generates clean executable code (e.g. AppleScript) without markdown code fences.
   * @param {string} prompt Prompt explaining what the script should do
   * @param {string} language 'applescript' or 'javascript'
   * @param {'gemini'|'openai'} provider The provider to use
   * @returns {Promise<string>} Clean executable script content
   */
  async generateCode(prompt, language = 'applescript', provider = 'gemini') {
    const systemPrompt = `You are a MacBook system automation engineer. 
Your task is to write a single, valid, executable ${language} script that accomplishes the user request.
Follow these rules strictly:
1. Output ONLY the raw executable code. 
2. Do NOT wrap your output in markdown code fences (like \`\`\`${language} or \`\`\`).
3. Do NOT include any comments, introductory explanations, or trailing notes. 
4. The output must be directly executable by the system command line (e.g., via osascript).
5. Ensure strings are properly escaped and error handling is included inside the script where necessary.`;

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
