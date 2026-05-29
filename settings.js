/**
 * AI Chat Bridge — Settings Page Logic
 * 
 * Handles loading/saving provider configs, testing selectors,
 * and import/export functionality.
 */

document.addEventListener('DOMContentLoaded', async () => {
  // ---- DOM References ----
  const providerSelect = document.getElementById('providerSelect');
  const providerUrl = document.getElementById('providerUrl');
  const providerUrlPattern = document.getElementById('providerUrlPattern');
  const inputSelector = document.getElementById('inputSelector');
  const sendButtonSelector = document.getElementById('sendButtonSelector');
  const responseContainerSelector = document.getElementById('responseContainerSelector');
  const responseTextSelector = document.getElementById('responseTextSelector');
  const typingIndicatorSelector = document.getElementById('typingIndicatorSelector');
  const doneIndicatorSelector = document.getElementById('doneIndicatorSelector');
  const sendMethod = document.getElementById('sendMethod');
  const inputMethod = document.getElementById('inputMethod');
  const inputType = document.getElementById('inputType');
  const settleTime = document.getElementById('settleTime');
  const timeout = document.getElementById('timeout');
  const bridgeUrl = document.getElementById('bridgeUrl');

  const activeProviderName = document.getElementById('activeProviderName');
  const saveBtn = document.getElementById('saveBtn');
  const testAllBtn = document.getElementById('testAllBtn');
  const resetBtn = document.getElementById('resetBtn');
  const openShellBtn = document.getElementById('openShellBtn');
  const openAiTabBtn = document.getElementById('openAiTabBtn');
  const jsonPreview = document.getElementById('jsonPreview');
  const copyJsonBtn = document.getElementById('copyJsonBtn');
  const importJsonBtn = document.getElementById('importJsonBtn');
  const importFileInput = document.getElementById('importFileInput');
  const importExportToggle = document.getElementById('importExportToggle');
  const importExportBody = document.getElementById('importExportBody');

  let currentConfig = null;

  // ---- Toast ----
  const SVG_ICONS = {
    success: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/></svg>',
    error: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg>',
    info: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#818cf8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>',
  };

  function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    const toastIcon = document.getElementById('toastIcon');
    const toastText = document.getElementById('toastText');
    
    toastIcon.innerHTML = SVG_ICONS[type] || SVG_ICONS.info;
    toastText.textContent = message;
    toast.className = `toast show ${type}`;
    
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => {
      toast.classList.remove('show');
    }, 3000);
  }

  // ---- Load Config ----
  async function loadAndDisplayConfig() {
    currentConfig = await loadConfig();
    
    // Set provider dropdown
    providerSelect.value = currentConfig.activeProvider || 'gemini';
    bridgeUrl.value = currentConfig.bridgeUrl || 'http://localhost:8765';
    
    // Load active provider fields
    populateFieldsFromProvider(currentConfig.activeProvider);
    
    // Update header badge
    const provider = getActiveProvider(currentConfig);
    activeProviderName.textContent = provider.name || 'Unknown';
    
    // Update JSON preview
    updateJsonPreview();
  }

  function populateFieldsFromProvider(providerId) {
    const provider = currentConfig.providers[providerId] || PROVIDER_PRESETS[providerId] || {};
    
    providerUrl.value = provider.url || '';
    providerUrlPattern.value = provider.urlPattern || '';
    inputSelector.value = provider.inputSelector || '';
    sendButtonSelector.value = provider.sendButtonSelector || '';
    responseContainerSelector.value = provider.responseContainerSelector || '';
    responseTextSelector.value = provider.responseTextSelector || '';
    typingIndicatorSelector.value = provider.typingIndicatorSelector || '';
    doneIndicatorSelector.value = provider.doneIndicatorSelector || '';
    sendMethod.value = provider.sendMethod || 'button';
    inputMethod.value = provider.inputMethod || 'clipboard';
    inputType.value = provider.inputType || 'contenteditable';
    settleTime.value = provider.settleTime || 3500;
    timeout.value = provider.timeout || 60000;
  }

  function collectFormData() {
    return {
      name: providerSelect.options[providerSelect.selectedIndex].text,
      url: providerUrl.value.trim(),
      urlPattern: providerUrlPattern.value.trim(),
      inputSelector: inputSelector.value.trim(),
      sendButtonSelector: sendButtonSelector.value.trim(),
      responseContainerSelector: responseContainerSelector.value.trim(),
      responseTextSelector: responseTextSelector.value.trim(),
      typingIndicatorSelector: typingIndicatorSelector.value.trim(),
      doneIndicatorSelector: doneIndicatorSelector.value.trim(),
      sendMethod: sendMethod.value,
      inputMethod: inputMethod.value,
      inputType: inputType.value,
      settleTime: parseInt(settleTime.value) || 3500,
      timeout: parseInt(timeout.value) || 60000,
    };
  }

  function updateJsonPreview() {
    if (!currentConfig) return;
    const display = {
      activeProvider: currentConfig.activeProvider,
      bridgeUrl: currentConfig.bridgeUrl,
      providers: currentConfig.providers
    };
    jsonPreview.textContent = JSON.stringify(display, null, 2);
  }

  // ---- Provider Switch ----
  providerSelect.addEventListener('change', () => {
    const newId = providerSelect.value;
    
    // Save current form data to the previous provider before switching
    if (currentConfig.activeProvider && currentConfig.activeProvider !== newId) {
      const formData = collectFormData();
      // Restore the correct name for the previous provider
      const prevPreset = PROVIDER_PRESETS[currentConfig.activeProvider];
      if (prevPreset) formData.name = prevPreset.name;
      currentConfig.providers[currentConfig.activeProvider] = {
        ...currentConfig.providers[currentConfig.activeProvider],
        ...formData
      };
    }
    
    currentConfig.activeProvider = newId;
    populateFieldsFromProvider(newId);
    
    const provider = currentConfig.providers[newId] || PROVIDER_PRESETS[newId];
    activeProviderName.textContent = provider?.name || newId;
    
    updateJsonPreview();
  });

  // ---- Save ----
  saveBtn.addEventListener('click', async () => {
    const providerId = providerSelect.value;
    const formData = collectFormData();
    
    currentConfig.activeProvider = providerId;
    currentConfig.bridgeUrl = bridgeUrl.value.trim() || 'http://localhost:8765';
    currentConfig.providers[providerId] = {
      ...currentConfig.providers[providerId],
      ...formData
    };
    
    await saveConfig(currentConfig);
    updateJsonPreview();
    showToast('Configuration saved successfully!');
    
    // Notify background script of config change
    try {
      chrome.runtime.sendMessage({ action: 'configChanged' });
    } catch (e) { /* ignore */ }
  });

  // ---- Reset to Preset ----
  resetBtn.addEventListener('click', () => {
    const providerId = providerSelect.value;
    const preset = PROVIDER_PRESETS[providerId];
    if (!preset) {
      showToast('No preset available for this provider', 'error');
      return;
    }
    
    currentConfig.providers[providerId] = { ...preset };
    populateFieldsFromProvider(providerId);
    updateJsonPreview();
    showToast(`Reset to ${preset.name} defaults`);
  });

  // ---- Test Selectors ----
  async function testSelector(selectorValue, fieldName) {
    if (!selectorValue.trim()) {
      return { found: 0, error: 'Empty selector' };
    }

    try {
      // Find the AI tab
      const urlPattern = providerUrlPattern.value.trim();
      if (!urlPattern) {
        return { found: 0, error: 'No URL pattern configured' };
      }

      const tabs = await chrome.tabs.query({ url: urlPattern });
      if (!tabs.length) {
        return { found: 0, error: `No open tab matching "${urlPattern}"` };
      }

      const tabId = tabs[0].id;
      
      const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: (selector) => {
          // Remove any previous test highlights
          document.querySelectorAll('.__aicb_test_highlight__').forEach(el => {
            el.style.outline = el.dataset.__aicb_orig_outline__ || '';
            el.classList.remove('__aicb_test_highlight__');
            delete el.dataset.__aicb_orig_outline__;
          });

          try {
            const elements = document.querySelectorAll(selector);
            // Highlight found elements
            elements.forEach(el => {
              el.dataset.__aicb_orig_outline__ = el.style.outline;
              el.style.outline = '3px solid #6366f1';
              el.classList.add('__aicb_test_highlight__');
            });

            // Auto-remove highlight after 4 seconds
            setTimeout(() => {
              document.querySelectorAll('.__aicb_test_highlight__').forEach(el => {
                el.style.outline = el.dataset.__aicb_orig_outline__ || '';
                el.classList.remove('__aicb_test_highlight__');
                delete el.dataset.__aicb_orig_outline__;
              });
            }, 4000);

            return { found: elements.length };
          } catch (e) {
            return { found: 0, error: e.message };
          }
        },
        args: [selectorValue]
      });

      return results[0]?.result || { found: 0, error: 'Script failed' };
    } catch (e) {
      return { found: 0, error: e.message };
    }
  }

  // Individual test buttons
  document.querySelectorAll('.btn-test').forEach(btn => {
    btn.addEventListener('click', async () => {
      const targetId = btn.dataset.target;
      const input = document.getElementById(targetId);
      if (!input) return;

      btn.textContent = '...';
      btn.classList.remove('test-pass', 'test-fail');

      const result = await testSelector(input.value, targetId);

      if (result.found > 0) {
        btn.textContent = `✓ ${result.found}`;
        btn.classList.add('test-pass');
        btn.classList.remove('test-fail');
      } else {
        btn.textContent = result.error ? '✗ err' : '✗ 0';
        btn.classList.add('test-fail');
        btn.classList.remove('test-pass');
        if (result.error) {
          showToast(`${targetId}: ${result.error}`, 'error');
        }
      }

      // Reset button after 5s
      setTimeout(() => {
        btn.textContent = 'Test';
        btn.classList.remove('test-pass', 'test-fail');
      }, 5000);
    });
  });

  // Test All button
  testAllBtn.addEventListener('click', async () => {
    const fields = ['inputSelector', 'sendButtonSelector', 'responseContainerSelector', 
                    'responseTextSelector', 'typingIndicatorSelector', 'doneIndicatorSelector'];
    
    let passed = 0;
    let failed = 0;

    for (const fieldId of fields) {
      const input = document.getElementById(fieldId);
      const btn = document.querySelector(`.btn-test[data-target="${fieldId}"]`);
      if (!input || !btn) continue;

      btn.textContent = '...';
      btn.classList.remove('test-pass', 'test-fail');

      const result = await testSelector(input.value, fieldId);

      if (result.found > 0) {
        btn.textContent = `✓ ${result.found}`;
        btn.classList.add('test-pass');
        passed++;
      } else {
        btn.textContent = '✗ 0';
        btn.classList.add('test-fail');
        failed++;
      }
    }

    showToast(`Test complete: ${passed} passed, ${failed} failed`, failed > 0 ? 'error' : 'success');

    // Reset after 8s
    setTimeout(() => {
      document.querySelectorAll('.btn-test').forEach(btn => {
        btn.textContent = 'Test';
        btn.classList.remove('test-pass', 'test-fail');
      });
    }, 8000);
  });

  // ---- Quick Links ----
  openShellBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('bridge-shell.html') });
  });

  openAiTabBtn.addEventListener('click', () => {
    const url = providerUrl.value.trim();
    if (url) {
      chrome.tabs.create({ url });
    } else {
      showToast('No provider URL configured', 'error');
    }
  });

  // ---- Import / Export ----
  importExportToggle.addEventListener('click', () => {
    importExportToggle.classList.toggle('expanded');
    importExportBody.classList.toggle('expanded');
  });

  copyJsonBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(jsonPreview.textContent);
      showToast('Configuration JSON copied to clipboard');
    } catch (e) {
      showToast('Failed to copy', 'error');
    }
  });

  importJsonBtn.addEventListener('click', () => {
    importFileInput.click();
  });

  importFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const imported = JSON.parse(ev.target.result);
        
        // Validate structure
        if (!imported.activeProvider || !imported.providers) {
          throw new Error('Invalid config format: missing activeProvider or providers');
        }

        currentConfig = {
          ...DEFAULT_CONFIG,
          ...imported,
          providers: {
            ...DEFAULT_CONFIG.providers,
            ...imported.providers
          }
        };

        await saveConfig(currentConfig);
        providerSelect.value = currentConfig.activeProvider;
        populateFieldsFromProvider(currentConfig.activeProvider);
        bridgeUrl.value = currentConfig.bridgeUrl || 'http://localhost:8765';
        
        const provider = getActiveProvider(currentConfig);
        activeProviderName.textContent = provider.name || 'Unknown';
        updateJsonPreview();

        showToast('Configuration imported successfully!');
      } catch (err) {
        showToast(`Import failed: ${err.message}`, 'error');
      }
    };
    reader.readAsText(file);
    importFileInput.value = ''; // Reset
  });

  // ---- Init ----
  await loadAndDisplayConfig();
});
