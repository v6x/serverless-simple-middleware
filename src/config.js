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
 * @typedef { {version: string, region: string, ...} } Config
 * @typedef { (string) => Config } ConfigResolver

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
  return config[service];
};

/**
 * @param {ConfigResolver} resolver
 */
const inject = resolver => {
  overridedResolver = resolver;
};

module.exports = {
  get: get,
  inject: inject,
};
