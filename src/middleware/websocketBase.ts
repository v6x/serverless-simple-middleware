import type { APIGatewayProxyWebsocketEventV2, Context } from 'aws-lambda';
import { getLogger } from '../utils/logger';

const logger = getLogger(__filename);

export interface WebSocketHandlerAuxBase {
  [key: string]: any;
}

export class WebSocketHandlerRequest {
  public event: APIGatewayProxyWebsocketEventV2;
  public context: Context;
  public lastError: Error | string | undefined;

  private lazyBody?: any;

  constructor(event: APIGatewayProxyWebsocketEventV2, context: Context) {
    this.event = event;
    this.context = context;
    this.lastError = undefined;
  }

  get body() {
    if (!this.event.body) {
      return {};
    }
    if (this.lazyBody === undefined) {
      try {
        this.lazyBody = JSON.parse(this.event.body);
      } catch (error) {
        logger.error(`Failed to parse WebSocket body: ${error}`);
        this.lazyBody = {};
      }
    }
    return this.lazyBody || {};
  }

  get connectionId(): string {
    return this.event.requestContext.connectionId;
  }

  get routeKey(): string {
    return this.event.requestContext.routeKey;
  }

  get domainName(): string {
    return this.event.requestContext.domainName;
  }

  get stage(): string {
    return this.event.requestContext.stage;
  }

  // HTTP plugin compatibility methods

  /**
   * For HTTP plugin compatibility (TracerPlugin uses this).
   * WebSocket events may have headers in $connect route (HTTP handshake),
   * but typically don't have headers in other routes.
   */
  public header(key: string): string | undefined {
    const event = this.event as any;
    if (event.headers) {
      return event.headers[key.toLowerCase()];
    }
    return undefined;
  }
}

export interface WebSocketHandlerResponse {
  statusCode: number;
  body?: string;
}

export interface WebSocketHandlerContext<A extends WebSocketHandlerAuxBase> {
  request: WebSocketHandlerRequest;
  response: undefined; // For HTTP plugin compatibility (not used in WebSocket handlers)
  aux: A;
}

export type WebSocketHandler<A extends WebSocketHandlerAuxBase> = (
  context: WebSocketHandlerContext<A>,
) => WebSocketHandlerResponse | Promise<WebSocketHandlerResponse> | undefined;
