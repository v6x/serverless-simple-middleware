import build from './build';

import aws from './aws';
import trace from './trace';

export const middleware = {
  build,
  aws,
  trace,
};

export * from './base';
export * from './aws';
export * from './trace';
