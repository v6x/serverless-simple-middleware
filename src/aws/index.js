const AWS = require('aws-sdk');
const fs = require('fs');
const logger = require('../utils/logger')(__filename);
const config = require('./config');

class Aws {
  constructor() {
    /**
     * The simple cache for { queueName: queueUrl }.
     * It can help in the only case of launching this project as offline.
     * @type { { [queueName: string]: string } }
     */
    this._queueUrls = {};
  }

  get s3() {
    if (this._s3 === undefined) {
      this._s3 = new AWS.S3(config.get('s3'));
    }
    return this._s3;
  }
  get sqs() {
    if (this._sqs === undefined) {
      this._sqs = new AWS.SQS(config.get('sqs'));
    }
    return this._sqs;
  }
  get dynamodb() {
    if (this._dynamodb === undefined) {
      this._dynamodb = new AWS.DynamoDB.DocumentClient(config.get('dynamodb'));
    }
    return this._dynamodb;
  }
  get dynamodbAdmin() {
    if (this._dynamodbAdmin === undefined) {
      this._dynamodbAdmin = new AWS.DynamoDB(config.get('dynamodb'));
    }
    return this._dynamodbAdmin;
  }

  /**
   * @param {string} queueName
   * @returns {Promise<string>} A promise of queueUrl
   */
  async getQueueUrl(queueName) {
    if (this._queueUrls[queueName] !== undefined) {
      return this._queueUrls[queueName];
    }
    const urlResult = await this.sqs
      .getQueueUrl({
        QueueName: queueName,
      })
      .promise();
    logger.stupid(`urlResult`, urlResult);
    return (this._queueUrls[queueName] = urlResult.QueueUrl);
  }

  /**
   * @param {string} queueName
   * @param {*} data
   */
  async enqueue(queueName, data) {
    logger.debug(`Send message[${data.key}] to queue.`);
    logger.stupid(`data`, data);
    const queueUrl = await this.getQueueUrl(queueName);
    const sendResult = await this.sqs
      .sendMessage({
        QueueUrl: queueUrl,
        MessageBody: JSON.stringify(data),
        DelaySeconds: 0,
      })
      .promise();
    logger.stupid(`sendResult`, sendResult);

    const attrResult = await this.sqs
      .getQueueAttributes({
        QueueUrl: queueUrl,
        AttributeNames: ['ApproximateNumberOfMessages'],
      })
      .promise();
    logger.stupid(`attrResult`, attrResult);
    return +attrResult.Attributes['ApproximateNumberOfMessages'];
  }

  /**
   * @param {string} queueName
   * @param {number} fetchSize
   * @param {number} waitSeconds
   * @param {number} visibilityTimeout
   */
  async dequeue(
    queueName,
    fetchSize = 1,
    waitSeconds = 1,
    visibilityTimeout = 15,
  ) {
    logger.debug(`Receive message from queue[${queueName}].`);
    const queueUrl = await this.getQueueUrl(queueName);
    const receiveResult = await this.sqs
      .receiveMessage({
        QueueUrl: queueUrl,
        MaxNumberOfMessages: fetchSize,
        WaitTimeSeconds: waitSeconds,
        VisibilityTimeout: visibilityTimeout,
      })
      .promise();
    logger.stupid(`receiveResult`, receiveResult);
    if (
      receiveResult.Messages === undefined ||
      receiveResult.Messages.length === 0
    ) {
      return [];
    }
    const data = [];
    for (const each of receiveResult.Messages) {
      data.push({
        handle: each.ReceiptHandle,
        body: JSON.parse(each.Body),
      });
    }
    logger.debug(`Receive a job[${JSON.stringify(data)}] from queue`);
    return data;
  }

  /**
   * @param {string} queueName
   * @param {string} handle
   * @param {number} seconds
   */
  async retainMessage(queueName, handle, seconds) {
    logger.debug(`Change visibilityTimeout of ${handle} to ${seconds}secs.`);
    const queueUrl = await this.getQueueUrl(queueName);
    const changeResult = await this.sqs
      .changeMessageVisibility({
        QueueUrl: queueUrl,
        ReceiptHandle: handle,
        VisibilityTimeout: seconds.toString(),
      })
      .promise();
    logger.stupid(`changeResult`, changeResult);
    return handle;
  }

  /**
   * @param {string} queueName
   * @param {string} handle
   */
  async completeMessage(queueName, handle) {
    logger.debug(`Complete a message with handle[${handle}]`);
    const queueUrl = await this.getQueueUrl(queueName);
    const deleteResult = await this.sqs
      .deleteMessage({
        QueueUrl: queueUrl,
        ReceiptHandle: handle,
      })
      .promise();
    logger.stupid(`deleteResult`, deleteResult);
    return handle;
  }

  async download(bucketName, key, localPath) {
    logger.debug(`Get a stream of item[${key}] from bucket[${bucketName}]`);
    const stream = this.s3
      .getObject({
        Bucket: bucketName,
        Key: key,
      })
      .createReadStream();
    return new Promise((resolve, reject) =>
      stream
        .pipe(fs.createWriteStream(localPath))
        .on('finish', () => resolve(localPath))
        .on('error', error => reject(error)),
    );
  }

  async upload(bucketName, localPath, key) {
    logger.debug(`Upload item[${key}] into bucket[${bucketName}]`);
    const putResult = await this.s3
      .upload({
        Bucket: bucketName,
        Key: key,
        Body: fs.createReadStream(localPath),
      })
      .promise();
    logger.stupid(`putResult`, putResult);
    return key;
  }

  /**
   * @param {string} bucketName
   * @param {string} key
   * @param { "getObject" | "putObject" } operation
   * @param { { Key: string, Expires: number, ContentType: string, ACL: "public-read" } } params
   * @returns { { key: string, url: string } }
   */
  getSignedUrl(bucketName, key, operation = 'getObject', params = {}) {
    return {
      key,
      url: this.s3.getSignedUrl(
        operation,
        Object.assign(
          {
            Bucket: bucketName,
            Key: key,
            Expires: 60 * 10,
          },
          params,
        ),
      ),
    };
  }

  /**
   * @param {string} bucketName
   * @param {string} key
   * @param {string} fileName
   * @param { { Expires: number, ContentType: string, ACL: "public-read" } } params
   * @returns { { key: string, url: string } }
   */
  getAttachmentUrl(bucketName, key, fileName, params = {}) {
    return this.getSignedUrl(bucketName, key, 'getObject', {
      ...params,
      ResponseContentDisposition: `attachment; filename="${fileName}"`,
    });
  }

  /**
   * @template T
   * @param {string} tableName
   * @param { { [keyColumn: string]: string } } key
   * @param {T} defaultValue
   * @returns {Promise<T>} A promise of a retrieved item
   */
  async getDynamoDbItem(tableName, key, defaultValue = {}) {
    logger.debug(
      `Read an item with key[${JSON.stringify(key)}] from ${tableName}.`,
    );
    const getResult = await this.dynamodb
      .get({
        TableName: tableName,
        Key: key,
      })
      .promise();
    logger.stupid(`getResult`, getResult);
    const item =
      getResult !== undefined && getResult.Item !== undefined
        ? getResult.Item
        : defaultValue;
    logger.stupid(`item`, item);
    return item;
  }

  /**
   * @param {string} tableName
   * @param { { [keyColumn: string]: string } } key
   * @param { [ { [column: string]: any } ] } keyValues
   */
  async updateDynamoDbItem(tableName, key, keyValues) {
    logger.debug(
      `Update an item with key[${JSON.stringify(key)}] to ${tableName}`,
    );
    logger.stupid(`keyValues`, keyValues);
    const expressions = Object.keys(keyValues)
      .map(key => `${key} = :${key}`)
      .join(', ');
    const attributeValues = Object.keys(keyValues)
      .map(key => [`:${key}`, keyValues[key]])
      .reduce((obj, pair) => ({ ...obj, [pair[0]]: pair[1] }), {});
    logger.stupid(`expressions`, expressions);
    logger.stupid(`attributeValues`, attributeValues);
    const updateResult = await this.dynamodb
      .update({
        TableName: tableName,
        Key: key,
        UpdateExpression: `set ${expressions}`,
        ExpressionAttributeValues: attributeValues,
      })
      .promise();
    logger.stupid(`updateResult`, updateResult);
    return updateResult;
  }

  // Setup

  /**
   * @param {string} queueName
   */
  async setupQueue(queueName) {
    try {
      const listResult = await this.sqs
        .listQueues({
          QueueNamePrefix: queueName,
        })
        .promise();
      if (listResult.QueueUrls) {
        for (const queueUrl of listResult.QueueUrls) {
          if (queueUrl.endsWith(queueName)) {
            logger.debug(`Queue[${queueName} => ${queueUrl}] already exists.`);
            return true;
          }
        }
      }
    } catch (error) {
      logger.debug(`No Queue[${queueName}] exists due to ${error}`);
    }
    logger.debug(`Create a queue[${queueName}] newly.`);
    const createResult = await this.sqs
      .createQueue({
        QueueName: queueName,
      })
      .promise();
    logger.stupid(`createResult`, createResult);
    return true;
  }

  /**
   * @param {string} bucketName
   * @param { { methods: ["GET" | "POST" | "PUT" | "DELETE" | "HEAD" ], origins: [ string ] } } cors
   */
  async setupStorage(bucketName, cors) {
    try {
      const listResult = await this.s3.listBuckets().promise();
      if (listResult.Buckets.map(each => each.Name).includes(bucketName)) {
        logger.debug(`Bucket[${bucketName}] already exists.`);
        return true;
      }
    } catch (error) {
      logger.debug(`No bucket[${bucketName}] exists due to ${error}`);
    }
    logger.debug(`Create a bucket[${bucketName}] newly.`);
    const createResult = await this.s3
      .createBucket({
        Bucket: bucketName,
      })
      .promise();
    logger.stupid(`createResult`, createResult);
    if (cors) {
      const corsResult = await this.s3
        .putBucketCors({
          Bucket: bucketName,
          CORSConfiguration: {
            CORSRules: [
              {
                AllowedHeaders: ['*'],
                AllowedMethods: cors.methods,
                AllowedOrigins: cors.origins,
              },
            ],
          },
        })
        .promise();
      logger.stupid(`corsResult`, corsResult);
    }
    return true;
  }

  /**
   * @param {string} tableName
   * @param {string} keyColumn
   */
  async setupDynamoDb(tableName, keyColumn) {
    try {
      const listResult = await this.dynamodbAdmin.listTables().promise();
      if (listResult.TableNames.includes(tableName)) {
        logger.debug(`Table[${tableName}] already exists.`);
        return true;
      }
    } catch (error) {
      logger.debug(`No table[${tableName}] exists due to ${error}`);
    }
    logger.debug(`Create a table[${tableName}] newly.`);
    const createResult = await this.dynamodbAdmin
      .createTable({
        TableName: tableName,
        KeySchema: [{ AttributeName: keyColumn, KeyType: 'HASH' }],
        AttributeDefinitions: [
          { AttributeName: keyColumn, AttributeType: 'S' },
        ],
        ProvisionedThroughput: {
          ReadCapacityUnits: 30,
          WriteCapacityUnits: 10,
        },
      })
      .promise();
    logger.stupid(`createResult`, createResult);
    return true;
  }
}

module.exports = {
  config,
  Aws,
};
