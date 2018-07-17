const logger = require('./logger')(__filename);

class ProxyRequest {
  constructor(event, context) {
    this.event = event;
    this.context = context;
  }
  get body() {
    if (!this.event.body) {
      return {};
    }
    if (this._body === undefined) {
      this._body = JSON.parse(this.event.body);
    }
    return this._body || {};
  }
  get path() {
    return this.event.pathParameters || {};
  }
  get query() {
    return this.event.queryStringParameters || {};
  }
  records(selector = undefined) {
    const target = this.event.Records || [];
    return selector === undefined ? target : target.map(selector);
  }
}

class ProxyResponse {
  constructor(callback) {
    this.callback = callback;
    this.completed = false;
    this.corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Credentials': true,
    };
  }
  ok(body = {}, code = 200) {
    logger.stupid(`ok`, body);
    const result = this.callback(null, {
      statusCode: code,
      headers: this.corsHeaders,
      body: JSON.stringify(body),
    });
    this.completed = true;
    return result;
  }
  fail(body = {}, code = 500) {
    logger.stupid(`fail`, body);
    const result = this.callback(null, {
      statusCode: code,
      headers: this.corsHeaders,
      body: JSON.stringify(body),
    });
    this.completed = true;
    return result;
  }
}

class ProxyHandler {
  /**
   * @param { (request: ProxyRequest, response: ProxyResponse ) => * } handler
   */
  constructor(handler) {
    this.handler = handler;
  }
  delegate(event, context, callback) {
    logger.stupid(`event`, event);
    const request = new ProxyRequest(event, context);
    const response = new ProxyResponse(callback);
    try {
      const result = this.handler(request, response);
      logger.stupid(`result`, result);
      if (response.completed || !result) {
        return result;
      }
      return result.constructor.name !== 'Promise'
        ? response.ok(result)
        : result
            .then(result => response.ok(result))
            .catch(err => response.fail(err));
    } catch (err) {
      logger.error(err);
      return response.fail(err);
    }
  }
}

class PreparationHolder {
  /**
   * @param {Promise.<any>} promise
   */
  constructor(promise) {
    this.promise = promise;
    this.fire = false;
  }

  has() {
    return this.promise != null;
  }

  isExecutable() {
    return this.has() && !this.fire;
  }

  async execute() {
    if (!this.isExecutable()) {
      return;
    }
    await this.promise;
    this.fire = true;
  }
}

let preparation = new PreparationHolder(null);

/**
 * @param {Promise.<any>} newPreparation
 * @param {boolean} installIfEmpty
 */
const setup = (newPreparation, installIfEmpty = true) => {
  if (installIfEmpty && preparation.has()) {
    logger.debug('Preparation is already installed.');
    return;
  }
  if (newPreparation instanceof Promise) {
    preparation = new PreparationHolder(newPreparation);
  } else if (newPreparation instanceof Function) {
    const maybePromise = newPreparation();
    const ensurePromise =
      maybePromise instanceof Promise
        ? maybePromise
        : Promise.resolve(maybePromise);
    preparation = new PreparationHolder(ensurePromise);
  }
  logger.debug('Preparation is set up completely.');
  logger.debug(preparation);
};

/**
 * @param { (request: ProxyRequest, response: ProxyResponse ) => * } handler
 */
const middleware = handler => {
  const proxy = new ProxyHandler(handler);
  return async (event, context, callback) => {
    logger.silly('Check preparation before run middleware');
    logger.silly(preparation);
    if (preparation.isExecutable()) {
      await preparation.execute();
    }
    return proxy.delegate(event, context, callback);
  };
};

/**
 * @param { ( env: {} ) => { [name: string]: () => Promise<boolean> } } mapper
 */
const initialize = async mapper => {
  const env = process.env;
  const mapping = mapper(env);
  const successes = await Promise.all(
    Object.keys(mapping).map(name => mapping[name]()),
  );
  return Object.keys(mapping).reduce(
    (result, name, index) =>
      Object.assign(result, { [name]: successes[index] }),
    {},
  );
};

module.exports = {
  setup,
  middleware,
  initialize,
};
