import { Kysely, MysqlDialect, MysqlPool } from 'kysely';
import {
  Connection,
  ConnectionOptions,
  createConnection,
  QueryError,
} from 'mysql2';

interface LazyMysqlPoolConnection extends Connection {
  release: () => void;
}

class LazyConnectionPool implements MysqlPool {
  private connection: LazyMysqlPoolConnection | null = null;

  constructor(private config: ConnectionOptions) {}

  public getConnection = (
    callback: (error: unknown, connection: LazyMysqlPoolConnection) => void,
  ): void => {
    if (this.connection) {
      callback(null, this.connection);
      return;
    }
    const conn = createConnection(this.config);
    conn.connect((err: QueryError) => {
      if (err) {
        callback(err, {} as LazyMysqlPoolConnection);
        return;
      }
      this.connection = this._addRelease(conn);
      callback(null, this.connection);
    });
  };

  public end = (callback: (error: unknown) => void): void => {
    if (this.connection) {
      this.connection.end((err: QueryError) => {
        this.connection = null;
        callback(err);
      });
    } else {
      callback(null);
    }
  };

  private _addRelease = (connection: Connection): LazyMysqlPoolConnection =>
    Object.assign(connection, {
      release: () => {},
    });
}

export class SQLClient<T = unknown> extends Kysely<T> {
  private pool: LazyConnectionPool;

  constructor(config: ConnectionOptions) {
    const pool = new LazyConnectionPool(config);
    super({
      dialect: new MysqlDialect({
        pool,
      }),
    });
    this.pool = pool;
  }

  public clearConnection = () =>
    new Promise<void>((resolve) => {
      this.pool.end(() => resolve());
    });
}

export {
  sql,
  type DeleteQueryBuilder,
  type ExpressionBuilder,
  type InsertQueryBuilder,
  type SelectQueryBuilder,
  type UpdateQueryBuilder,
} from 'kysely';
