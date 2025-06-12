import * as mysql from 'mysql';
import { HandlerAuxBase, HandlerPluginBase } from './base';
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
export declare class ConnectionProxy {
    private pluginConfig;
    private connection?;
    private initialized;
    private dbName?;
    constructor(config: MySQLPluginOptions);
    query: <T>(sql: string, params?: any[]) => Promise<T | undefined>;
    fetch: <T>(sql: string, params?: any[]) => Promise<T[]>;
    fetchOne: <T>(sql: string, params?: any[], defaultValue?: T) => Promise<T>;
    beginTransaction: () => Promise<void>;
    commit: () => Promise<void>;
    rollback: () => Promise<void>;
    clearConnection: () => void;
    onPluginCreated: () => Promise<void>;
    private prepareConnection;
    private changeDatabase;
    private tryToInitializeSchema;
}
export interface MySQLPluginAux extends HandlerAuxBase {
    db: ConnectionProxy;
}
export declare class MySQLPlugin extends HandlerPluginBase<MySQLPluginAux> {
    private proxy;
    constructor(options: MySQLPluginOptions);
    create: () => Promise<{
        db: ConnectionProxy;
    }>;
    end: () => void;
}
declare const build: (options: MySQLPluginOptions) => MySQLPlugin;
export default build;
