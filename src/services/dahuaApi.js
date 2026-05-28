'use strict';
const axios = require('axios');
const cfg = require('../config');
const addDigestAuth = require('../middleware/digestAuth');

const dApi = axios.create({
  baseURL:           `http://${cfg.nvrHost}:${cfg.nvrPort}`,
  timeout:           15000,
  transformResponse: [(data) => data],
});

addDigestAuth(dApi, cfg.nvrUser, cfg.nvrPass);

module.exports = dApi;
