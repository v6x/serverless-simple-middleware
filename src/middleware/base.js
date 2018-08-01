const logger = require('../utils/logger')(__filename);

class HandlerRequest {
  constructor(event, context) {
    this.event = event;
    this.context = context;
    this.lastError = undefined;

    /** @type {{[pluginName: string]: *}} Plugins */
    this.aux = {};
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

class HandlerResponse {
  constructor(callback) {
    this.callback = callback;
    this.completed = false;
    this.corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Credentials': true,
    };

    /** @type {undefined | Promise.<any> | any} */
    this.result = undefined;
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

/**
 * @template H
 */
class HandlerPluginBase {
  /**
   * @param {HandlerRequest} request
   * @param {HandlerResponse} response
   * @returns {T | Promise<T>}
   * @template T
   */
  begin(request, response) {}

  /**
   * @param {HandlerRequest} request
   * @param {HandlerResponse} response
   * @returns {T | Promise<T>}
   * @template T
   */
  end(request, response) {}

  /**
   * @param {HandlerRequest} request
   * @param {HandlerResponse} response
   * @returns {T | Promise<T>}
   * @template T
   */
  error(request, response) {}
}

module.exports = {
  HandlerRequest,
  HandlerResponse,
  HandlerPluginBase,
};
