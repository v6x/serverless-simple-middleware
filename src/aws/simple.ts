import {
  CloudfrontSignedCookiesOutput,
  getSignedCookies,
} from '@aws-sdk/cloudfront-signer';

import * as fs from 'fs';
import * as os from 'os';
import { nanoid } from 'nanoid/non-secure';

import { getLogger, stringifyError } from '../utils';
import { SimpleAWSConfig } from './config';

import { AWSComponent, SQSMessageBody } from './define';
import { DynamoDB, DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CopyObjectCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  ListPartsCommand,
  PutObjectCommand,
  S3,
  UploadPartCommand,
  UploadPartCopyCommand,
} from '@aws-sdk/client-s3';
import { SQS } from '@aws-sdk/client-sqs';
import { DynamoDBDocument } from '@aws-sdk/lib-dynamodb';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { PresignerOptions } from '../internal/s3';
import { Upload } from '@aws-sdk/lib-storage';

const logger = getLogger(__filename);

export class SimpleAWS {
  private queueUrls: { [queueName: string]: string } = {};
  private config: SimpleAWSConfig;
  private lazyS3: S3 | undefined;
  private lazySqs: SQS | undefined;
  private lazyDynamodb: DynamoDBDocument | undefined;
  private lazyDynamodbAdmin: DynamoDB | undefined;

  constructor(config?: SimpleAWSConfig) {
    this.config = config || new SimpleAWSConfig();
    /**
     * The simple cache for { queueName: queueUrl }.
     * It can help in the only case of launching this project as offline.
     * @type { { [queueName: string]: string } }
     */
    this.queueUrls = {};
  }

  get s3() {
    if (this.lazyS3 === undefined) {
      this.lazyS3 = new S3(this.config.get(AWSComponent.s3) || {});
    }
    return this.lazyS3;
  }

  get sqs() {
    if (this.lazySqs === undefined) {
      this.lazySqs = new SQS(this.config.get(AWSComponent.sqs) || {});
    }
    return this.lazySqs;
  }

  get dynamodb() {
    if (this.lazyDynamodb === undefined) {
      this.lazyDynamodb = DynamoDBDocument.from(
        new DynamoDBClient(this.config.get(AWSComponent.dynamodb) || {}),
        {
          marshallOptions: {
            convertEmptyValues: true,
            removeUndefinedValues: true,
          },
        },
      );
    }
    return this.lazyDynamodb;
  }

  get dynamodbAdmin() {
    if (this.lazyDynamodbAdmin === undefined) {
      this.lazyDynamodbAdmin = new DynamoDB(
        this.config.get(AWSComponent.dynamodb) || {},
      );
    }
    return this.lazyDynamodbAdmin;
  }

  public getQueueUrl = async (queueName: string): Promise<string> => {
    if (this.queueUrls[queueName] !== undefined) {
      return this.queueUrls[queueName];
    }
    const urlResult = await this.sqs.getQueueUrl({
      QueueName: queueName,
    });
    logger.stupid(`urlResult`, urlResult);
    if (!urlResult.QueueUrl) {
      throw new Error(`No queue url with name[${queueName}]`);
    }
    return (this.queueUrls[queueName] = urlResult.QueueUrl);
  };

  public enqueue = async (queueName: string, data: any): Promise<number> => {
    logger.debug(`Send message[${data.key}] to queue.`);
    logger.stupid(`data`, data);
    const queueUrl = await this.getQueueUrl(queueName);
    const sendResult = await this.sqs.sendMessage({
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify(data),
      DelaySeconds: 0,
    });
    logger.stupid(`sendResult`, sendResult);

    const attrResult = await this.sqs.getQueueAttributes({
      QueueUrl: queueUrl,
      AttributeNames: ['ApproximateNumberOfMessages'],
    });
    logger.stupid(`attrResult`, attrResult);
    if (!attrResult.Attributes) {
      return 0;
    }
    return +(attrResult.Attributes?.ApproximateNumberOfMessages || 0);
  };

  public dequeue = async <T>(
    queueName: string,
    fetchSize: number = 1,
    waitSeconds: number = 1,
    visibilityTimeout: number = 15,
  ): Promise<Array<SQSMessageBody<T>>> => {
    logger.debug(`Receive message from queue[${queueName}].`);
    const queueUrl = await this.getQueueUrl(queueName);
    const receiveResult = await this.sqs.receiveMessage({
      QueueUrl: queueUrl,
      MaxNumberOfMessages: fetchSize,
      WaitTimeSeconds: waitSeconds,
      VisibilityTimeout: visibilityTimeout,
    });
    logger.stupid(`receiveResult`, receiveResult);
    if (
      receiveResult.Messages === undefined ||
      receiveResult.Messages.length === 0
    ) {
      return [];
    }
    const data = [];
    for (const each of receiveResult.Messages) {
      if (!each.ReceiptHandle) {
        logger.warn(`No receipt handler: ${JSON.stringify(each)}`);
        continue;
      }
      const message: SQSMessageBody<T> = {
        handle: each.ReceiptHandle,
        body: each.Body ? (JSON.parse(each.Body) as T) : undefined,
      };
      data.push(message);
    }
    logger.verbose(`Receive a message[${JSON.stringify(data)}] from queue`);
    return data;
  };

  public dequeueAll = async <T>(
    queueName: string,
    limitSize: number = Number.MAX_VALUE,
    visibilityTimeout: number = 15,
  ): Promise<Array<SQSMessageBody<T>>> => {
    const messages = [];
    const maxFetchSize = 10; // This is max-value for fetching in each time.
    while (messages.length < limitSize) {
      const eachOfMessages: Array<SQSMessageBody<T>> = await this.dequeue<T>(
        queueName,
        Math.min(limitSize - messages.length, maxFetchSize),
        0,
        visibilityTimeout,
      );
      if (!eachOfMessages || eachOfMessages.length === 0) {
        break;
      }
      for (const each of eachOfMessages) {
        messages.push(each);
      }
    }
    logger.stupid(`messages`, messages);
    return messages;
  };

  public retainMessage = async (
    queueName: string,
    handle: string,
    seconds: number,
  ): Promise<string> => {
    logger.debug(`Change visibilityTimeout of ${handle} to ${seconds}secs.`);
    const queueUrl = await this.getQueueUrl(queueName);

    await this.sqs.changeMessageVisibility({
      QueueUrl: queueUrl,
      ReceiptHandle: handle,
      VisibilityTimeout: seconds,
    });

    return handle;
  };

  public completeMessage = async (
    queueName: string,
    handle: string,
  ): Promise<string> => {
    logger.debug(`Complete a message with handle[${handle}]`);
    const queueUrl = await this.getQueueUrl(queueName);
    const deleteResult = await this.sqs.deleteMessage({
      QueueUrl: queueUrl,
      ReceiptHandle: handle,
    });
    logger.stupid(`deleteResult`, deleteResult);
    return handle;
  };

  public completeMessages = async (queueName: string, handles: string[]) => {
    logger.debug(`Complete a message with handle[${handles}]`);
    if (!handles) {
      return handles;
    }

    const chunkSize = 10;
    let index = 0;
    for (let start = 0; start < handles.length; start += chunkSize) {
      const end = Math.min(start + chunkSize, handles.length);
      const sublist = handles.slice(start, end);
      const queueUrl = await this.getQueueUrl(queueName);
      const deletesResult = await this.sqs.deleteMessageBatch({
        QueueUrl: queueUrl,
        Entries: sublist.map((handle) => ({
          Id: (++index).toString(),
          ReceiptHandle: handle,
        })),
      });
      logger.stupid(`deleteResult`, deletesResult);
    }
    return handles;
  };

  public download = async (
    bucket: string,
    key: string,
    localPath: string,
  ): Promise<string> => {
    logger.debug(`Get a stream of item[${key}] from bucket[${bucket}]`);
    const { Body } = await this.s3.getObject({ Bucket: bucket, Key: key });

    return new Promise<string>((resolve, reject) =>
      (Body as NodeJS.ReadableStream)
        .on('error', (error) => reject(error))
        .pipe(fs.createWriteStream(localPath))
        .on('finish', () => resolve(localPath))
        .on('error', (error) => reject(error)),
    );
  };

  public readFile = async (bucket: string, key: string): Promise<string> => {
    logger.debug(`Read item[${key}] from bucket[${bucket}]`);
    const tempFile = `${os.tmpdir()}/${nanoid()}`;
    try {
      await this.download(bucket, key, tempFile);
      const content = await fs.promises.readFile(tempFile, {
        encoding: 'utf-8',
      });
      return content;
    } finally {
      if (fs.existsSync(tempFile)) {
        try {
          await fs.promises.unlink(tempFile);
        } catch (error) {
          logger.error(
            `Failed to delete temp file ${tempFile}: ${stringifyError(error)}`,
          );
        }
      }
    }
  };

  public readFileBuffer = async (
    bucket: string,
    key: string,
  ): Promise<Buffer> => {
    logger.debug(`Read item[${key}] from bucket[${bucket}]`);
    const { Body } = await this.s3.getObject({ Bucket: bucket, Key: key });

    const buffer = await Body?.transformToByteArray();
    if (!buffer) {
      throw new Error(`Failed to read file ${key} from bucket ${bucket}`);
    }
    return Buffer.from(buffer);
  };

  public upload = async (
    bucket: string,
    localPath: string,
    key: string,
  ): Promise<string> => {
    logger.debug(`Upload item[${key}] into bucket[${bucket}]`);
    const upload = new Upload({
      client: this.s3,
      params: {
        Bucket: bucket,
        Key: key,
        Body: fs.createReadStream(localPath),
      },
      partSize: 5 * 1024 * 1024, // 5MB
      queueSize: 4,
    });

    await upload.done();
    return key;
  };

  public uploadFromBuffer = async (
    bucket: string,
    key: string,
    buffer: Buffer,
  ): Promise<string> => {
    logger.debug(`Upload item[${key}] into bucket[${bucket}]`);
    const upload = new Upload({
      client: this.s3,
      params: {
        Bucket: bucket,
        Key: key,
        Body: buffer,
      },
      partSize: 5 * 1024 * 1024, // 5MB
      queueSize: 4,
    });
    await upload.done();
    return key;
  };

  public writeFile = async (
    bucket: string,
    key: string,
    content: string,
  ): Promise<void> => {
    logger.debug(`Write item[${key}] into bucket[${bucket}]`);
    const tempFile = `${os.tmpdir()}/${nanoid()}`;
    try {
      await fs.promises.writeFile(tempFile, content, 'utf-8');
      await this.upload(bucket, tempFile, key);
    } finally {
      if (!fs.existsSync(tempFile)) {
        return;
      }
      try {
        await fs.promises.unlink(tempFile);
      } catch (error) {
        const msg = `Error during writeFile: unlink file ${tempFile}: ${stringifyError(
          error,
        )}`;
        logger.error(msg);
      }
    }
  };

  public async getSignedUrl(options: PresignerOptions): Promise<string> {
    const { expiresIn = 600 } = options;
    switch (options.operation) {
      case 'putObject': {
        const cmd = new PutObjectCommand({
          Bucket: options.bucket,
          Key: options.key,
          ...options.params,
        });
        return getSignedUrl(this.s3, cmd, { expiresIn: expiresIn });
      }
      case 'getObject': {
        const cmd = new GetObjectCommand({
          Bucket: options.bucket,
          Key: options.key,
          ...options.params,
        });
        return getSignedUrl(this.s3, cmd, { expiresIn: expiresIn });
      }
      case 'deleteObject': {
        const cmd = new DeleteObjectCommand({
          Bucket: options.bucket,
          Key: options.key,
          ...options.params,
        });
        return getSignedUrl(this.s3, cmd, { expiresIn: expiresIn });
      }
      case 'headObject': {
        const cmd = new HeadObjectCommand({
          Bucket: options.bucket,
          Key: options.key,
          ...options.params,
        });
        return getSignedUrl(this.s3, cmd, { expiresIn: expiresIn });
      }
      case 'copyObject': {
        const cmd = new CopyObjectCommand({
          Bucket: options.bucket,
          Key: options.key,
          ...options.params,
        });
        return getSignedUrl(this.s3, cmd, { expiresIn: expiresIn });
      }
      case 'uploadPart': {
        const cmd = new UploadPartCommand({
          Bucket: options.bucket,
          Key: options.key,
          ...options.params,
        });
        return getSignedUrl(this.s3, cmd, { expiresIn: expiresIn });
      }
      case 'uploadPartCopy': {
        const cmd = new UploadPartCopyCommand({
          Bucket: options.bucket,
          Key: options.key,
          ...options.params,
        });
        return getSignedUrl(this.s3, cmd, { expiresIn: expiresIn });
      }
      case 'listObjectsV2': {
        const cmd = new ListObjectsV2Command({
          Bucket: options.bucket,
          ...options.params,
        });
        return getSignedUrl(this.s3, cmd, { expiresIn: expiresIn });
      }
      case 'createMultipartUpload': {
        const cmd = new CreateMultipartUploadCommand({
          Bucket: options.bucket,
          Key: options.key,
          ...options.params,
        });
        return getSignedUrl(this.s3, cmd, { expiresIn: expiresIn });
      }
      case 'completeMultipartUpload': {
        const cmd = new CompleteMultipartUploadCommand({
          Bucket: options.bucket,
          Key: options.key,
          ...options.params,
        });
        return getSignedUrl(this.s3, cmd, { expiresIn: expiresIn });
      }
      case 'abortMultipartUpload': {
        const cmd = new AbortMultipartUploadCommand({
          Bucket: options.bucket,
          Key: options.key,
          ...options.params,
        });
        return getSignedUrl(this.s3, cmd, { expiresIn: expiresIn });
      }
      case 'listParts': {
        const cmd = new ListPartsCommand({
          Bucket: options.bucket,
          Key: options.key,
          ...options.params,
        });
        return getSignedUrl(this.s3, cmd, { expiresIn: expiresIn });
      }
    }
  }

  public getSignedCookie = (
    keyPairId: string,
    privateKey: string,
    url: string,
    expires: number,
  ): CloudfrontSignedCookiesOutput => {
    const policy = JSON.stringify({
      Statement: [
        {
          Resource: url,
          Condition: {
            DateLessThan: { 'AWS:EpochTime': expires },
          },
        },
      ],
    });

    return getSignedCookies({
      keyPairId,
      privateKey,
      policy,
    });
  };

  public getDynamoDbItem = async <T>(
    tableName: string,
    key: { [keyColumn: string]: string },
    defaultValue?: T,
  ): Promise<T | undefined> => {
    logger.debug(
      `Read an item with key[${JSON.stringify(key)}] from ${tableName}.`,
    );
    const getResult = await this.dynamodb.get({
      TableName: tableName,
      Key: key,
    });
    logger.stupid(`getResult`, getResult);
    const item: T | undefined =
      getResult !== undefined && getResult.Item !== undefined
        ? (getResult.Item as any as T) // Casts forcefully.
        : defaultValue;
    logger.stupid(`item`, item);
    return item;
  };

  public updateDynamoDbItem = async (
    tableName: string,
    key: { [keyColumn: string]: string },
    columnValues: { [column: string]: any },
  ) => {
    logger.debug(
      `Update an item with key[${JSON.stringify(key)}] to ${tableName}`,
    );
    logger.stupid(`keyValues`, columnValues);
    const expressions = Object.keys(columnValues)
      .map((column) => `${column} = :${column}`)
      .join(', ');
    const attributeValues = Object.keys(columnValues)
      .map((column) => [`:${column}`, columnValues[column]])
      .reduce((obj, pair) => ({ ...obj, [pair[0]]: pair[1] }), {});
    logger.stupid(`expressions`, expressions);
    logger.stupid(`attributeValues`, attributeValues);
    const updateResult = await this.dynamodb.update({
      TableName: tableName,
      Key: key,
      UpdateExpression: `set ${expressions}`,
      ExpressionAttributeValues: attributeValues,
    });
    logger.stupid(`updateResult`, updateResult);
    return updateResult;
  };

  // Setup

  public setupQueue = async (queueName: string) => {
    try {
      const listResult = await this.sqs.listQueues({
        QueueNamePrefix: queueName,
      });
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
    const createResult = await this.sqs.createQueue({
      QueueName: queueName,
    });
    logger.stupid(`createResult`, createResult);
    return true;
  };

  public setupStorage = async (
    bucketName: string,
    cors: {
      methods: Array<'GET' | 'POST' | 'PUT' | 'DELETE' | 'HEAD'>;
      origins: string[];
    },
  ) => {
    try {
      const listResult = await this.s3.listBuckets();
      if (
        listResult.Buckets &&
        listResult.Buckets.map((each) => each.Name).includes(bucketName)
      ) {
        logger.debug(`Bucket[${bucketName}] already exists.`);
        return true;
      }
    } catch (error) {
      logger.debug(`No bucket[${bucketName}] exists due to ${error}`);
    }
    logger.debug(`Create a bucket[${bucketName}] newly.`);
    const createResult = await this.s3.createBucket({
      Bucket: bucketName,
    });
    logger.stupid(`createResult`, createResult);
    if (cors) {
      const corsResult = await this.s3.putBucketCors({
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
      });
      logger.stupid(`corsResult`, corsResult);
    }
    return true;
  };

  public setupDynamoDb = async (tableName: string, keyColumn: string) => {
    try {
      const listResult = await this.dynamodbAdmin.listTables();
      if (listResult.TableNames && listResult.TableNames.includes(tableName)) {
        logger.debug(`Table[${tableName}] already exists.`);
        return true;
      }
    } catch (error) {
      logger.debug(`No table[${tableName}] exists due to ${error}`);
    }
    logger.debug(`Create a table[${tableName}] newly.`);
    const createResult = await this.dynamodbAdmin.createTable({
      TableName: tableName,
      KeySchema: [{ AttributeName: keyColumn, KeyType: 'HASH' }],
      AttributeDefinitions: [{ AttributeName: keyColumn, AttributeType: 'S' }],
      ProvisionedThroughput: {
        ReadCapacityUnits: 30,
        WriteCapacityUnits: 10,
      },
    });
    logger.stupid(`createResult`, createResult);
    return true;
  };
}
