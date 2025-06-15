import { AwsError } from '../internal/AwsError';

export const stringifyError = (
  err: any,
  replacer?: (key: string, value: any) => any,
  space?: string | number,
) => {
  const error = isAWSv3Error(err) ? new AwsError(err) : err;
  const plainObject = {} as any;
  Object.getOwnPropertyNames(error).forEach((key) => {
    plainObject[key] = error[key];
  });
  return JSON.stringify(plainObject, replacer, space);
};

const isAWSv3Error = (
  error: unknown,
): error is Error & { $metadata?: object } => {
  return error instanceof Error && 'name' in error && '$metadata' in error;
};
