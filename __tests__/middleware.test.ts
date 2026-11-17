import {
  AWSPluginAux,
  getLogger,
  HandlerRequest,
  middleware,
  TracerPluginAux,
  WebSocketHandlerRequest,
} from '../src';

test('a thrown non-Error is hidden from the response but logged in full', async () => {
  const log = jest.spyOn(console, 'log').mockImplementation(() => {});
  const handler = middleware.build({
    cors: { allowedOrigins: [] },
    plugins: [],
  });

  const response = await new Promise<any>((resolve) =>
    handler(() => {
      throw { code: 'NOT_FOUND' };
    })({}, {}, (_: unknown, result: any) => resolve(result)),
  );
  const lines = log.mock.calls.map(([line]) => String(line)).join('\n');
  log.mockRestore();

  expect(response).toMatchObject({
    statusCode: 500,
    body: '{"error":"Internal Server Error"}',
  });
  expect(lines).toContain('"code":"NOT_FOUND"');
});

test('the logger never throws on a circular object', () => {
  const log = jest.spyOn(console, 'log').mockImplementation(() => {});
  const circular: { self?: unknown } = {};
  circular.self = circular;

  expect(() => getLogger('t').error(circular as Error)).not.toThrow();
  log.mockRestore();
});

test('an unparsable body is reported without quoting it', () => {
  const log = jest.spyOn(console, 'log').mockImplementation(() => {});
  const http = new HandlerRequest({ body: 'secret=1' }, {});
  const socket = new WebSocketHandlerRequest(
    { body: 'secret=1', requestContext: {} } as any,
    {} as any,
  );

  expect(() => http.body).toThrow(
    new SyntaxError('Request body is not valid JSON'),
  );
  expect(socket.body).toEqual({});
  const lines = log.mock.calls.map(([line]) => String(line)).join('\n');
  log.mockRestore();
  expect(lines).toContain('WebSocket body is not valid JSON');
  expect(lines).not.toContain('secret');
});

test('basic', async () => {
  type Aux = AWSPluginAux & TracerPluginAux;
  const handler = middleware.build<Aux>({
    cors: { allowedOrigins: [] },
    plugins: [
      middleware.aws(),
      middleware.trace({
        route: 'index/type',
        queueName: 'trace-queue',
        system: 'hello-world',
      }),
    ],
  });

  await handler(async ({ request, response, aux }) => {
    const { aws, tracer } = aux;
    expect(request).toBeDefined();
    expect(response).toBeDefined();
    expect(aws).toBeDefined();
    expect(tracer).toBeDefined();
  })({}, {}, () => 0);
});
