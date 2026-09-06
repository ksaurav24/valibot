import type {
  ArrayPathItem,
  BaseSchema,
  Config,
  ErrorMessage,
  ObjectPathItem,
  OutputDataset,
  UnknownDataset,
} from '../../types/index.ts';
import { _addIssue, _standardSchema } from '../../utils/index.ts';
import type { JsonValue, JsonValueIssue } from './types.ts';

/**
 * JSON value schema interface.
 */
export interface JsonValueSchema<
  TMessage extends ErrorMessage<JsonValueIssue> | undefined,
> extends BaseSchema<JsonValue, JsonValue, JsonValueIssue> {
  /**
   * The schema type.
   */
  readonly type: 'jsonValue';
  /**
   * The schema reference.
   */
  readonly reference: typeof jsonValue;
  /**
   * The expected property.
   */
  readonly expects: '(string | number | boolean | null | Object | Array)';
  /**
   * The error message.
   */
  readonly message: TMessage;
}

/**
 * Runs the JSON value schema against a dataset, recursing into nested
 * arrays and objects.
 *
 * Hint: This function only validates; it never creates a new array or
 * object or writes to `dataset.value`. On success (and even on failure),
 * `dataset.value` stays exactly the reference it started as, so no key is
 * ever excluded and no data is changed. Arrays are walked by index from `0`
 * up to `length - 1` (stopping early if `config.abortEarly` is `true` and
 * an item is invalid), so an inherited or sparse index is read just like
 * any other index. Objects are only walked for their own enumerable
 * properties, so `__proto__`, `prototype`, and `constructor` are validated
 * like any other key when they occur as an own property.
 *
 * Hint: `visiting` tracks the arrays and objects currently on the active
 * recursion path (not every value seen), so a value that occurs more than
 * once in sibling branches is still valid. Only a value that references one
 * of its own ancestors forms a cycle and is rejected.
 *
 * @param schema The JSON value schema.
 * @param dataset The input dataset.
 * @param config The configuration.
 * @param visiting The arrays and objects on the active recursion path.
 *
 * @returns The output dataset.
 */
function _runJsonValue(
  schema: JsonValueSchema<ErrorMessage<JsonValueIssue> | undefined>,
  dataset: UnknownDataset,
  config: Config<JsonValueIssue>,
  visiting: WeakSet<object>
): OutputDataset<JsonValue, JsonValueIssue> {
  // Get input value from dataset
  const input = dataset.value;

  // If input is a primitive JSON value, it is valid as is
  if (
    typeof input === 'string' ||
    (typeof input === 'number' && Number.isFinite(input)) ||
    typeof input === 'boolean' ||
    input === null
  ) {
    // @ts-expect-error
    dataset.typed = true;

    // If input is an array or object, check it for circular references
    // and then check each item or entry recursively
  } else if (typeof input === 'object') {
    // If input references one of its own ancestors, add JSON value issue
    if (visiting.has(input)) {
      _addIssue(schema, 'type', dataset, config);

      // If input is an array, check each item recursively
    } else if (Array.isArray(input)) {
      // Track input as being visited for the duration of this recursion
      visiting.add(input);

      // @ts-expect-error
      dataset.typed = true;

      // Check each array item recursively by reusing this same schema
      // Hint: `dataset.value` is left untouched, so the input array itself
      // is returned as is, unmodified
      for (let key = 0; key < input.length; key++) {
        const value: unknown = input[key];
        const itemDataset = _runJsonValue(schema, { value }, config, visiting);

        // If there are issues, capture them
        if (itemDataset.issues) {
          // Create array path item
          const pathItem: ArrayPathItem = {
            type: 'array',
            origin: 'value',
            input,
            key,
            value,
          };

          // Add modified item dataset issues to issues
          for (const issue of itemDataset.issues) {
            if (issue.path) {
              issue.path.unshift(pathItem);
            } else {
              // @ts-expect-error
              issue.path = [pathItem];
            }
            // @ts-expect-error
            dataset.issues?.push(issue);
          }
          if (!dataset.issues) {
            // @ts-expect-error
            dataset.issues = itemDataset.issues;
          }

          // If necessary, abort early
          if (config.abortEarly) {
            dataset.typed = false;
            break;
          }
        }

        // If not typed, set typed to `false`
        if (!itemDataset.typed) {
          dataset.typed = false;
        }
      }

      // Input is no longer on the active recursion path
      visiting.delete(input);

      // If input is not a plain object, add JSON value issue
      // Hint: Unlike `record`, this schema never copies the input into a
      // new plain object. If an instance of another class (for example
      // `Date` or `Map`) were accepted here, it would be returned as is
      // and typed as `JsonValue`, even though it is not actually a plain
      // JSON-shaped value.
    } else if (
      Object.getPrototypeOf(input) !== Object.prototype &&
      Object.getPrototypeOf(input) !== null
    ) {
      _addIssue(schema, 'type', dataset, config);

      // Otherwise, input is a plain object, so check each entry recursively
    } else {
      // Track input as being visited for the duration of this recursion
      visiting.add(input);

      // @ts-expect-error
      dataset.typed = true;

      // Check each object entry recursively by reusing this same schema
      // Hint: for...in loop always returns keys as strings
      // Hint: We only check the input's own enumerable properties, the
      // same way `JSON.stringify` ignores inherited ones
      // Hint: `dataset.value` is left untouched, so the input object itself
      // is returned as is, unmodified, and no key (including `__proto__`,
      // `prototype`, and `constructor`) is ever excluded
      for (const key in input) {
        if (Object.prototype.hasOwnProperty.call(input, key)) {
          const value: unknown = input[key as keyof typeof input];
          const entryDataset = _runJsonValue(
            schema,
            { value },
            config,
            visiting
          );

          // If there are issues, capture them
          if (entryDataset.issues) {
            // Create object path item
            const pathItem: ObjectPathItem = {
              type: 'object',
              origin: 'value',
              input: input as Record<string, unknown>,
              key,
              value,
            };

            // Add modified entry dataset issues to issues
            for (const issue of entryDataset.issues) {
              if (issue.path) {
                issue.path.unshift(pathItem);
              } else {
                // @ts-expect-error
                issue.path = [pathItem];
              }
              // @ts-expect-error
              dataset.issues?.push(issue);
            }
            if (!dataset.issues) {
              // @ts-expect-error
              dataset.issues = entryDataset.issues;
            }

            // If necessary, abort early
            if (config.abortEarly) {
              dataset.typed = false;
              break;
            }
          }

          // If not typed, set typed to `false`
          if (!entryDataset.typed) {
            dataset.typed = false;
          }
        }
      }

      // Input is no longer on the active recursion path
      visiting.delete(input);
    }

    // Otherwise, add JSON value issue
  } else {
    _addIssue(schema, 'type', dataset, config);
  }

  // Return output dataset
  // @ts-expect-error
  return dataset as OutputDataset<JsonValue, JsonValueIssue>;
}

/**
 * Creates a JSON value schema.
 *
 * Hint: This schema matches strings, finite numbers, booleans, `null`, and
 * plain objects or arrays that recursively contain only these types. It is
 * validation-only: on success, the input is returned unchanged rather than
 * copied into a new array or object, so `__proto__`, `prototype`, and
 * `constructor` are treated like any other key when they occur as an
 * object's own property, and no data is silently dropped or altered.
 * Because the input is not copied, mutating the returned value also
 * mutates the original input value. An object is only accepted if its
 * prototype is `Object.prototype` or `null`; instances of other classes
 * (for example `Date`, `Map`, or a custom class), including ones with no
 * own enumerable properties, are rejected with an issue, since the input
 * is never copied and so could otherwise be returned as a live instance
 * typed as `JsonValue`. An object or array that references itself,
 * directly or through a nested value, is rejected with an issue instead of
 * being followed. Also note that very deeply nested input can exceed the
 * call stack, so untrusted input should have its depth bounded before
 * parsing.
 *
 * @returns A JSON value schema.
 */
export function jsonValue(): JsonValueSchema<undefined>;

/**
 * Creates a JSON value schema.
 *
 * @param message The error message.
 *
 * @returns A JSON value schema.
 */
export function jsonValue<
  const TMessage extends ErrorMessage<JsonValueIssue> | undefined,
>(message: TMessage): JsonValueSchema<TMessage>;

// @__NO_SIDE_EFFECTS__
export function jsonValue(
  message?: ErrorMessage<JsonValueIssue>
): JsonValueSchema<ErrorMessage<JsonValueIssue> | undefined> {
  return _standardSchema({
    kind: 'schema',
    type: 'jsonValue',
    reference: jsonValue,
    expects: '(string | number | boolean | null | Object | Array)',
    async: false,
    message,
    '~run'(dataset, config) {
      return _runJsonValue(this, dataset, config, new WeakSet());
    },
  });
}
