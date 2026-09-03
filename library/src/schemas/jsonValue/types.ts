import type { BaseIssue } from '../../types/index.ts';

/**
 * JSON value type.
 *
 * Represents any value that can be serialized and deserialized with
 * `JSON.stringify` and `JSON.parse` without loss.
 */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | { [key: string]: JsonValue }
  | JsonValue[];

/**
 * JSON value issue interface.
 */
export interface JsonValueIssue extends BaseIssue<unknown> {
  /**
   * The issue kind.
   */
  readonly kind: 'schema';
  /**
   * The issue type.
   */
  readonly type: 'jsonValue';
  /**
   * The expected property.
   */
  readonly expected: '(string | number | boolean | null | Object | Array)';
}
