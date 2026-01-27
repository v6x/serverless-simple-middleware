import {
  GetSecretValueCommand,
  SecretsManagerClient,
  SecretsManagerClientConfig,
} from '@aws-sdk/client-secrets-manager';
import type { DatabaseCredentials } from '../middleware/mysql';
import { getLogger } from './logger';
import { stringifyError } from './misc';

const logger = getLogger(__filename);

export class SecretsManagerCache {
  private static instance: SecretsManagerCache;
  private client: SecretsManagerClient | undefined;
  private clientConfig: SecretsManagerClientConfig | undefined;
  private cache = new Map<string, any>();

  private constructor() {}

  public static getInstance(): SecretsManagerCache {
    if (!SecretsManagerCache.instance) {
      SecretsManagerCache.instance = new SecretsManagerCache();
    }
    return SecretsManagerCache.instance;
  }

  public configure(config: SecretsManagerClientConfig): void {
    if (this.client) {
      logger.warn(
        'SecretsManager client already initialized. Reconfiguring with new config.',
      );
      this.client = undefined;
    }
    this.clientConfig = config;
    logger.debug('SecretsManager client config updated');
  }

  private getClient(): SecretsManagerClient {
    if (!this.client) {
      this.client = new SecretsManagerClient(this.clientConfig ?? {});
      logger.debug('SecretsManager client initialized');
    }
    return this.client;
  }

  public async getSecret<T = any>(secretId: string): Promise<T> {
    if (this.cache.has(secretId)) {
      logger.debug(`Secret ${secretId} found in cache`);
      return this.cache.get(secretId);
    }

    try {
      const command = new GetSecretValueCommand({ SecretId: secretId });
      const response = await this.getClient().send(command);

      if (!response.SecretString) {
        throw new Error(`Secret ${secretId} has no SecretString value`);
      }

      const secretValue = JSON.parse(response.SecretString);

      this.cache.set(secretId, secretValue);

      return secretValue;
    } catch (error) {
      logger.error(
        `Failed to fetch secret ${secretId}: ${stringifyError(error)}`,
      );
      throw error;
    }
  }

  public async getDatabaseCredentials(
    secretId: string,
  ): Promise<DatabaseCredentials> {
    const secret = await this.getSecret<DatabaseCredentials>(secretId);

    if (!secret.username || !secret.password) {
      throw new Error(
        `Secret ${secretId} does not contain required database credentials (username, password)`,
      );
    }

    return secret;
  }
}
