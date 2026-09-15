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
      body: '{"error":"fixture initialization failure"}',
    };

    expect(await invocations[0]()).toMatchObject(expected);
    await new Promise((resolve) => setImmediate(resolve));
    for (const invoke of invocations.slice(1)) {
      expect(await invoke()).toMatchObject(expected);
    }
    expect(handler).not.toHaveBeenCalled();
  },
);
