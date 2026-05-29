export const log  = (...a) => { if (window.DEBUG) console.log(...a); };
export const warn = (...a) => { if (window.DEBUG) console.warn(...a); };
export const err  = (...a) => { if (window.DEBUG) console.error(...a); };
