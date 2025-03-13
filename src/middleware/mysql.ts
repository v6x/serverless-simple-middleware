import { Kysely, MysqlDialect, MysqlPool } from 'kysely';
import * as mysql from 'mysql';

import { getLogger } from '../utils/index.js';
import { HandlerAuxBase, HandlerPluginBase } from './base.js';

const logger = getLogger(__filename);

export interface MySQLPluginOptions {
  config: mysql.ConnectionConfig;
  schema?: {
    eager?: boolean;
    ignoreError?: boolean;
    database?: string;
    tables?: {
      [tableName: string]: string;
    };
  };
}

export class ConnectionProxy {
  private pluginConfig: MySQLPluginOptions;
  private connection?: mysql.Connection;

  private initialized: boolean;
  private dbName?: string;

  public constructor(config: MySQLPluginOptions) {
    this.pluginConfig = config;
    if (config.schema && config.schema.database) {
      this.dbName = config.config.database;
      config.config.database = undefined;
    }
  }

  public query = <T>(sql: string, params?: any[]) =>
    new Promise<T | undefined>(async (resolve, reject) => {
      const connection = this.prepareConnection();
      await this.tryToInitializeSchema(false);

      if (process.env.NODE_ENV !== 'test') {
        logger.silly(`Execute query[${sql}] with params[${params}]`);
      }
      connection.query(sql, params, (err: mysql.MysqlError, result?: T) => {
        if (err) {
          logger.error(`error occurred in database query=${sql}, error=${err}`);
          reject(err);
        } else {
          resolve(result);
          if (process.env.NODE_ENV !== 'test') {
            logger.silly(`DB result is ${JSON.stringify(result)}`);
          }
        }
      });
    });

  public fetch = <T>(sql: string, params?: any[]) =>
    this.query<T[]>(sql, params).then(res => res || []);

  public fetchOne = <T>(sql: string, params?: any[], defaultValue?: T) =>
    this.fetch<T>(sql, params).then(res => {
      if (res === undefined || res[0] === undefined) {
        // Makes it as non-null result.
        return defaultValue || (({} as any) as T);
      }
      return res[0];
    });

  public beginTransaction = () =>
    new Promise<void>(async (resolve, reject) => {
      const connection = this.prepareConnection();
      await this.tryToInitializeSchema(false);

      connection.beginTransaction((err: mysql.MysqlError) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    });

  public commit = () =>
    new Promise<void>(async (resolve, reject) => {
      const connection = this.prepareConnection();
      await this.tryToInitializeSchema(false);

      connection.commit((err: mysql.MysqlError) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    });

  public rollback = () =>
    new Promise<void>(async (resolve, reject) => {
      const connection = this.prepareConnection();
      await this.tryToInitializeSchema(false);

      connection.rollback((err: mysql.MysqlError) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    });

  public clearConnection = () => {
    if (this.connection) {
      this.connection.end();
      this.connection = undefined;
      logger.verbose('Connection is end');
    }
  };

  public onPluginCreated = async () => this.tryToInitializeSchema(true);

  private prepareConnection = () => {
    if (this.connection) {
      return this.connection;
    }
    this.connection = mysql.createConnection(this.pluginConfig.config);
    this.connection.connect();
    return this.connection;
  };

  private changeDatabase = (dbName: string) =>
    new Promise<void>((resolve, reject) =>
      this.prepareConnection().changeUser(
        {
          database: dbName,
        },
        err => (err ? reject(err) : resolve()),
      ),
    );

  private tryToInitializeSchema = async (initial: boolean) => {
    const { eager = false, ignoreError = false, database = '', tables = {} } =
      this.pluginConfig.schema || {};
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

interface LazyMysqlPoolConnection extends mysql.Connection {
  release: () => void;
}

class LazyConnectionPool implements MysqlPool {
  private connection: LazyMysqlPoolConnection | null = null;

  constructor(private config: mysql.ConnectionConfig) {}

  public getConnection = (
    callback: (error: unknown, connection: LazyMysqlPoolConnection) => void,
  ): void => {
    if (this.connection) {
      callback(null, this.connection);
      return;
    }
    const conn = mysql.createConnection(this.config);
    conn.connect((err: mysql.MysqlError) => {
      if (err) {
        callback(err, {} as LazyMysqlPoolConnection);
        return;
      }
      this.connection = this.addDummyRelease(conn);
      callback(null, this.connection);
    });
  };

  public end = (callback: (error: unknown) => void): void => {
    if (this.connection) {
      this.connection.end((err: mysql.MysqlError) => {
        this.connection = null;
        callback(err);
      });
    } else {
      callback(null);
    }
  };

  private addDummyRelease = (
    connection: mysql.Connection,
  ): LazyMysqlPoolConnection =>
    new Proxy(connection, {
      get(target, prop, receiver) {
        return prop === 'release'
          ? () => {}
          : Reflect.get(target, prop, receiver);
      },
    }) as LazyMysqlPoolConnection;
}

export type SQLClient<T = unknown> = Kysely<T>;

export interface MySQLPluginAux<T = unknown> extends HandlerAuxBase {
  db: ConnectionProxy;
  database: SQLClient<T>;
}

export class MySQLPlugin<T = unknown> extends HandlerPluginBase<
  MySQLPluginAux<T>
> {
  private proxy: ConnectionProxy;
  private sqlClient: SQLClient<T>;

  constructor(options: MySQLPluginOptions) {
    super();
    this.proxy = new ConnectionProxy(options);
    this.sqlClient = new Kysely<T>({
      dialect: new MysqlDialect({
        pool: new LazyConnectionPool(options.config),
      }),
    });
  }

  public create = async () => {
    await this.proxy.onPluginCreated();
    return { db: this.proxy, database: this.sqlClient };
  };

  public end = () => {
    if (this.proxy) {
      this.proxy.clearConnection();
    }

    if (this.sqlClient) {
      this.sqlClient.destroy();
    }
  };
}

const build = <T = unknown>(options: MySQLPluginOptions) =>
  new MySQLPlugin<T>(options);
export default build;
