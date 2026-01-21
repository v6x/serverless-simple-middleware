import type { DatabaseCredentials } from '../middleware/mysql';
export declare class SecretsManagerCache {
    private static instance;
    private client;
    private cache;
    private constructor();
    static getInstance(): SecretsManagerCache;
    private getClient;
    getSecret<T = any>(secretId: string): Promise<T>;
    getDatabaseCredentials(secretId: string): Promise<DatabaseCredentials>;
}
