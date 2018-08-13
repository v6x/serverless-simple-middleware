import {
  AWSHandlerPluginRequestAux,
  HandlerRequest,
  HandlerResponse,
  middleware,
  TracerHandlerRequestAux,
} from '../src';

test('basic', () => {
  type Aux = AWSHandlerPluginRequestAux & TracerHandlerRequestAux;
  const handler = middleware.build<Aux>([
    middleware.aws(),
    middleware.trace({
      route: 'index/type',
      queueName: 'trace-queue',
      system: 'hello-world',
    }),
  ]);

  handler(async ({ request, response, aux }) => {
    const { aws, tracer } = aux;
    expect(request).toBeDefined();
    expect(response).toBeDefined();
    expect(aws).toBeDefined();
    expect(tracer).toBeDefined();
  })({}, {}, () => 0);
});
