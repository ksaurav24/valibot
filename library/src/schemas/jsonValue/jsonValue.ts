import type {
  ArrayPathItem,
  BaseSchema,
  Config,
  ErrorMessage,
  ObjectPathItem,
  OutputDataset,
  UnknownDataset,
} from '../../types/index.ts';
import {
  _addIssue,
  _isValidObjectKey,
  _standardSchema,
} from '../../utils/index.ts';
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

      // Set typed to `true` and value to empty array
      // @ts-expect-error
      dataset.typed = true;
      dataset.value = [];

      // Parse each array item by recursing into this same schema
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

        // Add item to dataset
        // @ts-expect-error
        dataset.value.push(itemDataset.value);
      }

      // Input is no longer on the active recursion path
      visiting.delete(input);

      // Otherwise, input is an object, so check each entry recursively
    } else {
      // Track input as being visited for the duration of this recursion
      visiting.add(input);

      // Set typed to `true` and value to empty object
      // @ts-expect-error
      dataset.typed = true;
      dataset.value = {};

      // Parse each object entry by recursing into this same schema
      // Hint: for...in loop always returns keys as strings
      // Hint: We exclude specific keys for security reasons
      for (const key in input) {
        if (_isValidObjectKey(input, key)) {
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

          // Add entry to dataset
          // @ts-expect-error
          dataset.value[key] = entryDataset.value;
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
 * objects or arrays that recursively contain only these types. Values with
 * custom `toJSON` behavior (for example `Date`) are not specially handled;
 * their own enumerable properties are used instead, the same way the
 * `record` schema treats them (unlike `object`, which reads off the keys
 * declared in its entries rather than the input's own keys), and
 * `__proto__`, `prototype`, and `constructor` keys are always excluded from
 * objects for security reasons. An object or array that references itself,
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
