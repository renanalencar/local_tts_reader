const DEFAULT_SETTINGS = {
    serverUrl: 'http://localhost:8880/v1/audio/speech',
    voice: 'af_bella',
    speed: 1.0,
    recordAudio: false,
    preprocessText: true,
    maxReadLength: 350,
    clickToRead: true,
    autoScroll: true,
    highlightColor: '#3bc6ad'
  };
  
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { DEFAULT_SETTINGS };
  } else {
    self.DEFAULT_SETTINGS = DEFAULT_SETTINGS;
  }