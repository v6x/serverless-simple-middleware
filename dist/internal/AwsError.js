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
Object.defineProperty(exports, "__esModule", { value: true });
exports.AwsError = void 0;
var AwsError = /** @class */ (function (_super) {
    __extends(AwsError, _super);
    function AwsError(awsError) {
        var _this = this;
        var _a, _b, _c;
        var errorObj = awsError;
        var message = (_a = errorObj === null || errorObj === void 0 ? void 0 : errorObj.message) !== null && _a !== void 0 ? _a : 'Unknown AWS Error';
        _this = _super.call(this, message) || this;
        _this.name = (_b = errorObj === null || errorObj === void 0 ? void 0 : errorObj.name) !== null && _b !== void 0 ? _b : 'UnclassifiedError';
        _this.service = (_c = errorObj === null || errorObj === void 0 ? void 0 : errorObj.$service) !== null && _c !== void 0 ? _c : 'UnknownService';
        return _this;
    }
    return AwsError;
}(Error));
exports.AwsError = AwsError;
