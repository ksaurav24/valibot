import { describe, expect, test } from 'vitest';
import type { FailureDataset, InferIssue } from '../../types/index.ts';
import { expectNoSchemaIssue, expectSchemaIssue } from '../../vitest/index.ts';
import { jsonValue, type JsonValueSchema } from './jsonValue.ts';
import type { JsonValueIssue } from './types.ts';

describe('jsonValue', () => {
  describe('should return schema object', () => {
    const baseSchema: Omit<JsonValueSchema<never>, 'message'> = {
      kind: 'schema',
      type: 'jsonValue',
      reference: jsonValue,
      expects: '(string | number | boolean | null | Object | Array)',
      async: false,
      '~standard': {
        version: 1,
        vendor: 'valibot',
        validate: expect.any(Function),
      },
      '~run': expect.any(Function),
    };

    test('with undefined message', () => {
      const schema: JsonValueSchema<undefined> = {
        ...baseSchema,
        message: undefined,
      };
      expect(jsonValue()).toStrictEqual(schema);
      expect(jsonValue(undefined)).toStrictEqual(schema);
    });

    test('with string message', () => {
      expect(jsonValue('message')).toStrictEqual({
        ...baseSchema,
        message: 'message',
      } satisfies JsonValueSchema<'message'>);
    });

    test('with function message', () => {
      const message = () => 'message';
      expect(jsonValue(message)).toStrictEqual({
        ...baseSchema,
        message,
      } satisfies JsonValueSchema<typeof message>);
    });
  });

  describe('should return dataset without issues', () => {
    const schema = jsonValue();

    test('for strings', () => {
      expectNoSchemaIssue(schema, ['', 'foo', 'bar123']);
    });

    test('for numbers', () => {
      expectNoSchemaIssue(schema, [0, 123, -123, 1.23]);
    });

    test('for booleans', () => {
      expectNoSchemaIssue(schema, [true, false]);
    });

    test('for null', () => {
      expectNoSchemaIssue(schema, [null]);
    });

    test('for arrays', () => {
      expectNoSchemaIssue(schema, [[], [1, 'two', false, null]]);
    });

    test('for objects', () => {
      expectNoSchemaIssue(schema, [{}, { foo: 'bar', baz: 123 }]);
    });

    test('for deeply nested structures', () => {
      expectNoSchemaIssue(schema, [
        {
          name: 'Alice',
          tags: ['admin', 'user'],
          address: { city: 'NYC', zip: '10001' },
          history: [{ year: 2024, active: true }, null],
        },
      ]);
    });

    // Hint: This documents that jsonValue is validation-only: on success,
    // the input is returned unchanged, so no key is ever excluded, even
    // `__proto__`, `prototype`, and `constructor`.
    test('does not rebuild or alter the input on success', () => {
      const input = {
        name: 'Alice',
        tags: ['admin', 'user'],
        address: { city: 'NYC', zip: '10001' },
      };
      const result = schema['~run']({ value: input }, {});
      expect(result).toStrictEqual({ typed: true, value: input });
      expect(result.value).toBe(input);
      // @ts-expect-error `result.value` is narrowed to `JsonValue`
      expect(result.value.address).toBe(input.address);
      // @ts-expect-error `result.value` is narrowed to `JsonValue`
      expect(result.value.tags).toBe(input.tags);
    });

    test('for object with __proto__ key', () => {
      const input = JSON.parse('{"__proto__": 123, "foo": 456}');
      const result = schema['~run']({ value: input }, {});
      expect(result).toStrictEqual({ typed: true, value: input });
      expect(result.value).toBe(input);
    });

    test('for object with constructor and prototype keys', () => {
      const input = JSON.parse(
        '{"constructor":1,"prototype":2,"__proto__":3,"ok":4}'
      );
      const result = schema['~run']({ value: input }, {});
      expect(result).toStrictEqual({ typed: true, value: input });
      expect(result.value).toBe(input);
    });

    // Hint: This documents that a null-prototype object is treated as a
    // plain object, since it cannot be an instance of `Date`, `Map`, or any
    // other class.
    test('for object with null prototype', () => {
      const input = Object.assign(Object.create(null), { foo: 'bar' });
      const result = schema['~run']({ value: input }, {});
      expect(result).toStrictEqual({ typed: true, value: input });
      expect(result.value).toBe(input);
    });
  });

  describe('should return dataset with issues', () => {
    const schema = jsonValue('message');
    const baseIssue: Omit<JsonValueIssue, 'input' | 'received'> = {
      kind: 'schema',
      type: 'jsonValue',
      expected: '(string | number | boolean | null | Object | Array)',
      message: 'message',
      requirement: undefined,
      path: undefined,
      issues: undefined,
      lang: undefined,
      abortEarly: undefined,
      abortPipeEarly: undefined,
    };

    test('for undefined', () => {
      expectSchemaIssue(schema, baseIssue, [undefined]);
    });

    test('for functions', () => {
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      expectSchemaIssue(schema, baseIssue, [() => {}, function () {}]);
    });

    test('for symbols', () => {
      expectSchemaIssue(schema, baseIssue, [Symbol(), Symbol('foo')]);
    });

    test('for bigints', () => {
      expectSchemaIssue(schema, baseIssue, [0n, 123n]);
    });

    test('for NaN and Infinity', () => {
      expectSchemaIssue(schema, baseIssue, [NaN, Infinity, -Infinity]);
    });

    // Hint: Unlike `record`, this schema never copies the input into a new
    // plain object, so accepting a non-plain object would return it as is,
    // typed as `JsonValue`, even though it is really a live instance of
    // another class. It is rejected instead, even when it has no own
    // enumerable properties.
    test('for non-plain objects', () => {
      class Foo {
        bar = 'baz';
      }
      expectSchemaIssue(schema, baseIssue, [
        new Date(),
        new Map([['foo', 'bar']]),
        new Set([1, 2, 3]),
        new Foo(),
      ]);
    });
  });

  describe('should return dataset with nested issues', () => {
    const schema = jsonValue();

    test('for wrong value nested in array', () => {
      const input = ['foo', undefined, 'bar'];
      expect(schema['~run']({ value: input }, {})).toStrictEqual({
        typed: false,
        value: input,
        issues: [
          {
            kind: 'schema',
            type: 'jsonValue',
            input: undefined,
            expected: '(string | number | boolean | null | Object | Array)',
            received: 'undefined',
            message:
              'Invalid type: Expected (string | number | boolean | null | Object | Array) but received undefined',
            requirement: undefined,
            issues: undefined,
            lang: undefined,
            abortEarly: undefined,
            abortPipeEarly: undefined,
            path: [
              {
                type: 'array',
                origin: 'value',
                input,
                key: 1,
                value: undefined,
              },
            ],
          },
        ],
      } satisfies FailureDataset<InferIssue<typeof schema>>);
    });

    test('for wrong value nested two levels deep in an object', () => {
      const address = { city: 'NYC', zip: undefined };
      const input = { name: 'Alice', address };
      const result = schema['~run']({ value: input }, {});
      expect(result.value).toBe(input);
      expect(result).toStrictEqual({
        typed: false,
        value: input,
        issues: [
          {
            kind: 'schema',
            type: 'jsonValue',
            input: undefined,
            expected: '(string | number | boolean | null | Object | Array)',
            received: 'undefined',
            message:
              'Invalid type: Expected (string | number | boolean | null | Object | Array) but received undefined',
            requirement: undefined,
            issues: undefined,
            lang: undefined,
            abortEarly: undefined,
            abortPipeEarly: undefined,
            path: [
              {
                type: 'object',
                origin: 'value',
                input,
                key: 'address',
                value: address,
              },
              {
                type: 'object',
                origin: 'value',
                input: address,
                key: 'zip',
                value: undefined,
              },
            ],
          },
        ],
      } satisfies FailureDataset<InferIssue<typeof schema>>);
    });

    test('with abort early', () => {
      const input = ['foo', undefined, 'bar', undefined];
      const result = schema['~run']({ value: input }, { abortEarly: true });
      expect(result.value).toBe(input);
      expect(result).toStrictEqual({
        typed: false,
        value: input,
        issues: [
          {
            kind: 'schema',
            type: 'jsonValue',
            input: undefined,
            expected: '(string | number | boolean | null | Object | Array)',
            received: 'undefined',
            message:
              'Invalid type: Expected (string | number | boolean | null | Object | Array) but received undefined',
            requirement: undefined,
            issues: undefined,
            lang: undefined,
            abortEarly: true,
            abortPipeEarly: undefined,
            path: [
              {
                type: 'array',
                origin: 'value',
                input,
                key: 1,
                value: undefined,
              },
            ],
          },
        ],
      } satisfies FailureDataset<InferIssue<typeof schema>>);
    });

    test('for multiple wrong values nested in an array', () => {
      const input = ['foo', undefined, 'bar', undefined];
      const undefinedIssue = {
        kind: 'schema',
        type: 'jsonValue',
        input: undefined,
        expected: '(string | number | boolean | null | Object | Array)',
        received: 'undefined',
        message:
          'Invalid type: Expected (string | number | boolean | null | Object | Array) but received undefined',
        requirement: undefined,
        issues: undefined,
        lang: undefined,
        abortEarly: undefined,
        abortPipeEarly: undefined,
      } as const;
      expect(schema['~run']({ value: input }, {})).toStrictEqual({
        typed: false,
        value: input,
        issues: [
          {
            ...undefinedIssue,
            path: [
              {
                type: 'array',
                origin: 'value',
                input,
                key: 1,
                value: undefined,
              },
            ],
          },
          {
            ...undefinedIssue,
            path: [
              {
                type: 'array',
                origin: 'value',
                input,
                key: 3,
                value: undefined,
              },
            ],
          },
        ],
      } satisfies FailureDataset<InferIssue<typeof schema>>);
    });

    test('with abort early for an object', () => {
      const input = { a: undefined, b: undefined };
      const result = schema['~run']({ value: input }, { abortEarly: true });
      expect(result.value).toBe(input);
      expect(result).toStrictEqual({
        typed: false,
        value: input,
        issues: [
          {
            kind: 'schema',
            type: 'jsonValue',
            input: undefined,
            expected: '(string | number | boolean | null | Object | Array)',
            received: 'undefined',
            message:
              'Invalid type: Expected (string | number | boolean | null | Object | Array) but received undefined',
            requirement: undefined,
            issues: undefined,
            lang: undefined,
            abortEarly: true,
            abortPipeEarly: undefined,
            path: [
              {
                type: 'object',
                origin: 'value',
                input,
                key: 'a',
                value: undefined,
              },
            ],
          },
        ],
      } satisfies FailureDataset<InferIssue<typeof schema>>);
    });

    test('for wrong values nested through mixed array and object branches', () => {
      const list = [1, undefined];
      const meta = { ok: true, bad: undefined };
      const input = { list, meta };
      const undefinedIssue = {
        kind: 'schema',
        type: 'jsonValue',
        input: undefined,
        expected: '(string | number | boolean | null | Object | Array)',
        received: 'undefined',
        message:
          'Invalid type: Expected (string | number | boolean | null | Object | Array) but received undefined',
        requirement: undefined,
        issues: undefined,
        lang: undefined,
        abortEarly: undefined,
        abortPipeEarly: undefined,
      } as const;
      const result = schema['~run']({ value: input }, {});
      expect(result.value).toBe(input);
      expect(result).toStrictEqual({
        typed: false,
        value: input,
        issues: [
          {
            ...undefinedIssue,
            path: [
              {
                type: 'object',
                origin: 'value',
                input,
                key: 'list',
                value: list,
              },
              {
                type: 'array',
                origin: 'value',
                input: list,
                key: 1,
                value: undefined,
              },
            ],
          },
          {
            ...undefinedIssue,
            path: [
              {
                type: 'object',
                origin: 'value',
                input,
                key: 'meta',
                value: meta,
              },
              {
                type: 'object',
                origin: 'value',
                input: meta,
                key: 'bad',
                value: undefined,
              },
            ],
          },
        ],
      } satisfies FailureDataset<InferIssue<typeof schema>>);
    });

    test('for custom message applied to a nested issue', () => {
      const customSchema = jsonValue('custom message');
      const input = { a: [1, undefined] };
      const result = customSchema['~run']({ value: input }, {});
      expect(result.issues?.[0].message).toBe('custom message');
    });
  });

  describe('should reject circular references', () => {
    const schema = jsonValue();

    test('for an object referencing itself', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const input: any = { foo: 1 };
      input.self = input;
      const result = schema['~run']({ value: input }, {});
      expect(result.typed).toBe(false);
      expect(result.issues).toHaveLength(1);
      expect(result.issues?.[0].path).toStrictEqual([
        { type: 'object', origin: 'value', input, key: 'self', value: input },
      ]);
    });

    test('for an array referencing itself', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const input: any[] = [1, 2];
      input.push(input);
      const result = schema['~run']({ value: input }, {});
      expect(result.typed).toBe(false);
      expect(result.issues).toHaveLength(1);
      expect(result.issues?.[0].path).toStrictEqual([
        { type: 'array', origin: 'value', input, key: 2, value: input },
      ]);
    });

    test('for an object referencing an ancestor two levels up', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const root: any = { child: {} };
      root.child.grandchild = { root };
      const result = schema['~run']({ value: root }, {});
      expect(result.typed).toBe(false);
      expect(result.issues).toHaveLength(1);
      expect(result.issues?.[0].path).toStrictEqual([
        {
          type: 'object',
          origin: 'value',
          input: root,
          key: 'child',
          value: root.child,
        },
        {
          type: 'object',
          origin: 'value',
          input: root.child,
          key: 'grandchild',
          value: root.child.grandchild,
        },
        {
          type: 'object',
          origin: 'value',
          input: root.child.grandchild,
          key: 'root',
          value: root,
        },
      ]);
    });

    test('for the same object reused in sibling branches, not a cycle', () => {
      const shared = { x: 1 };
      const input = { a: shared, b: shared };
      expectNoSchemaIssue(schema, [input]);
    });

    test('for the same array reused as sibling elements, not a cycle', () => {
      const shared = [1, 2];
      const input = [shared, shared];
      expectNoSchemaIssue(schema, [input]);
    });
  });
});
