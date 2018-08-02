const { HandlerPluginBase } = require('./base');
const { Aws } = require('../aws');
const logger = require('../utils/logger')(__filename);

class Event {
  /**
   * @param {string} key
   * @param {string} system
   * @param {string} action
   * @param {string} attribute
   * @param {string} body
   * @param {boolean} error
   */
  constructor(key, system, action, attribute, body, error = false) {
    this.timestamp = Date.now();
    this.key = key;
    this.system = system;
    this.action = action;
    this.attribute = attribute;
    this.body = body;
    this.error = error;
  }
}

class EventStream {
  /**
   * @param {string} queueName
   * @param {string} key
   * @param {string} system
   * @param {string} action
   */
  constructor(queueName) {
    this.queueName = queueName;
    this.aws = new Aws();

    /** @type {Array.<Event>} */
    this.buffer = [];
  }

  /**
   * @param {Event} event
   */
  push(event) {
    this.buffer.push(event);
  }

  async flush() {
    if (this.buffer.length === 0) {
      return;
    }
    try {
      const eventQueueUrl = await this.aws.getQueueUrl(this.queueName);
      const chunkSize = 10;
      for (let begin = 0; begin < this.buffer.length; begin += chunkSize) {
        const end = Math.min(this.buffer.length, begin + chunkSize);
        const subset = this.buffer.slice(begin, end);
        const sendBatchResult = await this.aws.sqs
          .sendMessageBatch({
            QueueUrl: eventQueueUrl,
            Entries: subset.map(each => ({
              Id: `${each.key}_${each.timestamp}`,
              MessageBody: JSON.stringify(each),
            })),
          })
          .promise();
        logger.stupid(`sendBatchResult`, sendBatchResult);
      }
    } catch (error) {
      logger.warn(`Error in eventSource: ${error}`);
    }
  }
}

class EventBuilder {
  /**
   * @param {EventStream} stream
   * @param {string} system
   * @param {string} key
   * @param {string} action
   */
  constructor(stream, system, key, action) {
    this.stream = stream;
    this.system = system;
    this.key = key;
    this.action = action;
  }

  /**
   * @param {string} action
   * @param {string} body
   * @param {boolean} error
   */
  push(attribute, body, error = false) {
    this.stream.push(
      new Event(this.key, this.system, this.action, attribute, body, error),
    );
  }
}

class EventHandlerPlugin extends HandlerPluginBase {
  constructor({ queueName, system }) {
    super();
    this.stream = new EventStream(queueName);
    this.system = system;
    this.last = {
      key: 'nothing',
      action: 'unknown',
    };
  }

  begin(request) {
    request.aux.eventStream = this.stream;
    request.aux.newEventStream = (key, action) => {
      this.last = { key, action };
      return new EventBuilder(this.stream, this.system, key, action);
    };
  }

  end() {
    return this.stream.flush();
  }

  error(request) {
    if (request.lastError) {
      const { key, action } = this.last;
      this.stream.push(
        new Event(key, this.system, action, 'error', request.lastError, true),
      );
    }
  }
}

/**
 * @param { {queueName: string, system?: string} } options
 */
module.exports = options => new EventHandlerPlugin(options);
