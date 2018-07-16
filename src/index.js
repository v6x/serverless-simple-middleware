const getLogger = require('./logger');
const config = require('./config');
const aws = require('./aws');
const { middleware, initialize } = require('./middleware');

module.exports = {
  getLogger,
  aws,
  middleware,
  initialize,
  config,
};
