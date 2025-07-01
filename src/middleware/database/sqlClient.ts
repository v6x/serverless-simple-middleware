import { Kysely, MysqlDialect, MysqlPool } from 'kysely';
import * as mysql2 from 'mysql2';

interface LazyMysqlPoolConnection extends mysql2.Connection {
  release: () => void;
}

class LazyConnectionPool implements MysqlPool {
  private connection: LazyMysqlPoolConnection | null = null;

  constructor(private config: mysql2.ConnectionOptions) {}

  public getConnection = (
    callback: (error: unknown, connection: LazyMysqlPoolConnection) => void,
  ): void => {
    if (this.connection) {
      callback(null, this.connection);
      return;
    }
    const conn = mysql2.createConnection(this.config);
    conn.connect((err: mysql2.QueryError) => {
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
      this.connection.end((err: mysql2.QueryError) => {
        this.connection = null;
        callback(err);
      });
    } else {
      callback(null);
    }
  };

  private _addRelease = (
    connection: mysql2.Connection,
  ): LazyMysqlPoolConnection =>
    Object.assign(connection, {
      release: () => {},
    });
}

export class SQLClient<T = unknown> extends Kysely<T> {
  private pool: LazyConnectionPool;

  constructor(config: mysql2.ConnectionOptions) {
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
