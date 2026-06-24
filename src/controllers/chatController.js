import assistantService from '../services/assistantService.js';
import config from '../config/config.js';

class ChatController {
  /**
   * Handlers user prompt, generates dynamic AppleScript, executes it and returns outputs.
   */
  async chat(req, res, next) {
    try {
      const { instruction, provider } = req.body;
      
      if (!instruction) {
        return res.status(400).json({ success: false, error: 'Instruction parameter is required.' });
      }

      const activeProvider = provider || 'gemini';
      
      console.log(`[Chat Controller] Received dynamic instruction: "${instruction}" using provider: ${activeProvider}`);
      
      const result = await assistantService.executeDynamicAction({
        instruction,
        provider: activeProvider
      });

      res.status(200).json({
        success: true,
        message: 'Action executed successfully.',
        data: {
          instruction: instruction,
          script: result.script,
          output: result.output,
          attemptsUsed: result.attemptsUsed
        }
      });
    } catch (error) {
      // If dynamic execution fails after retries, report back to client
      res.status(500).json({
        success: false,
        error: {
          message: error.message,
          details: 'Dynamic execution failed or LLM failed to write valid code.'
        }
      });
    }
  }

  /**
   * Lists available model providers.
   */
  getModels(req, res) {
    res.status(200).json({
      providers: [
        { id: 'gemini', name: 'Gemini 1.5 Flash (Google)', configured: !!config.GEMINI_API_KEY },
        { id: 'openai', name: 'ChatGPT gpt-4o-mini (OpenAI)', configured: !!config.OPENAI_API_KEY }
      ]
    });
  }
}

export default new ChatController();
