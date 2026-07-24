function getSettings() {
  return {
    serverUrl: document.getElementById('serverUrl').value,
    voice: document.getElementById('voice').value,
    speed: parseFloat(document.getElementById('speed').value),
    recordAudio: document.getElementById('recordAudio').checked,
    preprocessText: document.getElementById('preprocessText').checked,
    maxReadLength: parseInt(document.getElementById('maxReadLength').value, 10),
    clickToRead: document.getElementById('clickToRead').checked,
    autoScroll: document.getElementById('autoScroll').checked,
    highlightColor: document.getElementById('highlightColor').value
  };
}

async function saveSettings() {
  const settings = getSettings();
  await chrome.storage.local.set(settings);
}

document.addEventListener('DOMContentLoaded', function() {
  // Localize UI
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const msg = chrome.i18n.getMessage(el.getAttribute('data-i18n'));
    if (msg) {
      if (el.tagName === 'TITLE' || el.tagName === 'SPAN' || el.tagName === 'DIV' || el.tagName === 'BUTTON') {
        el.innerHTML = msg;
      } else {
        el.textContent = msg;
      }
    }
  });

  // Load saved settings
  chrome.storage.local.get(DEFAULT_SETTINGS, function(result) {
    document.getElementById('serverUrl').value = result.serverUrl;
    document.getElementById('voice').value = result.voice;
    document.getElementById('speed').value = result.speed;
    document.getElementById('speedValue').textContent = `${Number(result.speed).toFixed(2)}x`;
    document.getElementById('recordAudio').checked = result.recordAudio;
    document.getElementById('preprocessText').checked = result.preprocessText;
    
    document.getElementById('maxReadLength').value = result.maxReadLength;
    document.getElementById('maxLengthValue').textContent = result.maxReadLength;
    document.getElementById('clickToRead').checked = result.clickToRead;
    document.getElementById('autoScroll').checked = result.autoScroll;
    document.getElementById('highlightColor').value = result.highlightColor;
  });
  
  // Save settings on change
  ['serverUrl', 'voice', 'speed', 'preprocessText', 'maxReadLength', 'clickToRead', 'autoScroll', 'highlightColor', 'recordAudio'].forEach(id => {
    document.getElementById(id).addEventListener('change', saveSettings);
  });
  
  // Real-time update for the slider text
  document.getElementById('maxReadLength').addEventListener('input', function(e) {
    document.getElementById('maxLengthValue').textContent = e.target.value;
  });

  // Real-time update for the speed slider text
  document.getElementById('speed').addEventListener('input', function(e) {
    document.getElementById('speedValue').textContent = `${Number(e.target.value).toFixed(2)}x`;
  });
});
