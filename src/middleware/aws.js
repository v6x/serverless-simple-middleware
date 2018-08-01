const { aws, config } = require('../aws');
const { HandlerPluginBase } = require('./base');

class AwsHandlerPlugin extends HandlerPluginBase {
  begin(request) {
    request.aux.aws = aws;
    request.aux.awsConfig = config;
  }
}

module.exports = () => new AwsHandlerPlugin();
