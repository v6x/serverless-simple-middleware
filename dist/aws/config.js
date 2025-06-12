"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadAWSConfig = exports.SimpleAWSConfig = void 0;
var cross_fetch_1 = require("cross-fetch");
var fs = require("fs");
var SimpleAWSConfig = /** @class */ (function () {
    function SimpleAWSConfig(configs) {
        var _this = this;
        this.get = function (service) {
            return _this.configs ? _this.configs[service] : undefined;
        };
        this.configs = configs;
    }
    return SimpleAWSConfig;
}());
exports.SimpleAWSConfig = SimpleAWSConfig;
var loadAWSConfig = function (newConfigsOrUrl) {
    if (typeof newConfigsOrUrl === 'string') {
        if (/^http.*json$/.test(newConfigsOrUrl)) {
            return (0, cross_fetch_1.default)(newConfigsOrUrl)
                .then(function (r) { return r.json(); })
                .then(exports.loadAWSConfig);
        }
        else if (/json$/.test(newConfigsOrUrl)) {
            return (0, exports.loadAWSConfig)(JSON.parse(fs.readFileSync(newConfigsOrUrl, 'utf-8')));
        }
        return (0, exports.loadAWSConfig)(JSON.parse(newConfigsOrUrl));
    }
    return Promise.resolve(new SimpleAWSConfig(newConfigsOrUrl));
};
exports.loadAWSConfig = loadAWSConfig;
