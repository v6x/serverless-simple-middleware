/**
 * @typedef { {version: string, region: string, ...} } Config
 * @typedef { {[service: string]: Config} } ServiceConfigs
 * @typedef { (string) => Config } ConfigResolver
 */

/**
 * @type {ServiceConfigs}
 */
const config = {
  s3: {
    version: '2006-03-01',
    region: 'ap-northeast-2',
  },
  sqs: {
    version: '2012-11-05',
    region: 'ap-northeast-2',
  },
  dynamodb: {
    version: '2012-11-05',
    region: 'ap-northeast-2',
  },
};

/**
 * @type {ServiceConfigs}
 */
let overrideConfig = null;

/**
 * @type {ConfigResolver}
 */
let overridedResolver = null;

/**
 * @param { 's3' | 'sqs' | 'dynamodb' } service
 * @returns { Config }
 */
const get = service => {
  if (overridedResolver) {
    return overridedResolver(service);
  }
  return (overrideConfig || config)[service];
};

/**
 * @param {ConfigResolver} newResolver
 */
const resolver = newResolver => {
  overridedResolver = newResolver;
};

/**
 * @param {ServiceConfigs} newConfig
 */
const configure = newConfig => {
  overrideConfig = newConfig;
};

module.exports = {
  get,
  resolver,
  configure,
};
