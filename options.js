const KNOWN_VOICES = {
  "af_alloy": "🇺🇸 Alloy",
  "af_aoede": "🇺🇸 Aoede",
  "af_bella": "🇺🇸 Bella",
  "af_heart": "🇺🇸 Heart",
  "af_jadzia": "🇺🇸 Jadzia",
  "af_jessica": "🇺🇸 Jessica",
  "af_kore": "🇺🇸 Kore",
  "af_nicole": "🇺🇸 Nicole",
  "af_nova": "🇺🇸 Nova",
  "af_river": "🇺🇸 River",
  "af_sarah": "🇺🇸 Sarah",
  "af_sky": "🇺🇸 Sky",
  "af_v0": "🇺🇸 V0",
  "af_v0bella": "🇺🇸 V0bella",
  "af_v0irulan": "🇺🇸 V0irulan",
  "af_v0nicole": "🇺🇸 V0nicole",
  "af_v0sarah": "🇺🇸 V0sarah",
  "af_v0sky": "🇺🇸 V0sky",
  "am_adam": "🇺🇸 Adam",
  "am_echo": "🇺🇸 Echo",
  "am_eric": "🇺🇸 Eric",
  "am_fenrir": "🇺🇸 Fenrir",
  "am_liam": "🇺🇸 Liam",
  "am_michael": "🇺🇸 Michael",
  "am_onyx": "🇺🇸 Onyx",
  "am_puck": "🇺🇸 Puck",
  "am_santa": "🇺🇸 Santa",
  "am_v0adam": "🇺🇸 V0adam",
  "am_v0gurney": "🇺🇸 V0gurney",
  "am_v0michael": "🇺🇸 V0michael",
  "bf_alice": "🇬🇧 Alice",
  "bf_emma": "🇬🇧 Emma",
  "bf_isabella": "🇬🇧 Isabella",
  "bf_lily": "🇬🇧 Lily",
  "bf_v0emma": "🇬🇧 V0emma",
  "bf_v0isabella": "🇬🇧 V0isabella",
  "bm_daniel": "🇬🇧 Daniel",
  "bm_fable": "🇬🇧 Fable",
  "bm_george": "🇬🇧 George",
  "bm_lewis": "🇬🇧 Lewis",
  "bm_v0george": "🇬🇧 V0george",
  "bm_v0lewis": "🇬🇧 V0lewis",
  "ef_dora": "🇪🇸 Dora",
  "em_alex": "🇪🇸 Alex",
  "em_santa": "🇪🇸 Santa",
  "ff_siwis": "🇫🇷 Siwis",
  "hf_alpha": "🇮🇳 Alpha",
  "hf_beta": "🇮🇳 Beta",
  "hm_omega": "🇮🇳 Omega",
  "hm_psi": "🇮🇳 Psi",
  "if_sara": "🇮🇹 Sara",
  "im_nicola": "🇮🇹 Nicola",
  "jf_alpha": "🇯🇵 Alpha",
  "jf_gongitsune": "🇯🇵 Gongitsune",
  "jf_nezumi": "🇯🇵 Nezumi",
  "jf_tebukuro": "🇯🇵 Tebukuro",
  "jm_kumo": "🇯🇵 Kumo",
  "pf_dora": "🇧🇷 Dora",
  "pm_alex": "🇧🇷 Alex",
  "pm_santa": "🇧🇷 Santa",
  "zf_xiaobei": "🇨🇳 Xiaobei",
  "zf_xiaoni": "🇨🇳 Xiaoni",
  "zf_xiaoxiao": "🇨🇳 Xiaoxiao",
  "zf_xiaoyi": "🇨🇳 Xiaoyi",
  "zm_yunjian": "🇨🇳 Yunjian",
  "zm_yunxi": "🇨🇳 Yunxi",
  "zm_yunxia": "🇨🇳 Yunxia",
  "zm_yunyang": "🇨🇳 Yunyang"
};

async function fetchVoices() {
  const voiceSelect = document.getElementById('voice');
  const serverUrlInput = document.getElementById('serverUrl');
  let voicesUrl = serverUrlInput.value;
  
  if (voicesUrl.endsWith('/speech')) {
    voicesUrl = voicesUrl.replace('/speech', '/voices');
  }
  
  voiceSelect.disabled = true;
  
  try {
    const response = await fetch(voicesUrl);
    if (!response.ok) throw new Error('Network response was not ok');
    const data = await response.json();
    
    let voicesList = [];
    if (data.voices && Array.isArray(data.voices)) {
      voicesList = data.voices;
    } else if (Array.isArray(data)) {
      voicesList = data;
    } else if (data.data && Array.isArray(data.data)) {
      voicesList = data.data; // standard OpenAI returns list in .data
    }
    
    if (voicesList.length > 0) {
        voiceSelect.innerHTML = '';
        voicesList.forEach(voice => {
            const option = document.createElement('option');
            let voiceId = typeof voice === 'string' ? voice : (voice.id || voice.name || JSON.stringify(voice));
            let voiceName = KNOWN_VOICES[voiceId] || voiceId;
            
            option.value = voiceId;
            option.textContent = voiceName;
            voiceSelect.appendChild(option);
        });
        
        chrome.storage.local.get(DEFAULT_SETTINGS, function(result) {
          if (Array.from(voiceSelect.options).some(opt => opt.value === result.voice)) {
            voiceSelect.value = result.voice;
          } else if (voiceSelect.options.length > 0) {
            voiceSelect.value = voiceSelect.options[0].value;
            saveSettings();
          }
        });
        
        voiceSelect.disabled = false;
    }
  } catch (error) {
    console.error('Failed to fetch voices:', error);
    voiceSelect.innerHTML = '<option value="">Failed to connect to TTS Server</option>';
  }
}

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
    
    fetchVoices();
  });
  
  // Save settings on change
  ['voice', 'speed', 'preprocessText', 'maxReadLength', 'clickToRead', 'autoScroll', 'highlightColor', 'recordAudio'].forEach(id => {
    document.getElementById(id).addEventListener('change', saveSettings);
  });
  
  document.getElementById('serverUrl').addEventListener('change', () => {
    saveSettings();
    fetchVoices();
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
