# Local TTS Reader - Chrome Extension

A sleek Chrome extension that converts webpage text to speech using a local OpenAI-compatible TTS server. Features include voice selection, speed control, and the ability to save audio files.


## Features

- 🎯 Read selected text or entire webpage
- 🖍️ Live text highlighting while reading
- 🎭 Multiple voice options compatible with OpenAI voice mappings
- ⚡ Adjustable playback speed (0.25x to 4.0x)
- 💾 Option to save audio for download
- ⏯️ Play/Pause/Stop/Seek controls
- 🎨 Clean, modern interface with Light and Dark mode support
- 🌍 Internationalization (i18n) support (English and Brazilian Portuguese)
- 🔧 Configurable server URL
- 🌐 Works with Tailscale/local network TTS servers

## Installation

1. Clone this repository:
```bash
git clone https://github.com/phildougherty/local_tts_reader.git
```

2. Load the extension in Chrome:
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable "Developer mode" in the top right
   - Click "Load unpacked"
   - Select the cloned repository folder

## Usage

1. Click the extension icon in your Chrome toolbar
2. Configure your settings:
   - Select your preferred voice
   - Adjust the playback speed using the slider
   - Check "Save audio for download" if you want to download the audio
   - Enter your local TTS server URL

3. On any webpage:
   - Select specific text to read just that portion
   - Or don't select anything to read the entire page
   - Click play to start TTS
   - Use pause/stop controls as needed
   - Download the audio if recording was enabled

## Voice Options

The extension supports the following voices:
- Adam (Alloy) - `am_adam`
- Nicole (Ash) - `af_nicole`
- Emma (Coral) - `bf_emma`
- Bella (Echo) - `af_bella`
- Sarah (Fable) - `af_sarah`
- George (Onyx) - `bm_george`
- Isabella (Nova) - `bf_isabella`
- Michael (Sage) - `am_michael`
- Sky (Shimmer) - `af_sky`
- Doralice (Dora) - `pf_dora`
- Alexandre (Alex) - `pm_alex`
- Papai Noel (Santa) - `pm_santa`

## Server Requirements

Your local TTS server should:
- Be OpenAI API compatible
- Accept POST requests to `/v1/audio/speech`
- Accept JSON payload in the format:
\\```json
{
  "model": "tts-1",
  "voice": "af_bella",
  "input": "text to speak",
  "speed": 1.0
}
\\```
- Return audio data (mp3/wav)

Default server URL: `http://localhost:8000/v1/audio/speech`

## Development

The extension uses a modern architecture with a service worker and offscreen document for reliable audio playback:
- `manifest.json`: Extension configuration
- `popup.html` & `popup.js`: UI layout and popup functionality
- `options.html` & `options.js`: Extension settings page
- `background.js`: Service worker for text extraction and state management
- `offscreen.html`, `offscreen.js`, & `audioPlayer.js`: Reliable audio playback engine
- `textProcessor.js`: Text chunking and sentence boundary detection
- `_locales/`: Localization files for internationalization (i18n)

To modify the extension:
1. Make your changes
2. Reload the extension in `chrome://extensions/`
3. Click the refresh icon on the extension card

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

Distributed under the MIT
