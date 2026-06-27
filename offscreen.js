let audioSourceNode = null;
const audioContext = new (globalThis.AudioContext || globalThis.webkitAudioContext)();

function setupAudioNode(context, audioElement) {
  // If it already exists, just return the existing node
  if (audioSourceNode) {
    return audioSourceNode;
  }

  // Otherwise, create it and store it
  audioSourceNode = context.createMediaElementSource(audioElement);
  return audioSourceNode;
}

// Initialize the audio context
function initAudio() {
  const audioElement = document.getElementById('audioElement');
  // Set up event listeners
  audioElement.onplay = () => {
    const sourceNode = setupAudioNode(audioContext, audioElement);
    sourceNode.connect(audioContext.destination);

    chrome.runtime.sendMessage({ type: 'stateUpdate', state: 'playing' });
  };

  audioElement.onpause = () => {
    chrome.runtime.sendMessage({ type: 'stateUpdate', state: 'paused' });
  };

  audioElement.onended = () => {
    chrome.runtime.sendMessage({ type: 'stateUpdate', state: 'stopped' });
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
}

// Process audio data received from background script
function processAudioData(audioDataArray, mimeType, isRecording) {
  try {
    initAudio();

    // Convert array back to Uint8Array
    const uint8Array = new Uint8Array(audioDataArray);

    // Create blob from the array
    const blob = new Blob([uint8Array], { type: mimeType });

    // Create URL for the blob
    const audioUrl = URL.createObjectURL(blob);

    // If recording is enabled, send URL back for download
    if (isRecording) {
      chrome.runtime.sendMessage({
        type: 'recordingComplete',
        audioUrl: audioUrl
      });
    }

    // Play the audio
    playAudioUrl(audioUrl);

    // Notify that audio is ready to play
    chrome.runtime.sendMessage({ type: 'audioReady' });
  } catch (error) {
    console.error('Error processing audio data:', error);
    chrome.runtime.sendMessage({
      type: 'streamError',
      error: error.message
    });
  }
}

// Play audio from URL
function playAudioUrl(audioUrl) {
  const audioElement = document.getElementById('audioElement');
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
  const audioElement = document.getElementById('audioElement');
  return {
    currentTime: audioElement.currentTime,
    duration: audioElement.duration
  };
}

// Seek to a specific time
function seekTo(time) {
  const audioElement = document.getElementById('audioElement');
  audioElement.currentTime = time;
}

// Handle messages from the background script
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  console.log('Offscreen received message:', message.type);
  const audioElement = document.getElementById('audioElement');

  switch (message.type) {
    case 'processAudioData':
      if (message.audioData) {
        processAudioData(message.audioData, message.mimeType, message.isRecording);
      }
      break;

    case 'play':
      audioElement.play();
      break;

    case 'pause':
      audioElement.pause();
      break;

    case 'stop':
      audioElement.pause();
      audioElement.currentTime = 0;
      chrome.runtime.sendMessage({ type: 'stateUpdate', state: 'stopped' });
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

// Initialize when the document loads
document.addEventListener('DOMContentLoaded', () => {
  console.log('Offscreen document loaded');

  // Initialize audio context
  initAudio();

  console.log('Offscreen document initialized');
});