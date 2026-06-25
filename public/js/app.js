document.addEventListener('DOMContentLoaded', () => {
  // DOM Nodes - General
  const platformStatus = document.getElementById('platform-status');
  const geminiStatus = document.getElementById('gemini-status');
  const openaiStatus = document.getElementById('openai-status');
  const ollamaStatus = document.getElementById('ollama-status');
  const teachModeBtn = document.getElementById('teach-mode-btn');
  const consoleLogs = document.getElementById('console-logs-area');
  const viewModeBtn = document.getElementById('view-mode-btn');
  const exitWidgetModeBtn = document.getElementById('exit-widget-mode-btn');

  // DOM Nodes - Tabs
  const tabButtons = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  // DOM Nodes - Speech Synthesis
  const ttsText = document.getElementById('tts-text');
  const ttsVoice = document.getElementById('tts-voice');
  const ttsSpeed = document.getElementById('tts-speed');
  const speedVal = document.getElementById('speed-val');
  const generateSpeechBtn = document.getElementById('generate-speech-btn');
  const ttsPlayerCard = document.getElementById('tts-player-card');
  const mainAudio = document.getElementById('main-audio');
  const downloadAudioBtn = document.getElementById('download-audio-btn');
  const playerMethod = document.getElementById('player-method');

  // DOM Nodes - System Actions
  const reminderTitle = document.getElementById('reminder-title');
  const reminderBody = document.getElementById('reminder-body');
  const createReminderBtn = document.getElementById('create-reminder-btn');
  const sysVolume = document.getElementById('sys-volume');
  const volumeVal = document.getElementById('volume-val');

  // DOM Nodes - A11y
  const dumpA11yBtn = document.getElementById('dump-a11y-btn');
  const a11yOutput = document.getElementById('a11y-output');

  // DOM Nodes - Chat Assistant
  const chatProvider = document.getElementById('chat-provider');
  const chatMessagesArea = document.getElementById('chat-messages-area');
  const chatInputForm = document.getElementById('chat-input-form');
  const chatInputBox = document.getElementById('chat-input-box');

  // DOM Nodes - Siri Widget
  const siriFloatingWidget = document.getElementById('siri-floating-widget');
  const siriOrb = document.getElementById('siri-orb');
  const siriOverlayPanel = document.getElementById('siri-overlay-panel');
  const siriCloseBtn = document.getElementById('siri-close-btn');
  const siriMessagesArea = document.getElementById('siri-messages-area');
  const siriInputForm = document.getElementById('siri-input-form');
  const siriInputBox = document.getElementById('siri-input-box');
  const siriStatusIndicator = document.getElementById('siri-status-indicator');

  // Configuration Cache
  let isMac = false;
  let speakResponseAudio = true; // Auto speak assistant responses

  // Initialize
  initApp();

  async function initApp() {
    logToConsole('Loading Kriko configuration...', 'info');
    
    // 1. Fetch Health Status & Platform Check
    try {
      const res = await fetch('/api/health');
      const data = await res.json();
      
      isMac = data.environment.isMac;
      
      // Update header indicators
      updateStatusIndicator(platformStatus, isMac, isMac ? 'macOS Active' : 'Non-macOS (Simulated)');
      updateStatusIndicator(geminiStatus, data.environment.keysConfigured.gemini, 'Gemini');
      updateStatusIndicator(openaiStatus, data.environment.keysConfigured.openai, 'ChatGPT');
      updateStatusIndicator(ollamaStatus, data.environment.keysConfigured.ollama, 'Ollama (Local)');
      
      logToConsole(`Server environment loaded. Platform: ${data.environment.platform}. macOS: ${isMac}`, 'success');
    } catch (e) {
      logToConsole('Error connecting to backend health check. Is the server running?', 'error');
    }

    // 2. Fetch TTS Voices
    try {
      const res = await fetch('/api/tts/voices');
      const voices = await res.json();
      
      ttsVoice.innerHTML = '';
      voices.forEach(voice => {
        const option = document.createElement('option');
        option.value = voice.id;
        option.textContent = `${voice.name} (${voice.lang})`;
        option.dataset.code = voice.code;
        ttsVoice.appendChild(option);
      });
      logToConsole('Text-to-Speech voices list loaded.', 'info');
    } catch (e) {
      logToConsole('Failed to load TTS voices.', 'error');
    }

    // 3. Sync Volume Slider with MacBook State
    try {
      const res = await fetch('/api/assistant/volume');
      const data = await res.json();
      if (data.success) {
        sysVolume.value = data.level;
        volumeVal.textContent = `${data.level}%`;
      }
    } catch (e) {
      console.warn('Failed to retrieve system volume.', e);
    }

    // 4. Sync Teach Mode status
    try {
      const res = await fetch('/api/assistant/teach/status');
      const data = await res.json();
      if (data.success && data.isRecording) {
        isRecordingDemo = true;
        teachModeBtn.textContent = '🔴 Recording... (Stop)';
        teachModeBtn.classList.add('recording');
        logToConsole(`Restored active recording demonstration for "${data.currentIntent}".`, 'warning');
      }
    } catch (e) {}
  }

  // ==============================================
  // UI & Tab Interactions
  // ==============================================

  // Tab Switching
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      tabButtons.forEach(b => b.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));
      
      btn.classList.add('active');
      const targetTab = document.getElementById(btn.dataset.tab);
      if (targetTab) targetTab.classList.add('active');
    });
  });

  // TTS Speed Slider label sync
  ttsSpeed.addEventListener('input', (e) => {
    speedVal.textContent = e.target.value;
  });

  // View Mode Toggles (Dashboard vs Siri widget mode)
  viewModeBtn.addEventListener('click', () => {
    document.body.classList.add('widget-mode-active');
    exitWidgetModeBtn.classList.remove('hidden');
    // Open the Siri panel automatically
    siriOverlayPanel.classList.remove('hidden');
    logToConsole('Switched to widget overlay mode.', 'info');
  });

  exitWidgetModeBtn.addEventListener('click', () => {
    document.body.classList.remove('widget-mode-active');
    exitWidgetModeBtn.classList.add('hidden');
    siriOverlayPanel.classList.add('hidden');
    logToConsole('Exited widget overlay mode.', 'info');
  });

  // Teach Mode toggle
  let isRecordingDemo = false;

  teachModeBtn.addEventListener('click', async () => {
    if (!isRecordingDemo) {
      const intentName = prompt('Enter a name for the task you are teaching (e.g., google_keep_reminder):');
      if (!intentName) return;

      try {
        const res = await fetch('/api/assistant/teach/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ intent: intentName })
        });
        const data = await res.json();
        if (data.success) {
          isRecordingDemo = true;
          teachModeBtn.textContent = '🔴 Recording... (Stop)';
          teachModeBtn.classList.add('recording');
          logToConsole(`Teach Mode Active: Recording demonstration for "${intentName}".`, 'warning');
        } else {
          alert(`Failed to start teaching: ${data.error}`);
        }
      } catch (e) {
        logToConsole(`Failed to connect to backend teach API: ${e.message}`, 'error');
      }
    } else {
      try {
        const res = await fetch('/api/assistant/teach/stop', { method: 'POST' });
        const data = await res.json();
        if (data.success) {
          isRecordingDemo = false;
          teachModeBtn.textContent = '🎓 Teach Mode';
          teachModeBtn.classList.remove('recording');
          logToConsole(`Teach Mode Complete: Saved demonstration flow to "${data.data?.intent}".`, 'success');
          alert(`Successfully saved task demonstration guide for "${data.data?.intent}"! Next time you ask this task, the assistant will follow your guide.`);
        } else {
          alert(`Failed to stop teaching: ${data.error}`);
        }
      } catch (e) {
        logToConsole(`Failed to stop teaching: ${e.message}`, 'error');
      }
    }
  });

  // Helper: Append logs to mock terminal
  function logToConsole(message, type = 'info') {
    const time = new Date().toLocaleTimeString();
    const line = document.createElement('div');
    line.className = `log-line ${type}`;
    line.textContent = `[${time}] ${message}`;
    consoleLogs.appendChild(line);
    consoleLogs.scrollTop = consoleLogs.scrollHeight;
  }

  function updateStatusIndicator(element, isActive, labelText) {
    const dot = element.querySelector('.status-dot');
    const text = element.querySelector('.status-text');
    dot.className = 'status-dot';
    
    if (isActive) {
      dot.classList.add('green');
    } else {
      dot.classList.add('orange');
    }
    text.textContent = labelText;
  }

  // ==============================================
  // Direct Action Triggers (Developer Panel)
  // ==============================================

  // Generate & Play Speech
  generateSpeechBtn.addEventListener('click', async () => {
    const text = ttsText.value.trim();
    if (!text) {
      logToConsole('Please enter text for synthesis.', 'warning');
      return;
    }

    setOrbState('speaking');
    generateSpeechBtn.disabled = true;
    generateSpeechBtn.textContent = 'Generating...';
    logToConsole(`Requesting TTS for: "${text.substring(0, 30)}..."`, 'info');

    try {
      const selectedVoice = ttsVoice.value;
      const voiceOption = ttsVoice.options[ttsVoice.selectedIndex];
      const langCode = voiceOption ? voiceOption.dataset.code : 'a';

      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          voice: selectedVoice,
          speed: ttsSpeed.value,
          langCode
        })
      });

      if (!response.ok) {
        throw new Error(`Server returned HTTP ${response.status}`);
      }

      const methodUsed = response.headers.get('X-TTS-Method') || 'Apple Native';
      playerMethod.textContent = methodUsed;

      // Stream the response as an audio blob
      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      
      mainAudio.src = audioUrl;
      ttsPlayerCard.classList.remove('hidden');
      mainAudio.play();
      
      // Setup download button
      downloadAudioBtn.href = audioUrl;

      // Pulse speaking visual
      mainAudio.onplay = () => setOrbState('speaking');
      mainAudio.onended = () => setOrbState('idle');

      logToConsole(`TTS Generated via ${methodUsed}. Outputting stream...`, 'success');
    } catch (error) {
      logToConsole(`TTS Speech generation failed: ${error.message}`, 'error');
      setOrbState('idle');
    } finally {
      generateSpeechBtn.disabled = false;
      generateSpeechBtn.textContent = '🔊 Generate & Play Speech';
    }
  });

  // Create Reminder
  createReminderBtn.addEventListener('click', async () => {
    const title = reminderTitle.value.trim();
    const body = reminderBody.value.trim();

    if (!title) {
      logToConsole('Please enter a title for the reminder.', 'warning');
      return;
    }

    createReminderBtn.disabled = true;
    logToConsole(`Creating macOS reminder: "${title}"`, 'info');

    try {
      const response = await fetch('/api/assistant/reminder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, body })
      });
      const result = await response.json();

      if (result.success) {
        logToConsole(`Reminder added. Output: ${result.output || 'Success'}`, 'success');
        reminderTitle.value = '';
        reminderBody.value = '';
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      logToConsole(`Failed to create reminder: ${error.message}`, 'error');
    } finally {
      createReminderBtn.disabled = false;
    }
  });

  // System Volume Control
  sysVolume.addEventListener('change', async (e) => {
    const level = e.target.value;
    volumeVal.textContent = `${level}%`;
    logToConsole(`Setting system volume output to: ${level}%`, 'info');

    try {
      const response = await fetch('/api/assistant/volume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ level })
      });
      const data = await response.json();
      if (data.success) {
        logToConsole(`Volume successfully synced to ${level}%`, 'success');
      }
    } catch (error) {
      logToConsole(`Volume control failed: ${error.message}`, 'error');
    }
  });

  // Accessibility Tree Dump
  dumpA11yBtn.addEventListener('click', async () => {
    dumpA11yBtn.disabled = true;
    dumpA11yBtn.textContent = 'Analyzing...';
    a11yOutput.textContent = 'Executing tree analysis...';
    logToConsole('Requesting accessibility tree analysis...', 'info');

    try {
      const response = await fetch('/api/assistant/accessibility-tree');
      const data = await response.json();
      
      a11yOutput.textContent = JSON.stringify(data.tree, null, 2);
      logToConsole('Accessibility tree analysis complete.', 'success');
    } catch (error) {
      a11yOutput.textContent = `Error: ${error.message}`;
      logToConsole(`Accessibility analysis failed: ${error.message}`, 'error');
    } finally {
      dumpA11yBtn.disabled = false;
      dumpA11yBtn.textContent = '🔍 Dump Accessibility Tree';
    }
  });

  // Quick Action Global Handlers (referenced in index.html)
  window.openAppDirect = async (appName) => {
    logToConsole(`Opening application: ${appName}`, 'info');
    try {
      const response = await fetch('/api/assistant/open-app', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appName })
      });
      const data = await response.json();
      if (data.success) {
        logToConsole(`App launcher output: ${data.output}`, 'success');
      }
    } catch (e) {
      logToConsole(`Failed to launch app: ${e.message}`, 'error');
    }
  };

  window.listRunningAppsDirect = async () => {
    logToConsole('Querying active user applications...', 'info');
    try {
      const response = await fetch('/api/assistant/running-apps');
      const data = await response.json();
      if (data.success) {
        logToConsole(`Running Applications: ${data.runningApps.join(', ')}`, 'success');
      }
    } catch (e) {
      logToConsole(`Failed to retrieve running apps: ${e.message}`, 'error');
    }
  };

  window.triggerSpeakDirect = async () => {
    const text = prompt('Enter text for Macbook hardware speaker to speak:');
    if (!text) return;
    logToConsole(`Direct vocal command: "${text}"`, 'info');
    try {
      const response = await fetch('/api/assistant/speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      });
      const data = await response.json();
      logToConsole(`Mac speaker response: ${data.output}`, 'success');
    } catch (e) {
      logToConsole(`Speech failed: ${e.message}`, 'error');
    }
  };

  // Suggestion buttons
  window.useSuggestion = (text) => {
    chatInputBox.value = text;
    chatInputBox.focus();
  };

  // ==============================================
  // Chat & LLM Orchestration
  // ==============================================

  // Handle Dashboard Chat Form Submit
  chatInputForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const promptText = chatInputBox.value.trim();
    if (!promptText) return;

    chatInputBox.value = '';
    appendMessage('user', promptText, chatMessagesArea);
    
    // Scroll chat
    chatMessagesArea.scrollTop = chatMessagesArea.scrollHeight;
    
    // Add thinking placeholder
    const thinkingBubble = appendMessage('assistant', 'Thinking...', chatMessagesArea, true);
    setOrbState('thinking');

    try {
      const provider = chatProvider.value;
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instruction: promptText,
          provider: provider
        })
      });
      const result = await response.json();

      // Remove thinking loading state
      thinkingBubble.remove();

      if (result.success) {
        const assistantText = result.message || 'Action executed successfully.';
        const responseCard = appendMessage('assistant', assistantText, chatMessagesArea);
        
        logToConsole(`AI dynamic execution complete. Model provider: ${provider}`, 'success');

        // Render AppleScript execution block if a script was written
        if (result.data && result.data.script) {
          logToConsole(`Generated script code: \n${result.data.script}`, 'info');
          renderExecutionBlock(responseCard.querySelector('.bubble-content'), result.data);
        }

        // Trigger Vocal output
        if (speakResponseAudio) {
          triggerVocalResponse(assistantText);
        } else {
          setOrbState('idle');
        }

      } else {
        throw new Error(result.error ? result.error.message : 'Server returned execution failure.');
      }
    } catch (error) {
      thinkingBubble.remove();
      appendMessage('assistant', `⚠️ Execution Failed: ${error.message}`, chatMessagesArea);
      logToConsole(`AI dynamic action failed: ${error.message}`, 'error');
      setOrbState('idle');
    }

    chatMessagesArea.scrollTop = chatMessagesArea.scrollHeight;
  });

  // ==============================================
  // Siri Orb and Compact Overlay Interactions
  // ==============================================

  // Siri Orb Toggle overlay
  siriOrb.addEventListener('click', () => {
    siriOverlayPanel.classList.toggle('hidden');
    if (!siriOverlayPanel.classList.contains('hidden')) {
      siriInputBox.focus();
    }
  });

  siriCloseBtn.addEventListener('click', () => {
    siriOverlayPanel.classList.add('hidden');
  });

  // Handle Siri Compact Chat Submit
  siriInputForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const promptText = siriInputBox.value.trim();
    if (!promptText) return;

    siriInputBox.value = '';
    appendMessage('user', promptText, siriMessagesArea);
    siriMessagesArea.scrollTop = siriMessagesArea.scrollHeight;

    setOrbState('thinking');
    siriStatusIndicator.textContent = 'Analyzing Command...';

    try {
      const provider = chatProvider.value; // reuse provider setting
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instruction: promptText,
          provider: provider
        })
      });
      const result = await response.json();

      if (result.success) {
        const assistantText = result.message || 'Action executed successfully.';
        appendMessage('assistant', assistantText, siriMessagesArea);
        siriStatusIndicator.textContent = 'Command Executed';
        
        // Speak voice response
        triggerVocalResponse(assistantText);
      } else {
        throw new Error(result.error ? result.error.message : 'Execution failed.');
      }
    } catch (error) {
      appendMessage('assistant', `Error: ${error.message}`, siriMessagesArea);
      siriStatusIndicator.textContent = 'Execution Error';
      setOrbState('idle');
    }

    siriMessagesArea.scrollTop = siriMessagesArea.scrollHeight;
  });

  // ==============================================
  // Helper / Utility functions
  // ==============================================

  // Set visual state of Siri Orb
  function setOrbState(state) {
    siriOrb.className = state; // 'idle', 'thinking', 'speaking'
    if (siriStatusIndicator) {
      siriStatusIndicator.textContent = state;
    }
  }

  // Appends a chat bubble to the specified container
  function appendMessage(sender, text, container, isThinking = false) {
    const bubble = document.createElement('div');
    bubble.className = `chat-bubble ${sender}`;
    
    const avatar = document.createElement('div');
    avatar.className = 'avatar';
    avatar.textContent = sender === 'user' ? '🧑' : '🤖';
    
    const content = document.createElement('div');
    content.className = 'bubble-content';
    
    if (isThinking) {
      content.innerHTML = `<span class="thinking-loader">Thinking...</span>`;
    } else {
      content.innerHTML = `<p>${text}</p>`;
    }
    
    bubble.appendChild(avatar);
    bubble.appendChild(content);
    container.appendChild(bubble);
    
    return bubble;
  }

  // Renders the dynamic AppleScript execution collapsible block
  function renderExecutionBlock(parentContentNode, data) {
    const wrapper = document.createElement('div');
    wrapper.className = 'tool-execution';
    
    const header = document.createElement('div');
    header.className = 'tool-header';
    header.innerHTML = `<span>🔧 Generated Script (Click to Expand)</span> <span>▲</span>`;
    
    const details = document.createElement('div');
    details.className = 'tool-details';
    
    const scriptPre = document.createElement('pre');
    scriptPre.className = 'tool-script';
    scriptPre.textContent = data.script;
    
    const outputPre = document.createElement('pre');
    outputPre.className = 'tool-output';
    outputPre.textContent = data.output || 'No output returned (compiled clean).';
    
    details.appendChild(scriptPre);
    details.appendChild(outputPre);
    wrapper.appendChild(header);
    wrapper.appendChild(details);
    
    parentContentNode.appendChild(wrapper);

    // Collapsible functionality
    header.addEventListener('click', () => {
      details.classList.toggle('show');
      header.querySelector('span:last-child').textContent = details.classList.contains('show') ? '▼' : '▲';
    });
  }

  // Calls the TTS endpoint to speak out the assistant text and plays it
  async function triggerVocalResponse(text) {
    setOrbState('speaking');
    try {
      const selectedVoice = ttsVoice.value || 'af_heart';
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: text,
          voice: selectedVoice,
          speed: 1.0,
          langCode: 'a'
        })
      });

      if (!response.ok) throw new Error();

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      
      const audioObj = new Audio(url);
      audioObj.play();
      
      audioObj.onplay = () => setOrbState('speaking');
      audioObj.onended = () => setOrbState('idle');
    } catch (e) {
      console.warn('Vocal output failed.', e);
      setOrbState('idle');
    }
  }
});
