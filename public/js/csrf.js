// Double-submit CSRF token: the server sets a readable (non-httpOnly)
// csrfToken cookie on first contact. Same-origin JS is the only thing that
// can read that cookie, so echoing it back as a header on state-changing
// requests proves the request actually came from our own page.
const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function readCsrfCookie() {
  const match = document.cookie.match(/(?:^|; )csrfToken=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : null;
}

const nativeFetch = window.fetch.bind(window);
window.fetch = (input, init = {}) => {
  const method = (init.method || 'GET').toUpperCase();
  if (UNSAFE_METHODS.has(method)) {
    const token = readCsrfCookie();
    if (token) {
      init = { ...init, headers: { ...(init.headers || {}), 'X-CSRF-Token': token } };
    }
  }
  return nativeFetch(input, init);
};
