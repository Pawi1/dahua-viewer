'use strict';
const http = require('http');

// Starts `app` on an ephemeral port and returns a small fetch-based client.
// Avoids pulling in supertest — Node already ships a global fetch.
async function startTestServer(app) {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  return {
    baseUrl,
    async close() {
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

module.exports = { startTestServer };
