export class AwsError extends Error {
  public readonly name: string;
  public readonly service: string;

  constructor(awsError: unknown) {
    const errorObj = awsError as Record<string, any>;
    const message = errorObj?.message ?? 'Unknown AWS Error';
    super(message);

    this.name = errorObj?.name ?? 'UnclassifiedError';
    this.service = errorObj?.$service ?? 'UnknownService';
  }
}
