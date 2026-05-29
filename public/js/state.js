export const state = {
  currentToken:         null,
  currentFile:          null,
  currentChannel:       1,
  currentRTCPeer:       null,
  currentMSEController: null,
  searchResults:        [],
  heartbeatInterval:    null,
  currentResolution:    '480p',
};

export const videoEl = () => document.getElementById('main-player');
