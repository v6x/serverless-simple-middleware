import * as mysql from 'mysql';

import { getLogger } from '../utils';
import { HandlerAuxBase, HandlerPluginBase } from './base';

const logger = getLogger(__filename);

export interface MySQLPluginOptions {
  config: mysql.ConnectionConfig;
  schema?: {
    eager?: boolean;
    ignoreError?: boolean;
    tables?: {
      [tableName: string]: string;
    };
  };
}

export class ConnectionProxy {
  private pluginConfig: MySQLPluginOptions;
  private connection?: mysql.Connection;

  private initialized: boolean;

  public constructor(config: MySQLPluginOptions) {
    this.pluginConfig = config;
  }

  public query = <T>(sql: string, params?: any[]) =>
    new Promise<T | undefined>(async (resolve, reject) => {
      const connection = this.connection
        ? this.connection
        : (this.connection = this.createConnection());
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

  public clearConnection = () => {
    if (this.connection) {
      this.connection.end();
      this.connection = undefined;
    }
  };

  public onPluginCreated = async () => this.tryToInitializeSchema(true);

  private createConnection = () => {
    const connection = mysql.createConnection(this.pluginConfig.config);
    connection.connect();
    return connection;
  };

  private tryToInitializeSchema = async (initial: boolean) => {
    // This method can be called twice when eager option is on,
    // so this flag should be set and checked at first.
    if (this.initialized) {
      return;
    }
    this.initialized = true;

    const { eager = false, ignoreError = false, tables = {} } =
      this.pluginConfig.schema || {};
    if (initial && !eager) {
      return;
    }

    try {
      for (const [name, query] of Object.entries(tables)) {
        logger.debug(`Prepare a table[${name}]`);
        logger.stupid(name, query);
        const result = await this.query(query);
        logger.debug(
          `Table[${name}] is initialized: ${JSON.stringify(result)}`,
        );
      }
      logger.debug(`Database schema is initialized.`);
    } catch (error) {
      logger.warn(error);
      if (!ignoreError) {
        throw error;
      }
    }
  };
}

export interface MySQLPluginAux extends HandlerAuxBase {
  db: ConnectionProxy;
}

export class MySQLPlugin extends HandlerPluginBase<MySQLPluginAux> {
  private proxy: ConnectionProxy;

  constructor(options: MySQLPluginOptions) {
    super();
    this.proxy = new ConnectionProxy(options);
  }

  public create = async () => {
    await this.proxy.onPluginCreated();
    return { db: this.proxy };
  };

  public end = () => {
    if (this.proxy) {
      this.proxy.clearConnection();
    }
  };
}

const build = (options: MySQLPluginOptions) => new MySQLPlugin(options);
export default build;
