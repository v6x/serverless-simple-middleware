import { basename } from 'path';
import { stringifyError } from './misc';

export enum LogLevel {
  error = 'error',
  warn = 'warn',
  info = 'info',
  debug = 'debug',
  verbose = 'verbose',
  silly = 'silly',
  stupid = 'stupid',
}

const severity = (level: LogLevel) => {
  switch (level) {
    case LogLevel.error:
      return 100;
    case LogLevel.warn:
      return 200;
    case LogLevel.info:
      return 300;
    case LogLevel.debug:
      return 400;
    case LogLevel.verbose:
      return 500;
    case LogLevel.silly:
      return 600;
    case LogLevel.stupid:
      return 700;
    default:
      return 1000;
  }
};

const currentLevel = (): LogLevel => {
  if (!process.env.LOG_LEVEL) {
    return process.env.STAGE === 'prod' ? LogLevel.debug : LogLevel.verbose;
  }
  for (const [key, value] of Object.entries(LogLevel)) {
    if (key === process.env.LOG_LEVEL) {
      return value;
    }
  }
  return LogLevel.info;
};

type LogMessage = string | Error;

export class Logger {
  private name: string;

  constructor(name: string) {
    this.name = name;
  }

  public log = (level: LogLevel, message: LogMessage) => {
    if (severity(currentLevel()) >= severity(level)) {
      console.log(
        `[${new Date().toISOString()}][${level.toUpperCase()}][${this.name}] ${
          message instanceof Error ? stringifyError(message) : message
        }`,
      );
    }
    return message;
  };

  public error = (message: LogMessage) => this.log(LogLevel.error, message);
  public warn = (message: LogMessage) => this.log(LogLevel.warn, message);
  public info = (message: LogMessage) => this.log(LogLevel.info, message);
  public debug = (message: LogMessage) => this.log(LogLevel.debug, message);
  public verbose = (message: LogMessage) => this.log(LogLevel.verbose, message);
  public silly = (message: LogMessage) => this.log(LogLevel.silly, message);

  public stupid = <T>(
    message: string,
    object: T,
    replacer?: (key: string, value: T) => T,
  ) => {
    this.log(
      LogLevel.stupid,
      `${message}: ${JSON.stringify(object, replacer)}`,
    );
    return object;
  };
}

const loggers: { [name: string]: Logger } = {};

export const getLogger = (fileName: string): Logger => {
  const name = basename(fileName);
  if (loggers[name] === undefined) {
    loggers[name] = new Logger(name);
  }
  return loggers[name];
};
