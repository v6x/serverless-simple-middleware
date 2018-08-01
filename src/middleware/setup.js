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

class SetupHandlerPlugin extends HandlerPluginBase {
  constructor(options) {
    super();
    this.options = options;
  }

  async begin() {
    // Setup only once.
    if (setupOnce) {
      return;
    }
    setupOnce = true;
    const { config, mapper } = this.options;

    if (config) {
      logger.debug(`Load aws config from ${config}`);
      await awsConfig.load(config);
    }

    logger.debug(`Initialize aws components with mapper.`);
    await initialize(mapper);
  }
}

module.exports = options => new SetupHandlerPlugin(options);
