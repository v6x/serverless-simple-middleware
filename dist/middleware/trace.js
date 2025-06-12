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
exports.TracerPlugin = exports.TracerWrapper = exports.Tracer = exports.TracerLog = void 0;
var uuid_1 = require("uuid");
var aws_1 = require("../aws");
var utils_1 = require("../utils");
var ts_enum_util_1 = require("ts-enum-util");
var base_1 = require("./base");
var client_sqs_1 = require("@aws-sdk/client-sqs");
var logger = (0, utils_1.getLogger)(__filename);
var TracerLog = /** @class */ (function () {
    function TracerLog(route, key, system, action, attribute, body, error, client, version) {
        this.route = route;
        this.key = key;
        this.system = system;
        this.action = action;
        this.attribute = attribute;
        this.body = body;
        this.error = error;
        this.client = client;
        this.version = version;
        this.uuid = (0, uuid_1.v4)();
        this.timestamp = Date.now();
    }
    return TracerLog;
}());
exports.TracerLog = TracerLog;
var Tracer = /** @class */ (function () {
    function Tracer(queueName, sqs) {
        var _this = this;
        this.push = function (log) { return _this.buffer.push(log); };
        this.flush = function () { return __awaiter(_this, void 0, void 0, function () {
            var urlResult, eventQueueUrl, chunkSize, begin, end, subset, sendBatchResult, error_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (this.buffer.length === 0) {
                            return [2 /*return*/];
                        }
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 7, , 8]);
                        return [4 /*yield*/, this.sqs.getQueueUrl({
                                QueueName: this.queueName,
                            })];
                    case 2:
                        urlResult = _a.sent();
                        logger.stupid("urlResult", urlResult);
                        if (!urlResult.QueueUrl) {
                            throw new Error("No queue url with name[".concat(this.queueName, "]"));
                        }
                        eventQueueUrl = urlResult.QueueUrl;
                        chunkSize = 10;
                        begin = 0;
                        _a.label = 3;
                    case 3:
                        if (!(begin < this.buffer.length)) return [3 /*break*/, 6];
                        end = Math.min(this.buffer.length, begin + chunkSize);
                        subset = this.buffer.slice(begin, end);
                        return [4 /*yield*/, this.sqs.sendMessageBatch({
                                QueueUrl: eventQueueUrl,
                                Entries: subset.map(function (each) { return ({
                                    Id: "".concat(each.key, "_").concat(each.uuid),
                                    MessageBody: JSON.stringify(each),
                                }); }),
                            })];
                    case 4:
                        sendBatchResult = _a.sent();
                        logger.stupid("sendBatchResult", sendBatchResult);
                        _a.label = 5;
                    case 5:
                        begin += chunkSize;
                        return [3 /*break*/, 3];
                    case 6:
                        this.buffer = [];
                        return [3 /*break*/, 8];
                    case 7:
                        error_1 = _a.sent();
                        logger.warn("Error in eventSource: ".concat(error_1));
                        return [3 /*break*/, 8];
                    case 8: return [2 /*return*/];
                }
            });
        }); };
        this.queueName = queueName;
        this.sqs = sqs;
        this.buffer = [];
    }
    return Tracer;
}());
exports.Tracer = Tracer;
var TracerWrapper = /** @class */ (function () {
    function TracerWrapper(tracer, route, system, key, action, client, version) {
        var _this = this;
        this.tracer = tracer;
        this.route = route;
        this.system = system;
        this.key = key;
        this.action = action;
        this.client = client;
        this.version = version;
        this.push = function (attribute, body, error) {
            if (error === void 0) { error = false; }
            _this.tracer.push(new TracerLog(_this.route, _this.key, _this.system, _this.action, attribute, body, error, _this.client, _this.version));
        };
        this.send = function (log) {
            _this.tracer.push(new TracerLog(log.route || _this.route, log.key || _this.key, log.system || _this.system, log.action || _this.action, log.attribute, log.body, log.error || false, log.client || _this.client, log.version || _this.version));
        };
    }
    return TracerWrapper;
}());
exports.TracerWrapper = TracerWrapper;
var TracerPlugin = /** @class */ (function (_super) {
    __extends(TracerPlugin, _super);
    function TracerPlugin(options) {
        var _this = _super.call(this) || this;
        _this.create = function () { return __awaiter(_this, void 0, void 0, function () {
            var awsConfig, _a, sqs, tracer;
            var _this = this;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        if (!this.options.awsConfig) return [3 /*break*/, 2];
                        return [4 /*yield*/, (0, aws_1.loadAWSConfig)(this.options.awsConfig)];
                    case 1:
                        _a = _b.sent();
                        return [3 /*break*/, 3];
                    case 2:
                        _a = undefined;
                        _b.label = 3;
                    case 3:
                        awsConfig = _a;
                        sqs = (function () {
                            if (!awsConfig) {
                                return new client_sqs_1.SQS({
                                    region: _this.options.region,
                                });
                            }
                            (0, ts_enum_util_1.$enum)(aws_1.AWSComponent).forEach(function (eachComponent) {
                                var config = awsConfig.get(eachComponent);
                                if (config) {
                                    config.region = _this.options.region;
                                }
                            });
                            return new aws_1.SimpleAWS(awsConfig).sqs;
                        })();
                        this.tracer = new Tracer(this.options.queueName, sqs);
                        tracer = function (key, action) {
                            _this.last = { key: key, action: action };
                            return new TracerWrapper(_this.tracer, _this.options.route, _this.options.system, key, action, _this.client.agent, _this.client.version);
                        };
                        return [2 /*return*/, { tracer: tracer }];
                }
            });
        }); };
        _this.begin = function (_a) {
            var request = _a.request;
            _this.client.version = request.header('X-Version') || '0.0.0';
            _this.client.agent = (function () {
                var fromHeader = request.header('User-Agent');
                if (fromHeader) {
                    return fromHeader;
                }
                if (request.context &&
                    request.context.identity &&
                    request.context.identity.userAgent) {
                    return request.context.identity.userAgent;
                }
                return '';
            })();
        };
        _this.end = function () { return _this.tracer.flush(); };
        _this.error = function (_a) {
            var request = _a.request, aux = _a.aux;
            if (!aux) {
                console.warn('Aux is not initialized');
                return;
            }
            if (!request.lastError) {
                return;
            }
            var _b = _this.last, key = _b.key, action = _b.action;
            aux
                .tracer(key, action)
                .push('error', typeof request.lastError === 'string'
                ? request.lastError
                : (0, utils_1.stringifyError)(request.lastError), true);
        };
        _this.options = options;
        _this.last = {
            key: 'nothing',
            action: 'unknown',
        };
        _this.client = {
            agent: '',
            version: '',
        };
        return _this;
    }
    return TracerPlugin;
}(base_1.HandlerPluginBase));
exports.TracerPlugin = TracerPlugin;
var build = function (options) { return new TracerPlugin(options); };
exports.default = build;
