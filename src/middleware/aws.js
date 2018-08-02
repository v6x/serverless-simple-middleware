const { aws, config: awsConfig } = require('../aws');
const { HandlerPluginBase } = require('./base');

const logger = require('../utils/logger')(__filename);

/**
 * @param { ( env: {} ) => { [name: string]: () => Promise<boolean> } } mapper
 */
const initialize = async mapper => {
  const env = process.env;
  const mapping = mapper(aws, env);
  const successes = await Promise.all(
    Object.keys(mapping).map(name => mapping[name]()),
  );
  return Object.keys(mapping).reduce(
    (result, name, index) =>
      Object.assign(result, { [name]: successes[index] }),
    {},
  );
};

let setupOnce = false;

class AwsHandlerPlugin extends HandlerPluginBase {
  constructor(options) {
    super();
    this.options = options;
  }

  async begin(request) {
    // Setup only once.
    if (!setupOnce) {
      const { config, mapper } = this.options;

      if (config) {
        logger.debug(`Load aws config from ${config}`);
        await awsConfig.load(config);
      }

      if (mapper) {
        logger.debug(`Initialize aws components with mapper.`);
        await initialize(mapper);
      }
      setupOnce = true;
    }

    request.aux.aws = aws;
    request.aux.awsConfig = awsConfig;
  }
}

module.exports = options => new AwsHandlerPlugin(options);
