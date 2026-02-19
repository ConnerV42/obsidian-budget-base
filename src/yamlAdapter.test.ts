import { describe, expect, it } from 'vitest';
import { parseYamlObject, stringifyYamlObject } from './yamlAdapter';

describe('yaml adapter fallback safety', () => {
  it('parses nested mappings and lists used by compensation frontmatter', () => {
    const parsed = parseYamlObject(`type: budget
income: 5000
compensation:
  version: 1
  gross: 8000
  deductions:
    -
      id: d001
      label: Tax
      mode: percent
      percentBps: 2275
      amount: 0
    - id: d002
      label: Retirement
      mode: percent
      percentBps: 1600
      amount: 0
`);

    expect(parsed).toMatchObject({
      type: 'budget',
      income: 5000,
      compensation: {
        version: 1,
        gross: 8000
      }
    });
    const compensation = parsed?.compensation as { deductions?: unknown[] } | undefined;
    expect(Array.isArray(compensation?.deductions)).toBe(true);
  });

  it('returns null for unsupported flow-style list syntax in fallback parser', () => {
    const parsed = parseYamlObject(`type: budget
aliases:
  [Monthly Budget]
`);

    expect(parsed).toBeNull();
  });

  it('returns null for unsupported block scalar syntax', () => {
    const parsed = parseYamlObject(`type: budget
notes: |
  line1
  line2
`);

    expect(parsed).toBeNull();
  });

  it('serializes and parses nested arrays/mappings deterministically', () => {
    const serialized = stringifyYamlObject({
      type: 'budget',
      compensation: {
        version: 1,
        gross: 8200,
        deductions: [
          { id: 'd001', label: 'Tax', mode: 'percent', percentBps: 2275, amount: 0 },
          { id: 'd002', label: 'Retirement', mode: 'percent', percentBps: 1600, amount: 0 }
        ]
      }
    });

    const parsed = parseYamlObject(serialized);
    expect(parsed).toEqual({
      type: 'budget',
      compensation: {
        version: 1,
        gross: 8200,
        deductions: [
          { id: 'd001', label: 'Tax', mode: 'percent', percentBps: 2275, amount: 0 },
          { id: 'd002', label: 'Retirement', mode: 'percent', percentBps: 1600, amount: 0 }
        ]
      }
    });
  });

  it('throws for unsupported function values in fallback serializer', () => {
    expect(() => stringifyYamlObject({
      type: 'budget',
      invalid: () => 'x'
    })).toThrow(/unsupported yaml value/i);
  });
});
