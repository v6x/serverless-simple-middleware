import { SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { SecretsManagerCache } from '../src/utils/secretsManager';

test('a malformed secret fails without its contents in the error or logs', async () => {
  const log = jest.spyOn(console, 'log').mockImplementation(() => {});
  const send = jest
    .spyOn(SecretsManagerClient.prototype, 'send')
    .mockImplementation(async () => ({
      SecretString: '{"password":"hunter2"',
    }));
  try {
    const error = await SecretsManagerCache.getInstance()
      .getSecret('db/main')
      .catch((each: Error) => each);
    const lines = log.mock.calls.map(([line]) => String(line)).join('\n');

    expect(String(error)).toContain('Secret db/main is not valid JSON');
    expect(String(error)).not.toContain('hunter2');
    expect(lines).not.toContain('hunter2');
  } finally {
    log.mockRestore();
    send.mockRestore();
  }
});
