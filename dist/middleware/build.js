"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
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
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
var logger_1 = require("../utils/logger");
var utils_1 = require("../utils");
var base_1 = require("./base");
var logger = (0, logger_1.getLogger)(__filename);
var HandlerMiddleware = /** @class */ (function () {
    function HandlerMiddleware(plugins) {
        var _this = this;
        this.createAuxPromise = function () {
            return !_this.plugins || _this.plugins.length === 0
                ? Promise.resolve({}) // tslint:disable-line
                : Promise.all(_this.plugins.map(function (plugin) {
                    var maybePromise = plugin.create();
                    return maybePromise instanceof Promise
                        ? maybePromise
                        : Promise.resolve(maybePromise);
                })).then(function (auxes) {
                    return auxes.reduce(function (all, each) { return (__assign(__assign({}, all), each)); }, {});
                });
        };
        this.plugins = plugins;
        this.auxPromise = this.createAuxPromise();
    }
    return HandlerMiddleware;
}());
var HandlerProxy = /** @class */ (function () {
    function HandlerProxy(event, context, callback) {
        var _this = this;
        this.call = function (middleware, handler) { return __awaiter(_this, void 0, void 0, function () {
            var _a, error_1, actualHandler, beginHandlers, endHandlers, errorHandlers, iterate, results, _b, _c, _d, _i, results_1, each;
            var _this = this;
            return __generator(this, function (_e) {
                switch (_e.label) {
                    case 0:
                        _e.trys.push([0, 2, , 3]);
                        _a = this;
                        return [4 /*yield*/, middleware.auxPromise];
                    case 1:
                        _a.aux = _e.sent();
                        return [3 /*break*/, 3];
                    case 2:
                        error_1 = _e.sent();
                        logger.error("Error while initializing plugins' aux: ".concat((0, utils_1.stringifyError)(error_1)));
                        this.response.fail(error_1 instanceof Error ? { error: error_1.message } : error_1);
                        return [2 /*return*/, [error_1]];
                    case 3:
                        actualHandler = [this.generateDelegator(handler)];
                        beginHandlers = middleware.plugins.map(function (plugin) {
                            return _this.generateDelegator(plugin.begin);
                        });
                        endHandlers = middleware.plugins.map(function (plugin) {
                            return _this.generateDelegator(plugin.end);
                        });
                        errorHandlers = middleware.plugins.map(function (plugin) {
                            return _this.generateDelegator(plugin.error);
                        });
                        iterate = function (handlers_1) {
                            var args_1 = [];
                            for (var _i = 1; _i < arguments.length; _i++) {
                                args_1[_i - 1] = arguments[_i];
                            }
                            return __awaiter(_this, __spreadArray([handlers_1], args_1, true), void 0, function (handlers, okResponsible) {
                                var _this = this;
                                if (okResponsible === void 0) { okResponsible = false; }
                                return __generator(this, function (_a) {
                                    return [2 /*return*/, Promise.all(handlers.map(function (each) {
                                            return _this.safeCall(each, okResponsible, errorHandlers);
                                        }))];
                                });
                            });
                        };
                        _b = [[]];
                        return [4 /*yield*/, iterate(beginHandlers)];
                    case 4:
                        _c = [__spreadArray.apply(void 0, _b.concat([(_e.sent()), true]))];
                        return [4 /*yield*/, iterate(actualHandler, true)];
                    case 5:
                        _d = [__spreadArray.apply(void 0, _c.concat([(_e.sent()), true]))];
                        return [4 /*yield*/, iterate(endHandlers)];
                    case 6:
                        results = __spreadArray.apply(void 0, _d.concat([(_e.sent()), true])).filter(function (x) { return x; });
                        // In test phase, throws any exception if there was.
                        if (process.env.NODE_ENV === 'test') {
                            for (_i = 0, results_1 = results; _i < results_1.length; _i++) {
                                each = results_1[_i];
                                if (each instanceof Error) {
                                    logger.error("Error occurred: ".concat((0, utils_1.stringifyError)(each)));
                                    throw each;
                                }
                            }
                        }
                        results.forEach(function (result) {
                            return logger.silly("middleware result : ".concat(JSON.stringify(result)));
                        });
                        return [2 /*return*/];
                }
            });
        }); };
        this.safeCall = function (delegator, okResponsible, errorHandlers) { return __awaiter(_this, void 0, void 0, function () {
            var result, error_2, handled;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 4]);
                        return [4 /*yield*/, delegator(okResponsible)];
                    case 1:
                        result = _a.sent();
                        return [2 /*return*/, result];
                    case 2:
                        error_2 = _a.sent();
                        return [4 /*yield*/, this.handleError(error_2, errorHandlers)];
                    case 3:
                        handled = _a.sent();
                        return [2 /*return*/, handled];
                    case 4: return [2 /*return*/];
                }
            });
        }); };
        this.generateDelegator = function (handler) {
            return function (okResponsible) { return __awaiter(_this, void 0, void 0, function () {
                var maybePromise, result, _a;
                return __generator(this, function (_b) {
                    switch (_b.label) {
                        case 0:
                            maybePromise = handler({
                                request: this.request,
                                response: this.response,
                                aux: this.aux,
                            });
                            if (!(maybePromise instanceof Promise)) return [3 /*break*/, 2];
                            return [4 /*yield*/, maybePromise];
                        case 1:
                            _a = _b.sent();
                            return [3 /*break*/, 3];
                        case 2:
                            _a = maybePromise;
                            _b.label = 3;
                        case 3:
                            result = _a;
                            logger.stupid("result", result);
                            if (!this.response.completed && okResponsible) {
                                this.response.ok(result);
                            }
                            return [2 /*return*/, result];
                    }
                });
            }); };
        };
        this.handleError = function (error, errorHandlers) { return __awaiter(_this, void 0, void 0, function () {
            var _i, errorHandlers_1, handler, ignorable_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        logger.error(error);
                        this.request.lastError = error;
                        if (!errorHandlers) return [3 /*break*/, 6];
                        _i = 0, errorHandlers_1 = errorHandlers;
                        _a.label = 1;
                    case 1:
                        if (!(_i < errorHandlers_1.length)) return [3 /*break*/, 6];
                        handler = errorHandlers_1[_i];
                        _a.label = 2;
                    case 2:
                        _a.trys.push([2, 4, , 5]);
                        return [4 /*yield*/, handler(false)];
                    case 3:
                        _a.sent();
                        return [3 /*break*/, 5];
                    case 4:
                        ignorable_1 = _a.sent();
                        logger.error(ignorable_1);
                        return [3 /*break*/, 5];
                    case 5:
                        _i++;
                        return [3 /*break*/, 1];
                    case 6:
                        if (!this.response.completed) {
                            this.response.fail(error instanceof Error ? { error: error.message } : error);
                        }
                        return [2 /*return*/, error];
                }
            });
        }); };
        logger.stupid("event", event);
        this.request = new base_1.HandlerRequest(event, context);
        this.response = new base_1.HandlerResponse(callback);
        this.aux = {}; // tslint:disable-line
    }
    return HandlerProxy;
}());
// It will break type safety because there is no relation between Aux and Plugin.
var build = function (plugins) {
    var middleware = new HandlerMiddleware(plugins);
    return function (handler) {
        return function (event, context, callback) {
            new HandlerProxy(event, context, callback).call(middleware, handler);
        };
    };
};
exports.default = build;
