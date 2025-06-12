"use strict";
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        if (typeof b !== "function" && b !== null)
            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MySQLPlugin = exports.ConnectionProxy = void 0;
var mysql = require("mysql");
var utils_1 = require("../utils");
var base_1 = require("./base");
var logger = (0, utils_1.getLogger)(__filename);
var ConnectionProxy = /** @class */ (function () {
    function ConnectionProxy(config) {
        var _this = this;
        this.query = function (sql, params) {
            return new Promise(function (resolve, reject) { return __awaiter(_this, void 0, void 0, function () {
                var connection;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            connection = this.prepareConnection();
                            return [4 /*yield*/, this.tryToInitializeSchema(false)];
                        case 1:
                            _a.sent();
                            if (process.env.NODE_ENV !== 'test') {
                                logger.silly("Execute query[".concat(sql, "] with params[").concat(params, "]"));
                            }
                            connection.query(sql, params, function (err, result) {
                                if (err) {
                                    logger.error("error occurred in database query=".concat(sql, ", error=").concat(err));
                                    reject(err);
                                }
                                else {
                                    resolve(result);
                                    if (process.env.NODE_ENV !== 'test') {
                                        logger.silly("DB result is ".concat(JSON.stringify(result)));
                                    }
                                }
                            });
                            return [2 /*return*/];
                    }
                });
            }); });
        };
        this.fetch = function (sql, params) {
            return _this.query(sql, params).then(function (res) { return res || []; });
        };
        this.fetchOne = function (sql, params, defaultValue) {
            return _this.fetch(sql, params).then(function (res) {
                if (res === undefined || res[0] === undefined) {
                    // Makes it as non-null result.
                    return defaultValue || {};
                }
                return res[0];
            });
        };
        this.beginTransaction = function () {
            return new Promise(function (resolve, reject) { return __awaiter(_this, void 0, void 0, function () {
                var connection;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            connection = this.prepareConnection();
                            return [4 /*yield*/, this.tryToInitializeSchema(false)];
                        case 1:
                            _a.sent();
                            connection.beginTransaction(function (err) {
                                if (err) {
                                    reject(err);
                                    return;
                                }
                                resolve();
                            });
                            return [2 /*return*/];
                    }
                });
            }); });
        };
        this.commit = function () {
            return new Promise(function (resolve, reject) { return __awaiter(_this, void 0, void 0, function () {
                var connection;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            connection = this.prepareConnection();
                            return [4 /*yield*/, this.tryToInitializeSchema(false)];
                        case 1:
                            _a.sent();
                            connection.commit(function (err) {
                                if (err) {
                                    reject(err);
                                    return;
                                }
                                resolve();
                            });
                            return [2 /*return*/];
                    }
                });
            }); });
        };
        this.rollback = function () {
            return new Promise(function (resolve, reject) { return __awaiter(_this, void 0, void 0, function () {
                var connection;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            connection = this.prepareConnection();
                            return [4 /*yield*/, this.tryToInitializeSchema(false)];
                        case 1:
                            _a.sent();
                            connection.rollback(function (err) {
                                if (err) {
                                    reject(err);
                                    return;
                                }
                                resolve();
                            });
                            return [2 /*return*/];
                    }
                });
            }); });
        };
        this.clearConnection = function () {
            if (_this.connection) {
                _this.connection.end();
                _this.connection = undefined;
                logger.verbose('Connection is end');
            }
        };
        this.onPluginCreated = function () { return __awaiter(_this, void 0, void 0, function () { return __generator(this, function (_a) {
            return [2 /*return*/, this.tryToInitializeSchema(true)];
        }); }); };
        this.prepareConnection = function () {
            if (_this.connection) {
                return _this.connection;
            }
            _this.connection = mysql.createConnection(_this.pluginConfig.config);
            _this.connection.connect();
            return _this.connection;
        };
        this.changeDatabase = function (dbName) {
            return new Promise(function (resolve, reject) {
                return _this.prepareConnection().changeUser({
                    database: dbName,
                }, function (err) { return (err ? reject(err) : resolve(undefined)); });
            });
        };
        this.tryToInitializeSchema = function (initial) { return __awaiter(_this, void 0, void 0, function () {
            var _a, _b, eager, _c, ignoreError, _d, database, _e, tables, result, _i, _f, _g, name_1, query, result, error_1;
            return __generator(this, function (_h) {
                switch (_h.label) {
                    case 0:
                        _a = this.pluginConfig.schema || {}, _b = _a.eager, eager = _b === void 0 ? false : _b, _c = _a.ignoreError, ignoreError = _c === void 0 ? false : _c, _d = _a.database, database = _d === void 0 ? '' : _d, _e = _a.tables, tables = _e === void 0 ? {} : _e;
                        if (initial && !eager) {
                            return [2 /*return*/];
                        }
                        // This method can be called twice when eager option is on,
                        // so this flag should be set and checked at first.
                        if (this.initialized) {
                            return [2 /*return*/];
                        }
                        this.initialized = true;
                        _h.label = 1;
                    case 1:
                        _h.trys.push([1, 10, , 11]);
                        if (!database) return [3 /*break*/, 3];
                        logger.debug("Prepare a database[".concat(this.dbName, "]"));
                        logger.stupid(this.dbName, database);
                        return [4 /*yield*/, this.query(database)];
                    case 2:
                        result = _h.sent();
                        logger.debug("Database[".concat(this.dbName, "] is initialized: ").concat(JSON.stringify(result)));
                        _h.label = 3;
                    case 3:
                        if (!this.dbName) return [3 /*break*/, 5];
                        return [4 /*yield*/, this.changeDatabase(this.dbName)];
                    case 4:
                        _h.sent();
                        logger.verbose("Database[".concat(this.dbName, "] is connected."));
                        _h.label = 5;
                    case 5:
                        _i = 0, _f = Object.entries(tables);
                        _h.label = 6;
                    case 6:
                        if (!(_i < _f.length)) return [3 /*break*/, 9];
                        _g = _f[_i], name_1 = _g[0], query = _g[1];
                        logger.debug("Prepare a table[".concat(name_1, "]"));
                        logger.stupid(name_1, query);
                        return [4 /*yield*/, this.query(query)];
                    case 7:
                        result = _h.sent();
                        logger.debug("Table[".concat(name_1, "] is initialized: ").concat(JSON.stringify(result)));
                        _h.label = 8;
                    case 8:
                        _i++;
                        return [3 /*break*/, 6];
                    case 9:
                        logger.verbose("Database schema is initialized.");
                        return [3 /*break*/, 11];
                    case 10:
                        error_1 = _h.sent();
                        logger.warn(error_1);
                        if (!ignoreError) {
                            throw error_1;
                        }
                        return [3 /*break*/, 11];
                    case 11: return [2 /*return*/];
                }
            });
        }); };
        this.pluginConfig = config;
        if (config.schema && config.schema.database) {
            this.dbName = config.config.database;
            config.config.database = undefined;
        }
    }
    return ConnectionProxy;
}());
exports.ConnectionProxy = ConnectionProxy;
var MySQLPlugin = /** @class */ (function (_super) {
    __extends(MySQLPlugin, _super);
    function MySQLPlugin(options) {
        var _this = _super.call(this) || this;
        _this.create = function () { return __awaiter(_this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.proxy.onPluginCreated()];
                    case 1:
                        _a.sent();
                        return [2 /*return*/, { db: this.proxy }];
                }
            });
        }); };
        _this.end = function () {
            if (_this.proxy) {
                _this.proxy.clearConnection();
            }
        };
        _this.proxy = new ConnectionProxy(options);
        return _this;
    }
    return MySQLPlugin;
}(base_1.HandlerPluginBase));
exports.MySQLPlugin = MySQLPlugin;
var build = function (options) { return new MySQLPlugin(options); };
exports.default = build;
