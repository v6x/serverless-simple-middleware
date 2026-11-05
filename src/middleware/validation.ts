import type { ZodError, ZodSchema } from 'zod';
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

const describeIssues = (
  issues: ValidationIssue[],
  prefix: PropertyKey[] = [],
): string[] =>
  issues.flatMap(({ path, message, errors }) =>
    errors?.length
      ? describeIssues(errors.flat(), [...prefix, ...path])
      : [`${[...prefix, ...path].join('.') || '(root)'}: ${message}`],
  );

/** Logs a logOnly validation failure as field paths and zod messages (which may name unknown keys), never input values. */
export const warnInvalidPayload = (
  name: string,
  error: { issues: ValidationIssue[] },
) =>
  logger.warn(
    `Validation failed (logOnly) ${name}: ${describeIssues(error.issues).join('; ')}`,
  );

export const parseLogOnly = <S>(
  name: string,
  schema: ZodSchema<S>,
  value: unknown,
): S => {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    warnInvalidPayload(name, parsed.error);
  }
  return value as S;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

// Paths present in the input but stripped by the schema; array indexes become [].
const droppedKeys = (raw: unknown, parsed: unknown, path = ''): string[] => {
  if (Array.isArray(raw) && Array.isArray(parsed)) {
    return raw.flatMap((each, i) => droppedKeys(each, parsed[i], `${path}[]`));
  }
  if (!isRecord(raw) || !isRecord(parsed)) {
    return [];
  }
  return Object.keys(raw).flatMap((key) => {
    const at = path ? `${path}.${key}` : key;
    return Object.prototype.hasOwnProperty.call(parsed, key)
      ? droppedKeys(raw[key], parsed[key], at)
      : [at];
  });
};

const capped = (entries: string[]) => {
  const unique = [...new Set(entries)].map((each) =>
    each.length > MAX_KEY_LENGTH ? `${each.slice(0, MAX_KEY_LENGTH)}…` : each,
  );
  return unique.length > MAX_ENTRIES
    ? [
        ...unique.slice(0, MAX_ENTRIES),
        `(+${unique.length - MAX_ENTRIES} more)`,
      ]
    : unique;
};

/**
 * Validates `read()` against `schema`. logOnly only logs and always passes;
 * enforce returns the parsed value or the error. Unknown keys are logged in both.
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
    return observe([], unknownKeys);
  };

  if (!logOnly) {
    const input = read();
    const parsed = schema.safeParse(input);
    if (!parsed.success) {
      const issues = describeIssues(parsed.error.issues);
      logger.error(`Validation failed ${source}: ${issues.join('; ')}`);
      return {
        outcome: { kind: 'invalid', error: parsed.error },
        observation: observe(issues),
      };
    }
    return {
      outcome: { kind: 'valid', data: parsed.data },
      observation: reportUnknown(input, parsed.data),
    };
  }

  let value: unknown;
  try {
    value = read();
  } catch {
    logger.warn(
      `Validation failed (logOnly) ${source}: ${key} could not be parsed`,
    );
    return {
      outcome: { kind: 'pass' },
      observation: observe([`${key}: could not be parsed`]),
    };
  }
  try {
    const parsed = schema.safeParse(value);
    if (!parsed.success) {
      warnInvalidPayload(source, parsed.error);
      return {
        outcome: { kind: 'pass' },
        observation: observe(describeIssues(parsed.error.issues)),
      };
    }
    return {
      outcome: { kind: 'pass' },
      observation: reportUnknown(value, parsed.data),
    };
  } catch (error) {
    logger.warn(
      `Validation threw (logOnly) ${source}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return {
      outcome: { kind: 'pass' },
      observation: observe(['(root): validation threw']),
    };
  }
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
