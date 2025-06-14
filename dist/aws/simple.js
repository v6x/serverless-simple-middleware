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
exports.SimpleAWS = void 0;
var cloudfront_signer_1 = require("@aws-sdk/cloudfront-signer");
var fs = require("fs");
var os = require("os");
var non_secure_1 = require("nanoid/non-secure");
var utils_1 = require("../utils");
var config_1 = require("./config");
var define_1 = require("./define");
var client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
var client_s3_1 = require("@aws-sdk/client-s3");
var client_sqs_1 = require("@aws-sdk/client-sqs");
var lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
var s3_request_presigner_1 = require("@aws-sdk/s3-request-presigner");
var lib_storage_1 = require("@aws-sdk/lib-storage");
var logger = (0, utils_1.getLogger)(__filename);
var SimpleAWS = /** @class */ (function () {
    function SimpleAWS(config) {
        var _this = this;
        this.queueUrls = {};
        this.getQueueUrl = function (queueName) { return __awaiter(_this, void 0, void 0, function () {
            var urlResult;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (this.queueUrls[queueName] !== undefined) {
                            return [2 /*return*/, this.queueUrls[queueName]];
                        }
                        return [4 /*yield*/, this.sqs.getQueueUrl({
                                QueueName: queueName,
                            })];
                    case 1:
                        urlResult = _a.sent();
                        logger.stupid("urlResult", urlResult);
                        if (!urlResult.QueueUrl) {
                            throw new Error("No queue url with name[".concat(queueName, "]"));
                        }
                        return [2 /*return*/, (this.queueUrls[queueName] = urlResult.QueueUrl)];
                }
            });
        }); };
        this.enqueue = function (queueName, data) { return __awaiter(_this, void 0, void 0, function () {
            var queueUrl, sendResult, attrResult;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        logger.debug("Send message[".concat(data.key, "] to queue."));
                        logger.stupid("data", data);
                        return [4 /*yield*/, this.getQueueUrl(queueName)];
                    case 1:
                        queueUrl = _b.sent();
                        return [4 /*yield*/, this.sqs.sendMessage({
                                QueueUrl: queueUrl,
                                MessageBody: JSON.stringify(data),
                                DelaySeconds: 0,
                            })];
                    case 2:
                        sendResult = _b.sent();
                        logger.stupid("sendResult", sendResult);
                        return [4 /*yield*/, this.sqs.getQueueAttributes({
                                QueueUrl: queueUrl,
                                AttributeNames: ['ApproximateNumberOfMessages'],
                            })];
                    case 3:
                        attrResult = _b.sent();
                        logger.stupid("attrResult", attrResult);
                        if (!attrResult.Attributes) {
                            return [2 /*return*/, 0];
                        }
                        return [2 /*return*/, +(((_a = attrResult.Attributes) === null || _a === void 0 ? void 0 : _a.ApproximateNumberOfMessages) || 0)];
                }
            });
        }); };
        this.dequeue = function (queueName_1) {
            var args_1 = [];
            for (var _i = 1; _i < arguments.length; _i++) {
                args_1[_i - 1] = arguments[_i];
            }
            return __awaiter(_this, __spreadArray([queueName_1], args_1, true), void 0, function (queueName, fetchSize, waitSeconds, visibilityTimeout) {
                var queueUrl, receiveResult, data, _a, _b, each, message;
                if (fetchSize === void 0) { fetchSize = 1; }
                if (waitSeconds === void 0) { waitSeconds = 1; }
                if (visibilityTimeout === void 0) { visibilityTimeout = 15; }
                return __generator(this, function (_c) {
                    switch (_c.label) {
                        case 0:
                            logger.debug("Receive message from queue[".concat(queueName, "]."));
                            return [4 /*yield*/, this.getQueueUrl(queueName)];
                        case 1:
                            queueUrl = _c.sent();
                            return [4 /*yield*/, this.sqs.receiveMessage({
                                    QueueUrl: queueUrl,
                                    MaxNumberOfMessages: fetchSize,
                                    WaitTimeSeconds: waitSeconds,
                                    VisibilityTimeout: visibilityTimeout,
                                })];
                        case 2:
                            receiveResult = _c.sent();
                            logger.stupid("receiveResult", receiveResult);
                            if (receiveResult.Messages === undefined ||
                                receiveResult.Messages.length === 0) {
                                return [2 /*return*/, []];
                            }
                            data = [];
                            for (_a = 0, _b = receiveResult.Messages; _a < _b.length; _a++) {
                                each = _b[_a];
                                if (!each.ReceiptHandle) {
                                    logger.warn("No receipt handler: ".concat(JSON.stringify(each)));
                                    continue;
                                }
                                message = {
                                    handle: each.ReceiptHandle,
                                    body: each.Body ? JSON.parse(each.Body) : undefined,
                                };
                                data.push(message);
                            }
                            logger.verbose("Receive a message[".concat(JSON.stringify(data), "] from queue"));
                            return [2 /*return*/, data];
                    }
                });
            });
        };
        this.dequeueAll = function (queueName_1) {
            var args_1 = [];
            for (var _i = 1; _i < arguments.length; _i++) {
                args_1[_i - 1] = arguments[_i];
            }
            return __awaiter(_this, __spreadArray([queueName_1], args_1, true), void 0, function (queueName, limitSize, visibilityTimeout) {
                var messages, maxFetchSize, eachOfMessages, _a, eachOfMessages_1, each;
                if (limitSize === void 0) { limitSize = Number.MAX_VALUE; }
                if (visibilityTimeout === void 0) { visibilityTimeout = 15; }
                return __generator(this, function (_b) {
                    switch (_b.label) {
                        case 0:
                            messages = [];
                            maxFetchSize = 10;
                            _b.label = 1;
                        case 1:
                            if (!(messages.length < limitSize)) return [3 /*break*/, 3];
                            return [4 /*yield*/, this.dequeue(queueName, Math.min(limitSize - messages.length, maxFetchSize), 0, visibilityTimeout)];
                        case 2:
                            eachOfMessages = _b.sent();
                            if (!eachOfMessages || eachOfMessages.length === 0) {
                                return [3 /*break*/, 3];
                            }
                            for (_a = 0, eachOfMessages_1 = eachOfMessages; _a < eachOfMessages_1.length; _a++) {
                                each = eachOfMessages_1[_a];
                                messages.push(each);
                            }
                            return [3 /*break*/, 1];
                        case 3:
                            logger.stupid("messages", messages);
                            return [2 /*return*/, messages];
                    }
                });
            });
        };
        this.retainMessage = function (queueName, handle, seconds) { return __awaiter(_this, void 0, void 0, function () {
            var queueUrl;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        logger.debug("Change visibilityTimeout of ".concat(handle, " to ").concat(seconds, "secs."));
                        return [4 /*yield*/, this.getQueueUrl(queueName)];
                    case 1:
                        queueUrl = _a.sent();
                        return [4 /*yield*/, this.sqs.changeMessageVisibility({
                                QueueUrl: queueUrl,
                                ReceiptHandle: handle,
                                VisibilityTimeout: seconds,
                            })];
                    case 2:
                        _a.sent();
                        return [2 /*return*/, handle];
                }
            });
        }); };
        this.completeMessage = function (queueName, handle) { return __awaiter(_this, void 0, void 0, function () {
            var queueUrl, deleteResult;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        logger.debug("Complete a message with handle[".concat(handle, "]"));
                        return [4 /*yield*/, this.getQueueUrl(queueName)];
                    case 1:
                        queueUrl = _a.sent();
                        return [4 /*yield*/, this.sqs.deleteMessage({
                                QueueUrl: queueUrl,
                                ReceiptHandle: handle,
                            })];
                    case 2:
                        deleteResult = _a.sent();
                        logger.stupid("deleteResult", deleteResult);
                        return [2 /*return*/, handle];
                }
            });
        }); };
        this.completeMessages = function (queueName, handles) { return __awaiter(_this, void 0, void 0, function () {
            var chunkSize, index, start, end, sublist, queueUrl, deletesResult;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        logger.debug("Complete a message with handle[".concat(handles, "]"));
                        if (!handles) {
                            return [2 /*return*/, handles];
                        }
                        chunkSize = 10;
                        index = 0;
                        start = 0;
                        _a.label = 1;
                    case 1:
                        if (!(start < handles.length)) return [3 /*break*/, 5];
                        end = Math.min(start + chunkSize, handles.length);
                        sublist = handles.slice(start, end);
                        return [4 /*yield*/, this.getQueueUrl(queueName)];
                    case 2:
                        queueUrl = _a.sent();
                        return [4 /*yield*/, this.sqs.deleteMessageBatch({
                                QueueUrl: queueUrl,
                                Entries: sublist.map(function (handle) { return ({
                                    Id: (++index).toString(),
                                    ReceiptHandle: handle,
                                }); }),
                            })];
                    case 3:
                        deletesResult = _a.sent();
                        logger.stupid("deleteResult", deletesResult);
                        _a.label = 4;
                    case 4:
                        start += chunkSize;
                        return [3 /*break*/, 1];
                    case 5: return [2 /*return*/, handles];
                }
            });
        }); };
        this.download = function (bucket, key, localPath) { return __awaiter(_this, void 0, void 0, function () {
            var Body;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        logger.debug("Get a stream of item[".concat(key, "] from bucket[").concat(bucket, "]"));
                        return [4 /*yield*/, this.s3.getObject({ Bucket: bucket, Key: key })];
                    case 1:
                        Body = (_a.sent()).Body;
                        return [2 /*return*/, new Promise(function (resolve, reject) {
                                return Body
                                    .on('error', function (error) { return reject(error); })
                                    .pipe(fs.createWriteStream(localPath))
                                    .on('finish', function () { return resolve(localPath); })
                                    .on('error', function (error) { return reject(error); });
                            })];
                }
            });
        }); };
        this.readFile = function (bucket, key) { return __awaiter(_this, void 0, void 0, function () {
            var tempFile, content, error_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        logger.debug("Read item[".concat(key, "] from bucket[").concat(bucket, "]"));
                        tempFile = "".concat(os.tmpdir(), "/").concat((0, non_secure_1.nanoid)());
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, , 4, 9]);
                        return [4 /*yield*/, this.download(bucket, key, tempFile)];
                    case 2:
                        _a.sent();
                        return [4 /*yield*/, fs.promises.readFile(tempFile, {
                                encoding: 'utf-8',
                            })];
                    case 3:
                        content = _a.sent();
                        return [2 /*return*/, content];
                    case 4:
                        if (!fs.existsSync(tempFile)) return [3 /*break*/, 8];
                        _a.label = 5;
                    case 5:
                        _a.trys.push([5, 7, , 8]);
                        return [4 /*yield*/, fs.promises.unlink(tempFile)];
                    case 6:
                        _a.sent();
                        return [3 /*break*/, 8];
                    case 7:
                        error_1 = _a.sent();
                        logger.error("Failed to delete temp file ".concat(tempFile, ": ").concat((0, utils_1.stringifyError)(error_1)));
                        return [3 /*break*/, 8];
                    case 8: return [7 /*endfinally*/];
                    case 9: return [2 /*return*/];
                }
            });
        }); };
        this.readFileBuffer = function (bucket, key) { return __awaiter(_this, void 0, void 0, function () {
            var Body, buffer;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        logger.debug("Read item[".concat(key, "] from bucket[").concat(bucket, "]"));
                        return [4 /*yield*/, this.s3.getObject({ Bucket: bucket, Key: key })];
                    case 1:
                        Body = (_a.sent()).Body;
                        return [4 /*yield*/, (Body === null || Body === void 0 ? void 0 : Body.transformToByteArray())];
                    case 2:
                        buffer = _a.sent();
                        if (!buffer) {
                            throw new Error("Failed to read file ".concat(key, " from bucket ").concat(bucket));
                        }
                        return [2 /*return*/, Buffer.from(buffer)];
                }
            });
        }); };
        this.upload = function (bucket, localPath, key) { return __awaiter(_this, void 0, void 0, function () {
            var upload;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        logger.debug("Upload item[".concat(key, "] into bucket[").concat(bucket, "]"));
                        upload = new lib_storage_1.Upload({
                            client: this.s3,
                            params: {
                                Bucket: bucket,
                                Key: key,
                                Body: fs.createReadStream(localPath),
                            },
                            partSize: 5 * 1024 * 1024, // 5MB
                            queueSize: 4,
                        });
                        return [4 /*yield*/, upload.done()];
                    case 1:
                        _a.sent();
                        return [2 /*return*/, key];
                }
            });
        }); };
        this.uploadFromBuffer = function (bucket, key, buffer) { return __awaiter(_this, void 0, void 0, function () {
            var upload;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        logger.debug("Upload item[".concat(key, "] into bucket[").concat(bucket, "]"));
                        upload = new lib_storage_1.Upload({
                            client: this.s3,
                            params: {
                                Bucket: bucket,
                                Key: key,
                                Body: buffer,
                            },
                            partSize: 5 * 1024 * 1024, // 5MB
                            queueSize: 4,
                        });
                        return [4 /*yield*/, upload.done()];
                    case 1:
                        _a.sent();
                        return [2 /*return*/, key];
                }
            });
        }); };
        this.writeFile = function (bucket, key, content) { return __awaiter(_this, void 0, void 0, function () {
            var tempFile, error_2, msg;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        logger.debug("Write item[".concat(key, "] into bucket[").concat(bucket, "]"));
                        tempFile = "".concat(os.tmpdir(), "/").concat((0, non_secure_1.nanoid)());
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, , 4, 9]);
                        return [4 /*yield*/, fs.promises.writeFile(tempFile, content, 'utf-8')];
                    case 2:
                        _a.sent();
                        return [4 /*yield*/, this.upload(bucket, tempFile, key)];
                    case 3:
                        _a.sent();
                        return [3 /*break*/, 9];
                    case 4:
                        if (!fs.existsSync(tempFile)) {
                            return [2 /*return*/];
                        }
                        _a.label = 5;
                    case 5:
                        _a.trys.push([5, 7, , 8]);
                        return [4 /*yield*/, fs.promises.unlink(tempFile)];
                    case 6:
                        _a.sent();
                        return [3 /*break*/, 8];
                    case 7:
                        error_2 = _a.sent();
                        msg = "Error during writeFile: unlink file ".concat(tempFile, ": ").concat((0, utils_1.stringifyError)(error_2));
                        logger.error(msg);
                        return [3 /*break*/, 8];
                    case 8: return [7 /*endfinally*/];
                    case 9: return [2 /*return*/];
                }
            });
        }); };
        this.getSignedCookie = function (keyPairId, privateKey, url, expires) {
            var policy = JSON.stringify({
                Statement: [
                    {
                        Resource: url,
                        Condition: {
                            DateLessThan: { 'AWS:EpochTime': expires },
                        },
                    },
                ],
            });
            return (0, cloudfront_signer_1.getSignedCookies)({
                keyPairId: keyPairId,
                privateKey: privateKey,
                policy: policy,
            });
        };
        this.getDynamoDbItem = function (tableName, key, defaultValue) { return __awaiter(_this, void 0, void 0, function () {
            var getResult, item;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        logger.debug("Read an item with key[".concat(JSON.stringify(key), "] from ").concat(tableName, "."));
                        return [4 /*yield*/, this.dynamodb.get({
                                TableName: tableName,
                                Key: key,
                            })];
                    case 1:
                        getResult = _a.sent();
                        logger.stupid("getResult", getResult);
                        item = getResult !== undefined && getResult.Item !== undefined
                            ? getResult.Item // Casts forcefully.
                            : defaultValue;
                        logger.stupid("item", item);
                        return [2 /*return*/, item];
                }
            });
        }); };
        this.updateDynamoDbItem = function (tableName, key, columnValues) { return __awaiter(_this, void 0, void 0, function () {
            var expressions, attributeValues, updateResult;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        logger.debug("Update an item with key[".concat(JSON.stringify(key), "] to ").concat(tableName));
                        logger.stupid("keyValues", columnValues);
                        expressions = Object.keys(columnValues)
                            .map(function (column) { return "".concat(column, " = :").concat(column); })
                            .join(', ');
                        attributeValues = Object.keys(columnValues)
                            .map(function (column) { return [":".concat(column), columnValues[column]]; })
                            .reduce(function (obj, pair) {
                            var _a;
                            return (__assign(__assign({}, obj), (_a = {}, _a[pair[0]] = pair[1], _a)));
                        }, {});
                        logger.stupid("expressions", expressions);
                        logger.stupid("attributeValues", attributeValues);
                        return [4 /*yield*/, this.dynamodb.update({
                                TableName: tableName,
                                Key: key,
                                UpdateExpression: "set ".concat(expressions),
                                ExpressionAttributeValues: attributeValues,
                            })];
                    case 1:
                        updateResult = _a.sent();
                        logger.stupid("updateResult", updateResult);
                        return [2 /*return*/, updateResult];
                }
            });
        }); };
        // Setup
        this.setupQueue = function (queueName) { return __awaiter(_this, void 0, void 0, function () {
            var listResult, _i, _a, queueUrl, error_3, createResult;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        _b.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, this.sqs.listQueues({
                                QueueNamePrefix: queueName,
                            })];
                    case 1:
                        listResult = _b.sent();
                        if (listResult.QueueUrls) {
                            for (_i = 0, _a = listResult.QueueUrls; _i < _a.length; _i++) {
                                queueUrl = _a[_i];
                                if (queueUrl.endsWith(queueName)) {
                                    logger.debug("Queue[".concat(queueName, " => ").concat(queueUrl, "] already exists."));
                                    return [2 /*return*/, true];
                                }
                            }
                        }
                        return [3 /*break*/, 3];
                    case 2:
                        error_3 = _b.sent();
                        logger.debug("No Queue[".concat(queueName, "] exists due to ").concat(error_3));
                        return [3 /*break*/, 3];
                    case 3:
                        logger.debug("Create a queue[".concat(queueName, "] newly."));
                        return [4 /*yield*/, this.sqs.createQueue({
                                QueueName: queueName,
                            })];
                    case 4:
                        createResult = _b.sent();
                        logger.stupid("createResult", createResult);
                        return [2 /*return*/, true];
                }
            });
        }); };
        this.setupStorage = function (bucketName, cors) { return __awaiter(_this, void 0, void 0, function () {
            var listResult, error_4, createResult, corsResult;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, this.s3.listBuckets()];
                    case 1:
                        listResult = _a.sent();
                        if (listResult.Buckets &&
                            listResult.Buckets.map(function (each) { return each.Name; }).includes(bucketName)) {
                            logger.debug("Bucket[".concat(bucketName, "] already exists."));
                            return [2 /*return*/, true];
                        }
                        return [3 /*break*/, 3];
                    case 2:
                        error_4 = _a.sent();
                        logger.debug("No bucket[".concat(bucketName, "] exists due to ").concat(error_4));
                        return [3 /*break*/, 3];
                    case 3:
                        logger.debug("Create a bucket[".concat(bucketName, "] newly."));
                        return [4 /*yield*/, this.s3.createBucket({
                                Bucket: bucketName,
                            })];
                    case 4:
                        createResult = _a.sent();
                        logger.stupid("createResult", createResult);
                        if (!cors) return [3 /*break*/, 6];
                        return [4 /*yield*/, this.s3.putBucketCors({
                                Bucket: bucketName,
                                CORSConfiguration: {
                                    CORSRules: [
                                        {
                                            AllowedHeaders: ['*'],
                                            AllowedMethods: cors.methods,
                                            AllowedOrigins: cors.origins,
                                        },
                                    ],
                                },
                            })];
                    case 5:
                        corsResult = _a.sent();
                        logger.stupid("corsResult", corsResult);
                        _a.label = 6;
                    case 6: return [2 /*return*/, true];
                }
            });
        }); };
        this.setupDynamoDb = function (tableName, keyColumn) { return __awaiter(_this, void 0, void 0, function () {
            var listResult, error_5, createResult;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, this.dynamodbAdmin.listTables()];
                    case 1:
                        listResult = _a.sent();
                        if (listResult.TableNames && listResult.TableNames.includes(tableName)) {
                            logger.debug("Table[".concat(tableName, "] already exists."));
                            return [2 /*return*/, true];
                        }
                        return [3 /*break*/, 3];
                    case 2:
                        error_5 = _a.sent();
                        logger.debug("No table[".concat(tableName, "] exists due to ").concat(error_5));
                        return [3 /*break*/, 3];
                    case 3:
                        logger.debug("Create a table[".concat(tableName, "] newly."));
                        return [4 /*yield*/, this.dynamodbAdmin.createTable({
                                TableName: tableName,
                                KeySchema: [{ AttributeName: keyColumn, KeyType: 'HASH' }],
                                AttributeDefinitions: [{ AttributeName: keyColumn, AttributeType: 'S' }],
                                ProvisionedThroughput: {
                                    ReadCapacityUnits: 30,
                                    WriteCapacityUnits: 10,
                                },
                            })];
                    case 4:
                        createResult = _a.sent();
                        logger.stupid("createResult", createResult);
                        return [2 /*return*/, true];
                }
            });
        }); };
        this.config = config || new config_1.SimpleAWSConfig();
        /**
         * The simple cache for { queueName: queueUrl }.
         * It can help in the only case of launching this project as offline.
         * @type { { [queueName: string]: string } }
         */
        this.queueUrls = {};
    }
    Object.defineProperty(SimpleAWS.prototype, "s3", {
        get: function () {
            if (this.lazyS3 === undefined) {
                this.lazyS3 = new client_s3_1.S3(this.config.get(define_1.AWSComponent.s3) || {});
            }
            return this.lazyS3;
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(SimpleAWS.prototype, "sqs", {
        get: function () {
            if (this.lazySqs === undefined) {
                this.lazySqs = new client_sqs_1.SQS(this.config.get(define_1.AWSComponent.sqs) || {});
            }
            return this.lazySqs;
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(SimpleAWS.prototype, "dynamodb", {
        get: function () {
            if (this.lazyDynamodb === undefined) {
                this.lazyDynamodb = lib_dynamodb_1.DynamoDBDocument.from(new client_dynamodb_1.DynamoDBClient(this.config.get(define_1.AWSComponent.dynamodb) || {}), {
                    marshallOptions: {
                        convertEmptyValues: true,
                        removeUndefinedValues: true,
                    },
                });
            }
            return this.lazyDynamodb;
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(SimpleAWS.prototype, "dynamodbAdmin", {
        get: function () {
            if (this.lazyDynamodbAdmin === undefined) {
                this.lazyDynamodbAdmin = new client_dynamodb_1.DynamoDB(this.config.get(define_1.AWSComponent.dynamodb) || {});
            }
            return this.lazyDynamodbAdmin;
        },
        enumerable: false,
        configurable: true
    });
    SimpleAWS.prototype.getSignedUrl = function (options) {
        return __awaiter(this, void 0, void 0, function () {
            var _a, expiresIn, cmd, cmd, cmd, cmd, cmd, cmd, cmd, cmd, cmd, cmd, cmd, cmd;
            return __generator(this, function (_b) {
                _a = options.expiresIn, expiresIn = _a === void 0 ? 600 : _a;
                switch (options.operation) {
                    case 'putObject': {
                        cmd = new client_s3_1.PutObjectCommand(__assign({ Bucket: options.bucket, Key: options.key }, options.params));
                        return [2 /*return*/, (0, s3_request_presigner_1.getSignedUrl)(this.s3, cmd, { expiresIn: expiresIn })];
                    }
                    case 'getObject': {
                        cmd = new client_s3_1.GetObjectCommand(__assign({ Bucket: options.bucket, Key: options.key }, options.params));
                        return [2 /*return*/, (0, s3_request_presigner_1.getSignedUrl)(this.s3, cmd, { expiresIn: expiresIn })];
                    }
                    case 'deleteObject': {
                        cmd = new client_s3_1.DeleteObjectCommand(__assign({ Bucket: options.bucket, Key: options.key }, options.params));
                        return [2 /*return*/, (0, s3_request_presigner_1.getSignedUrl)(this.s3, cmd, { expiresIn: expiresIn })];
                    }
                    case 'headObject': {
                        cmd = new client_s3_1.HeadObjectCommand(__assign({ Bucket: options.bucket, Key: options.key }, options.params));
                        return [2 /*return*/, (0, s3_request_presigner_1.getSignedUrl)(this.s3, cmd, { expiresIn: expiresIn })];
                    }
                    case 'copyObject': {
                        cmd = new client_s3_1.CopyObjectCommand(__assign({ Bucket: options.bucket, Key: options.key }, options.params));
                        return [2 /*return*/, (0, s3_request_presigner_1.getSignedUrl)(this.s3, cmd, { expiresIn: expiresIn })];
                    }
                    case 'uploadPart': {
                        cmd = new client_s3_1.UploadPartCommand(__assign({ Bucket: options.bucket, Key: options.key }, options.params));
                        return [2 /*return*/, (0, s3_request_presigner_1.getSignedUrl)(this.s3, cmd, { expiresIn: expiresIn })];
                    }
                    case 'uploadPartCopy': {
                        cmd = new client_s3_1.UploadPartCopyCommand(__assign({ Bucket: options.bucket, Key: options.key }, options.params));
                        return [2 /*return*/, (0, s3_request_presigner_1.getSignedUrl)(this.s3, cmd, { expiresIn: expiresIn })];
                    }
                    case 'listObjectsV2': {
                        cmd = new client_s3_1.ListObjectsV2Command(__assign({ Bucket: options.bucket }, options.params));
                        return [2 /*return*/, (0, s3_request_presigner_1.getSignedUrl)(this.s3, cmd, { expiresIn: expiresIn })];
                    }
                    case 'createMultipartUpload': {
                        cmd = new client_s3_1.CreateMultipartUploadCommand(__assign({ Bucket: options.bucket, Key: options.key }, options.params));
                        return [2 /*return*/, (0, s3_request_presigner_1.getSignedUrl)(this.s3, cmd, { expiresIn: expiresIn })];
                    }
                    case 'completeMultipartUpload': {
                        cmd = new client_s3_1.CompleteMultipartUploadCommand(__assign({ Bucket: options.bucket, Key: options.key }, options.params));
                        return [2 /*return*/, (0, s3_request_presigner_1.getSignedUrl)(this.s3, cmd, { expiresIn: expiresIn })];
                    }
                    case 'abortMultipartUpload': {
                        cmd = new client_s3_1.AbortMultipartUploadCommand(__assign({ Bucket: options.bucket, Key: options.key }, options.params));
                        return [2 /*return*/, (0, s3_request_presigner_1.getSignedUrl)(this.s3, cmd, { expiresIn: expiresIn })];
                    }
                    case 'listParts': {
                        cmd = new client_s3_1.ListPartsCommand(__assign({ Bucket: options.bucket, Key: options.key }, options.params));
                        return [2 /*return*/, (0, s3_request_presigner_1.getSignedUrl)(this.s3, cmd, { expiresIn: expiresIn })];
                    }
                }
                return [2 /*return*/];
            });
        });
    };
    return SimpleAWS;
}());
exports.SimpleAWS = SimpleAWS;
