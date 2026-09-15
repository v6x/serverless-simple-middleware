const assert = require('node:assert/strict');
const { test } = require('node:test');
const { z } = require('zod');
const build = require('../dist/middleware/build').default;
const {
  HandlerPluginBase,
  HandlerResponse,
} = require('../dist/middleware/base');

const origin = 'https://app.example.com';
const cors = {
  allowedOrigins: [origin],
  allowCredentials: true,
  exposedHeaders: ['Retry-After'],
};

const invoke = (handler, requestOrigin = origin) =>
  new Promise((resolve, reject) => {
    handler(
      {
        headers: requestOrigin ? { OrIgIn: requestOrigin } : {},
        body: '{}',
        queryStringParameters: {},
      },
      {},
      (error, response) => (error ? reject(error) : resolve(response)),
    );
  });

const assertCors = (response, status) => {
  assert.equal(response.statusCode, status);
  assert.equal(response.headers['Access-Control-Allow-Origin'], origin);
  assert.equal(response.headers['Access-Control-Allow-Credentials'], 'true');
  assert.equal(response.headers['Access-Control-Allow-Headers'], undefined);
  assert.equal(response.headers.Vary, 'Origin');
};

test('configured success preserves body and cookies', async () => {
  const response = await invoke(
    build({ plugins: [], cors })(({ response: output }) => {
      output.addCookie('fixture', 'value', undefined, 'None', true);
      return { ok: true };
    }),
  );
  assertCors(response, 200);
  assert.equal(response.body, '{"ok":true}');
  assert.deepEqual(response.multiValueHeaders['Set-Cookie'], [
    'fixture=value; SameSite=None; Secure',
  ]);
});

test('explicit failure preserves status, custom headers, and exposed headers', async () => {
  const response = await invoke(
    build({ plugins: [], cors })(({ response: output }) => {
      output.addHeader('Retry-After', '10');
      output.addCookie('fixture', 'value');
      return output.fail({ error: 'retry' }, 429);
    }),
  );
  assertCors(response, 429);
  assert.equal(response.body, '{"error":"retry"}');
  assert.equal(response.headers['Retry-After'], '10');
  assert.equal(
    response.headers['Access-Control-Expose-Headers'],
    'Retry-After',
  );
  assert.equal(response.multiValueHeaders, undefined);
});

test('plugin initialization failure returns CORS before begin hooks run', async () => {
  class FailingPlugin extends HandlerPluginBase {
    create = () => Promise.reject(new Error('fixture initialization failure'));
  }
  const response = await invoke(
    build({ plugins: [new FailingPlugin()], cors })(() => ({})),
  );
  assertCors(response, 500);
  assert.equal(response.body, '{"error":"fixture initialization failure"}');
});

test('thrown handler errors retain CORS', async () => {
  const response = await invoke(
    build({ plugins: [], cors })(() => {
      throw new Error('fixture handler failure');
    }),
  );
  assertCors(response, 500);
  assert.equal(response.body, '{"error":"fixture handler failure"}');
});

for (const method of ['withBody', 'withQuery']) {
  test(`${method} validation errors retain CORS`, async () => {
    const response = await invoke(
      build({ plugins: [], cors })[method](
        z.object({ required: z.string() }),
        () => {
          assert.fail('invalid input must not reach the handler');
        },
      ),
    );
    assertCors(response, 400);
  });
}

test('custom validation errors preserve status and body', async () => {
  const response = await invoke(
    build({ plugins: [], cors }).withBody(
      z.object({ required: z.string() }),
      () => assert.fail('invalid input must not reach the handler'),
      () => ({ statusCode: 422, body: { error: 'invalid' } }),
    ),
  );
  assertCors(response, 422);
  assert.equal(response.body, '{"error":"invalid"}');
});

for (const requestOrigin of [
  '',
  'null',
  'https://app.example.com.attacker.invalid',
]) {
  test(`unmatched or missing origin is not reflected: ${requestOrigin || 'missing'}`, async () => {
    const response = await invoke(
      build({ plugins: [], cors })(() => ({})),
      requestOrigin,
    );
    assert.equal(response.headers['Access-Control-Allow-Origin'], undefined);
    assert.equal(
      response.headers['Access-Control-Allow-Credentials'],
      undefined,
    );
    assert.equal(response.headers.Vary, 'Origin');
  });
}

test('an empty allowlist cannot be bypassed with response overrides', async () => {
  const response = await invoke(
    build({
      plugins: [],
      cors: { allowedOrigins: [], allowCredentials: true },
    })(({ response: output }) => {
      output.addHeader('access-control-allow-origin', origin);
      output.addHeader('access-control-allow-credentials', 'true');
      output.addHeader('access-control-expose-headers', 'Retry-After');
      output.addHeader('Retry-After', '10');
      return {};
    }),
  );
  assert.equal(response.statusCode, 200);
  assert.equal(
    Object.keys(response.headers).some((name) =>
      [
        'access-control-allow-origin',
        'access-control-allow-credentials',
        'access-control-expose-headers',
      ].includes(name.toLowerCase()),
    ),
    false,
  );
  assert.equal(response.headers.Vary, undefined);
  assert.equal(response.headers['Access-Control-Expose-Headers'], undefined);
});

test('credentials are opt-in even if a handler tries to enable them', async () => {
  const response = await invoke(
    build({ plugins: [], cors: { allowedOrigins: [origin] } })(
      ({ response: output }) => {
        output.addHeader('Access-Control-Allow-Credentials', 'true');
        return {};
      },
    ),
  );
  assert.equal(response.headers['Access-Control-Allow-Origin'], origin);
  assert.equal(response.headers['Access-Control-Allow-Credentials'], undefined);
  assert.equal(response.headers['Access-Control-Expose-Headers'], undefined);
});

test('exposed headers come only from the CORS options', async () => {
  const response = await invoke(
    build({ plugins: [], cors })(({ response: output }) => {
      output.addHeader('Access-Control-Allow-Headers', 'Authorization');
      output.addHeader('Retry-After', '10');
      output.addHeader('access-control-expose-headers', 'Unlisted');
      output.addHeader('Unlisted', 'value');
      return {};
    }),
  );
  assert.equal(
    response.headers['Access-Control-Allow-Headers'],
    'Authorization',
  );
  assert.equal(
    response.headers['Access-Control-Expose-Headers'],
    'Retry-After',
  );
  assert.equal(response.headers['access-control-expose-headers'], undefined);
  assert.equal(response.headers.Unlisted, 'value');
});

for (const allowedOrigins of ['*', []]) {
  test(`static policy preserves Vary without adding Origin: ${allowedOrigins}`, async () => {
    const response = await invoke(
      build({ plugins: [], cors: { allowedOrigins } })(
        ({ response: output }) => {
          output.addHeader('vArY', 'Accept-Encoding');
          return {};
        },
      ),
    );
    assert.equal(response.headers.vArY, 'Accept-Encoding');
    assert.equal(response.headers.Vary, undefined);
  });
}

for (const [vary, expected] of [
  ['Accept-Encoding', 'Accept-Encoding, Origin'],
  ['Accept-Encoding, origin', 'Accept-Encoding, origin'],
  ['*', '*'],
]) {
  test(`Vary preserves existing values: ${vary}`, async () => {
    const response = await invoke(
      build({ plugins: [], cors })(({ response: output }) => {
        output.addHeader('vArY', vary);
        return {};
      }),
    );
    assert.equal(response.headers.Vary, expected);
    assert.equal(response.headers.vArY, undefined);
  });
}

test('an empty allowlist sends no implicit CORS headers on either outcome', async () => {
  const response = await invoke(
    build({ plugins: [], cors: { allowedOrigins: [] } })(() => ({})),
  );
  assert.deepEqual(response.headers, {});

  for (const method of ['ok', 'fail']) {
    const result = await new Promise((resolve) => {
      const output = new HandlerResponse((_, value) => resolve(value), {
        allowedOrigins: [],
      });
      output.addHeader('Retry-After', '10');
      output.addHeader('Access-Control-Allow-Origin', origin);
      output.addHeader('Access-Control-Allow-Credentials', 'true');
      output.addHeader('Access-Control-Expose-Headers', 'Retry-After');
      output[method]();
    });
    assert.deepEqual(result.headers, { 'Retry-After': '10' });
  }
});

test('wildcard responses stay public without credentials or Origin variation', async () => {
  for (const requestOrigin of [origin, 'null', '']) {
    for (const method of ['ok', 'fail']) {
      const response = await invoke(
        build({
          plugins: [],
          cors: { allowedOrigins: '*', exposedHeaders: ['Retry-After'] },
        })(({ response: output }) => {
          output.addHeader('access-control-allow-origin', origin);
          output.addHeader('access-control-allow-credentials', 'true');
          output.addHeader('Retry-After', '10');
          output[method]();
        }),
        requestOrigin,
      );
      assert.equal(response.statusCode, method === 'ok' ? 200 : 500);
      assert.deepEqual(response.headers, {
        'Retry-After': '10',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Expose-Headers': 'Retry-After',
      });
    }
  }
});

test('invalid CORS configuration is rejected before plugins initialize', () => {
  class UnexpectedPlugin extends HandlerPluginBase {
    create = () =>
      assert.fail('invalid configuration must not initialize plugins');
  }
  const plugins = [new UnexpectedPlugin()];
  assert.throws(() => build({ plugins }), /cors is required/);
  assert.throws(
    () =>
      build({ plugins, cors: { allowedOrigins: '*', allowCredentials: true } }),
    /Wildcard origins cannot be used with allowCredentials/,
  );
  for (const invalid of [
    'not-a-url',
    'null',
    '*',
    'https://example.com/',
    'https://example.com/path',
    'https://example.com?query=value',
    'https://example.com#fragment',
    'https://user@example.com',
    'https://EXAMPLE.com',
    'https://example.com:443',
    ' https://example.com',
    'vrew-file://',
    'vrew-file://bundle/',
    'vrew-file://bundle/path',
    'vrew-file://bundle?query=value',
    'vrew-file://bundle#fragment',
  ]) {
    assert.throws(
      () => build({ plugins, cors: { allowedOrigins: [invalid] } }),
      TypeError,
      invalid,
    );
  }
});

test('origin validation accepts network and host-based custom schemes', async () => {
  for (const requestOrigin of [
    origin,
    'http://localhost:3000',
    'https://[::1]:8443',
    'vrew-file://bundle',
    'example-app://assets:1234',
  ]) {
    const response = await invoke(
      build({
        plugins: [],
        cors: { allowedOrigins: [requestOrigin], allowCredentials: true },
      })(() => ({})),
      requestOrigin,
    );
    assert.equal(
      response.headers['Access-Control-Allow-Origin'],
      requestOrigin,
    );
    assert.equal(response.headers['Access-Control-Allow-Credentials'], 'true');
  }
});
