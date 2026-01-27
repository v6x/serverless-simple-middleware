"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sql = exports.expressionBuilder = exports.SQLClient = void 0;
const kysely_1 = require("kysely");
const mysql2_1 = require("mysql2");
const oncePromise_1 = require("../../internal/oncePromise");
const utils_1 = require("../../utils");
const secretsManager_1 = require("../../utils/secretsManager");
const logger = (0, utils_1.getLogger)(__filename);
class LazyConnectionPool {
    options;
    connection = null;
    connectionConfig;
    secretsCache;
    configInitOnce = new oncePromise_1.OncePromise();
    connectionInitOnce = new oncePromise_1.OncePromise();
    constructor(options) {
        this.options = options;
        this.secretsCache = secretsManager_1.SecretsManagerCache.getInstance();
        if (options.secretsManagerConfig) {
            this.secretsCache.configure(options.secretsManagerConfig);
        }
    }
    ensureConnectionConfig = async () => {
        if (this.connectionConfig) {
            return;
        }
        await this.configInitOnce.run(async () => {
            const baseConfig = this.options.config;
            if (!this.options.secretId) {
                this.connectionConfig = baseConfig;
                return;
            }
            const credentials = await this.secretsCache.getDatabaseCredentials(this.options.secretId);
            this.connectionConfig = {
                ...baseConfig,
                user: credentials.username,
                password: credentials.password,
            };
        });
    };
    getConnection = (callback) => {
        if (this.connection) {
            callback(null, this.connection);
            return;
        }
        this.connectionInitOnce
            .run(async () => {
            await this.ensureConnectionConfig();
            const conn = (0, mysql2_1.createConnection)(this.connectionConfig);
            return await new Promise((resolve, reject) => {
                conn.connect((err) => {
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
            .catch((err) => callback(err, {}));
    };
    end = (callback) => {
        const conn = this.connection;
        this.connection = null;
        this.connectionInitOnce.reset();
        if (conn) {
            conn.end((err) => {
                callback(err);
            });
        }
        else {
            callback(null);
        }
    };
    destroy = () => {
        const conn = this.connection;
        this.connection = null;
        this.connectionInitOnce.reset();
        if (conn) {
            try {
                conn.destroy();
            }
            catch (error) {
                logger.warn(`Error occurred while destroying connection: ${error}`);
            }
        }
    };
    _addRelease = (connection) => Object.assign(connection, {
        release: () => { },
    });
}
class SQLClient extends kysely_1.Kysely {
    pool;
    constructor(config) {
        const pool = new LazyConnectionPool(config);
        const kyselyConfig = {
            dialect: new kysely_1.MysqlDialect({
                pool,
            }),
            plugins: [
                new kysely_1.HandleEmptyInListsPlugin({
                    strategy: kysely_1.replaceWithNoncontingentExpression,
                }),
            ],
        };
        super(kyselyConfig);
        this.pool = pool;
    }
    clearConnection = () => new Promise((resolve) => {
        this.pool.end(() => resolve());
    });
    /**
     * Destroy the connection socket immediately. No further events or callbacks will be triggered.
     * This should be used only for special use cases!
     */
    destroyConnection = () => {
        this.pool.destroy();
    };
}
exports.SQLClient = SQLClient;
var kysely_2 = require("kysely");
Object.defineProperty(exports, "expressionBuilder", { enumerable: true, get: function () { return kysely_2.expressionBuilder; } });
Object.defineProperty(exports, "sql", { enumerable: true, get: function () { return kysely_2.sql; } });
