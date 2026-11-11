import { getLogger } from '../utils/logger';

import { treeifyError, type z, type ZodSchema } from 'zod';
import { stringifyError } from '../utils';
import {
  CorsOptions,
  Handler,
  HandlerAuxBase,
  HandlerOptions,
  HandlerPluginBase,
  HandlerRequest,
  HandlerResponse,
  InvalidResponse,
} from './base';
import { InvalidResponder, respondInvalid, validate } from './validation';

const logger = getLogger(__filename);
const INTERNAL_ERROR = { error: 'Internal Server Error' };

type Delegator = (okResponsible: boolean) => Promise<any>;

class HandlerMiddleware<A extends HandlerAuxBase> {
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

class HandlerProxy<A extends HandlerAuxBase> {
  private request: HandlerRequest;
  private response: HandlerResponse;
  private aux: A;

  public constructor(
    event: any,
    context: any,
    callback: any,
    cors: CorsOptions,
  ) {
    logger.stupid(`event`, event);
    this.request = new HandlerRequest(event, context);
    this.response = new HandlerResponse(
      callback,
      cors,
      this.request.header('Origin'),
    );
    this.aux = {} as A; // tslint:disable-line
  }

  public call = async (
    middleware: HandlerMiddleware<A>,
    handler: Handler<A>,
  ) => {
    try {
      this.aux = await middleware.auxPromise;
    } catch (error) {
      logger.error(
        `Error while initializing plugins' aux: ${stringifyError(error)}`,
      );
      this.response.fail(INTERNAL_ERROR);
      return [error];
    }

    const actualHandler = [this.generateDelegator(handler)];
    const beginHandlers = middleware.plugins.map((plugin) =>
      this.generateDelegator(plugin.begin),
    );
    const endHandlers = middleware.plugins.map((plugin) =>
      this.generateDelegator(plugin.end),
    );
    const errorHandlers = middleware.plugins.map((plugin) =>
      this.generateDelegator(plugin.error),
    );

    const iterate = async (
      handlers: Delegator[],
      okResponsible: boolean = false,
    ) =>
      Promise.all(
        handlers.map((each) =>
          this.safeCall(each, okResponsible, errorHandlers),
        ),
      );

    const results = [
      ...(await iterate(beginHandlers)),
      ...(await iterate(actualHandler, true)),
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
      logger.silly(`middleware result : ${JSON.stringify(result)}`),
    );
  };

  private safeCall = async (
    delegator: Delegator,
    okResponsible: boolean,
    errorHandlers: Delegator[],
  ) => {
    try {
      const result = await delegator(okResponsible);
      return result;
    } catch (error) {
      const handled = await this.handleError(error, errorHandlers);
      return handled;
    }
  };

  private generateDelegator =
    (handler: Handler<A>): Delegator =>
    async (okResponsible: boolean) => {
      const maybePromise = handler({
        request: this.request,
        response: this.response,
        aux: this.aux,
      });
      const result =
        maybePromise instanceof Promise ? await maybePromise : maybePromise;
      logger.stupid(`result`, result);
      if (!this.response.completed && okResponsible) {
        this.response.ok(result);
      }
      return result;
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
      this.response.fail(INTERNAL_ERROR);
    }
    return error;
  };
}

const validateCors = (cors: CorsOptions) => {
  if (!cors) {
    throw new TypeError(
      'cors is required; use { allowedOrigins: [] } to disable CORS.',
    );
  }
  if (cors.allowedOrigins === '*' && cors.allowCredentials) {
    throw new TypeError(
      'Wildcard origins cannot be used with allowCredentials.',
    );
  }
  if (cors.allowedOrigins !== '*') {
    for (const origin of cors.allowedOrigins) {
      const url = new URL(origin);
      if (!url.host || `${url.protocol}//${url.host}` !== origin) {
        throw new TypeError(`Invalid CORS origin: ${origin}`);
      }
    }
  }
};

export type BuiltHandler<Aux extends HandlerAuxBase> = ReturnType<
  typeof bindCors<Aux>
>;

const bindCors = <Aux extends HandlerAuxBase>(
  middleware: HandlerMiddleware<Aux>,
  cors: CorsOptions,
  defaultOnInvalid?: InvalidResponder<InvalidResponse>,
) => {
  const invoke =
    (handler: Handler<Aux>) => (event: any, context: any, callback: any) => {
      new HandlerProxy<Aux>(event, context, callback, cors).call(
        middleware,
        handler,
      );
    };

  /**
   * @param schema - Zod schema to validate the request `key` part; `event` is
   *   the raw Lambda event, for direct invocations and other non-HTTP triggers.
   * @param handler - Handler that receives the validated value.
   * @param onInvalid - Optional callback to customize invalid responses. If it
   *   returns `{ statusCode, body }`, that is sent instead of the builder's
   *   `onInvalid` or the default zod error payload. `{ logOnly: true }` only
   *   observes: it logs a failure and always passes the raw value through, so
   *   the handler gets it unparsed. An unparsable body is only logged; the
   *   handler hits the same error on read.
   */
  const withValidated = <K extends 'body' | 'query' | 'path' | 'event'>(
    key: K,
  ) => {
    function validated<S>(
      schema: ZodSchema<S>,
      handler: (context: {
        request: Omit<HandlerRequest, K> & { [P in K]: S };
        response: HandlerResponse;
        aux: Aux;
      }) => any,
      onInvalid?: InvalidResponder<InvalidResponse, S>,
    ): ReturnType<typeof invoke>;
    function validated<Z extends ZodSchema>(
      schema: Z,
      handler: (context: {
        request: Omit<HandlerRequest, K> & { [P in K]: z.input<Z> };
        response: HandlerResponse;
        aux: Aux;
      }) => any,
      onInvalid: { logOnly: true },
    ): ReturnType<typeof invoke>;
    function validated<S>(
      schema: ZodSchema<S>,
      handler: (context: {
        request: Omit<HandlerRequest, K> & { [P in K]: S };
        response: HandlerResponse;
        aux: Aux;
      }) => any,
      onInvalid?: InvalidResponder<InvalidResponse, S> | { logOnly: true },
    ) {
      return invoke(async ({ request, response, aux }) => {
        const target =
          (key === 'event'
            ? process.env.AWS_LAMBDA_FUNCTION_NAME
            : request.event.resource) ?? '';
        const { outcome, observation } = validate(schema, () => request[key], {
          logOnly: typeof onInvalid === 'object' && onInvalid?.logOnly === true,
          key,
          target,
          source:
            key === 'event'
              ? `function=${target}`
              : `resource=${target} user-agent=${request.header('user-agent')}`,
        });
        request.validation = observation;

        if (outcome.kind === 'invalid') {
          const custom = await respondInvalid(outcome.error, [
            typeof onInvalid === 'function' ? onInvalid : undefined,
            defaultOnInvalid,
          ]);
          return custom
            ? response.fail(custom.body, custom.statusCode)
            : response.fail(treeifyError(outcome.error), 400);
        }
        if (outcome.kind === 'valid') {
          (request as unknown as Record<K, S>)[key] = outcome.data;
        }
        return handler({
          request: request as Omit<HandlerRequest, K> & { [P in K]: S },
          response,
          aux,
        });
      });
    }
    return validated;
  };

  return Object.assign(invoke, {
    withBody: withValidated('body'),
    withQuery: withValidated('query'),
    withPath: withValidated('path'),
    withEvent: withValidated('event'),
    withCors: (next: CorsOptions): BuiltHandler<Aux> => {
      validateCors(next);
      return bindCors(middleware, next, defaultOnInvalid);
    },
  });
};

// It will break type safety because there is no relation between Aux and Plugin.
const build = <Aux extends HandlerAuxBase>({
  plugins,
  cors,
  onInvalid,
}: HandlerOptions): BuiltHandler<Aux> => {
  validateCors(cors);
  return bindCors(new HandlerMiddleware<Aux>(plugins), cors, onInvalid);
};
export default build;
