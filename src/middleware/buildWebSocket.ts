import type {
  APIGatewayProxyWebsocketEventV2,
  APIGatewayProxyWebsocketHandlerV2,
  Context,
} from 'aws-lambda';
import { stringifyError } from '../utils';
import { getLogger } from '../utils/logger';
import { HandlerPluginBase } from './base';
import {
  WebSocketHandler,
  WebSocketHandlerAuxBase,
  WebSocketHandlerRequest,
  WebSocketHandlerResponse,
} from './websocketBase';

const logger = getLogger(__filename);

type WebSocketDelegator = () => Promise<WebSocketHandlerResponse | undefined>;

class WebSocketHandlerMiddleware<A extends WebSocketHandlerAuxBase> {
  public auxPromise: Promise<A>;
  public plugins: Array<HandlerPluginBase<any>>;

  constructor(plugins: Array<HandlerPluginBase<any>>) {
    this.plugins = plugins;
    this.auxPromise = this.createAuxPromise();
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
        body: JSON.stringify(
          error instanceof Error ? { error: error.message } : error,
        ),
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
      body: JSON.stringify(
        error instanceof Error ? { error: error.message } : error,
      ),
    };

    return error;
  };
}

const buildWebSocket = <Aux extends WebSocketHandlerAuxBase>(
  plugins: Array<HandlerPluginBase<any>>,
) => {
  const middleware = new WebSocketHandlerMiddleware<Aux>(plugins);
  return (handler: WebSocketHandler<Aux>): APIGatewayProxyWebsocketHandlerV2 =>
    async (event: APIGatewayProxyWebsocketEventV2, context: Context) => {
      return new WebSocketHandlerProxy<Aux>(event, context).call(
        middleware,
        handler,
      );
    };
};

export default buildWebSocket;
