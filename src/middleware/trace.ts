import { v4 as uuid4 } from 'uuid';
import {
  AWSComponent,
  loadAWSConfig,
  SimpleAWS,
  SimpleAWSConfigLoadParam,
} from '../aws';
import { getLogger, stringifyError } from '../utils';

import { SQS } from '@aws-sdk/client-sqs';
import { $enum } from 'ts-enum-util';
import { HandlerAuxBase, HandlerContext, HandlerPluginBase } from './base';

const logger = getLogger(__filename);

interface ITracerLog {
  uuid: string;
  timestamp: number;
  route: string;
  key: string;
  system: string;
  action: string;
  attribute: string;
  body: string;
  error: boolean;
  client: string;
  version: string;
}

interface ITracerLogInput {
  route?: string;
  key?: string;
  system?: string;
  action?: string;
  attribute: string;
  body: string;
  error?: boolean;
  client?: string;
  version?: string;
}

export class TracerLog implements ITracerLog {
  public readonly uuid: string;
  public readonly timestamp: number;

  constructor(
    public readonly route: string,
    public readonly key: string,
    public readonly system: string,
    public readonly action: string,
    public readonly attribute: string,
    public readonly body: string,
    public readonly error: boolean,
    public readonly client: string,
    public readonly version: string,
  ) {
    this.uuid = uuid4();
    this.timestamp = Date.now();
  }
}

export class Tracer {
  private queueName: string;
  private sqs: SQS;
  private buffer: TracerLog[];

  constructor(queueName: string, sqs: SQS) {
    this.queueName = queueName;
    this.sqs = sqs;
    this.buffer = [];
    logger.verbose(`[DEBUG] Tracer constructor: queueName=${queueName}`);
  }

  public push = (log: TracerLog) => this.buffer.push(log);

  public flush = async () => {
    // 메모리 상태 로깅 헬퍼
    const logMemory = (label: string) => {
      const mem = process.memoryUsage();
      console.log(`[MEMORY] ${label}: heapUsed=${Math.round(mem.heapUsed / 1024 / 1024)}MB, heapTotal=${Math.round(mem.heapTotal / 1024 / 1024)}MB, rss=${Math.round(mem.rss / 1024 / 1024)}MB, external=${Math.round(mem.external / 1024 / 1024)}MB`);
    };

    // 1초마다 heartbeat (이벤트 루프 동작 확인)
    let heartbeatCount = 0;
    const heartbeatInterval = setInterval(() => {
      heartbeatCount++;
      console.log(`[HEARTBEAT] #${heartbeatCount} at ${new Date().toISOString()}`);
      logMemory(`heartbeat-${heartbeatCount}`);
    }, 1000);

    logger.verbose(`[DEBUG] Tracer.flush() called, buffer.length=${this.buffer.length}`);
    logMemory('flush-start');

    if (this.buffer.length === 0) {
      clearInterval(heartbeatInterval);
      logger.verbose('[DEBUG] Tracer.flush() buffer is empty, returning early');
      return;
    }

    try {
      // SQS 클라이언트 config 출력
      logMemory('before-credentials');
      console.log(`[TIMING] before credentials: ${new Date().toISOString()}`);
      const sqsConfig = await this.sqs.config.region();
      console.log(`[TIMING] after region: ${new Date().toISOString()}`);
      const endpoint = await this.sqs.config.endpoint?.();
      console.log(`[TIMING] after endpoint: ${new Date().toISOString()}`);
      const credentials = await this.sqs.config.credentials?.();
      console.log(`[TIMING] after credentials: ${new Date().toISOString()}`);
      logMemory('after-credentials');
      logger.verbose(`[DEBUG] Tracer.flush() SQS client config: region=${sqsConfig}, endpoint=${JSON.stringify(endpoint)}, hasCredentials=${!!credentials}, accessKeyId=${credentials?.accessKeyId?.substring(0, 8)}...`);

      logger.verbose(`[DEBUG] Tracer.flush() calling sqs.getQueueUrl for queue: ${this.queueName}`);
      logMemory('before-getQueueUrl');

      // 5초 timeout으로 테스트
      const abortController = new AbortController();
      const timeoutId = setTimeout(() => {
        console.log(`[TIMEOUT] setTimeout callback fired at ${new Date().toISOString()}`);
        logMemory('timeout-callback');
        logger.warn('[DEBUG] Tracer.flush() sqs.getQueueUrl timeout after 5s, aborting...');
        abortController.abort();
        console.log(`[TIMEOUT] abort() called at ${new Date().toISOString()}`);
      }, 5000);

      const getQueueUrlStart = Date.now();
      console.log(`[TIMING] getQueueUrl request starting at ${new Date().toISOString()}`);

      let urlResult;
      try {
        urlResult = await this.sqs.getQueueUrl({
          QueueName: this.queueName,
        }, {
          abortSignal: abortController.signal,
        });
        console.log(`[TIMING] getQueueUrl completed at ${new Date().toISOString()}`);
      } finally {
        clearTimeout(timeoutId);
      }

      logger.verbose(`[DEBUG] Tracer.flush() sqs.getQueueUrl completed in ${Date.now() - getQueueUrlStart}ms`);
      logMemory('after-getQueueUrl');
      logger.stupid(`urlResult`, urlResult);
      if (!urlResult.QueueUrl) {
        throw new Error(`No queue url with name[${this.queueName}]`);
      }
      const eventQueueUrl = urlResult.QueueUrl;
      logger.verbose(`[DEBUG] Tracer.flush() got queue URL: ${eventQueueUrl}`);

      const chunkSize = 10;
      const totalChunks = Math.ceil(this.buffer.length / chunkSize);
      logger.verbose(`[DEBUG] Tracer.flush() sending ${this.buffer.length} messages in ${totalChunks} chunk(s)`);

      for (let begin = 0; begin < this.buffer.length; begin += chunkSize) {
        const chunkIndex = Math.floor(begin / chunkSize) + 1;
        const end = Math.min(this.buffer.length, begin + chunkSize);
        const subset = this.buffer.slice(begin, end);

        logger.verbose(`[DEBUG] Tracer.flush() sending chunk ${chunkIndex}/${totalChunks} (${subset.length} messages)`);
        const sendBatchStart = Date.now();
        const sendBatchResult = await this.sqs.sendMessageBatch({
          QueueUrl: eventQueueUrl,
          Entries: subset.map((each) => ({
            Id: `${each.key}_${each.uuid}`,
            MessageBody: JSON.stringify(each),
          })),
        });
        logger.verbose(`[DEBUG] Tracer.flush() chunk ${chunkIndex}/${totalChunks} sent in ${Date.now() - sendBatchStart}ms`);
        logger.stupid(`sendBatchResult`, sendBatchResult);
      }

      this.buffer = [];
      logger.verbose('[DEBUG] Tracer.flush() completed successfully');
    } catch (error) {
      console.log(`[ERROR] flush error at ${new Date().toISOString()}: ${stringifyError(error)}`);
      logMemory('error');
      logger.warn(`[DEBUG] Tracer.flush() error: ${stringifyError(error)}`);
      logger.warn(`Error in eventSource: ${error}`);
    } finally {
      clearInterval(heartbeatInterval);
      console.log(`[TIMING] flush finally block at ${new Date().toISOString()}, heartbeatCount=${heartbeatCount}`);
    }
  };
}

export class TracerWrapper {
  constructor(
    private tracer: Tracer,
    private route: string,
    private system: string,
    private key: string,
    private action: string,
    private client: string,
    private version: string,
  ) {}

  public push = (attribute: string, body: string, error: boolean = false) => {
    this.tracer.push(
      new TracerLog(
        this.route,
        this.key,
        this.system,
        this.action,
        attribute,
        body,
        error,
        this.client,
        this.version,
      ),
    );
  };

  public send = (log: ITracerLogInput) => {
    this.tracer.push(
      new TracerLog(
        log.route || this.route,
        log.key || this.key,
        log.system || this.system,
        log.action || this.action,
        log.attribute,
        log.body,
        log.error || false,
        log.client || this.client,
        log.version || this.version,
      ),
    );
  };
}

export interface TracerPluginOptions {
  route: string;
  queueName: string;
  system: string;

  awsConfig?: SimpleAWSConfigLoadParam;
  region?: string;
}

export interface TracerPluginAux extends HandlerAuxBase {
  tracer: (key: string, action: string) => TracerWrapper;
}

export class TracerPlugin extends HandlerPluginBase<TracerPluginAux> {
  private tracer: Tracer;
  private options: TracerPluginOptions;
  private last: { key: string; action: string };
  private client: { agent: string; version: string };

  constructor(options: TracerPluginOptions) {
    super();
    this.options = options;
    this.last = {
      key: 'nothing',
      action: 'unknown',
    };
    this.client = {
      agent: '',
      version: '',
    };
  }

  public create = async () => {
    logger.verbose(`[DEBUG] TracerPlugin.create() called, options: queueName=${this.options.queueName}, region=${this.options.region}`);

    const awsConfig = this.options.awsConfig
      ? await loadAWSConfig(this.options.awsConfig)
      : undefined;

    logger.verbose(`[DEBUG] TracerPlugin.create() awsConfig loaded: ${awsConfig ? 'yes' : 'no (using default)'}`);

    const sqs = (() => {
      if (!awsConfig) {
        logger.verbose(`[DEBUG] TracerPlugin.create() creating SQS client with region=${this.options.region}`);
        return new SQS({
          region: this.options.region,
        });
      }
      logger.verbose('[DEBUG] TracerPlugin.create() creating SQS client from SimpleAWS');
      $enum(AWSComponent).forEach((eachComponent) => {
        const config = awsConfig.get(eachComponent);
        if (config) {
          config.region = this.options.region;
        }
      });
      return new SimpleAWS(awsConfig).sqs;
    })();

    logger.verbose('[DEBUG] TracerPlugin.create() SQS client created, creating Tracer...');
    this.tracer = new Tracer(this.options.queueName, sqs);
    const tracer = (key: string, action: string) => {
      this.last = { key, action };
      return new TracerWrapper(
        this.tracer,
        this.options.route,
        this.options.system,
        key,
        action,
        this.client.agent,
        this.client.version,
      );
    };
    return { tracer };
  };

  public begin = ({ request }: HandlerContext<TracerPluginAux>) => {
    this.client.version = request.header('X-Version') || '0.0.0';
    this.client.agent = (() => {
      const fromHeader = request.header('User-Agent');
      if (fromHeader) {
        return fromHeader;
      }
      if (
        request.context &&
        request.context.identity &&
        request.context.identity.userAgent
      ) {
        return request.context.identity.userAgent;
      }
      return '';
    })();
  };

  public end = () => {
    logger.verbose('[DEBUG] TracerPlugin.end() called, starting flush...');
    const flushPromise = this.tracer.flush();
    flushPromise
      .then(() => logger.verbose('[DEBUG] TracerPlugin.end() flush promise resolved'))
      .catch((err) => logger.warn(`[DEBUG] TracerPlugin.end() flush promise rejected: ${stringifyError(err)}`));
    return flushPromise;
  };

  public error = ({ request, aux }: HandlerContext<TracerPluginAux>) => {
    if (!aux) {
      console.warn('Aux is not initialized');
      return;
    }
    if (!request.lastError) {
      return;
    }

    const { key, action } = this.last;
    aux
      .tracer(key, action)
      .push(
        'error',
        typeof request.lastError === 'string'
          ? request.lastError
          : stringifyError(request.lastError),
        true,
      );
  };
}

const build = (options: TracerPluginOptions) => new TracerPlugin(options);
export default build;
