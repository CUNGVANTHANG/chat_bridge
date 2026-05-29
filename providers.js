/**
 * AI Chat Bridge — Provider Presets
 * 
 * Each provider profile defines CSS selectors and behavior for interacting
 * with a specific AI chat web interface.
 */

const PROVIDER_PRESETS = {
  gemini: {
    name: 'Google Gemini',
    url: 'https://gemini.google.com/',
    urlPattern: 'https://gemini.google.com/*',
    inputSelector: 'div[contenteditable="true"], rich-textarea div[contenteditable], [role="textbox"]',
    sendButtonSelector: 'button[aria-label="Send message"], button[aria-label="Send"], button:has(mat-icon[data-mat-icon-name="send"]), button:has(mat-icon[fonticon="send"])',
    responseContainerSelector: 'model-response, .model-response-text, .message-content, .response-container',
    responseTextSelector: '.model-response-text p, .message-content p, div[class*="message-text"] p, p',
    typingIndicatorSelector: 'button[aria-label="Stop generating"], button[aria-label*="Stop"], [data-test-id="stop-button"], mat-progress-bar, .typing-indicator, [aria-label*="loading"], [aria-label*="Generating"]',
    doneIndicatorSelector: 'g-response-actions, [class*="response-actions"], [class*="message-actions"]',
    sendMethod: 'button',       // 'button' = click send btn, 'enter' = press Enter key
    inputMethod: 'clipboard',   // 'clipboard' = paste, 'innerText' = set innerText, 'value' = set .value
    inputType: 'contenteditable', // 'contenteditable', 'textarea', 'input'
    settleTime: 3500,
    timeout: 60000,
  },

  chatgpt: {
    name: 'ChatGPT',
    url: 'https://chatgpt.com/',
    urlPattern: 'https://chatgpt.com/*',
    inputSelector: '#prompt-textarea, div[contenteditable="true"][id="prompt-textarea"], [id="prompt-textarea"] p',
    sendButtonSelector: 'button[data-testid="send-button"], button[aria-label="Send prompt"]',
    responseContainerSelector: '[data-message-author-role="assistant"], .agent-turn',
    responseTextSelector: '.markdown p, .markdown li, .markdown pre code, .markdown',
    typingIndicatorSelector: 'button[data-testid="stop-button"], button[aria-label="Stop generating"], .result-streaming',
    doneIndicatorSelector: '[data-testid="copy-turn-action-button"]',
    sendMethod: 'button',
    inputMethod: 'clipboard',
    inputType: 'contenteditable',
    settleTime: 3000,
    timeout: 120000,
  },

  claude: {
    name: 'Claude (Anthropic)',
    url: 'https://claude.ai/',
    urlPattern: 'https://claude.ai/*',
    inputSelector: 'div[contenteditable="true"].ProseMirror, div[contenteditable="true"]',
    sendButtonSelector: 'button[aria-label="Send Message"], button[aria-label="Send message"]',
    responseContainerSelector: '[data-is-streaming], .font-claude-message, div[class*="claude-message"]',
    responseTextSelector: '.font-claude-message p, .font-claude-message li, .font-claude-message pre code, p',
    typingIndicatorSelector: 'button[aria-label="Stop Response"], [data-is-streaming="true"], .animate-pulse',
    doneIndicatorSelector: 'button[aria-label="Copy"], button[class*="copy"]',
    sendMethod: 'button',
    inputMethod: 'clipboard',
    inputType: 'contenteditable',
    settleTime: 3000,
    timeout: 120000,
  },

  grok: {
    name: 'Grok (xAI)',
    url: 'https://grok.com/',
    urlPattern: 'https://grok.com/*',
    inputSelector: 'textarea, div[contenteditable="true"]',
    sendButtonSelector: 'button[aria-label="Send"], button[type="submit"]',
    responseContainerSelector: '[class*="message"][class*="assistant"], [data-role="assistant"]',
    responseTextSelector: 'p, li, pre code',
    typingIndicatorSelector: 'button[aria-label*="Stop"], [class*="loading"], [class*="typing"]',
    doneIndicatorSelector: 'button[aria-label="Copy"], [class*="action-bar"]',
    sendMethod: 'button',
    inputMethod: 'clipboard',
    inputType: 'textarea',
    settleTime: 3000,
    timeout: 120000,
  },

  deepseek: {
    name: 'DeepSeek',
    url: 'https://chat.deepseek.com/',
    urlPattern: 'https://chat.deepseek.com/*',
    inputSelector: 'textarea#chat-input, textarea',
    sendButtonSelector: 'div[class*="send"][role="button"], button[aria-label="Send"]',
    responseContainerSelector: '.ds-markdown, [class*="assistant-message"]',
    responseTextSelector: '.ds-markdown p, .ds-markdown li, .ds-markdown pre code, p',
    typingIndicatorSelector: '[class*="stop-button"], [class*="loading"]',
    doneIndicatorSelector: '[class*="copy-btn"], button[class*="copy"]',
    sendMethod: 'button',
    inputMethod: 'value',
    inputType: 'textarea',
    settleTime: 3000,
    timeout: 120000,
  },

  custom: {
    name: 'Custom Provider',
    url: '',
    urlPattern: '',
    inputSelector: '',
    sendButtonSelector: '',
    responseContainerSelector: '',
    responseTextSelector: '',
    typingIndicatorSelector: '',
    doneIndicatorSelector: '',
    sendMethod: 'enter',
    inputMethod: 'clipboard',
    inputType: 'contenteditable',
    settleTime: 3500,
    timeout: 60000,
  }
};

const DEFAULT_CONFIG = {
  activeProvider: 'gemini',
  bridgeUrl: 'http://localhost:8765',
  providers: { ...PROVIDER_PRESETS }
};

/**
 * Load the full config from chrome.storage.sync
 * Merges saved config over defaults.
 */
async function loadConfig() {
  return new Promise((resolve) => {
    chrome.storage.sync.get('aiBridgeConfig', (result) => {
      const saved = result.aiBridgeConfig || {};
      const config = {
        ...DEFAULT_CONFIG,
        ...saved,
        providers: {
          ...DEFAULT_CONFIG.providers,
          ...(saved.providers || {})
        }
      };
      resolve(config);
    });
  });
}

/**
 * Save full config to chrome.storage.sync
 */
async function saveConfig(config) {
  return new Promise((resolve) => {
    chrome.storage.sync.set({ aiBridgeConfig: config }, resolve);
  });
}

/**
 * Get the active provider profile from config
 */
function getActiveProvider(config) {
  const id = config.activeProvider || 'gemini';
  return config.providers[id] || PROVIDER_PRESETS.gemini;
}

// Export for both ES module and script contexts
if (typeof globalThis !== 'undefined') {
  globalThis.PROVIDER_PRESETS = PROVIDER_PRESETS;
  globalThis.DEFAULT_CONFIG = DEFAULT_CONFIG;
  globalThis.loadConfig = loadConfig;
  globalThis.saveConfig = saveConfig;
  globalThis.getActiveProvider = getActiveProvider;
}
