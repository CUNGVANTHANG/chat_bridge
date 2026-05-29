/**
 * AI Chat Bridge — Background Service Worker
 * 
 * Dynamically loads provider configuration from chrome.storage.sync
 * and interacts with any AI chat web interface based on CSS selectors.
 */

// Import provider presets and config helpers
importScripts('providers.js');

function bglog(...args) {
  console.log('[BG]', ...args);
}

// ---- Cached config ----
let _cachedConfig = null;

async function getConfig() {
  if (!_cachedConfig) {
    _cachedConfig = await loadConfig();
  }
  return _cachedConfig;
}

// Listen for config changes
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes.aiBridgeConfig) {
    bglog('Config changed, invalidating cache');
    _cachedConfig = null;
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'configChanged') {
    bglog('Config change notification received');
    _cachedConfig = null;
  }
});

// ---- Extension Icon Click → Open Settings ----
chrome.action.onClicked.addListener(() => {
  bglog('Toolbar icon clicked; opening settings page');
  chrome.tabs.create({
    url: chrome.runtime.getURL('settings.html')
  });
});

// ---- Main Message Handler ----
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  bglog('onMessage received:', msg);
  if (msg.action !== 'runAI' && msg.action !== 'runGemini') return;

  const attachments = msg.attachments || (msg.attachment ? [msg.attachment] : []);

  runAIFlow(msg.prompt, attachments)
    .then(reply => {
      bglog('runAIFlow resolved:', reply);
      sendResponse({ status: 'success', reply });
    })
    .catch(err => {
      bglog('runAIFlow failed:', err);
      sendResponse({ status: 'error', reply: 'Error: ' + err });
    });

  return true;
});

// ---- Open/Reuse AI Tab Handler ----
let _lastOpenRequestTs = 0;
let _openInProgress = false;
const OPEN_COOLDOWN_MS = 5000;

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'openNewAI' || msg.action === 'openNewGemini') {
    const now = Date.now();
    const force = !!msg.force;
    if (!force) {
      if (_openInProgress) {
        bglog('openNewAI suppressed because open already in progress');
        sendResponse({ ok: false, reason: 'in-progress' });
        return true;
      }
      if (now - _lastOpenRequestTs < OPEN_COOLDOWN_MS) {
        bglog('openNewAI suppressed by cooldown');
        sendResponse({ ok: false, reason: 'cooldown' });
        return true;
      }
    }
    _lastOpenRequestTs = now;
    _openInProgress = true;

    const clearOpenFlagTimer = setTimeout(() => {
      _openInProgress = false;
      bglog('openNewAI: clearing in-progress flag by timeout');
    }, OPEN_COOLDOWN_MS * 2);

    bglog('openNewAI requested — handling...');

    getConfig().then(config => {
      const provider = getActiveProvider(config);
      const urlPattern = provider.urlPattern;
      const chatUrl = provider.url;

      if (force) {
        chrome.tabs.query({ url: urlPattern }, tabs => {
          if (tabs && tabs.length) {
            const ids = tabs.map(t => t.id).filter(Boolean);
            bglog('force: closing AI tabs', ids);
            chrome.tabs.remove(ids, () => {
              chrome.tabs.create({ url: chatUrl }, newTab => {
                clearTimeout(clearOpenFlagTimer);
                _openInProgress = false;
                sendResponse({ ok: true, opened: true, tabId: newTab.id, forced: true });
              });
            });
          } else {
            chrome.tabs.create({ url: chatUrl }, newTab => {
              clearTimeout(clearOpenFlagTimer);
              _openInProgress = false;
              sendResponse({ ok: true, opened: true, tabId: newTab.id, forced: true });
            });
          }
        });
      } else {
        // Check for existing shell tab first
        chrome.tabs.query({ url: chrome.runtime.getURL('bridge-shell.html') }, extTabs => {
          if (extTabs && extTabs.length) {
            const t = extTabs[0];
            bglog('found existing extension shell tab, focusing', t.id);
            chrome.tabs.update(t.id, { active: true }, () => {
              clearTimeout(clearOpenFlagTimer);
              _openInProgress = false;
              sendResponse({ ok: true, focused: true });
            });
            return;
          }

          chrome.tabs.query({ url: urlPattern }, tabs => {
            if (tabs && tabs.length) {
              const t = tabs[0];
              bglog('reusing existing AI tab', t.id);
              chrome.tabs.update(t.id, { active: true }, () => {
                clearTimeout(clearOpenFlagTimer);
                _openInProgress = false;
                sendResponse({ ok: true, reused: true, tabId: t.id });
              });
            } else {
              bglog('no existing tabs, opening extension page');
              chrome.tabs.create({ url: chrome.runtime.getURL('bridge-shell.html') }, newTab => {
                clearTimeout(clearOpenFlagTimer);
                _openInProgress = false;
                sendResponse({ ok: true, opened: true, tabId: newTab.id });
              });
            }
          });
        });
      }
    });

    return true;
  }
});

// ================================================================
//  Core AI Interaction Flow (config-driven)
// ================================================================

async function runAIFlow(prompt, attachments) {
  const config = await getConfig();
  const provider = getActiveProvider(config);
  bglog('→ start runAIFlow for provider:', provider.name, 'prompt:', prompt);

  // Save currently active tab in order to return back later
  let originalActiveTabId = null;
  try {
    const activeTabs = await new Promise(resolve => {
      chrome.tabs.query({ active: true, currentWindow: true }, resolve);
    });
    if (activeTabs && activeTabs.length > 0) {
      originalActiveTabId = activeTabs[0].id;
    }
  } catch (e) {
    bglog('→ failed to query original active tab:', e);
  }

  const tab = await findOrCreateTab(provider);
  bglog('→ using tab:', tab.id, tab.url);

  // Activate the AI tab to prevent browser throttling
  try {
    await new Promise(resolve => {
      chrome.tabs.update(tab.id, { active: true }, resolve);
    });
    bglog('→ activated AI tab to prevent background throttling:', tab.id);
  } catch (e) {
    bglog('→ failed to activate AI tab:', e);
  }

  await waitForLoad(tab.id);
  bglog('→ page loaded');

  await retryEnsureInput(tab.id, provider, 3, 1000);
  bglog('→ input ready');

  // Count current response containers before sending prompt
  let initialCount = 0;
  try {
    const result = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (containerSelector) => {
        if (!containerSelector) return 0;
        const selectors = containerSelector.split(',').map(s => s.trim());
        for (const sel of selectors) {
          try {
            const els = document.querySelectorAll(sel);
            if (els.length) return els.length;
          } catch (e) { /* skip invalid selector */ }
        }
        return 0;
      },
      args: [provider.responseContainerSelector]
    });
    initialCount = result[0]?.result || 0;
  } catch (err) {
    bglog('→ failed to count initial responses:', err);
  }
  bglog('→ initial response count:', initialCount);

  // 1. Inject attachments (if any)
  if (attachments && attachments.length) {
    for (const att of attachments) {
      if (!att) continue;
      bglog('→ attaching file:', att.name);
      try {
        if (att.dataURL) {
          await injectFileIntoPage(tab.id, att, provider);
        } else if (att.data && att.type && att.name) {
          const dataURL = `data:${att.type};charset=utf-8,` + encodeURIComponent(att.data);
          await injectFileIntoPage(tab.id, { name: att.name, type: att.type, dataURL }, provider);
        } else {
          bglog('→ attachment missing fields, skipping', att);
          continue;
        }
        bglog('→ attachment injected');
      } catch (err) {
        bglog('→ attachment injection failed:', err);
      }
      await new Promise(r => setTimeout(r, 50));
    }
  }

  // 2. Send the prompt
  bglog('→ sending prompt');
  await sendPrompt(tab.id, prompt, provider);
  bglog('→ prompt sent');

  // 3. Wait for response
  let reply = '';
  try {
    reply = await waitForResponse(tab.id, provider, initialCount);
    bglog('→ response received');
  } finally {
    // Restore the user's original active tab if they were switched
    if (originalActiveTabId && originalActiveTabId !== tab.id) {
      try {
        await new Promise(resolve => {
          chrome.tabs.update(originalActiveTabId, { active: true }, resolve);
        });
        bglog('→ restored original active tab:', originalActiveTabId);
      } catch (e) {
        bglog('→ failed to restore original active tab:', e);
      }
    }
  }

  return reply;
}

// ---- Find or Create AI Tab ----
function findOrCreateTab(provider) {
  return new Promise(resolve => {
    chrome.tabs.query({}, tabs => {
      // Try to find by URL pattern
      const existingTab = tabs.find(t => {
        if (!t.url) return false;
        // Simple pattern matching: check if URL contains the domain
        try {
          const providerDomain = new URL(provider.url).hostname;
          return t.url.includes(providerDomain);
        } catch (e) {
          return false;
        }
      });

      if (existingTab) {
        bglog('findOrCreateTab: found existing tab', existingTab.id, existingTab.url);
        return resolve(existingTab);
      }

      bglog('findOrCreateTab: creating new tab for', provider.url);
      chrome.tabs.create(
        { url: provider.url, active: false },
        newTab => {
          bglog('findOrCreateTab: new tab opened', newTab.id);
          resolve(newTab);
        }
      );
    });
  });
}

// ---- Wait for Tab Load ----
function waitForLoad(tabId) {
  return new Promise(resolve => {
    let resolved = false;
    const triggerResolve = (reason) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(safetyTimeout);
      chrome.tabs.onUpdated.removeListener(listener);
      bglog(`waitForLoad resolved by: ${reason}`);
      resolve();
    };

    const safetyTimeout = setTimeout(() => {
      triggerResolve('safety timeout');
    }, 5000);

    const listener = (id, info) => {
      if (id === tabId && info.status === 'complete') {
        triggerResolve('load event complete');
      }
    };

    chrome.tabs.get(tabId, tab => {
      if (tab.status === 'complete') {
        triggerResolve('already complete');
      } else {
        bglog('waitForLoad: waiting for load on tab', tabId);
        chrome.tabs.onUpdated.addListener(listener);
      }
    });
  });
}

// ---- Ensure Input Ready ----
async function retryEnsureInput(tabId, provider, retries = 3, delay = 1000) {
  for (let i = 0; i < retries; i++) {
    try {
      bglog(`retryEnsureInput: attempt ${i + 1}`);
      await ensureInputReady(tabId, provider);
      return;
    } catch (err) {
      bglog(`retryEnsureInput: attempt ${i + 1} failed:`, err);
      if (i === retries - 1) throw err;
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

function ensureInputReady(tabId, provider) {
  bglog('ensureInputReady: injecting script with selector:', provider.inputSelector);

  return chrome.scripting.executeScript({
    target: { tabId },
    func: (inputSelector, timeout) => {
      return new Promise((res, rej) => {
        const find = () => {
          const selectors = inputSelector.split(',').map(s => s.trim());
          for (const sel of selectors) {
            try {
              const el = document.querySelector(sel);
              if (el) return el;
            } catch (e) { /* skip invalid selector */ }
          }
          return null;
        };

        if (find()) return res();

        const obs = new MutationObserver(() => {
          if (find()) { obs.disconnect(); res(); }
        });
        obs.observe(document.body, { childList: true, subtree: true });
        setTimeout(() => { obs.disconnect(); rej('Timeout waiting for input element'); }, timeout);
      });
    },
    args: [provider.inputSelector, 8000]
  }).then(() => {
    bglog('ensureInputReady: input element found');
  });
}

// ---- Send Prompt ----
async function sendPrompt(tabId, prompt, provider) {
  bglog('sendPrompt: injecting text with method:', provider.inputMethod);

  await chrome.scripting.executeScript({
    target: { tabId },
    func: async (text, inputSel, sendBtnSel, inputMethod, sendMethod, inputType) => {

      // Find the input element
      const findEl = (selStr) => {
        const selectors = selStr.split(',').map(s => s.trim());
        for (const sel of selectors) {
          try {
            const el = document.querySelector(sel);
            if (el) return el;
          } catch (e) { /* skip */ }
        }
        return null;
      };

      const input = findEl(inputSel);
      if (!input) throw 'Input element not found with selector: ' + inputSel;

      input.focus();

      // Clear existing content
      if (inputType === 'contenteditable') {
        input.innerHTML = '';
      } else {
        input.value = '';
      }

      // Input the text based on configured method
      if (inputMethod === 'clipboard') {
        try {
          await navigator.clipboard.writeText(text);
          document.execCommand('paste');
        } catch (e) {
          console.warn('Clipboard paste failed, fallback to innerText:', e);
          if (inputType === 'contenteditable') {
            input.innerText = text;
          } else {
            input.value = text;
          }
        }
      } else if (inputMethod === 'innerText') {
        if (inputType === 'contenteditable') {
          input.innerText = text;
        } else {
          input.value = text;
        }
      } else if (inputMethod === 'value') {
        input.value = text;
        // Trigger React/Vue change detection
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
          window.HTMLTextAreaElement.prototype, 'value'
        )?.set || Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype, 'value'
        )?.set;
        if (nativeInputValueSetter) {
          nativeInputValueSetter.call(input, text);
        }
      }

      // Dispatch input event to trigger framework reactivity
      input.dispatchEvent(new InputEvent('input', { bubbles: true, data: text }));
      input.dispatchEvent(new Event('change', { bubbles: true }));

      // Small delay before sending
      return new Promise(resolve => setTimeout(() => {

        if (sendMethod === 'button') {
          // Try to find and click the send button
          const sendBtn = findEl(sendBtnSel);

          if (!sendBtn) {
            // Fallback: search for any visible send-like button near the input
            const composerRoot =
              input.closest('form') ||
              input.closest('[class*="input"]') ||
              input.closest('[class*="composer"]') ||
              input.closest('[class*="footer"]') ||
              input.parentElement;

            let fallbackBtn = null;
            if (composerRoot) {
              const candidates = Array.from(composerRoot.querySelectorAll('button, [role="button"]'))
                .filter(n => n.offsetParent !== null && !n.hasAttribute('disabled'));

              fallbackBtn = candidates.find(n => {
                const label = (n.getAttribute('aria-label') || n.title || '').toLowerCase();
                return label.includes('send') && !label.includes('share') && !label.includes('feedback');
              });

              if (!fallbackBtn) {
                fallbackBtn = candidates[candidates.length - 1] || null;
              }
            }

            if (fallbackBtn && !fallbackBtn.hasAttribute('disabled')) {
              fallbackBtn.click();
            } else {
              // Ultimate fallback: press Enter
              input.dispatchEvent(new KeyboardEvent('keydown', {
                key: 'Enter', code: 'Enter', keyCode: 13, which: 13,
                bubbles: true, cancelable: true, composed: true
              }));
            }
          } else if (!sendBtn.hasAttribute('disabled')) {
            sendBtn.click();
          } else {
            // Button is disabled, try Enter
            input.dispatchEvent(new KeyboardEvent('keydown', {
              key: 'Enter', code: 'Enter', keyCode: 13, which: 13,
              bubbles: true, cancelable: true, composed: true
            }));
          }
        } else {
          // sendMethod === 'enter'
          input.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'Enter', code: 'Enter', keyCode: 13, which: 13,
            bubbles: true, cancelable: true, composed: true
          }));
        }

        resolve();
      }, 50));
    },
    args: [prompt, provider.inputSelector, provider.sendButtonSelector, provider.inputMethod, provider.sendMethod, provider.inputType]
  });
}

// ---- Inject File Attachment ----
async function injectFileIntoPage(tabId, attachment, provider) {
  return chrome.scripting.executeScript({
    target: { tabId },
    func: (att, inputSel, timeout) => {
      return new Promise((resolve, reject) => {
        try {
          // Build File object from dataURL
          const parts = att.dataURL.split(',');
          const meta = parts[0];
          const isBase64 = meta.indexOf('base64') !== -1;
          const matches = /data:([^;]+)(;base64)?/.exec(meta);
          const mime = matches ? matches[1] : att.type || 'application/octet-stream';
          const raw = parts[1];
          let binStr = isBase64 ? atob(raw) : decodeURIComponent(raw);
          const u8 = new Uint8Array(binStr.length);
          for (let i = 0; i < binStr.length; i++) u8[i] = binStr.charCodeAt(i);
          const blob = new Blob([u8], { type: mime });
          const file = new File([blob], att.name, { type: mime });

          // Find the input/composer element
          const selectors = inputSel.split(',').map(s => s.trim());
          let composer = null;
          for (const sel of selectors) {
            try {
              composer = document.querySelector(sel);
              if (composer) break;
            } catch (e) { /* skip */ }
          }

          if (!composer) { reject('Input element not found for file attachment'); return; }

          // Paste file via ClipboardEvent
          composer.focus();
          const dt = new DataTransfer();
          dt.items.add(file);
          const pasteEvent = new ClipboardEvent('paste', {
            bubbles: true,
            cancelable: true,
            clipboardData: dt
          });
          composer.dispatchEvent(pasteEvent);

          // Wait for file chip/preview to appear
          const start = Date.now();
          const check = () => {
            const chips = document.querySelectorAll('mat-chip, [data-test-id*="attachment"], [data-test-id*="chip"], .file-chip, .attachment-preview, [class*="attachment"]');
            if (chips.length > 0) {
              return resolve(true);
            }
            if (Date.now() - start > timeout) {
              return resolve(true); // Don't block on missing chip indicator
            }
            setTimeout(check, 50);
          };
          setTimeout(check, 50);

        } catch (err) {
          reject(err?.toString?.() || String(err));
        }
      });
    },
    args: [attachment, provider.inputSelector, 5000]
  }).then(() => true);
}

// ---- Wait for Response ----
async function waitForResponse(tabId, provider, initialCount = 0) {
  const timeout = provider.timeout || 60000;
  const settleTime = provider.settleTime || 3500;

  bglog('waitForResponse: injecting observer script');
  return chrome.scripting.executeScript({
    target: { tabId },
    func: (containerSel, textSel, typingSel, doneSel, initialCount, timeout, settleTime) => {
      return new Promise((resolve, reject) => {

        const queryAll = (selStr) => {
          if (!selStr) return [];
          const selectors = selStr.split(',').map(s => s.trim());
          for (const sel of selectors) {
            try {
              const els = document.querySelectorAll(sel);
              if (els.length) return Array.from(els);
            } catch (e) { /* skip */ }
          }
          return [];
        };

        const queryOne = (selStr) => {
          if (!selStr) return null;
          const selectors = selStr.split(',').map(s => s.trim());
          for (const sel of selectors) {
            try {
              const el = document.querySelector(sel);
              if (el) return el;
            } catch (e) { /* skip */ }
          }
          return null;
        };

        const isTyping = () => {
          // Check for typing indicators
          if (typingSel) {
            const indicator = queryOne(typingSel);
            if (indicator && indicator.offsetParent !== null) return true;
          }

          // Check if a new response container exists with done indicator
          const containers = queryAll(containerSel);
          if (containers.length > initialCount) {
            const lastContainer = containers[containers.length - 1];

            // Check done indicator inside the last container
            if (doneSel) {
              const selectors = doneSel.split(',').map(s => s.trim());
              for (const sel of selectors) {
                try {
                  const doneEl = lastContainer.querySelector(sel);
                  if (doneEl && doneEl.offsetParent !== null) {
                    return false; // Done! Response complete.
                  }
                } catch (e) { /* skip */ }
              }
            }

            // Fallback: check for icon buttons in response (toolbar appeared = done)
            const buttons = Array.from(lastContainer.querySelectorAll('button, [role="button"]'));
            const hasToolbar = buttons.some(btn => {
              const hasIcon = btn.querySelector('mat-icon, gem-icon, svg, [class*="icon"]') !== null;
              const label = btn.getAttribute('aria-label') || btn.title || '';
              return hasIcon && (btn.classList.contains('icon-button') || label.length > 0);
            });

            if (!hasToolbar) return true; // Still generating
          } else {
            return true; // Still waiting for response block
          }

          return false;
        };

        const getLatestText = () => {
          const containers = queryAll(containerSel);

          if (containers.length > initialCount) {
            const lastContainer = containers[containers.length - 1];

            // Try text selectors inside the container
            if (textSel) {
              const selectors = textSel.split(',').map(s => s.trim());
              for (const sel of selectors) {
                try {
                  const els = lastContainer.querySelectorAll(sel);
                  if (els.length) {
                    return Array.from(els)
                      .map(p => p.innerText.trim())
                      .filter(Boolean)
                      .join('\n\n');
                  }
                } catch (e) { /* skip */ }
              }
            }

            // Fallback: get all text from container
            return lastContainer.innerText.trim();
          }
          return '';
        };

        let lastText = '';
        let settleTimer = null;

        const trySettle = () => {
          const text = getLatestText();
          if (!text) return;

          if (text !== lastText || isTyping()) {
            lastText = text;
            clearTimeout(settleTimer);
            settleTimer = null;
            if (isTyping()) return;
          }

          if (settleTimer === null) {
            settleTimer = setTimeout(() => {
              if (isTyping()) {
                settleTimer = null;
                return;
              }
              observer.disconnect();
              clearTimeout(timeoutId);
              clearInterval(pollId);
              resolve(getLatestText());
            }, settleTime);
          }
        };

        const observer = new MutationObserver(trySettle);
        observer.observe(document.body, { childList: true, subtree: true, characterData: true });

        const pollId = setInterval(trySettle, 500);

        const timeoutId = setTimeout(() => {
          observer.disconnect();
          clearInterval(pollId);
          clearTimeout(settleTimer);
          const text = getLatestText();
          if (text) resolve(text);
          else reject('Timeout waiting for AI response');
        }, timeout);
      });
    },
    args: [
      provider.responseContainerSelector,
      provider.responseTextSelector,
      provider.typingIndicatorSelector,
      provider.doneIndicatorSelector,
      initialCount,
      timeout,
      settleTime
    ]
  }).then(r => r[0].result);
}