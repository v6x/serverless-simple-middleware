import fetch from 'cross-fetch';
import * as fs from 'fs';

import { AWSComponent } from './define';

export interface AWSConfig {
  version: string;
  region: string;
  [key: string]: string;
}

export interface AWSConfigs {
  [service: string]: AWSConfig;
}

export type AWSConfigResolver = (service: string) => AWSConfig;

const defaultConfigs: AWSConfigs = {
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

export type SimpleAWSConfigLoadParam = AWSConfigs | string;

export class SimpleAWSConfig {
  private configs: AWSConfigs;

  public constructor(configs: AWSConfigs = defaultConfigs) {
    this.configs = configs;
  }

  public get = (service: AWSComponent): AWSConfig => {
    return this.configs[service];
  };

  public update = (configs: AWSConfigs) => {
    this.configs = configs;
  };
}

export const awsConfig = new SimpleAWSConfig();

export const loadAWSConfig = (
  newConfigsOrUrl: SimpleAWSConfigLoadParam,
  target?: SimpleAWSConfig,
): Promise<SimpleAWSConfig> => {
  if (typeof newConfigsOrUrl === 'string') {
    if (/^http.*json$/.test(newConfigsOrUrl)) {
      return fetch(newConfigsOrUrl)
        .then(r => r.json())
        .then(loadAWSConfig);
    } else if (/json$/.test(newConfigsOrUrl)) {
      return loadAWSConfig(
        JSON.parse(fs.readFileSync(newConfigsOrUrl, 'utf-8')),
      );
    }
    return loadAWSConfig(JSON.parse(newConfigsOrUrl));
  }
  if (!target) {
    return Promise.resolve(new SimpleAWSConfig(newConfigsOrUrl));
  }
  target.update(newConfigsOrUrl);
  return Promise.resolve(target);
};
