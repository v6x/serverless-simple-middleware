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
import { SecretsManagerCache } from '../../utils/secretsManager';
import { MySQLPluginOptions } from '../mysql';

interface LazyMysqlPoolConnection extends Connection {
  release: () => void;
}

class LazyConnectionPool implements MysqlPool {
  private connection: LazyMysqlPoolConnection | null = null;
  private connectionConfig: ConnectionOptions;
  private secretsCache: SecretsManagerCache;
  private configInitOnce = new OncePromise<void>();
  private connectionInitOnce = new OncePromise<LazyMysqlPoolConnection>();

  constructor(private readonly options: MySQLPluginOptions) {
    this.secretsCache = SecretsManagerCache.getInstance();
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
        const conn = createConnection(this.connectionConfig);
        return await new Promise<LazyMysqlPoolConnection>((resolve, reject) => {
          conn.connect((err: QueryError) => {
            if (err) {
              reject(err);
              return;
            }
            const wrapped = this._addRelease(conn);
            this.connection = wrapped;
            resolve(wrapped);
          });
        });
      })
      .then((conn) => callback(null, conn))
      .catch((err) => callback(err, {} as LazyMysqlPoolConnection));
  };

  public end = (callback: (error: unknown) => void): void => {
    if (this.connection) {
      this.connection.end((err: QueryError) => {
        this.connection = null;
        this.connectionInitOnce.reset();
        callback(err);
      });
    } else {
      callback(null);
    }
  };

  public destroy = (): void => {
    if (this.connection) {
      this.connection.destroy();
      this.connection = null;
      this.connectionInitOnce.reset();
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
  type UpdateResult,
} from 'kysely';
