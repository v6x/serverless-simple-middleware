import {
  createConnection,
  type Connection,
  type ConnectionOptions,
  type FieldPacket,
  type QueryError,
  type QueryResult,
} from 'mysql2';
import { OncePromise } from '../../internal/oncePromise';
import { getLogger } from '../../utils';
import { SecretsManagerCache } from '../../utils/secretsManager';
import { MySQLPluginOptions } from '../mysql';

const logger = getLogger(__filename);

export class ConnectionProxy {
  private connection?: Connection;
  private connectionConfig: ConnectionOptions;
  private secretsCache: SecretsManagerCache;
  private configInitOnce = new OncePromise<void>();
  private connectionInitOnce = new OncePromise<Connection>();

  private initialized: boolean;
  private dbName?: string;

  private readonly MAX_RETRIES: number = 1;

  public constructor(private readonly options: MySQLPluginOptions) {
    if (options.schema && options.schema.database) {
      this.dbName = options.config.database;
      options.config.database = undefined;
    }
    this.secretsCache = SecretsManagerCache.getInstance();
    if (options.secretsManagerConfig) {
      this.secretsCache.configure(options.secretsManagerConfig);
    }
  }

  public query = <T>(sql: string, params?: any[]) =>
    this.prepareConnection().then((connection) =>
      this.tryToInitializeSchema(false).then(
        () =>
          new Promise<T | undefined>((resolve, reject) => {
            if (process.env.NODE_ENV !== 'test') {
              logger.silly(`Execute query[${sql}] with params[${params}]`);
            }
            connection.query(
              sql,
              params,
              (err: QueryError, result: QueryResult, _fields?: FieldPacket[]) => {
                if (err) {
                  logger.error(
                    `error occurred in database query=${sql}, error=${err}`,
                  );
                  reject(err);
                } else {
                  resolve(result as T);
                  if (process.env.NODE_ENV !== 'test') {
                    logger.silly(`DB result is ${JSON.stringify(result)}`);
                  }
                }
              },
            );
          }),
      ),
    );

  public fetch = <T>(sql: string, params?: any[]) =>
    this.query<T[]>(sql, params).then((res) => res || []);

  public fetchOne = <T>(sql: string, params?: any[], defaultValue?: T) =>
    this.fetch<T>(sql, params).then((res) => {
      if (res === undefined || res[0] === undefined) {
        // Makes it as non-null result.
        return defaultValue || ({} as any as T);
      }
      return res[0];
    });

  public beginTransaction = () =>
    this.prepareConnection().then((connection) =>
      this.tryToInitializeSchema(false).then(
        () =>
          new Promise<void>((resolve, reject) => {
            connection.beginTransaction((err: QueryError) => {
              if (err) {
                reject(err);
                return;
              }
              resolve();
            });
          }),
      ),
    );

  public commit = () =>
    this.prepareConnection().then((connection) =>
      this.tryToInitializeSchema(false).then(
        () =>
          new Promise<void>((resolve, reject) => {
            connection.commit((err: QueryError) => {
              if (err) {
                reject(err);
                return;
              }
              resolve();
            });
          }),
      ),
    );

  public rollback = () =>
    this.prepareConnection().then((connection) =>
      this.tryToInitializeSchema(false).then(
        () =>
          new Promise<void>((resolve, reject) => {
            connection.rollback((err: QueryError) => {
              if (err) {
                reject(err);
                return;
              }
              resolve();
            });
          }),
      ),
    );

  public clearConnection = () => {
    logger.verbose('[DEBUG] clearConnection called');
    const conn = this.connection;
    this.connection = undefined;
    this.connectionInitOnce.reset();

    if (conn) {
      try {
        logger.verbose('[DEBUG] Calling conn.end()...');
        conn.end((err) => {
          if (err) {
            logger.warn(`[DEBUG] conn.end() callback error: ${err}`);
          } else {
            logger.verbose('[DEBUG] conn.end() callback success');
          }
        });
      } catch (error) {
        logger.warn(`Error occurred while ending connection: ${error}`);
      }
    } else {
      logger.verbose('[DEBUG] No connection to clear');
    }
  };

  /**
   * Destroy the connection socket immediately. No further events or callbacks will be triggered.
   * This should be used only for special use cases!
   */
  public destroyConnection = () => {
    const conn = this.connection;
    this.connection = undefined;
    this.connectionInitOnce.reset();

    if (conn) {
      try {
        conn.destroy();
      } catch (error) {
        logger.warn(`Error occurred while destroying connection: ${error}`);
      }
    }
  };

  public onPluginCreated = async () => this.tryToInitializeSchema(true);

  private prepareConnection = async (): Promise<Connection> => {
    if (this.connection) {
      return this.connection;
    }

    return await this.connectionInitOnce.run(async () => {
      await this.ensureConnectionConfig();
      this.connection = await this.createConnection(this.MAX_RETRIES);
      return this.connection;
    });
  };

  private createConnection = async (
    remainingRetries: number,
  ): Promise<Connection> => {
    logger.verbose(`[DEBUG] createConnection called, remainingRetries=${remainingRetries}`);
    const conn = createConnection(this.connectionConfig);

    return new Promise((resolve, reject) => {
      logger.verbose('[DEBUG] Registering conn.on("error") listener...');
      conn.on('error', (err) => {
        logger.error(`Connection error event: ${err.message}`);
      });

      conn.connect((err) => {
        if (err) {
          logger.error(`Failed to connect to database: ${err.message}`);
          logger.verbose('[DEBUG] Destroying failed connection...');
          conn.destroy();

          if (remainingRetries > 0) {
            logger.warn(
              `Retrying database connection... (${remainingRetries} attempt(s) remaining)`,
            );
            logger.verbose('[DEBUG] Setting setTimeout for retry...');
            setTimeout(() => {
              logger.verbose('[DEBUG] setTimeout fired, retrying...');
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
          logger.verbose(`[DEBUG] Connection state: threadId=${conn.threadId}`);
          resolve(conn);
        }
      });
    });
  };

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

  private changeDatabase = async (dbName: string) =>
    new Promise<void>((resolve, reject) =>
      this.prepareConnection()
        .then((connection) =>
          connection.changeUser(
            {
              database: dbName,
            },
            (err) => (err ? reject(err) : resolve(undefined)),
          ),
        )
        .catch(reject),
    );

  private tryToInitializeSchema = async (initial: boolean) => {
    const {
      eager = false,
      ignoreError = false,
      database = '',
      tables = {},
    } = this.options.schema || {};
    if (initial && !eager) {
      return;
    }

    // This method can be called twice when eager option is on,
    // so this flag should be set and checked at first.
    if (this.initialized) {
      return;
    }
    this.initialized = true;

    try {
      if (database) {
        logger.debug(`Prepare a database[${this.dbName}]`);
        logger.stupid(this.dbName!, database);
        const result = await this.query(database);
        logger.debug(
          `Database[${this.dbName}] is initialized: ${JSON.stringify(result)}`,
        );
      }
      if (this.dbName) {
        await this.changeDatabase(this.dbName);
        logger.verbose(`Database[${this.dbName}] is connected.`);
      }

      for (const [name, query] of Object.entries(tables)) {
        logger.debug(`Prepare a table[${name}]`);
        logger.stupid(name, query);
        const result = await this.query(query);
        logger.debug(
          `Table[${name}] is initialized: ${JSON.stringify(result)}`,
        );
      }
      logger.verbose(`Database schema is initialized.`);
    } catch (error) {
      logger.warn(error);
      if (!ignoreError) {
        throw error;
      }
    }
  };
}
