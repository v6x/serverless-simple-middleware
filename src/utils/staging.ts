import { $enum } from 'ts-enum-util';

export enum StagingLevel {
  Test = 'test',
  Local = 'local',
  Alpha = 'alpha',
  Beta = 'beta',
  RC = 'rc',
  Release = 'release',
}

export const currentStage: StagingLevel = $enum(StagingLevel).asValueOrDefault(
  process.env.STAGE,
  StagingLevel.Local,
);

export const isInhouse = () => {
  switch (currentStage) {
    case StagingLevel.Test:
    case StagingLevel.Local:
    case StagingLevel.Alpha:
      return true;
    case StagingLevel.Beta:
    case StagingLevel.RC:
    case StagingLevel.Release:
      return false;
    default:
      throw new Error(`Undefined stage: ${currentStage}`);
  }
};

export const isProduction = () => {
  switch (currentStage) {
    case StagingLevel.Test:
    case StagingLevel.Local:
    case StagingLevel.Alpha:
      return false;
    case StagingLevel.Beta:
    case StagingLevel.RC:
    case StagingLevel.Release:
      return true;
    default:
      throw new Error(`Undefined stage: ${currentStage}`);
  }
};

export const isDebuggable = () => {
  switch (currentStage) {
    case StagingLevel.Test:
    case StagingLevel.Local:
    case StagingLevel.Alpha:
    case StagingLevel.Beta:
      return true;
    case StagingLevel.RC:
    case StagingLevel.Release:
      return false;
    default:
      throw new Error(`Undefined stage: ${currentStage}`);
  }
};
