const {
  HandlerRequest,
  HandlerResponse,
  HandlerPluginBase,
} = require('./base');
const logger = require('../utils/logger')(__filename);

/**
 * @param { Array.<HandlerPluginBase> } plugins
 */
const build = plugins => {
  /**
   * @param { (request: HandlerRequest, response: HandlerResponse) => * } handler
   */
  const delegator = handler => {
    return async (event, context, callback) => {
      logger.stupid(`event`, event);
      const request = new HandlerRequest(event, context);
      const response = new HandlerResponse(callback);

      const processInternal = async (delegator, finalizable) => {
        const maybePromise = delegator(request, response);
        const result =
          maybePromise instanceof Promise ? await maybePromise : maybePromise;
        logger.stupid(`result`, result);
        if (response.completed) {
          return result;
        }
        if (finalizable) {
          return response.ok(result);
        }
      };

      const process = async (delegator, finalizable) => {
        try {
          const result = await processInternal(delegator, finalizable);
          return result;
        } catch (err) {
          logger.error(err);
          request.lastError = err;

          for (const plugin of plugins) {
            try {
              await processInternal(plugin.error.bind(plugin), false);
            } catch (ignorable) {
              logger.error(ignorable);
            }
          }
          if (!response.completed) {
            return response.fail(
              err instanceof Error ? { error: err.message } : err,
            );
          }
          return err;
        }
      };

      for (const plugin of plugins) {
        await process(plugin.begin.bind(plugin), false);
      }
      await process(handler, true);
      for (const plugin of plugins) {
        await process(plugin.end.bind(plugin), false);
      }
    };
  };
  return delegator;
};

module.exports = {
  build,
  aws: require('./aws'),
  trace: require('./trace'),
  HandlerPluginBase,
};
