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

const config: AWSConfigs = {
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
  private overrideConfigs: AWSConfigs | undefined;

  public get = (service: AWSComponent): AWSConfig => {
    return (this.overrideConfigs || config)[service];
  };

  public load = (
    newConfigsOrUrl: SimpleAWSConfigLoadParam,
  ): Promise<AWSConfigs> => {
    if (typeof newConfigsOrUrl === 'string') {
      if (/^http.*json$/.test(newConfigsOrUrl)) {
        return fetch(newConfigsOrUrl)
          .then((r: any) => r.json())
          .then(this.load);
      } else if (/json$/.test(newConfigsOrUrl)) {
        return this.load(JSON.parse(fs.readFileSync(newConfigsOrUrl, 'utf-8')));
      }
      return this.load(JSON.parse(newConfigsOrUrl));
    }
    this.overrideConfigs = newConfigsOrUrl;
    return Promise.resolve(newConfigsOrUrl);
  };
}

export const awsConfig = new SimpleAWSConfig();
