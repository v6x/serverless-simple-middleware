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
Object.defineProperty(exports, "__esModule", { value: true });
exports.HandlerPluginBase = exports.HandlerResponse = exports.HandlerRequest = void 0;
var logger_1 = require("../utils/logger");
var logger = (0, logger_1.getLogger)(__filename);
var HandlerRequest = /** @class */ (function () {
    function HandlerRequest(event, context) {
        this.event = event;
        this.context = context;
        this.lastError = undefined;
    }
    Object.defineProperty(HandlerRequest.prototype, "body", {
        get: function () {
            if (!this.event.body) {
                return {};
            }
            if (this.lazyBody === undefined) {
                this.lazyBody = JSON.parse(this.event.body);
            }
            return this.lazyBody || {};
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(HandlerRequest.prototype, "path", {
        get: function () {
            return this.event.pathParameters || {};
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(HandlerRequest.prototype, "query", {
        get: function () {
            return this.event.queryStringParameters || {};
        },
        enumerable: false,
        configurable: true
    });
    HandlerRequest.prototype.header = function (key) {
        return this.event.headers
            ? this.event.headers[key] || this.event.headers[key.toLowerCase()]
            : undefined;
    };
    HandlerRequest.prototype.records = function (selector) {
        var target = (this.event.Records || []);
        return selector === undefined ? target : target.map(selector);
    };
    return HandlerRequest;
}());
exports.HandlerRequest = HandlerRequest;
var CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'X-Version',
    'Access-Control-Allow-Credentials': true,
};
var HandlerResponse = /** @class */ (function () {
    function HandlerResponse(callback) {
        var _this = this;
        this.setCrossOrigin = function (origin) {
            _this.crossOrigin = origin;
        };
        this.addHeader = function (header, value) {
            _this.customHeaders[header] = value;
        };
        this.callback = callback;
        this.completed = false;
        this.cookies = [];
        this.customHeaders = {};
    }
    HandlerResponse.prototype.ok = function (body, code) {
        if (body === void 0) { body = {}; }
        if (code === void 0) { code = 200; }
        logger.stupid("ok", body);
        var headers = __assign(__assign({}, CORS_HEADERS), this.customHeaders);
        if (this.crossOrigin) {
            headers['Access-Control-Allow-Origin'] = this.crossOrigin;
        }
        var multiValueHeaders = undefined;
        if (this.cookies.length > 0) {
            multiValueHeaders = { 'Set-Cookie': this.cookies };
        }
        var result = this.callback(null, {
            statusCode: code,
            headers: headers,
            multiValueHeaders: multiValueHeaders,
            body: JSON.stringify(body),
        });
        this.completed = true;
        return result;
    };
    HandlerResponse.prototype.fail = function (body, code) {
        if (body === void 0) { body = {}; }
        if (code === void 0) { code = 500; }
        logger.stupid("fail", body);
        var result = this.callback(null, {
            statusCode: code,
            headers: CORS_HEADERS,
            body: JSON.stringify(body),
        });
        this.completed = true;
        return result;
    };
    HandlerResponse.prototype.addCookie = function (key, value, domain, specifyCrossOrigin, path) {
        var keyValueStr = "".concat(key, "=").concat(value);
        var domainStr = domain ? "Domain=".concat(domain) : '';
        var sameSiteStr = specifyCrossOrigin ? 'SameSite=None' : '';
        var secureStr = specifyCrossOrigin ? 'Secure' : '';
        var pathStr = path !== undefined ? "Path=".concat(path) : '';
        var cookieStr = [keyValueStr, domainStr, sameSiteStr, secureStr, pathStr]
            .filter(function (x) { return x; })
            .join('; ');
        this.cookies.push(cookieStr);
    };
    return HandlerResponse;
}());
exports.HandlerResponse = HandlerResponse;
var HandlerPluginBase = /** @class */ (function () {
    function HandlerPluginBase() {
        this.create = function () {
            throw new Error('Not yet implemented');
        };
        this.begin = function (_) {
            // do nothing
        };
        this.end = function (_) {
            // do nothing
        };
        this.error = function (_) {
            // do nothing
        };
    }
    return HandlerPluginBase;
}());
exports.HandlerPluginBase = HandlerPluginBase;
