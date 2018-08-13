import {
  awsConfig,
  loadAWSConfig,
  SimpleAWS,
  SimpleAWSConfig,
  SimpleAWSConfigLoadParam,
} from '../aws';
import { getLogger } from '../utils';
import { HandlerAuxBase, HandlerPluginBase } from './base';

const logger = getLogger(__filename);

export type InitializerMapper = (
  aws: SimpleAWS,
  env: {},
) => { [name: string]: () => Promise<boolean> };

const initialize = async (aws: SimpleAWS, mapper: InitializerMapper) => {
  const env = process.env;
  const mapping = mapper(aws, env);
  const successes = await Promise.all(
    Object.keys(mapping).map(name => mapping[name]()),
  );
  return Object.keys(mapping).reduce(
    (result, name, index) => ({ ...result, [name]: successes[index] }),
    {},
  );
};

let defaultAws: SimpleAWS | undefined;

export interface AWSHandlerPluginOptions {
  config?: SimpleAWSConfigLoadParam;
  mapper?: InitializerMapper;
}

export interface AWSHandlerPluginRequestAux extends HandlerAuxBase {
  aws: SimpleAWS;
  awsConfig: SimpleAWSConfig;
}

export class AWSHandlerPlugin extends HandlerPluginBase<
  AWSHandlerPluginRequestAux
> {
  private options?: AWSHandlerPluginOptions;

  constructor(options?: AWSHandlerPluginOptions) {
    super();
    this.options = options;
  }

  public create = async () => {
    // Setup only once.
    if (!defaultAws) {
      const { config, mapper } = this.options || {
        config: undefined,
        mapper: undefined,
      };

      if (config) {
        logger.debug(`Load aws config from ${config}`);
        await loadAWSConfig(config, awsConfig);
      }

      defaultAws = new SimpleAWS();

      if (mapper) {
        logger.debug(`Initialize aws components with mapper.`);
        await initialize(defaultAws, mapper);
      }
    }
    return {
      aws: defaultAws,
      awsConfig,
    };
  };
}

const build = (options?: AWSHandlerPluginOptions) =>
  new AWSHandlerPlugin(options);
export default build;
