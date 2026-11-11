import { type z, type ZodSchema, ZodError } from 'zod';
import { getLogger } from '../utils/logger';

const logger = getLogger(__filename);

/** What a validation saw, for plugins such as the tracer. Never holds input values. */
export interface ValidationObservation {
  mode: 'logOnly' | 'enforce';
  target: string;
  issues: string[];
  unknownKeys: string[];
}

export type InvalidResponder<R, S = unknown> = (
  error: ZodError<S>,
) => R | void | Promise<R | void>;

export type ValidationOutcome<S> =
  | { kind: 'pass' }
  | { kind: 'valid'; data: S }
  | { kind: 'invalid'; error: ZodError<S> };

interface ValidationIssue {
  path: PropertyKey[];
  message: string;
  errors?: ValidationIssue[][];
}

// Caps how much one request can write into logs and the tracer.
const MAX_ENTRIES = 20;
const MAX_KEY_LENGTH = 64;
const MAX_MESSAGE_LENGTH = 128;

const clip = (text: string, max: number) =>
  text.length > max ? `${text.slice(0, max)}…` : text;

// Array indexes become [] so all elements of a list share one entry.
const joinPath = (path: string, key: PropertyKey) =>
  typeof key === 'number'
    ? `${path}[]`
    : path
      ? `${path}.${String(key)}`
      : String(key);

const describeIssues = (
  issues: ValidationIssue[],
  prefix: PropertyKey[] = [],
): string[] =>
  issues.flatMap(({ path, message, errors }) =>
    errors?.length
      ? describeIssues(errors.flat(), [...prefix, ...path])
      : [
          `${clip([...prefix, ...path].reduce<string>(joinPath, '') || '(root)', MAX_KEY_LENGTH)}: ${clip(message, MAX_MESSAGE_LENGTH)}`,
        ],
  );

const capped = (entries: string[]) => {
  const unique = [...new Set(entries)];
  return unique.length > MAX_ENTRIES
    ? [
        ...unique.slice(0, MAX_ENTRIES),
        `(+${unique.length - MAX_ENTRIES} more)`,
      ]
    : unique;
};

/** Logs a logOnly validation failure as field paths and zod messages (which may name unknown keys), never input values. */
export const warnInvalidPayload = (
  name: string,
  error: { issues: ValidationIssue[] },
) =>
  logger.warn(
    `Validation failed (logOnly) ${name}: ${capped(describeIssues(error.issues)).join('; ')}`,
  );

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

// Paths present in the input but stripped by the schema.
const droppedKeys = (raw: unknown, parsed: unknown, path = ''): string[] => {
  if (raw === parsed) {
    return [];
  }
  if (Array.isArray(raw) && Array.isArray(parsed)) {
    return raw.flatMap((each, i) =>
      droppedKeys(each, parsed[i], joinPath(path, i)),
    );
  }
  if (!isRecord(raw) || !isRecord(parsed)) {
    return [];
  }
  return Object.keys(raw).flatMap((key) => {
    const at = joinPath(path, key);
    return Object.prototype.hasOwnProperty.call(parsed, key)
      ? droppedKeys(raw[key], parsed[key], at)
      : [clip(at, MAX_KEY_LENGTH)];
  });
};

/**
 * Validates `read()` against `schema`. logOnly only logs and always passes;
 * enforce returns the parsed value or the error. Unknown keys are logged in
 * both but observed only in logOnly.
 */
export const validate = <S>(
  schema: ZodSchema<S>,
  read: () => unknown,
  options: { logOnly: boolean; key: string; target: string; source: string },
): { outcome: ValidationOutcome<S>; observation?: ValidationObservation } => {
  const { logOnly, key, target, source } = options;
  const label = logOnly ? ' (logOnly)' : '';
  const observe = (issues: string[], unknownKeys: string[] = []) =>
    issues.length > 0 || unknownKeys.length > 0
      ? {
          mode: logOnly ? ('logOnly' as const) : ('enforce' as const),
          target,
          issues: capped(issues),
          unknownKeys: capped(unknownKeys),
        }
      : undefined;
  const reportUnknown = (input: unknown, data: unknown) => {
    const unknownKeys = droppedKeys(input, data);
    if (unknownKeys.length > 0) {
      logger.warn(
        `Unknown keys${label} ${source}: ${capped(unknownKeys).join(', ')}`,
      );
    }
    return unknownKeys;
  };

  let raw: unknown;
  try {
    raw = read();
  } catch {
    const message = `${key} could not be parsed`;
    (logOnly ? logger.warn : logger.error)(
      `Validation failed${label} ${source}: ${message}`,
    );
    return {
      outcome: logOnly
        ? { kind: 'pass' }
        : {
            kind: 'invalid',
            error: new ZodError([
              { code: 'custom', path: [], message, input: undefined },
            ]) as ZodError<S>,
          },
      observation: observe([`${key}: could not be parsed`]),
    };
  }

  if (!logOnly) {
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      const issues = describeIssues(parsed.error.issues);
      logger.error(`Validation failed ${source}: ${capped(issues).join('; ')}`);
      return {
        outcome: { kind: 'invalid', error: parsed.error },
        observation: observe(issues),
      };
    }
    reportUnknown(raw, parsed.data);
    return { outcome: { kind: 'valid', data: parsed.data } };
  }

  try {
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      warnInvalidPayload(source, parsed.error);
      return {
        outcome: { kind: 'pass' },
        observation: observe(describeIssues(parsed.error.issues)),
      };
    }
    return {
      outcome: { kind: 'pass' },
      observation: observe([], reportUnknown(raw, parsed.data)),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(
      `Validation threw (logOnly) ${source}: ${clip(message, MAX_MESSAGE_LENGTH)}`,
    );
    return {
      outcome: { kind: 'pass' },
      observation: observe(['(root): validation threw']),
    };
  }
};

export const parseLogOnly = <Z extends ZodSchema>(
  name: string,
  schema: Z,
  value: unknown,
): z.input<Z> => {
  validate(schema, () => value, {
    logOnly: true,
    key: 'value',
    target: name,
    source: name,
  });
  return value as z.input<Z>;
};

/** The first responder that returns a response wins; undefined means use the default. */
export const respondInvalid = async <R, S>(
  error: ZodError<S>,
  responders: Array<InvalidResponder<R, S> | undefined>,
): Promise<R | undefined> => {
  for (const responder of responders) {
    const result = responder ? await responder(error) : undefined;
    if (result) {
      return result;
    }
  }
  return undefined;
};
