import { describe, expect, it } from 'vitest';
import { parseYamlObject, stringifyYamlObject } from './yamlAdapter';

describe('yaml adapter fallback safety', () => {
  it('parses supported flat and one-level nested mappings', () => {
    const parsed = parseYamlObject(`type: budget
income: 5000
layout:
  splitRatio: 0.31
`);

    expect(parsed).toEqual({
      type: 'budget',
      income: 5000,
      layout: {
        splitRatio: 0.31
      }
    });
  });

  it('returns null for unsupported list syntax in fallback parser', () => {
    const parsed = parseYamlObject(`type: budget
aliases:
  - Monthly Budget
`);

    expect(parsed).toBeNull();
  });

  it('returns null for deeper-than-supported nested mappings', () => {
    const parsed = parseYamlObject(`type: budget
layout:
  options:
    splitRatio: 0.31
`);

    expect(parsed).toBeNull();
  });

  it('throws for arrays in fallback serializer', () => {
    expect(() => stringifyYamlObject({
      type: 'budget',
      tags: ['primary']
    })).toThrow(/does not support arrays/i);
  });

  it('throws for nested objects beyond one level in fallback serializer', () => {
    expect(() => stringifyYamlObject({
      type: 'budget',
      layout: {
        options: {
          splitRatio: 0.31
        }
      }
    })).toThrow(/nested yaml value|one nested object level/i);
  });
});
