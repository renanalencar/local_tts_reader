importScripts('textProcessor.js');

let isRecording = false;
let currentPlayerState = 'stopped';
let creating = null; // A global promise to avoid concurrency issues
let streamingAbortController = null;
let isStreaming = false;

// JIT state variables
let pendingChunks = [];
let currentChunkIndex = 0;
let streamingSettings = null;
let savedAudioBuffers = [];
let mimeTypeToSave = 'audio/mpeg';
let isFetchingChunk = false;
let streamingTabId = null;

async function setupOffscreenDocument() {
  // Check all windows controlled by the service worker to see if one
  // of them is the offscreen document with the given path
  const path = './offscreen.html';
  const offscreenUrl = chrome.runtime.getURL(path);
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [offscreenUrl],
  });

  if (existingContexts.length > 0) {
    return;
  }

  // create offscreen document
  if (creating) {
    await creating;
  } else {
    creating = chrome.offscreen.createDocument({
      url: path,
      reasons: ['AUDIO_PLAYBACK'],
      justification: 'Playing TTS audio in the background'
    });
    await creating;
    creating = null;
  }
}

// Fast Base64 conversion avoiding byte-by-byte loops
function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

// Set up context menu items
function setupContextMenu() {
  chrome.contextMenus.create({
    id: "readAloud",
    title: chrome.i18n.getMessage("contextMenuReadAloud") || "Read Aloud",
    contexts: ["selection", "page"]
  });
}

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "readAloud") {
    let text = info.selectionText;
    let frameId = info.frameId || 0;

    if (!text) {
      // If no text is selected, read from the clicked element onwards
      chrome.scripting.executeScript({
        target: { tabId: tab?.id, frameIds: [frameId] },
        function: () => {
          const startNode = window.ttsLastRightClickedElement;
          if (startNode) {
            try {
              const range = document.createRange();
              range.setStartBefore(startNode);
              const lastChild = document.body.lastChild || document.body;
              range.setEndAfter(lastChild);
              
              const selection = window.getSelection();
              selection.removeAllRanges();
              selection.addRange(range);
              const extractedText = selection.toString();
              selection.removeAllRanges();
              
              if (extractedText && extractedText.trim()) {
                return extractedText;
              }
            } catch (e) {
              console.error('Error extracting text from clicked element', e);
            }
          }
          return document.body.innerText;
        }
      }).then(results => {
        if (results && results[0] && results[0].result) {
          processAndReadText(results[0].result, tab.id);
        }
      });
    } else {
      // Use the selected text
      processAndReadText(text, tab.id);
    }
  }
});

// Process and read text with default settings
async function processAndReadText(text, tabId) {
  try {
    // Get default settings
    const settings = await chrome.storage.local.get({
      serverUrl: 'http://localhost:8880/v1/audio/speech',
      voice: 'af_bella',
      speed: 1.0,
      recordAudio: false,
      preprocessText: true
    });

    // Set state to loading
    currentPlayerState = 'loading';
    chrome.runtime.sendMessage({
      type: 'playerStateUpdate',
      state: 'loading'
    });

    // Start streaming audio
    startStreamingAudio(text, settings, tabId);
  } catch (error) {
    console.error('Error in processAndReadText:', error);
    chrome.runtime.sendMessage({
      type: 'streamError',
      error: error.message
    });
  }
}

// Handle messages from popup or offscreen document
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  switch (message.type) {
    case 'setupOffscreen':
      setupOffscreenDocument().then(() => sendResponse({ success: true }));
      return true;

    case 'startStreaming':
      isRecording = message.record;
      // Set state to loading before starting the audio stream
      currentPlayerState = 'loading';
      chrome.runtime.sendMessage({
        type: 'playerStateUpdate',
        state: 'loading'
      });
      startStreamingAudio(message.text, message.settings, message.tabId);
      sendResponse({ success: true });
      return true;

    case 'controlAudio':
      if (message.action === 'stop') {
        isStreaming = false;
        if (streamingAbortController) {
          streamingAbortController.abort();
        }
      }
      chrome.runtime.sendMessage({
        type: message.action,
        data: message.data
      });
      return true;

    case 'stop':
      isStreaming = false;
      if (streamingAbortController) {
        streamingAbortController.abort();
      }
      return true;

    case 'stateUpdate':
      currentPlayerState = message.state;
      chrome.runtime.sendMessage({
        type: 'playerStateUpdate',
        state: message.state
      });
      if (message.state === 'stopped') {
        highlightChunkInTab(null, true);
      }
      return true;

    case 'audioReady':
      // Audio is ready but not yet playing
      if (currentPlayerState === 'loading') {
        currentPlayerState = 'ready';
        chrome.runtime.sendMessage({
          type: 'playerStateUpdate',
          state: 'ready'
        });
      }
      return true;

    case 'getPlayerState':
      sendResponse({ state: currentPlayerState });
      return true;

    case 'seek':
      chrome.runtime.sendMessage({
        type: 'seek',
        time: message.time
      }, (response) => {
        sendResponse(response);
      });
      return true;

    case 'getTimeInfo':
      chrome.runtime.sendMessage({
        type: 'getTimeInfo'
      }).then((response) => {
        sendResponse(response);
      });
      return true;

    case 'timeUpdate':
      // Forward time updates to the popup
      chrome.runtime.sendMessage(message);
      return true;
      
    case 'chunkPlaying':
      highlightChunkInTab(message.text, false);
      return true;
      
    case 'requestNextChunk':
      console.log('[background] Received requestNextChunk from offscreen');
      fetchNextChunk();
      return true;
      
    case 'keepAlive':
      // Just keep the service worker alive
      sendResponse({ status: 'alive' });
      return true;
  }
});

// Start streaming audio from the TTS server
async function startStreamingAudio(text, settings, tabId) {
  isStreaming = true;
  streamingTabId = tabId || null;
  if (streamingAbortController) {
    streamingAbortController.abort();
  }
  streamingAbortController = new AbortController();

  try {
    await setupOffscreenDocument();
    
    // Clear previous highlight
    highlightChunkInTab(null, true);

    console.log(`[background] Starting audio stream for text of length: ${text.length}`);
    pendingChunks = splitText(text);
    console.log(`[background] Text split into ${pendingChunks.length} chunks`);
    if (pendingChunks.length > 0) {
      console.log(`[background] Chunk 0 length: ${pendingChunks[0].length}`);
    }

    currentChunkIndex = 0;
    streamingSettings = settings;
    savedAudioBuffers = [];
    mimeTypeToSave = 'audio/mpeg';
    isFetchingChunk = false;

    // Start fetching the first chunk
    fetchNextChunk();

  } catch (error) {
    console.error('Error starting stream:', error);
    chrome.runtime.sendMessage({
      type: 'streamError',
      error: error.message
    });

    currentPlayerState = 'stopped';
    chrome.runtime.sendMessage({
      type: 'playerStateUpdate',
      state: 'stopped'
    });
  }
}

async function fetchNextChunk() {
  console.log(`[background] fetchNextChunk called. Index: ${currentChunkIndex}/${pendingChunks.length}. isFetching: ${isFetchingChunk}, isStreaming: ${isStreaming}`);
  if (!isStreaming || !streamingAbortController || streamingAbortController.signal.aborted) {
    console.log('[background] fetchNextChunk aborted because not streaming or signal aborted.');
    return;
  }
  
  if (currentChunkIndex >= pendingChunks.length) {
    console.log('[background] Finished all chunks!');
    // Let the popup know generation is fully complete
    chrome.runtime.sendMessage({ type: 'streamFinished' });
    
    // Always merge and send to offscreen for replay/download support
    if (savedAudioBuffers.length > 0) {
      const totalLength = savedAudioBuffers.reduce((acc, val) => acc + val.byteLength, 0);
      const merged = new Uint8Array(totalLength);
      let offset = 0;
      for (const buffer of savedAudioBuffers) {
        merged.set(new Uint8Array(buffer), offset);
        offset += buffer.byteLength;
      }
      
      const base64Audio = arrayBufferToBase64(merged.buffer);
      
      chrome.runtime.sendMessage({
        type: 'processAudioData',
        audioData: base64Audio,
        mimeType: mimeTypeToSave,
        isRecording: true, // We spoof this so offscreen.js handles it as a full recording
        forDownloadOnly: true
      });
      // Clear buffers after sending to free memory
      savedAudioBuffers = [];
    }
    return;
  }

  if (isFetchingChunk) {
    console.log('[background] fetchNextChunk ignored - already fetching a chunk.');
    return; // Prevent concurrent fetching
  }
  
  isFetchingChunk = true;
  const chunkIndex = currentChunkIndex;
  currentChunkIndex++;
  const chunk = pendingChunks[chunkIndex];
  const signal = streamingAbortController.signal;
  
  console.log(`[background] Fetching chunk ${chunkIndex} (length: ${chunk?.length || 0})`);

  try {
    if (!chunk) {
      isFetchingChunk = false;
      return fetchNextChunk();
    }

    let response;
    let retries = 5;
    
    while (retries > 0) {
      try {
        let processedChunk = chunk;
        if (streamingSettings.preprocessText) {
          processedChunk = TextProcessor.process(chunk);
        }

        response = await fetch(streamingSettings.serverUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'audio/mpeg, audio/wav, audio/*'
          },
          body: JSON.stringify({
            model: 'tts-1',
            voice: streamingSettings.voice,
            input: processedChunk,
            speed: Number.parseFloat(streamingSettings.speed)
          }),
          signal: signal
        });
        
        if (!response.ok) {
          // It's an actual error response from the backend. Do not retry.
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        // If we get here, it succeeded!
        break;
      } catch (error) {
        if (error.name === 'AbortError') {
          throw error; // User stopped it, don't retry
        }
        
        // If it's an HTTP error from backend, response will be defined and not ok
        if (response && !response.ok) {
          throw error;
        }
        
        // Otherwise, it's a network drop (like a timeout). Retry!
        retries--;
        console.warn(`[background] Network error fetching chunk ${chunkIndex}. Retries left: ${retries}. Error:`, error);
        
        if (retries === 0) {
          throw new Error('Maximum retries reached for network error.');
        }
        
        // Wait 2 seconds before retrying
        await new Promise(r => setTimeout(r, 2000));
      }
    }

    console.log(`[background] Successfully fetched chunk ${chunkIndex}. Status: ${response.status}`);

    const audioBlob = await response.blob();
    const mimeType = audioBlob.type || 'audio/mpeg';
    mimeTypeToSave = mimeType;

    const arrayBuffer = await audioBlob.arrayBuffer();
    
    // Always save chunks so we can assemble the final audio for replay/download
    savedAudioBuffers.push(arrayBuffer);

    const base64Audio = arrayBufferToBase64(arrayBuffer);
    console.log(`[background] Base64 encoded length: ${base64Audio.length}`);

    chrome.runtime.sendMessage({
      type: 'processAudioData',
      audioData: base64Audio,
      mimeType: mimeType,
      isRecording: false,
      forDownloadOnly: false,
      chunkText: chunk
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('[background] Error sending audio chunk to offscreen:', chrome.runtime.lastError.message);
      } else {
        console.log('[background] Successfully sent audio chunk to offscreen player');
      }
    });
    
    isFetchingChunk = false;
    
    // If recording, greedily fetch the next chunk with a delay to prevent throttling
    if (isRecording) {
      setTimeout(() => {
        if (isStreaming && !isFetchingChunk) {
          fetchNextChunk();
        }
      }, 1000); // 1 second delay between chunk generations
    }
  } catch (error) {
    isFetchingChunk = false;
    if (error.name === 'AbortError') {
      console.log('Fetch aborted');
      return;
    }
    
    console.error('Error streaming audio chunk:', error);
    chrome.runtime.sendMessage({
      type: 'streamError',
      error: error.message
    });

    currentPlayerState = 'stopped';
    chrome.runtime.sendMessage({
      type: 'playerStateUpdate',
      state: 'stopped'
    });
  }
}

// Split text into chunks for JIT streaming
function splitText(text) {
  // Try to split by sentence boundaries to avoid cutting off words
  const chunks = text.match(/[^.!?]+[.!?]+/g);
  
  if (!chunks || chunks.length === 0) {
    // If no sentence boundaries found, fallback to chunking by length
    const fallbackChunks = [];
    let i = 0;
    while (i < text.length) {
      fallbackChunks.push(text.slice(i, i + 800));
      i += 800;
    }
    return fallbackChunks;
  }
  
  return chunks.map(chunk => chunk.trim()).filter(chunk => chunk.length > 0);
}

// Initialize context menu when extension is installed or updated
chrome.runtime.onInstalled.addListener(() => {
  setupContextMenu();
  
  // Inject content script into all existing tabs so it works without reloading
  chrome.tabs.query({}, (tabs) => {
    for (const tab of tabs) {
      if (tab.url && !tab.url.startsWith('chrome://') && !tab.url.startsWith('edge://') && !tab.url.startsWith('about:')) {
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content.js']
        }).catch(() => {});
      }
    }
  });
});

async function highlightChunkInTab(chunkText, isStopped = false) {
  if (!streamingSettings && !isStopped) return;
  
  try {
    let tabId = streamingTabId;
    if (!tabId) {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs.length === 0) return;
      tabId = tabs[0].id;
    }
    
    const color = streamingSettings ? streamingSettings.highlightColor : '#3bc6ad';
    const autoScroll = streamingSettings ? streamingSettings.autoScroll : true;
    
    await chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: (text, color, autoScroll, isStopped) => {
        let style = document.getElementById('tts-reader-highlight-style');
        if (!style) {
          style = document.createElement('style');
          style.id = 'tts-reader-highlight-style';
          document.head.appendChild(style);
        }
        style.textContent = `::highlight(tts-reading) { background-color: ${color}; color: #000; }`;

        if (CSS.highlights) {
          CSS.highlights.delete('tts-reading');
        }
        
        const legacyHighlights = document.querySelectorAll('.tts-legacy-highlight');
        legacyHighlights.forEach(el => {
          const parent = el.parentNode;
          while(el.firstChild) parent.insertBefore(el.firstChild, el);
          parent.removeChild(el);
        });

        if (isStopped || !text) {
          window.ttsLastFoundIndex = 0;
          return;
        }

        const normalizedSearchText = text.replace(/\s+/g, '');
        if (!normalizedSearchText) return;

        const treeWalker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
            acceptNode: (n) => {
                const parent = n.parentNode;
                if (!parent) return NodeFilter.FILTER_REJECT;
                const tag = parent.nodeName;
                if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT') return NodeFilter.FILTER_REJECT;
                return NodeFilter.FILTER_ACCEPT;
            }
        });

        let textNodes = [];
        let fullText = "";
        let n;
        while (n = treeWalker.nextNode()) {
            const nodeText = n.textContent;
            textNodes.push({
                node: n,
                start: fullText.length,
                text: nodeText,
                end: fullText.length + nodeText.length
            });
            fullText += nodeText;
        }

        const strippedToFull = [];
        for (let i = 0; i < fullText.length; i++) {
            if (!/\s/.test(fullText[i])) {
                strippedToFull.push(i);
            }
        }
        
        const strippedFull = fullText.replace(/\s+/g, '');
        let targetStrippedIndex = window.ttsLastFoundIndex || 0;
        
        let startIndex = strippedFull.indexOf(normalizedSearchText, targetStrippedIndex);
        let actualMatchLength = normalizedSearchText.length;
        
        if (startIndex === -1) {
            startIndex = strippedFull.indexOf(normalizedSearchText, 0);
            if (startIndex === -1) {
                const shortSearch = normalizedSearchText.substring(0, 20);
                if (shortSearch.length > 5) {
                    startIndex = strippedFull.indexOf(shortSearch, targetStrippedIndex);
                    if (startIndex === -1) {
                         startIndex = strippedFull.indexOf(shortSearch, 0);
                    }
                    if (startIndex !== -1) {
                        actualMatchLength = shortSearch.length;
                    }
                }
            }
        }

        if (startIndex !== -1) {
            const endIndex = startIndex + actualMatchLength - 1;
            
            const fullStartIndex = strippedToFull[startIndex];
            const fullEndIndex = strippedToFull[endIndex];
            
            let startNodeData = textNodes.find(n => fullStartIndex >= n.start && fullStartIndex < n.end);
            let endNodeData = textNodes.find(n => fullEndIndex >= n.start && fullEndIndex < n.end);
            
            if (startNodeData && endNodeData) {
                const range = document.createRange();
                range.setStart(startNodeData.node, fullStartIndex - startNodeData.start);
                range.setEnd(endNodeData.node, fullEndIndex - endNodeData.start + 1);
                
                if ('highlights' in CSS) {
                    const highlight = new Highlight(range);
                    CSS.highlights.set('tts-reading', highlight);
                } else {
                    const selection = window.getSelection();
                    selection.removeAllRanges();
                    selection.addRange(range);
                }
                
                window.ttsLastFoundIndex = endIndex + 1;
                
                if (autoScroll) {
                    const rect = range.getBoundingClientRect();
                    const isInViewport = rect.top >= 0 && rect.bottom <= window.innerHeight;
                    if (!isInViewport) {
                        window.scrollBy(0, rect.top - window.innerHeight / 2);
                    }
                }
            }
        }
      },
      args: [chunkText, color, autoScroll, isStopped]
    });
  } catch (err) {
    console.log('Highlight error:', err);
  }
}