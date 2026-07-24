let audioPlayer = null;
let currentAudioUrl = null;
let isGenerating = false;
let cachedSettings = { ...DEFAULT_SETTINGS };

chrome.storage.local.get(DEFAULT_SETTINGS, (result) => {
  cachedSettings = result;
});

chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local') {
    for (let [key, { newValue }] of Object.entries(changes)) {
      cachedSettings[key] = newValue !== undefined ? newValue : DEFAULT_SETTINGS[key];
    }
    syncPlayerState();
  }
});

function updateStatus(message, isError = false) {
  const statusBtn = document.getElementById('statusBtn');
  if (statusBtn) {
    statusBtn.innerHTML = message;
    if (isError) {
      statusBtn.classList.add('error');
    } else {
      statusBtn.classList.remove('error');
    }
  }
}

function showAudioWave() {
  return `
    <div class="audio-wave">
      <div></div><div></div><div></div><div></div>
      <div></div><div></div><div></div>
    </div>
  `;
}

function updateControlButtons(state) {
  const playBtn = document.getElementById('playBtn');
  const pauseBtn = document.getElementById('pauseBtn');
  const stopBtn = document.getElementById('stopBtn');
  const downloadBtn = document.getElementById('downloadBtn');
  const loadingIndicator = document.getElementById('loadingIndicator');
  const seekBar = document.getElementById('seekBar');
  
  const statusBtn = document.getElementById('statusBtn');
  
  // Hide loading indicator by default
  if (loadingIndicator) loadingIndicator.style.display = 'none';
  
  // Stop button is always enabled (except during loading)
  if (stopBtn) stopBtn.disabled = state === 'loading';
  
  // Determine if download button should be enabled
  const isRecordEnabled = cachedSettings.recordAudio;
  const canDownload = currentAudioUrl && isRecordEnabled;

  if (state === 'loading') {
    if (playBtn) playBtn.disabled = true;
    if (pauseBtn) pauseBtn.disabled = true;
    if (downloadBtn) downloadBtn.disabled = true;
    if (seekBar) seekBar.disabled = true;
    if (loadingIndicator) loadingIndicator.style.display = 'flex';
    if (statusBtn) statusBtn.innerHTML = showAudioWave();
  } else if (state === 'ready') {
    if (playBtn) playBtn.disabled = false;
    if (pauseBtn) pauseBtn.disabled = true;
    if (downloadBtn) downloadBtn.disabled = !canDownload;
    if (seekBar) seekBar.disabled = false;
  } else if (state === 'playing') {
    if (playBtn) playBtn.disabled = true;
    if (pauseBtn) pauseBtn.disabled = false;
    if (downloadBtn) downloadBtn.disabled = !canDownload;
    if (seekBar) seekBar.disabled = false;
    if (statusBtn) statusBtn.innerHTML = showAudioWave();
  } else if (state === 'paused') {
    if (playBtn) playBtn.disabled = false;
    if (pauseBtn) pauseBtn.disabled = true;
    if (downloadBtn) downloadBtn.disabled = !canDownload;
    if (seekBar) seekBar.disabled = false;
    if (statusBtn) statusBtn.innerHTML = chrome.i18n.getMessage("pausedStatus") || 'PAUSED';
  } else if (state === 'stopped') {
    if (playBtn) playBtn.disabled = false;
    if (pauseBtn) pauseBtn.disabled = true;
    if (downloadBtn) downloadBtn.disabled = !canDownload;
    if (seekBar) {
      seekBar.disabled = true;
      seekBar.value = 0;
    }
    const curTime = document.getElementById('currentTime');
    const dur = document.getElementById('duration');
    if (curTime) curTime.textContent = '0:00';
    if (dur) dur.textContent = '0:00';
    if (statusBtn) updateStatus(chrome.i18n.getMessage("readBtn") || 'READ', false);
    isGenerating = false;
  } else {
    if (playBtn) playBtn.disabled = false;
    if (pauseBtn) pauseBtn.disabled = true;
    if (downloadBtn) downloadBtn.disabled = true;
    if (seekBar) seekBar.disabled = true;
  }
}

// Format time in seconds to MM:SS format
function formatTime(seconds) {
  if (isNaN(seconds)) return '0:00';
  
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

// Sync player state when popup opens
async function syncPlayerState() {
  if (audioPlayer) {
    const state = await audioPlayer.getState();
    updateControlButtons(state);
    
    // Also sync the seek bar
    const timeInfo = await audioPlayer.getTimeInfo();
    if (timeInfo) {
      const seekBar = document.getElementById('seekBar');
      if (seekBar) {
        seekBar.max = timeInfo.duration;
        seekBar.value = timeInfo.currentTime;
      }
      const curTime = document.getElementById('currentTime');
      const dur = document.getElementById('duration');
      if (curTime) curTime.textContent = formatTime(timeInfo.currentTime);
      if (dur) dur.textContent = formatTime(timeInfo.duration);
    }
  }
}

// Update seek bar periodically
function startSeekBarUpdates() {
  const updateInterval = setInterval(async () => {
    if (!audioPlayer) return;
    
    const state = await audioPlayer.getState();
    if (state !== 'playing' && state !== 'paused') {
      clearInterval(updateInterval);
      return;
    }
    
    const timeInfo = await audioPlayer.getTimeInfo();
    if (timeInfo) {
      const seekBar = document.getElementById('seekBar');
      if (seekBar && !seekBar.classList.contains('seeking')) {
        seekBar.max = timeInfo.duration;
        seekBar.value = timeInfo.currentTime;
        const curTime = document.getElementById('currentTime');
        const dur = document.getElementById('duration');
        if (curTime) curTime.textContent = formatTime(timeInfo.currentTime);
        if (dur) dur.textContent = formatTime(timeInfo.duration);
      }
    }
  }, 1000);
  
  return updateInterval;
}

// Process text based on settings
function processText(text, settings) {
  if (settings.preprocessText) {
    return TextProcessor.process(text);
  }
  return text;
}

document.addEventListener('DOMContentLoaded', async function() {
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
  
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    const msg = chrome.i18n.getMessage(el.getAttribute('data-i18n-title'));
    if (msg) el.title = msg;
  });

  // Initialize audio player
  audioPlayer = new AudioPlayer();
  await audioPlayer.init();
  
  // Open Settings Page
  const settingsBtn = document.getElementById('settingsBtn');
  if (settingsBtn) {
    settingsBtn.addEventListener('click', () => {
      chrome.runtime.openOptionsPage();
    });
  }

  // Sync player state
  syncPlayerState();
  
  // Start seek bar updates
  let updateInterval = startSeekBarUpdates();
  
  // Set up seek bar events
  const seekBar = document.getElementById('seekBar');
  if (seekBar) {
    // When user starts seeking
    seekBar.addEventListener('mousedown', function() {
      seekBar.classList.add('seeking');
    });
    
    // When user is seeking
    seekBar.addEventListener('input', function() {
      document.getElementById('currentTime').textContent = formatTime(seekBar.value);
    });
    
    // When user finishes seeking
    seekBar.addEventListener('change', async function() {
      const newTime = parseFloat(seekBar.value);
      await audioPlayer.seek(newTime);
      seekBar.classList.remove('seeking');
    });
  }

  // Status button (Read/Stop)
  const statusBtn = document.getElementById('statusBtn');
  if (statusBtn) {
    statusBtn.addEventListener('click', async function() {
      try {
        const state = await audioPlayer.getState();
        
        if (state === 'playing') {
          audioPlayer.pause();
          updateControlButtons('paused');
        } else if (state === 'paused') {
          audioPlayer.resume();
          updateControlButtons('playing');
          if (updateInterval) clearInterval(updateInterval);
          updateInterval = startSeekBarUpdates();
        } else if (state === 'loading') {
          // Stop current loading/generation
          isGenerating = false;
          audioPlayer.stop();
          updateControlButtons('stopped');
          if (updateInterval) {
            clearInterval(updateInterval);
            updateInterval = null;
          }
        } else {
          // Start reading
          isGenerating = true;
          const tabs = await chrome.tabs.query({active: true, currentWindow: true});
          const [tab] = tabs;
          const result = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            function: () => {
              const selection = window.getSelection();
              return selection.toString().trim() || document.body.innerText;
            },
          });

          let text = result[0].result;
          
          // Process text if enabled
          text = processText(text, cachedSettings);
          
          updateControlButtons('loading');
          await audioPlayer.play(text, cachedSettings, tab.id);
          
          // Restart seek bar updates
          if (updateInterval) clearInterval(updateInterval);
          updateInterval = startSeekBarUpdates();
        }
      } catch (error) {
        console.error('Error:', error);
        updateStatus(error.message || chrome.i18n.getMessage("errorOccurred") || 'An error occurred', true);
        updateControlButtons('stopped');
      }
    });
  }

  // Play button (Resume)
  const playBtn = document.getElementById('playBtn');
  if (playBtn) {
    playBtn.addEventListener('click', async function() {
      try {
        const state = await audioPlayer.getState();
        
        if (state === 'paused' || state === 'ready') {
          audioPlayer.resume();
          updateControlButtons('playing');
          
          // Restart seek bar updates
          if (updateInterval) clearInterval(updateInterval);
          updateInterval = startSeekBarUpdates();
        } else if (state === 'stopped' && currentAudioUrl && !isGenerating) {
          chrome.runtime.sendMessage({
            type: 'controlAudio',
            action: 'playUrl',
            data: { url: currentAudioUrl }
          });
          updateControlButtons('playing');
          if (updateInterval) clearInterval(updateInterval);
          updateInterval = startSeekBarUpdates();
        }
      } catch (error) {
        console.error('Error:', error);
      }
    });
  }
  
  // Pause button
  const pauseBtn = document.getElementById('pauseBtn');
  if (pauseBtn) {
    pauseBtn.addEventListener('click', function() {
      audioPlayer.pause();
      updateControlButtons('paused');
    });
  }
  
  // Stop button
  const stopBtn = document.getElementById('stopBtn');
  if (stopBtn) {
    stopBtn.addEventListener('click', function() {
      audioPlayer.stop();
      updateControlButtons('stopped');
      if (updateInterval) {
        clearInterval(updateInterval);
        updateInterval = null;
      }
    });
  }
  
  // Download button
  const downloadBtn = document.getElementById('downloadBtn');
  if (downloadBtn) {
    downloadBtn.addEventListener('click', function() {
      if (currentAudioUrl) {
        const a = document.createElement('a');
        a.href = currentAudioUrl;
        a.download = 'speech.mp3';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        updateStatus(chrome.i18n.getMessage("audioDownloaded") || 'Audio downloaded', false);
      }
    });
  }

  // Listen for messages from background script
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.type) {
      case 'playerStateUpdate':
        updateControlButtons(message.state);
        if (message.state === 'playing' && !updateInterval) {
          updateInterval = startSeekBarUpdates();
        }
        break;
        
      case 'recordingComplete':
        currentAudioUrl = message.audioUrl;
        break;
        
      case 'streamFinished':
        // Backend finished generating all chunks
        isGenerating = false;
        const statusBtnEl = document.getElementById('statusBtn');
        const dBtn = document.getElementById('downloadBtn');
        const isRecordEnabled = cachedSettings.recordAudio;
        if (statusBtnEl) statusBtnEl.innerHTML = chrome.i18n.getMessage("readBtn") || 'READ';
        if (dBtn && currentAudioUrl && isRecordEnabled) dBtn.disabled = false;
        break;
        
      case 'streamError':
        isGenerating = false;
        updateStatus(message.error || chrome.i18n.getMessage("streamErrorOccurred") || 'Stream error occurred', true);
        updateControlButtons('stopped');
        break;
        
      case 'timeUpdate':
        const sb = document.getElementById('seekBar');
        if (message.timeInfo && sb && !sb.classList.contains('seeking')) {
          sb.max = message.timeInfo.duration;
          sb.value = message.timeInfo.currentTime;
          const cur = document.getElementById('currentTime');
          const dur = document.getElementById('duration');
          if (cur) cur.textContent = formatTime(message.timeInfo.currentTime);
          if (dur) dur.textContent = formatTime(message.timeInfo.duration);
        }
        break;
    }
  });
});