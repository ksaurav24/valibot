import type {
  ArrayPathItem,
  BaseSchema,
  ErrorMessage,
  ObjectPathItem,
  OutputDataset,
} from '../../types/index.ts';
import {
  _addIssue,
  _getStandardProps,
  _isValidObjectKey,
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
 * Creates a JSON value schema.
 *
 * Hint: This schema matches any value that can be serialized and
 * deserialized with `JSON.stringify` and `JSON.parse` without loss, i.e.
 * strings, numbers, booleans, `null`, and objects or arrays that
 * recursively contain only these types.
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
  return {
    kind: 'schema',
    type: 'jsonValue',
    reference: jsonValue,
    expects: '(string | number | boolean | null | Object | Array)',
    async: false,
    message,
    get '~standard'() {
      return _getStandardProps(this);
    },
    '~run'(dataset, config) {
      // Get input value from dataset
      const input = dataset.value;

      // If input is a primitive JSON value, it is valid as is
      if (
        typeof input === 'string' ||
        typeof input === 'number' ||
        typeof input === 'boolean' ||
        input === null
      ) {
        // @ts-expect-error
        dataset.typed = true;

        // If input is an array, check each item recursively
      } else if (Array.isArray(input)) {
        // Set typed to `true` and value to empty array
        // @ts-expect-error
        dataset.typed = true;
        dataset.value = [];

        // Parse each array item by recursing into this same schema
        for (let key = 0; key < input.length; key++) {
          const value: unknown = input[key];
          const itemDataset = this['~run']({ value }, config);

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

        // If input is a plain object, check each entry recursively
      } else if (typeof input === 'object') {
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
            const entryDataset = this['~run']({ value }, config);

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

        // Otherwise, add JSON value issue
      } else {
        _addIssue(this, 'type', dataset, config);
      }

      // Return output dataset
      // @ts-expect-error
      return dataset as OutputDataset<JsonValue, JsonValueIssue>;
    },
  };
}
