// content.js
// Store the last right-clicked element so the background script can access it
// when the user selects "Read Aloud" from the context menu.

document.addEventListener('contextmenu', function(event) {
  window.ttsLastRightClickedElement = event.target;
}, true);
