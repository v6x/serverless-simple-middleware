import { z } from 'zod';
import { SQS } from '@aws-sdk/client-sqs';
import build from '../src/middleware/build';
import buildWebSocket from '../src/middleware/buildWebSocket';
import trace from '../src/middleware/trace';
import { parseLogOnly } from '../src/middleware/validation';

const handler = build({ plugins: [], cors: { allowedOrigins: [] } });

const call = (
  invoke: (event: any, context: any, callback: any) => void,
  event: any,
) =>
  new Promise<any>((resolve) =>
    invoke(event, {}, (_error: unknown, response: any) => resolve(response)),
  );

test('withPath converts path parameters and rejects invalid ones', async () => {
  const schema = z.object({ id: z.string().regex(/^\d+$/).transform(Number) });
  const invoke = handler.withPath(schema, ({ request }) => request.path);

  expect(await call(invoke, { pathParameters: { id: '12' } })).toMatchObject({
    statusCode: 200,
    body: '{"id":12}',
  });
  expect(await call(invoke, { pathParameters: { id: '1abc' } })).toMatchObject({
    statusCode: 400,
  });
});

test('withQuery validates the query string', async () => {
  const invoke = handler.withQuery(
    z.object({ page: z.string().regex(/^\d+$/) }),
    ({ request }) => request.query,
  );

  expect(
    await call(invoke, { queryStringParameters: { page: '2' } }),
  ).toMatchObject({ statusCode: 200, body: '{"page":"2"}' });
  expect(
    await call(invoke, { queryStringParameters: { page: 'x' } }),
  ).toMatchObject({ statusCode: 400 });
});

test('logOnly passes the raw body through whether valid or not', async () => {
  const invoke = handler.withBody(
    z.object({ n: z.number().transform((n) => n + 1) }),
    ({ request }) => request.body,
    { logOnly: true },
  );

  expect(await call(invoke, { body: '{"n":1,"extra":true}' })).toMatchObject({
    statusCode: 200,
    body: '{"n":1,"extra":true}',
  });
  expect(await call(invoke, { body: '{"n":"1"}' })).toMatchObject({
    statusCode: 200,
    body: '{"n":"1"}',
  });
});

test('logOnly leaves an unparsable body to the handler and logs field paths', async () => {
  const log = jest.spyOn(console, 'log').mockImplementation(() => {});
  const invoke = handler.withBody(
    z.union([
      z.array(z.unknown()),
      z.object({ events: z.array(z.object({ value: z.number() })) }),
    ]),
    ({ request }) => {
      try {
        return request.body;
      } catch {
        return 'unparsable';
      }
    },
    { logOnly: true },
  );

  expect(await call(invoke, { body: '{bad' })).toMatchObject({
    statusCode: 200,
    body: '"unparsable"',
  });
  await call(invoke, { body: '{"events":[{"value":"secret"}]}' });
  const lines = log.mock.calls.map(([line]) => String(line)).join('\n');
  log.mockRestore();
  expect(lines).toContain('body could not be parsed');
  expect(lines).toContain('events.0.value: Invalid input: expected number');
  expect(lines).not.toContain('secret');
});

test('withEvent validates a direct invocation payload without headers', async () => {
  process.env.AWS_LAMBDA_FUNCTION_NAME = 'worker-fn';
  const log = jest.spyOn(console, 'log').mockImplementation(() => {});
  try {
    const schema = z.strictObject({ uid: z.string() });
    const observe = handler.withEvent(
      schema,
      ({ request }) => request.event.uid,
      { logOnly: true },
    );
    const enforce = handler.withEvent(schema, ({ request }) => [
      request.event.uid,
      request.header('x-version') ?? null,
    ]);

    expect(await call(observe, { uid: 1 })).toMatchObject({
      statusCode: 200,
      body: '1',
    });
    expect(await call(enforce, { uid: 'u1' })).toMatchObject({
      statusCode: 200,
      body: '["u1",null]',
    });
    expect(await call(enforce, { uid: 1 })).toMatchObject({ statusCode: 400 });
    const lines = log.mock.calls.map(([line]) => String(line)).join('\n');
    expect(lines).toContain('uid: Invalid input: expected string');
    expect(lines).toContain('function=worker-fn');
    expect(lines).not.toContain('headers');
  } finally {
    log.mockRestore();
    delete process.env.AWS_LAMBDA_FUNCTION_NAME;
  }
});

test('only { logOnly: true } skips enforcement', async () => {
  const log = jest.spyOn(console, 'log').mockImplementation(() => {});
  const invoke = handler.withBody(
    z.object({ n: z.number() }),
    ({ request }) => request.body,
    { logOnly: false } as unknown as { logOnly: true },
  );

  expect(await call(invoke, { body: '{"n":"1"}' })).toMatchObject({
    statusCode: 400,
  });
  log.mockRestore();
});

test('logOnly logs a throwing schema by its message and still runs the handler', async () => {
  const log = jest.spyOn(console, 'log').mockImplementation(() => {});
  const invoke = handler.withBody(
    z.object({}).refine(() => {
      throw new Error('refine boom');
    }),
    () => 'ran',
    { logOnly: true },
  );

  expect(await call(invoke, { body: '{}' })).toMatchObject({
    statusCode: 200,
    body: '"ran"',
  });
  const lines = log.mock.calls.map(([line]) => String(line)).join('\n');
  log.mockRestore();
  expect(lines).toContain('Validation threw (logOnly)');
  expect(lines).toContain('refine boom');
  expect(lines).not.toContain('could not be parsed');
});

test('withBody passes schema defaults for an empty body', async () => {
  const invoke = handler.withBody(
    z.object({ a: z.string().default('x') }),
    ({ request }) => request.body,
  );

  expect(await call(invoke, {})).toMatchObject({
    statusCode: 200,
    body: '{"a":"x"}',
  });
});

test('parseLogOnly returns the value unchanged and logs a mismatch', () => {
  const log = jest.spyOn(console, 'log').mockImplementation(() => {});
  const value = { count: 'secret' };

  const result = parseLogOnly('job', z.object({ count: z.number() }), value);
  const lines = log.mock.calls.map(([line]) => String(line)).join('\n');
  log.mockRestore();

  expect(result).toBe(value);
  expect(lines).toContain('job: count: Invalid input: expected number');
  expect(lines).not.toContain('secret');
});

test('builder onInvalid applies to every endpoint unless the endpoint answers first', async () => {
  const log = jest.spyOn(console, 'log').mockImplementation(() => {});
  const scoped = build({
    plugins: [],
    cors: { allowedOrigins: [] },
    onInvalid: () => ({ statusCode: 422, body: { error: 'invalid' } }),
  });
  const schema = z.object({ n: z.number() });

  expect(
    await call(
      scoped.withBody(schema, () => 'ran'),
      {},
    ),
  ).toMatchObject({
    statusCode: 422,
    body: '{"error":"invalid"}',
  });
  expect(
    await call(
      scoped.withQuery(
        schema,
        () => 'ran',
        () => ({ statusCode: 418, body: 'no' }),
      ),
      {},
    ),
  ).toMatchObject({ statusCode: 418, body: '"no"' });
  expect(
    await call(
      scoped.withBody(
        schema,
        () => 'ran',
        () => undefined,
      ),
      {},
    ),
  ).toMatchObject({ statusCode: 422 });
  expect(
    await call(
      scoped.withCors({ allowedOrigins: [] }).withBody(schema, () => 'ran'),
      {},
    ),
  ).toMatchObject({ statusCode: 422 });
  log.mockRestore();
});

test('unknown keys are stripped in enforce and logged by name, never by value', async () => {
  const log = jest.spyOn(console, 'log').mockImplementation(() => {});
  const schema = z.object({
    n: z.number(),
    items: z.array(z.object({ id: z.number() })),
  });
  const body = '{"n":1,"token":"secret","items":[{"id":1,"pw":"secret"}]}';
  const many = JSON.stringify({
    n: 1,
    items: [],
    ...Object.fromEntries(Array.from({ length: 25 }, (_, i) => [`k${i}`, 1])),
  });

  expect(
    await call(
      handler.withBody(schema, ({ request }) => request.body),
      { body },
    ),
  ).toMatchObject({ statusCode: 200, body: '{"n":1,"items":[{"id":1}]}' });
  expect(
    await call(
      handler.withBody(schema, ({ request }) => request.body, {
        logOnly: true,
      }),
      { body },
    ),
  ).toMatchObject({ statusCode: 200, body });
  await call(
    handler.withBody(schema, () => 'ran'),
    { body: many },
  );
  const lines = log.mock.calls.map(([line]) => String(line)).join('\n');
  log.mockRestore();

  expect(lines).toContain('Unknown keys resource=');
  expect(lines).toContain('Unknown keys (logOnly) resource=');
  expect(lines).toContain('token, items[].pw');
  expect(lines).toContain('(+5 more)');
  expect(lines).not.toContain('secret');
});

test('the tracer records what validation saw without input values', async () => {
  const log = jest.spyOn(console, 'log').mockImplementation(() => {});
  const getQueueUrl = jest
    .spyOn(SQS.prototype, 'getQueueUrl')
    .mockImplementation(async () => ({ QueueUrl: 'https://queue' }) as any);
  const send = jest
    .spyOn(SQS.prototype, 'sendMessageBatch')
    .mockImplementation(async () => ({}) as any);
  try {
    const traced = build({
      plugins: [
        trace({ route: 'r', queueName: 'q', system: 's', region: 'us-east-1' }),
      ],
      cors: { allowedOrigins: [] },
    });
    const schema = z.object({ n: z.number() });
    const clean = traced.withBody(schema, () => 'ran');
    const observe = traced.withBody(schema, () => 'ran', { logOnly: true });

    await call(clean, { resource: '/items', body: '{"n":1}' });
    await new Promise((resolve) => setImmediate(resolve));
    expect(send).not.toHaveBeenCalled();

    await call(observe, {
      resource: '/items',
      body: '{"n":"secret","token":"secret"}',
    });
    await new Promise((resolve) => setImmediate(resolve));
    const [entry] = (send.mock.calls[0][0] as any).Entries;
    expect(JSON.parse(entry.MessageBody)).toMatchObject({
      key: 'SYSTEM',
      action: 'validation',
      attribute: '/items',
      error: false,
    });
    expect(JSON.parse(JSON.parse(entry.MessageBody).body)).toEqual({
      mode: 'logOnly',
      issues: ['n: Invalid input: expected number, received string'],
      unknownKeys: [],
    });
    expect(entry.MessageBody).not.toContain('secret');
  } finally {
    log.mockRestore();
    getQueueUrl.mockRestore();
    send.mockRestore();
  }
});

test('WebSocket withBody enforces, observes, and falls back through onInvalid', async () => {
  const log = jest.spyOn(console, 'log').mockImplementation(() => {});
  const schema = z.object({ action: z.literal('ping') });
  const echo = ({ request }: { request: { body: unknown } }) => ({
    statusCode: 200,
    body: JSON.stringify(request.body),
  });
  const send = (invoke: (...args: any[]) => any, body: string) =>
    invoke(
      { body, requestContext: { routeKey: 'ping', connectionId: 'c' } },
      {},
      () => {},
    );
  const scoped = buildWebSocket([], { onInvalid: () => ({ statusCode: 422 }) });

  expect(
    await send(scoped.withBody(schema, echo), '{"action":"ping","x":1}'),
  ).toEqual({ statusCode: 200, body: '{"action":"ping"}' });
  expect(await send(scoped.withBody(schema, echo), '{}')).toEqual({
    statusCode: 422,
  });
  expect(
    await send(
      scoped.withBody(schema, echo, () => ({ statusCode: 400, body: 'no' })),
      '{}',
    ),
  ).toEqual({ statusCode: 400, body: 'no' });
  expect(
    await send(buildWebSocket([]).withBody(schema, echo), '{}'),
  ).toMatchObject({ statusCode: 400 });
  expect(
    await send(
      scoped.withBody(schema, echo, { logOnly: true }),
      '{"action":"pong"}',
    ),
  ).toEqual({ statusCode: 200, body: '{"action":"pong"}' });
  const lines = log.mock.calls.map(([line]) => String(line)).join('\n');
  log.mockRestore();

  expect(lines).toContain('Validation failed (logOnly) route=ping');
  expect(lines).toContain('Unknown keys route=ping: x');
});
