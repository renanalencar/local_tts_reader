const audioElement = document.getElementById('audioElement');
let audioQueue = [];
let isPlayingQueue = false;

// Create a silent audio element to keep the offscreen document alive indefinitely
const silentAudio = new Audio('data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA');
silentAudio.loop = true;
silentAudio.volume = 0;
silentAudio.play().catch(e => console.warn('Could not play silent audio:', e));

// Process audio data received from background script
async function processAudioData(base64Audio, mimeType, isRecording, forDownloadOnly = false, chunkText = null) {
  try {
    // Native, highly optimized async conversion from base64 to Blob
    const dataUrl = `data:${mimeType};base64,${base64Audio}`;
    const response = await fetch(dataUrl);
    const blob = await response.blob();

    // Create URL for the blob
    const audioUrl = URL.createObjectURL(blob);

    // If recording is enabled or this is the final merged file, send URL back for download
    if (isRecording) {
      chrome.runtime.sendMessage({
        type: 'recordingComplete',
        audioUrl: audioUrl
      });
    }

    if (forDownloadOnly) {
      return; // Do not play this one
    }

    // Queue for playback
    audioQueue.push({ url: audioUrl, text: chunkText });
    if (!isPlayingQueue) {
      playNextInQueue();
    }

    // Notify that audio is ready to play
    chrome.runtime.sendMessage({ type: 'audioReady' });
    
    // Check if we need more chunks to buffer
    checkQueueAndRequestNext();
  } catch (error) {
    console.error('Error processing audio data:', error);
    chrome.runtime.sendMessage({
      type: 'streamError',
      error: error.message
    });
  }
}

function checkQueueAndRequestNext() {
  if (audioQueue.length < 2) {
    chrome.runtime.sendMessage({ type: 'requestNextChunk' });
  }
}

function playNextInQueue() {
  if (audioQueue.length === 0) {
    isPlayingQueue = false;
    chrome.runtime.sendMessage({ type: 'stateUpdate', state: 'stopped' });
    return;
  }
  
  isPlayingQueue = true;
  const item = audioQueue.shift();
  
  if (item.text) {
    chrome.runtime.sendMessage({ type: 'chunkPlaying', text: item.text });
  }
  
  playAudioUrl(item.url);
}

// Play audio from URL
function playAudioUrl(audioUrl) {
  try {
    console.log('Playing audio URL:', audioUrl);

    // Set up audio element
    audioElement.src = audioUrl;

    // Start playing
    audioElement.play().catch(err => {
      console.error('Play error:', err);
      chrome.runtime.sendMessage({
        type: 'streamError',
        error: err.message
      });
    });
  } catch (error) {
    console.error('Error playing audio URL:', error);
    chrome.runtime.sendMessage({
      type: 'streamError',
      error: error.message
    });
  }
}

// Get current time and duration
function getTimeInfo() {
  return {
    currentTime: audioElement.currentTime,
    duration: audioElement.duration
  };
}

// Seek to a specific time
function seekTo(time) {
  audioElement.currentTime = time;
}

// Handle messages from the background script
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  console.log('Offscreen received message:', message.type);

  switch (message.type) {
    case 'processAudioData':
      if (message.audioData) {
        processAudioData(message.audioData, message.mimeType, message.isRecording, message.forDownloadOnly, message.chunkText);
      }
      sendResponse({ success: true });
      return true;

    case 'play':
      audioElement.play();
      break;

    case 'pause':
      audioElement.pause();
      break;

    case 'stop':
      audioQueue = []; // Clear the queue
      isPlayingQueue = false;
      audioElement.pause();
      audioElement.currentTime = 0;
      chrome.runtime.sendMessage({ type: 'stateUpdate', state: 'stopped' });
      break;

    case 'playUrl':
      audioQueue = [];
      isPlayingQueue = false;
      audioElement.src = message.data.url;
      audioElement.play().catch(console.error);
      chrome.runtime.sendMessage({ type: 'stateUpdate', state: 'playing' });
      break;

    case 'seek': {
      seekTo(message.time);
      return true;
    }
    case 'getTimeInfo':
      sendResponse({ timeInfo: getTimeInfo() });
      return true;
  }
});

// Initialize audio event handlers
audioElement.onplay = () => {
  chrome.runtime.sendMessage({ type: 'stateUpdate', state: 'playing' });
};

audioElement.onpause = () => {
  // Only send pause state if we aren't about to play the next chunk
  if (audioQueue.length === 0 || !isPlayingQueue) {
    chrome.runtime.sendMessage({ type: 'stateUpdate', state: 'paused' });
  }
};

audioElement.onended = () => {
  // Play the next chunk in the queue
  playNextInQueue();
  
  // Check if we need more chunks to buffer
  checkQueueAndRequestNext();
};

// Add timeupdate event for seeking
audioElement.ontimeupdate = () => {
  chrome.runtime.sendMessage({
    type: 'timeUpdate',
    timeInfo: {
      currentTime: audioElement?.currentTime ?? 0,
      duration: audioElement?.duration ?? 0
    }
  });
};

// Keep the service worker alive during long fetches
setInterval(() => {
  chrome.runtime.sendMessage({ type: 'keepAlive' }).catch(() => {});
}, 10000);
