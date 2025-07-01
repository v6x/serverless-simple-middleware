import { ConnectionConfig } from 'mysql';
import { PoolOptions } from 'mysql2';
import { HandlerAuxBase, HandlerPluginBase } from './base';
import { ConnectionProxy } from './database/connectionProxy';
import { SQLClient } from './database/sqlClient';

export interface MySQLPluginOptions {
  config: ConnectionConfig & PoolOptions;
  schema?: {
    eager?: boolean;
    ignoreError?: boolean;
    database?: string;
    tables?: {
      [tableName: string]: string;
    };
  };
}

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
    this.sqlClient = new SQLClient(options.config);
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
      this.sqlClient.clearConnection();
    }
  };
}

const build = (options: MySQLPluginOptions) => new MySQLPlugin(options);
export default build;
