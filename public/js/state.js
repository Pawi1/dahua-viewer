export const state = {
  currentToken:         null,
  currentFile:          null,
  currentChannel:       1,
  currentRTCPeer:       null,
  searchResults:        [],
  heartbeatInterval:    null,
  currentResolution:    '480p',
};

export const videoEl = () => document.getElementById('main-player');
