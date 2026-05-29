export const state = {
  currentToken:         null,
  currentFile:          null,
  currentChannel:       1,
  currentRTCPeer:       null,
  currentMSEController: null,
  searchResults:        []
};

export const videoEl = () => document.getElementById('main-player');
