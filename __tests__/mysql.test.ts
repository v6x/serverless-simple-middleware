import { middleware, MySQLPluginAux } from '../src';

// Needs a real MySQL, so it only runs via `yarn test:db`.
const dbTest = process.env.TEST_MYSQL ? test : test.skip;

dbTest('basic', async () => {
  type Aux = MySQLPluginAux;
  const handler = middleware.build<Aux>({
    cors: { allowedOrigins: [] },
    plugins: [
      middleware.mysql({
        config: {
          host: '127.0.0.1',
          user: 'root',
          password: 'test***',
          database: 'test123',
        },
        schema: {
          database: `CREATE DATABASE IF NOT EXISTS test123`,
          eager: true,
          tables: {
            simple: `CREATE TABLE IF NOT EXISTS simple (id INT PRIMARY KEY);`,
          },
        },
      }),
    ],
  });

  // `build` doesn't return the handler's promise, so the callback is the only
  // completion signal; a plugin/assertion failure surfaces as statusCode 500.
  const result = await new Promise<any>((resolve) =>
    handler(async ({ request, response, aux }) => {
      const { db } = aux;
      expect(request).toBeDefined();
      expect(response).toBeDefined();
      expect(db).toBeDefined();

      const result1 = await db.fetchOne<{ '1': number }>('SELECT 1');
      expect(result1['1']).toBe(1);

      const result2 = await db.fetchOne<{ '1': number }>('SELECT 1');
      expect(result2['1']).toBe(1);
    })({}, {}, (_error: any, res: any) => resolve(res)),
  );
  expect(result.statusCode).toBe(200);
});
