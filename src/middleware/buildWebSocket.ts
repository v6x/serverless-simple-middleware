import type {
  APIGatewayProxyWebsocketEventV2,
  APIGatewayProxyWebsocketHandlerV2,
  Context,
} from 'aws-lambda';
import { treeifyError, type z, type ZodSchema } from 'zod';
import { stringifyError } from '../utils';
import { getLogger } from '../utils/logger';
import { HandlerPluginBase } from './base';
import { InvalidResponder, respondInvalid, validate } from './validation';
import {
  WebSocketHandler,
  WebSocketHandlerAuxBase,
  WebSocketHandlerRequest,
  WebSocketHandlerResponse,
} from './websocketBase';

const logger = getLogger(__filename);
const INTERNAL_ERROR = { error: 'Internal Server Error' };

type WebSocketDelegator = () => Promise<WebSocketHandlerResponse | undefined>;

class WebSocketHandlerMiddleware<A extends WebSocketHandlerAuxBase> {
  public auxPromise: Promise<A>;
  public plugins: Array<HandlerPluginBase<any>>;

  constructor(plugins: Array<HandlerPluginBase<any>>) {
    this.plugins = plugins;
    this.auxPromise = this.createAuxPromise();
    void this.auxPromise.catch(() => {});
  }

  private createAuxPromise = (): Promise<A> => {
    return !this.plugins || this.plugins.length === 0
      ? Promise.resolve({} as A) // tslint:disable-line
      : Promise.all(
          this.plugins.map((plugin) => {
            const maybePromise = plugin.create();
            return maybePromise instanceof Promise
              ? maybePromise
              : Promise.resolve(maybePromise);
          }),
        ).then(
          (auxes) =>
            auxes.reduce((all, each) => ({ ...all, ...each }), {}) as A,
        );
  };
}

class WebSocketHandlerProxy<A extends WebSocketHandlerAuxBase> {
  private request: WebSocketHandlerRequest;
  private aux: A;
  private result: WebSocketHandlerResponse;

  public constructor(event: APIGatewayProxyWebsocketEventV2, context: Context) {
    logger.stupid(`WebSocket event`, event);
    this.request = new WebSocketHandlerRequest(event, context);
    this.aux = {} as A; // tslint:disable-line
    this.result = { statusCode: 200 };
  }

  public call = async (
    middleware: WebSocketHandlerMiddleware<A>,
    handler: WebSocketHandler<A>,
  ): Promise<WebSocketHandlerResponse> => {
    try {
      this.aux = await middleware.auxPromise;
    } catch (error) {
      logger.error(
        `Error while initializing plugins' aux: ${stringifyError(error)}`,
      );
      return {
        statusCode: 500,
        body: JSON.stringify(INTERNAL_ERROR),
      };
    }

    const actualHandler = [this.generateHandlerDelegator(handler)];
    const beginHandlers = middleware.plugins.map((plugin) =>
      this.generatePluginDelegator(plugin.begin),
    );
    const endHandlers = middleware.plugins.map((plugin) =>
      this.generatePluginDelegator(plugin.end),
    );
    const errorHandlers = middleware.plugins.map((plugin) =>
      this.generatePluginDelegator(plugin.error),
    );

    const iterate = async (handlers: WebSocketDelegator[]) =>
      Promise.all(handlers.map((each) => this.safeCall(each, errorHandlers)));

    const results = [
      ...(await iterate(beginHandlers)),
      ...(await iterate(actualHandler)),
      ...(await iterate(endHandlers)),
    ].filter((x) => x);

    // In test phase, throws any exception if there was.
    if (process.env.NODE_ENV === 'test') {
      for (const each of results) {
        if (each instanceof Error) {
          logger.error(`Error occurred: ${stringifyError(each)}`);
          throw each;
        }
      }
    }

    results.forEach((result) =>
      logger.silly(`WebSocket middleware result: ${JSON.stringify(result)}`),
    );

    return this.result;
  };

  private safeCall = async (
    delegator: WebSocketDelegator,
    errorHandlers: WebSocketDelegator[],
  ) => {
    try {
      const result = await delegator();
      return result;
    } catch (error) {
      const handled = await this.handleError(error, errorHandlers);
      return handled;
    }
  };

  private generateHandlerDelegator =
    (handler: WebSocketHandler<A>): WebSocketDelegator =>
    async () => {
      const maybePromise = handler({
        request: this.request,
        response: undefined, // WebSocket doesn't use response
        aux: this.aux,
      });
      const result =
        maybePromise instanceof Promise ? await maybePromise : maybePromise;
      logger.stupid(`WebSocket handler result`, result);

      if (result) {
        this.result = result;
      }
      return result;
    };

  private generatePluginDelegator =
    (pluginCallback: (context: any) => any): WebSocketDelegator =>
    async () => {
      const maybePromise = pluginCallback({
        request: this.request,
        response: undefined, // WebSocket doesn't use response (for HTTP plugin compatibility)
        aux: this.aux,
      });
      const result =
        maybePromise instanceof Promise ? await maybePromise : maybePromise;
      logger.stupid(`WebSocket plugin callback result`, result);
      return result;
    };

  private handleError = async (
    error: Error,
    errorHandlers?: WebSocketDelegator[],
  ) => {
    logger.error(error);
    this.request.lastError = error;

    if (errorHandlers) {
      for (const handler of errorHandlers) {
        try {
          await handler();
        } catch (ignorable) {
          logger.error(ignorable);
        }
      }
    }

    this.result = {
      statusCode: 500,
      body: JSON.stringify(INTERNAL_ERROR),
    };

    return error;
  };
}

export interface WebSocketBuildOptions {
  /** Response for failed validation unless an endpoint overrides it; defaults to 400 with the zod error tree. */
  onInvalid?: InvalidResponder<WebSocketHandlerResponse>;
}

const buildWebSocket = <Aux extends WebSocketHandlerAuxBase>(
  plugins: Array<HandlerPluginBase<any>>,
  options: WebSocketBuildOptions = {},
) => {
  const middleware = new WebSocketHandlerMiddleware<Aux>(plugins);
  const invoke =
    (handler: WebSocketHandler<Aux>): APIGatewayProxyWebsocketHandlerV2 =>
    async (event: APIGatewayProxyWebsocketEventV2, context: Context) => {
      return new WebSocketHandlerProxy<Aux>(event, context).call(
        middleware,
        handler,
      );
    };

  /**
   * @param schema - Zod schema to validate the message body.
   * @param handler - Handler that receives the validated body.
   * @param onInvalid - Optional callback returning the response for an invalid
   *   body, ahead of the builder's `onInvalid`. `{ logOnly: true }` only logs a
   *   failure and passes the raw body through.
   */
  function withBody<S>(
    schema: ZodSchema<S>,
    handler: (context: {
      request: Omit<WebSocketHandlerRequest, 'body'> & { body: S };
      response: undefined;
      aux: Aux;
    }) => ReturnType<WebSocketHandler<Aux>>,
    onInvalid?: InvalidResponder<WebSocketHandlerResponse, S>,
  ): APIGatewayProxyWebsocketHandlerV2;
  function withBody<Z extends ZodSchema>(
    schema: Z,
    handler: (context: {
      request: Omit<WebSocketHandlerRequest, 'body'> & { body: z.input<Z> };
      response: undefined;
      aux: Aux;
    }) => ReturnType<WebSocketHandler<Aux>>,
    onInvalid: { logOnly: true },
  ): APIGatewayProxyWebsocketHandlerV2;
  function withBody<S>(
    schema: ZodSchema<S>,
    handler: (context: {
      request: Omit<WebSocketHandlerRequest, 'body'> & { body: S };
      response: undefined;
      aux: Aux;
    }) => ReturnType<WebSocketHandler<Aux>>,
    onInvalid?:
      | InvalidResponder<WebSocketHandlerResponse, S>
      | { logOnly: true },
  ) {
    return invoke(async ({ request, response, aux }) => {
      const { outcome, observation } = validate(schema, () => request.body, {
        logOnly: typeof onInvalid === 'object' && onInvalid?.logOnly === true,
        key: 'body',
        target: request.routeKey,
        source: `route=${request.routeKey}`,
      });
      request.validation = observation;

      if (outcome.kind === 'invalid') {
        const custom = await respondInvalid(outcome.error, [
          typeof onInvalid === 'function' ? onInvalid : undefined,
          options.onInvalid,
        ]);
        return (
          custom ?? {
            statusCode: 400,
            body: JSON.stringify(treeifyError(outcome.error)),
          }
        );
      }
      if (outcome.kind === 'valid') {
        request.body = outcome.data;
      }
      return handler({
        request: request as Omit<WebSocketHandlerRequest, 'body'> & { body: S },
        response,
        aux,
      });
    });
  }

  invoke.withBody = withBody;
  return invoke;
};

export default buildWebSocket;
