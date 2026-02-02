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
import * as v8 from 'v8';
import { HandlerAuxBase, HandlerContext, HandlerPluginBase } from './base';

const logger = getLogger(__filename);

// ============================================================
// Memory Debugging Utilities
// ============================================================

interface MemorySnapshot {
  timestamp: string;
  label: string;
  process: {
    rss: number;          // Resident Set Size - 전체 프로세스 메모리
    heapTotal: number;    // V8이 예약한 힙 크기
    heapUsed: number;     // V8이 실제 사용 중인 힙
    external: number;     // V8 외부 C++ 객체 (Buffer 등)
    arrayBuffers: number; // ArrayBuffer, SharedArrayBuffer 메모리
  };
  v8Heap: {
    totalHeapSize: number;
    totalHeapSizeExecutable: number;
    totalPhysicalSize: number;
    totalAvailableSize: number;
    usedHeapSize: number;
    heapSizeLimit: number;
    mallocedMemory: number;
    peakMallocedMemory: number;
    externalMemory: number;
  };
  heapSpaces: Array<{
    name: string;
    size: number;
    used: number;
    available: number;
    physicalSize: number;
  }>;
}

const captureMemorySnapshot = (label: string): MemorySnapshot => {
  const mem = process.memoryUsage();
  const heapStats = v8.getHeapStatistics();
  const heapSpaces = v8.getHeapSpaceStatistics();

  return {
    timestamp: new Date().toISOString(),
    label,
    process: {
      rss: Math.round(mem.rss / 1024 / 1024 * 100) / 100,
      heapTotal: Math.round(mem.heapTotal / 1024 / 1024 * 100) / 100,
      heapUsed: Math.round(mem.heapUsed / 1024 / 1024 * 100) / 100,
      external: Math.round(mem.external / 1024 / 1024 * 100) / 100,
      arrayBuffers: Math.round(mem.arrayBuffers / 1024 / 1024 * 100) / 100,
    },
    v8Heap: {
      totalHeapSize: Math.round(heapStats.total_heap_size / 1024 / 1024 * 100) / 100,
      totalHeapSizeExecutable: Math.round(heapStats.total_heap_size_executable / 1024 / 1024 * 100) / 100,
      totalPhysicalSize: Math.round(heapStats.total_physical_size / 1024 / 1024 * 100) / 100,
      totalAvailableSize: Math.round(heapStats.total_available_size / 1024 / 1024 * 100) / 100,
      usedHeapSize: Math.round(heapStats.used_heap_size / 1024 / 1024 * 100) / 100,
      heapSizeLimit: Math.round(heapStats.heap_size_limit / 1024 / 1024 * 100) / 100,
      mallocedMemory: Math.round(heapStats.malloced_memory / 1024 / 1024 * 100) / 100,
      peakMallocedMemory: Math.round(heapStats.peak_malloced_memory / 1024 / 1024 * 100) / 100,
      externalMemory: Math.round(heapStats.external_memory / 1024 / 1024 * 100) / 100,
    },
    heapSpaces: heapSpaces.map(space => ({
      name: space.space_name,
      size: Math.round(space.space_size / 1024 / 1024 * 100) / 100,
      used: Math.round(space.space_used_size / 1024 / 1024 * 100) / 100,
      available: Math.round(space.space_available_size / 1024 / 1024 * 100) / 100,
      physicalSize: Math.round(space.physical_space_size / 1024 / 1024 * 100) / 100,
    })),
  };
};

const logMemorySnapshot = (snapshot: MemorySnapshot): void => {
  console.log(`\n[MEMORY:${snapshot.label}] ${snapshot.timestamp}`);
  console.log(`  Process: rss=${snapshot.process.rss}MB, heapTotal=${snapshot.process.heapTotal}MB, heapUsed=${snapshot.process.heapUsed}MB, external=${snapshot.process.external}MB, arrayBuffers=${snapshot.process.arrayBuffers}MB`);
  console.log(`  V8 Heap: used=${snapshot.v8Heap.usedHeapSize}MB, total=${snapshot.v8Heap.totalHeapSize}MB, limit=${snapshot.v8Heap.heapSizeLimit}MB, available=${snapshot.v8Heap.totalAvailableSize}MB`);
  console.log(`  V8 Native: malloced=${snapshot.v8Heap.mallocedMemory}MB, peakMalloced=${snapshot.v8Heap.peakMallocedMemory}MB, external=${snapshot.v8Heap.externalMemory}MB`);

  // Heap spaces 중 의미있는 것만 출력
  const significantSpaces = snapshot.heapSpaces.filter(s => s.used > 0.1);
  if (significantSpaces.length > 0) {
    console.log(`  Heap Spaces:`);
    significantSpaces.forEach(space => {
      console.log(`    ${space.name}: used=${space.used}MB, size=${space.size}MB, available=${space.available}MB`);
    });
  }
};

const compareMemorySnapshots = (before: MemorySnapshot, after: MemorySnapshot): void => {
  const diff = (a: number, b: number) => {
    const d = Math.round((b - a) * 100) / 100;
    return d >= 0 ? `+${d}` : `${d}`;
  };

  console.log(`\n[MEMORY:DIFF] ${before.label} -> ${after.label}`);
  console.log(`  Process: rss=${diff(before.process.rss, after.process.rss)}MB, heapTotal=${diff(before.process.heapTotal, after.process.heapTotal)}MB, heapUsed=${diff(before.process.heapUsed, after.process.heapUsed)}MB, external=${diff(before.process.external, after.process.external)}MB`);
  console.log(`  V8 Native: malloced=${diff(before.v8Heap.mallocedMemory, after.v8Heap.mallocedMemory)}MB, external=${diff(before.v8Heap.externalMemory, after.v8Heap.externalMemory)}MB`);
};

// ============================================================
// Tracer Implementation
// ============================================================

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
  private debugMemory: boolean;

  constructor(queueName: string, sqs: SQS, debugMemory: boolean = false) {
    this.queueName = queueName;
    this.sqs = sqs;
    this.buffer = [];
    this.debugMemory = debugMemory;
  }

  public push = (log: TracerLog) => this.buffer.push(log);

  public flush = async () => {
    const snapshots: MemorySnapshot[] = [];
    const capture = (label: string) => {
      if (!this.debugMemory) return;
      const snapshot = captureMemorySnapshot(label);
      logMemorySnapshot(snapshot);
      snapshots.push(snapshot);
    };

    capture('flush:start');

    if (this.buffer.length === 0) {
      return;
    }

    try {
      capture('flush:before-getQueueUrl');

      const urlResult = await this.sqs.getQueueUrl({
        QueueName: this.queueName,
      });

      capture('flush:after-getQueueUrl');

      logger.stupid(`urlResult`, urlResult);
      if (!urlResult.QueueUrl) {
        throw new Error(`No queue url with name[${this.queueName}]`);
      }
      const eventQueueUrl = urlResult.QueueUrl;

      const chunkSize = 10;
      const totalChunks = Math.ceil(this.buffer.length / chunkSize);

      for (let begin = 0; begin < this.buffer.length; begin += chunkSize) {
        const chunkIndex = Math.floor(begin / chunkSize) + 1;
        const end = Math.min(this.buffer.length, begin + chunkSize);
        const subset = this.buffer.slice(begin, end);

        capture(`flush:before-sendBatch-${chunkIndex}/${totalChunks}`);

        const sendBatchResult = await this.sqs.sendMessageBatch({
          QueueUrl: eventQueueUrl,
          Entries: subset.map((each) => ({
            Id: `${each.key}_${each.uuid}`,
            MessageBody: JSON.stringify(each),
          })),
        });

        capture(`flush:after-sendBatch-${chunkIndex}/${totalChunks}`);

        logger.stupid(`sendBatchResult`, sendBatchResult);
      }

      this.buffer = [];
      capture('flush:complete');

      // 전체 메모리 변화 요약
      if (this.debugMemory && snapshots.length >= 2) {
        compareMemorySnapshots(snapshots[0], snapshots[snapshots.length - 1]);
      }
    } catch (error) {
      capture('flush:error');
      logger.warn(`Error in eventSource: ${error}`);
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
  debugMemory?: boolean;
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
    const awsConfig = this.options.awsConfig
      ? await loadAWSConfig(this.options.awsConfig)
      : undefined;

    const sqs = (() => {
      if (!awsConfig) {
        return new SQS({
          region: this.options.region,
        });
      }
      $enum(AWSComponent).forEach((eachComponent) => {
        const config = awsConfig.get(eachComponent);
        if (config) {
          config.region = this.options.region;
        }
      });
      return new SimpleAWS(awsConfig).sqs;
    })();

    this.tracer = new Tracer(
      this.options.queueName,
      sqs,
      this.options.debugMemory ?? false,
    );
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

  public end = () => this.tracer.flush();

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
