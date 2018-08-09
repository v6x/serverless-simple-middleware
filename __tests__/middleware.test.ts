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

  handler(
    async (request: HandlerRequest, response: HandlerResponse, aux: Aux) => {
      const { aws, tracer } = aux;
      expect(aws).toBeDefined();
      expect(tracer).toBeDefined();
    },
  )({}, {}, () => 0);
});
