const getLogger = require('./logger');
const config = require('./config');
const aws = require('./aws');
const { setup, middleware, initialize } = require('./middleware');

module.exports = {
  getLogger,
  aws,
  setup,
  middleware,
  initialize,
  config,
};
