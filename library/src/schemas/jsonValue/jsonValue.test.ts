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

    test('for object with __proto__ key', () => {
      const input = JSON.parse('{"__proto__": 123, "foo": 456}');
      expect(schema['~run']({ value: input }, {})).toStrictEqual({
        typed: true,
        value: { foo: 456 },
      });
    });

    test('for object with constructor and prototype keys', () => {
      const input = JSON.parse(
        '{"constructor":1,"prototype":2,"__proto__":3,"ok":4}'
      );
      expect(schema['~run']({ value: input }, {})).toStrictEqual({
        typed: true,
        value: { ok: 4 },
      });
    });

    // Hint: This documents the intentional, precedent-based behavior of the
    // object branch (matches `object`/`record`): non-plain objects such as
    // `Date`, `Map`, and `Set` are not specially handled. Their own
    // enumerable properties are used, which for these built-ins means no
    // own enumerable properties at all, so they are accepted as `{}`.
    test('for Date object', () => {
      expect(schema['~run']({ value: new Date() }, {})).toStrictEqual({
        typed: true,
        value: {},
      });
    });

    test('for Map object', () => {
      expect(
        schema['~run']({ value: new Map([['foo', 'bar']]) }, {})
      ).toStrictEqual({
        typed: true,
        value: {},
      });
    });

    test('for Set object', () => {
      expect(schema['~run']({ value: new Set([1, 2, 3]) }, {})).toStrictEqual({
        typed: true,
        value: {},
      });
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
      expect(schema['~run']({ value: input }, {})).toStrictEqual({
        typed: false,
        value: { name: 'Alice', address: { city: 'NYC', zip: undefined } },
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
      expect(
        schema['~run']({ value: input }, { abortEarly: true })
      ).toStrictEqual({
        typed: false,
        value: ['foo'],
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
  });
});
