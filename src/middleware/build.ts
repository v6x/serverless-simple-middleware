import { getLogger } from '../utils/logger';

import {
  Handler,
  HandlerAuxBase,
  HandlerPluginBase,
  HandlerRequest,
  HandlerResponse,
} from './base';

const logger = getLogger(__filename);

type Delegator = (okResponsible: boolean) => Promise<any>;

class HandlerMiddleware<A extends HandlerAuxBase> {
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
          this.plugins.map(plugin => {
            const maybePromise = plugin.create();
            return maybePromise instanceof Promise
              ? maybePromise
              : Promise.resolve(maybePromise);
          }),
        ).then(
          auxes => auxes.reduce((all, each) => ({ ...all, ...each }), {}) as A,
        );
  };
}

class HandlerProxy<A extends HandlerAuxBase> {
  private request: HandlerRequest;
  private response: HandlerResponse;
  private aux: A;

  public constructor(event: any, context: any, callback: any) {
    logger.stupid(`event`, event);
    this.request = new HandlerRequest(event, context);
    this.response = new HandlerResponse(callback);
    this.aux = {} as A; // tslint:disable-line
  }

  public call = async (
    middleware: HandlerMiddleware<A>,
    handler: Handler<A>,
  ) => {
    this.aux = await middleware.auxPromise;

    const beginHandlers = middleware.plugins.map(plugin =>
      this.generateDelegator(plugin.begin),
    );
    const endHandlers = middleware.plugins.map(plugin =>
      this.generateDelegator(plugin.end),
    );
    const errorHandlers = middleware.plugins.map(plugin =>
      this.generateDelegator(plugin.error),
    );

    for (const beginHandler of beginHandlers) {
      await this.safeCall(beginHandler, false, errorHandlers);
    }
    await this.safeCall(this.generateDelegator(handler), true, errorHandlers);
    for (const endHandler of endHandlers) {
      await this.safeCall(endHandler, false, errorHandlers);
    }
  };

  private safeCall = async (
    delegator: Delegator,
    okResponsible: boolean,
    errorHandlers: Delegator[],
  ) => {
    try {
      return await delegator(okResponsible);
    } catch (err) {
      return this.handleError(err, errorHandlers);
    }
  };

  private generateDelegator = (source: Handler<A>): Delegator => async (
    okResponsible: boolean,
  ) => {
    const maybePromise = source(this.request, this.response, this.aux);
    const result =
      maybePromise instanceof Promise ? await maybePromise : maybePromise;
    logger.stupid(`result`, result);
    if (this.response.completed) {
      return result;
    }
    if (okResponsible) {
      return this.response.ok(result);
    }
  };

  private handleError = async (error: Error, errorHandlers?: Delegator[]) => {
    logger.error(error);
    this.request.lastError = error;

    if (errorHandlers) {
      for (const handler of errorHandlers) {
        try {
          await handler(false);
        } catch (ignorable) {
          logger.error(ignorable);
        }
      }
    }
    if (!this.response.completed) {
      return this.response.fail(
        error instanceof Error ? { error: error.message } : error,
      );
    }
    return error;
  };
}

// It will break type safety because there is no relation between Aux and Plugin.
const build = <Aux extends HandlerAuxBase>(
  plugins: Array<HandlerPluginBase<any>>,
) => {
  const middleware = new HandlerMiddleware<Aux>(plugins);
  return (handler: Handler<Aux>) => async (
    event: any,
    context: any,
    callback: any,
  ) =>
    new HandlerProxy<Aux>(event, context, callback).call(middleware, handler);
};
export default build;
