import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { bumpPatchVersion, updateManifestVersion } from './bump-manifest-version.mjs';

describe('bump-manifest-version script', () => {
  it('bumps patch version for valid semver', () => {
    expect(bumpPatchVersion('0.1.0')).toBe('0.1.1');
    expect(bumpPatchVersion('9.3.99')).toBe('9.3.100');
  });

  it('throws for invalid semver strings', () => {
    expect(() => bumpPatchVersion('0.1')).toThrow(/invalid semver/i);
    expect(() => bumpPatchVersion('1.2.3-beta')).toThrow(/invalid semver/i);
  });

  it('updates manifest.json patch when explicit version is not provided', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'budgetbase-bump-'));
    const manifestPath = path.join(tempDir, 'manifest.json');
    fs.writeFileSync(
      manifestPath,
      `${JSON.stringify({ id: 'budgetbase', version: '1.4.7' }, null, 2)}\n`,
      'utf8'
    );

    const next = updateManifestVersion(manifestPath);
    const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

    expect(next).toBe('1.4.8');
    expect(parsed.version).toBe('1.4.8');
  });

  it('updates manifest.json to explicit version when --set equivalent value is provided', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'budgetbase-bump-set-'));
    const manifestPath = path.join(tempDir, 'manifest.json');
    fs.writeFileSync(
      manifestPath,
      `${JSON.stringify({ id: 'budgetbase', version: '1.4.7' }, null, 2)}\n`,
      'utf8'
    );

    const next = updateManifestVersion(manifestPath, '2.0.0');
    const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

    expect(next).toBe('2.0.0');
    expect(parsed.version).toBe('2.0.0');
  });
});
