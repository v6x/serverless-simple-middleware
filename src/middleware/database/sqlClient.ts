import {
  HandleEmptyInListsPlugin,
  Kysely,
  type KyselyConfig,
  MysqlDialect,
  type MysqlPool,
  replaceWithNoncontingentExpression,
} from 'kysely';
import {
  type Connection,
  type ConnectionOptions,
  createConnection,
  type QueryError,
} from 'mysql2';
import { OncePromise } from '../../internal/oncePromise';
import { getLogger } from '../../utils';
import { SecretsManagerCache } from '../../utils/secretsManager';
import { MySQLPluginOptions } from '../mysql';

const logger = getLogger(__filename);

interface LazyMysqlPoolConnection extends Connection {
  release: () => void;
}

class LazyConnectionPool implements MysqlPool {
  private connection: LazyMysqlPoolConnection | null = null;
  private connectionConfig: ConnectionOptions;
  private secretsCache: SecretsManagerCache;
  private configInitOnce = new OncePromise<void>();
  private connectionInitOnce = new OncePromise<LazyMysqlPoolConnection>();

  private readonly MAX_RETRIES: number = 1;

  constructor(private readonly options: MySQLPluginOptions) {
    this.secretsCache = SecretsManagerCache.getInstance();
    if (options.secretsManagerConfig) {
      this.secretsCache.configure(options.secretsManagerConfig);
    }
  }

  private ensureConnectionConfig = async (): Promise<void> => {
    if (this.connectionConfig) {
      return;
    }

    await this.configInitOnce.run(async () => {
      const baseConfig = this.options.config;
      if (!this.options.secretId) {
        this.connectionConfig = baseConfig;
        return;
      }
      const credentials = await this.secretsCache.getDatabaseCredentials(
        this.options.secretId,
      );

      this.connectionConfig = {
        ...baseConfig,
        user: credentials.username,
        password: credentials.password,
      };
    });
  };

  public getConnection = (
    callback: (error: unknown, connection: LazyMysqlPoolConnection) => void,
  ): void => {
    if (this.connection) {
      callback(null, this.connection);
      return;
    }

    this.connectionInitOnce
      .run(async () => {
        await this.ensureConnectionConfig();
        return await this.createConnection(this.MAX_RETRIES);
      })
      .then((conn) => callback(null, conn))
      .catch((err) => callback(err, {} as LazyMysqlPoolConnection));
  };

  private createConnection = async (
    remainingRetries: number,
  ): Promise<LazyMysqlPoolConnection> => {
    const conn = createConnection(this.connectionConfig);

    return new Promise((resolve, reject) => {
      conn.on('error', (err) => {
        logger.error(`Database connection error occurred: ${err.message}`);
      });

      conn.connect((err: QueryError) => {
        if (err) {
          logger.error(`Failed to connect to database: ${err.message}`);
          conn.destroy();

          if (remainingRetries > 0) {
            logger.warn(
              `Retrying database connection... (${remainingRetries} attempt(s) remaining)`,
            );
            setTimeout(() => {
              this.createConnection(remainingRetries - 1)
                .then(resolve)
                .catch(reject);
            }, 100);
          } else {
            logger.error('Database connection failed after all retries. Giving up.');
            reject(err);
          }
        } else {
          logger.verbose('Database connection established successfully.');
          const wrapped = this._addRelease(conn);
          this.connection = wrapped;
          resolve(wrapped);
        }
      });
    });
  };

  public end = (callback: (error: unknown) => void): void => {
    const conn = this.connection;
    this.connection = null;
    this.connectionInitOnce.reset();

    if (conn) {
      conn.end((err: QueryError) => {
        callback(err);
      });
    } else {
      callback(null);
    }
  };

  public destroy = (): void => {
    const conn = this.connection;
    this.connection = null;
    this.connectionInitOnce.reset();

    if (conn) {
      try {
        conn.destroy();
      } catch (error) {
        logger.warn(`Error occurred while destroying connection: ${error}`);
      }
    }
  };

  private _addRelease = (connection: Connection): LazyMysqlPoolConnection =>
    Object.assign(connection, {
      release: () => {},
    });
}

export class SQLClient<T = unknown> extends Kysely<T> {
  private pool: LazyConnectionPool;

  constructor(config: MySQLPluginOptions) {
    const pool = new LazyConnectionPool(config);
    const kyselyConfig: KyselyConfig = {
      dialect: new MysqlDialect({
        pool,
      }),
      plugins: [
        new HandleEmptyInListsPlugin({
          strategy: replaceWithNoncontingentExpression,
        }),
      ],
    };
    super(kyselyConfig);
    this.pool = pool;
  }

  public clearConnection = () =>
    new Promise<void>((resolve) => {
      this.pool.end(() => resolve());
    });

  /**
   * Destroy the connection socket immediately. No further events or callbacks will be triggered.
   * This should be used only for special use cases!
   */
  public destroyConnection = (): void => {
    this.pool.destroy();
  };
}

export {
  expressionBuilder,
  sql,
  type DeleteQueryBuilder,
  type DeleteResult,
  type Expression,
  type ExpressionBuilder,
  type InferResult,
  type Insertable,
  type InsertQueryBuilder,
  type InsertResult,
  type NotNull,
  type RawBuilder,
  type Selectable,
  type SelectQueryBuilder,
  type SqlBool,
  type Transaction,
  type Updateable,
  type UpdateQueryBuilder,
  type UpdateResult
} from 'kysely';

