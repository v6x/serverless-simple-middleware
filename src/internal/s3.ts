import {
  DeleteObjectCommandInput,
  GetObjectCommandInput,
  PutObjectCommandInput,
  HeadObjectCommandInput,
  CopyObjectCommandInput,
  UploadPartCommandInput,
  UploadPartCopyCommandInput,
} from '@aws-sdk/client-s3/dist-types/commands';

export type S3Operation =
  | 'putObject'
  | 'getObject'
  | 'deleteObject'
  | 'headObject'
  | 'copyObject'
  | 'uploadPart'
  | 'uploadPartCopy';

export type CommandInputMap = {
  putObject: PutObjectCommandInput;
  getObject: GetObjectCommandInput;
  deleteObject: DeleteObjectCommandInput;
  headObject: HeadObjectCommandInput;
  copyObject: CopyObjectCommandInput;
  uploadPart: UploadPartCommandInput;
  uploadPartCopy: UploadPartCopyCommandInput;
};

type OpsWithRequiredParams = 'copyObject' | 'uploadPart' | 'uploadPartCopy';
type OpsWithOptionalParams = Exclude<S3Operation, OpsWithRequiredParams>;

export type PresignerOptions =
  | {
      [K in OpsWithOptionalParams]: {
        operation: K;
        bucket: string;
        key: string;
        params?: Omit<CommandInputMap[K], 'Bucket' | 'Key'>;
        expiresIn?: number;
      };
    }[OpsWithOptionalParams]
  | {
      [K in OpsWithRequiredParams]: {
        operation: K;
        bucket: string;
        key: string;
        params: Omit<CommandInputMap[K], 'Bucket' | 'Key'>;
        expiresIn?: number;
      };
    }[OpsWithRequiredParams];
