import type {
  APIGatewayEvent,
  APIGatewayEventRequestContext,
} from 'aws-lambda';
import { getLogger } from '../utils/logger';

const logger = getLogger(__filename);

export interface RequestAuxBase {
  [pluginName: string]: any;
}

export class HandlerRequest {
  public event: APIGatewayEvent;
  public context: APIGatewayEventRequestContext;
  public lastError: Error | string | undefined;

  private lazyBody?: any;

  constructor(event: any, context: any) {
    this.event = event;
    this.context = context;
    this.lastError = undefined;
    const normalizedHeaders: Record<string, string | undefined> = {};
    if (this.event.headers) {
      for (const key of Object.keys(this.event.headers)) {
        normalizedHeaders[key.toLowerCase()] = this.event.headers[key];
      }
    }
    this.event.headers = normalizedHeaders;
  }

  get body() {
    if (!this.event.body) {
      return {};
    }
    if (this.lazyBody === undefined) {
      this.lazyBody = JSON.parse(this.event.body);
    }
    return this.lazyBody || {};
  }

  set body(value: any) {
    this.lazyBody = value;
  }

  get path(): { [key: string]: string | undefined } {
    return this.event.pathParameters || {};
  }

  get query(): { [key: string]: string | undefined } {
    return this.event.queryStringParameters || {};
  }

  set query(value: { [key: string]: any }) {
    this.event.queryStringParameters = value;
  }

  public header(key: string): string | undefined {
    return this.event.headers[key.toLowerCase()];
  }

  public records<T, U>(selector?: (each: T) => U) {
    const target = ((this.event as any).Records || []) as T[];
    return selector === undefined ? target : target.map(selector);
  }
}

export type CorsOptions = {
  exposedHeaders?: readonly string[];
} & (
  | { allowedOrigins: '*'; allowCredentials?: false }
  | { allowedOrigins: readonly string[]; allowCredentials?: boolean }
);

export interface HandlerOptions {
  plugins: Array<HandlerPluginBase<any>>;
  cors: CorsOptions;
}

export class HandlerResponse {
  public callback: any;
  public completed: boolean;
  public result: any | Promise<any> | undefined;

  private cookies: string[];
  private customHeaders: { [header: string]: any };
  private cors: CorsOptions;
  private requestOrigin?: string;

  constructor(callback: any, cors: CorsOptions, requestOrigin?: string) {
    this.callback = callback;
    this.completed = false;
    this.cookies = [];
    this.customHeaders = {};
    this.cors = cors;
    this.requestOrigin = requestOrigin;
  }

  public ok(body = {}, code = 200) {
    logger.stupid(`ok`, body);
    let multiValueHeaders: any = undefined;
    if (this.cookies.length > 0) {
      multiValueHeaders = { 'Set-Cookie': this.cookies };
    }
    const result = this.callback(null, {
      statusCode: code,
      headers: this.getHeaders(),
      multiValueHeaders,
      body: JSON.stringify(body),
    });
    this.completed = true;
    return result;
  }

  public fail(body = {}, code = 500) {
    logger.stupid(`fail`, body);
    const result = this.callback(null, {
      statusCode: code,
      headers: this.getHeaders(),
      body: JSON.stringify(body),
    });
    this.completed = true;
    return result;
  }

  public addCookie(
    key: string,
    value: string,
    domain?: string,
    sameSite?: 'None' | 'Lax' | 'Strict',
    secure?: boolean,
    path?: string,
    httpOnly?: boolean,
    maxAgeSeconds?: number,
  ) {
    const keyValueStr = `${key}=${value}`;
    const domainStr = domain ? `Domain=${domain}` : '';
    const sameSiteStr = sameSite ? `SameSite=${sameSite}` : '';
    const secureStr = secure ? 'Secure' : '';
    const pathStr = path !== undefined ? `Path=${path}` : '';
    const httpOnlyStr = httpOnly ? 'HttpOnly' : '';
    const maxAgeStr =
      maxAgeSeconds || maxAgeSeconds === 0 ? `Max-Age=${maxAgeSeconds}` : '';
    const cookieStr = [
      keyValueStr,
      domainStr,
      sameSiteStr,
      secureStr,
      pathStr,
      httpOnlyStr,
      maxAgeStr,
    ]
      .filter((x) => x)
      .join('; ');
    this.cookies.push(cookieStr);
  }

  public addHeader = (header: string, value: string) => {
    this.customHeaders[header] = value;
  };

  private getHeaders() {
    const headers = { ...this.customHeaders };
    const { allowedOrigins } = this.cors;
    const wildcard = allowedOrigins === '*';
    const variesByOrigin = !wildcard && allowedOrigins.length > 0;
    const vary: string[] = [];
    for (const name of Object.keys(headers)) {
      const lowerName = name.toLowerCase();
      if (variesByOrigin && lowerName === 'vary') {
        vary.push(
          ...String(headers[name])
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean),
        );
        delete headers[name];
      }
      if (
        lowerName === 'access-control-allow-origin' ||
        lowerName === 'access-control-allow-credentials' ||
        lowerName === 'access-control-expose-headers'
      ) {
        delete headers[name];
      }
    }

    if (
      wildcard ||
      (this.requestOrigin && allowedOrigins.includes(this.requestOrigin))
    ) {
      headers['Access-Control-Allow-Origin'] = wildcard
        ? '*'
        : this.requestOrigin;
      if (this.cors.allowCredentials) {
        headers['Access-Control-Allow-Credentials'] = 'true';
      }
      if (this.cors.exposedHeaders?.length) {
        headers['Access-Control-Expose-Headers'] =
          this.cors.exposedHeaders.join(', ');
      }
    }

    if (variesByOrigin) {
      if (
        !vary.some((name) => name === '*' || name.toLowerCase() === 'origin')
      ) {
        vary.push('Origin');
      }
      headers.Vary = vary.join(', ');
    }

    return headers;
  }
}

export interface HandlerAuxBase {
  [key: string]: any;
}

export interface HandlerContext<A extends HandlerAuxBase> {
  request: HandlerRequest;
  response: HandlerResponse;
  aux: A;
}

export type Handler<A extends HandlerAuxBase> = (
  context: HandlerContext<A>,
) => any | Promise<any> | undefined;

export interface HandlerPlugin<A extends HandlerAuxBase> {
  create: () => Promise<A> | A;
  begin: Handler<A>;
  end: Handler<A>;
  error: Handler<A>;
}

export class HandlerPluginBase<A extends HandlerAuxBase>
  implements HandlerPlugin<A>
{
  public create = (): Promise<A> | A => {
    throw new Error('Not yet implemented');
  };
  public begin = (_: HandlerContext<A>) => {
    // do nothing
  };
  public end = (_: HandlerContext<A>) => {
    // do nothing
  };
  public error = (_: HandlerContext<A>) => {
    // do nothing
  };
}
