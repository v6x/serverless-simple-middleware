import { middleware } from '../dist';
import build from '../dist/middleware/build';
import { HandlerResponse } from '../dist/middleware/base';

build({ plugins: [], cors: { allowedOrigins: '*' } });
build({ plugins: [], cors: { allowedOrigins: '*', allowCredentials: false } });
build({ plugins: [], cors: { allowedOrigins: [] } });
build({
  plugins: [],
  cors: {
    allowedOrigins: ['https://app.example.com'] as const,
    allowCredentials: true,
  },
});

// @ts-expect-error CORS must be configured explicitly.
build({ plugins: [] });
// @ts-expect-error Wildcard origins do not support credentials.
build({ plugins: [], cors: { allowedOrigins: '*', allowCredentials: true } });
// @ts-expect-error Direct response construction also requires CORS options.
new HandlerResponse(() => undefined);

const handler = middleware.build<{ count: number }>({
  plugins: [],
  cors: { allowedOrigins: [] },
});
handler
  .withCors({ allowedOrigins: ['https://app.example.com'] })
  .withCors({ allowedOrigins: '*' })(({ aux }) => aux.count.toFixed());
// @ts-expect-error withCors keeps the wildcard credentials restriction.
handler.withCors({ allowedOrigins: '*', allowCredentials: true });
