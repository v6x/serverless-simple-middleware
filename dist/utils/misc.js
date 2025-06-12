"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.stringifyError = void 0;
var AwsError_1 = require("../internal/AwsError");
var stringifyError = function (err, replacer, space) {
    var error = isAWSv3Error(err) ? new AwsError_1.AwsError(err) : err;
    var plainObject = {};
    Object.getOwnPropertyNames(error).forEach(function (key) {
        plainObject[key] = error[key];
    });
    return JSON.stringify(plainObject, replacer, space);
};
exports.stringifyError = stringifyError;
var isAWSv3Error = function (error) {
    return error instanceof Error && 'name' in error && '$metadata' in error;
};
