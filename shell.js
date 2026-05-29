document.addEventListener('DOMContentLoaded', async () => {
  const wsStateEl = document.getElementById('wsState');
  const closeBtn = document.getElementById('closeWs');
  const reconnectBtn = document.getElementById('reconnectWs');
  const copyBtn = document.getElementById('copyUrl');
  const settingsBtn = document.getElementById('openSettings');
  const logEl = document.getElementById('log');
  const providerNameEl = document.getElementById('providerName');
  const apiEndpointEl = document.getElementById('apiEndpointDisplay');

  const toast = document.createElement('div');
  toast.id = 'toast';
  document.body.appendChild(toast);

  // Load active provider name
  try {
    const config = await loadConfig();
    const provider = getActiveProvider(config);
    if (providerNameEl) providerNameEl.textContent = provider.name || config.activeProvider;
    if (apiEndpointEl) apiEndpointEl.textContent = `${config.bridgeUrl || 'http://localhost:8765'}/gemini`;
  } catch (e) {
    if (providerNameEl) providerNameEl.textContent = 'Unknown';
  }

  function log(msg, level = 'info') {
    const row = document.createElement('div');
    row.className = 'logRow ' + level;
    const time = new Date().toLocaleTimeString();

    const colors = { error: '#ef4444', action: '#6366f1', state: '#10b981', bridge: '#818cf8', info: '#94a3b8' };
    const c = colors[level] || colors.info;
    const dot = document.createElement('span');
    dot.innerHTML = `<svg width="8" height="8" viewBox="0 0 8 8"><circle cx="4" cy="4" r="4" fill="${c}"/></svg>`;
    dot.style.flexShrink = '0';

    const text = document.createElement('span');
    text.textContent = `[${time}] ${msg}`;

    row.appendChild(dot);
    row.appendChild(text);
    logEl.appendChild(row);

    if (logEl.children.length > 200) logEl.removeChild(logEl.children[0]);
    logEl.scrollTop = logEl.scrollHeight;
  }

  function showToast(text, timeout = 2000) {
    toast.textContent = text;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), timeout);
  }

  const stateObserver = new MutationObserver(() => {
    const s = wsStateEl.textContent.trim();
    log('Bridge state: ' + s, 'state');
    setBadgeClass(s);
  });
  stateObserver.observe(wsStateEl, { childList: true, subtree: true, characterData: true });

  function setBadgeClass(state) {
    const badge = wsStateEl.parentElement;
    badge.classList.remove('connecting','connected','disconnected','closed');
    if (/connect/i.test(state)) badge.classList.add('connecting');
    else if (/connected/i.test(state)) badge.classList.add('connected');
    else if (/closed/i.test(state)) badge.classList.add('closed');
    else badge.classList.add('disconnected');
  }

  closeBtn.addEventListener('click', () => {
    window.postMessage({ __bridge__: true, cmd: 'closeWs' }, '*');
    log('Requested stop polling', 'action');
    showToast('Polling stopped');
  });

  reconnectBtn.addEventListener('click', () => {
    window.postMessage({ __bridge__: true, cmd: 'reconnectWs' }, '*');
    log('Requested reconnect', 'action');
    showToast('Reconnecting...');
  });

  copyBtn.addEventListener('click', async () => {
    let apiUrl = 'http://localhost:8765/gemini';
    try {
      const config = await loadConfig();
      apiUrl = `${config.bridgeUrl || 'http://localhost:8765'}/gemini`;
    } catch (e) { /* use default */ }

    try {
      await navigator.clipboard.writeText(apiUrl);
      log('Copied API URL to clipboard: ' + apiUrl, 'action');
      showToast('API URL copied');
    } catch (e) {
      log('Failed to copy to clipboard', 'error');
      showToast('Failed to copy');
    }
  });

  if (settingsBtn) {
    settingsBtn.addEventListener('click', () => {
      chrome.tabs.create({ url: chrome.runtime.getURL('settings.html') });
    });
  }

  window.addEventListener('message', ev => {
    if (!ev.data || typeof ev.data !== 'object') return;
    const d = ev.data;
    if (d.__bridge_event__) {
      log('Bridge: ' + (d.message || JSON.stringify(d)), 'bridge');
      if (d.state) {
        wsStateEl.textContent = d.state;
      }
    }
  });

  log('Shell ready — AI Chat Bridge');
});