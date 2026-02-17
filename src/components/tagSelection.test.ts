import { describe, expect, it } from 'vitest';
import { normalizeTag } from './tagSelection';

describe('tagSelection helpers', () => {
  it('normalizes tags to capitalized form', () => {
    expect(normalizeTag('vault')).toBe('Vault');
    expect(normalizeTag('SAVINGS')).toBe('Savings');
    expect(normalizeTag('')).toBe('Item');
  });

  it('normalizes whitespace and invisible characters', () => {
    expect(normalizeTag('  MORTGAGE  ')).toBe('Mortgage');
    expect(normalizeTag('SOFI    VAULT')).toBe('Sofi vault');
    expect(normalizeTag('MORTGAGE\u200B')).toBe('Mortgage');
  });
});
