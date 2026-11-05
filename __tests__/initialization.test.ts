import { HandlerPluginBase } from '../src/middleware/base';
import build from '../src/middleware/build';
import buildWebSocket from '../src/middleware/buildWebSocket';

test.each(['HTTP', 'WebSocket'])(
  '%s handles shared initialization failure before every handler is invoked',
  async (transport) => {
    let initialization: Promise<{}> | undefined;
    const plugin = new HandlerPluginBase();
    plugin.create = () => {
      initialization ??= Promise.reject(
        new Error('fixture initialization failure'),
      );
      return initialization;
    };
    const handler = jest.fn(() => ({ statusCode: 200 }));
    const invocations = Array.from({ length: 4 }, () => {
      if (transport === 'HTTP') {
        const invoke = build({
          plugins: [plugin],
          cors: { allowedOrigins: [] },
        })(handler);
        return () =>
          new Promise((resolve, reject) => {
            invoke({}, {}, (error: unknown, response: unknown) =>
              error ? reject(error) : resolve(response),
            );
          });
      }
      const invoke = buildWebSocket([plugin])(handler);
      return () => invoke({} as any, {} as any, () => {});
    });
    const expected = {
      statusCode: 500,
      body: '{"error":"Internal Server Error"}',
    };

    expect(await invocations[0]()).toMatchObject(expected);
    await new Promise((resolve) => setImmediate(resolve));
    for (const invoke of invocations.slice(1)) {
      expect(await invoke()).toMatchObject(expected);
    }
    expect(handler).not.toHaveBeenCalled();
  },
);
test.each(['HTTP', 'WebSocket'])(
  '%s handler errors are logged but not returned',
  async (transport) => {
    // The HTTP builder rethrows handler errors under NODE_ENV=test.
    const env = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const failing = () => {
        throw Object.assign(new Error('Duplicate entry'), {
          sql: "INSERT INTO user VALUES ('secret')",
        });
      };
      const response =
        transport === 'HTTP'
          ? await new Promise<any>((resolve) =>
              build({ plugins: [], cors: { allowedOrigins: [] } })(failing)(
                {},
                {},
                (_error: unknown, result: unknown) => resolve(result),
              ),
            )
          : await buildWebSocket([])(failing)({} as any, {} as any, () => {});
      // The callback fires before the HTTP builder finishes its error checks.
      await new Promise((resolve) => setImmediate(resolve));
      const lines = log.mock.calls.map(([line]) => String(line)).join('\n');

      expect(response).toMatchObject({
        statusCode: 500,
        body: '{"error":"Internal Server Error"}',
      });
      expect(lines).toContain('Duplicate entry');
      expect(lines).toContain('secret');
    } finally {
      log.mockRestore();
      process.env.NODE_ENV = env;
    }
  },
);
