import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildPluginDir, resolveVaultPath, verifyPluginCopy } from './verify-plugin-copy.mjs';

function writePluginFiles(dir, { main, styles, version }) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'main.js'), main, 'utf8');
  fs.writeFileSync(path.join(dir, 'styles.css'), styles, 'utf8');
  fs.writeFileSync(
    path.join(dir, 'manifest.json'),
    `${JSON.stringify({ id: 'budgetbase', version }, null, 2)}\n`,
    'utf8'
  );
}

describe('verify-plugin-copy script', () => {
  it('passes when local and deployed plugin assets match', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'budgetbase-verify-pass-'));
    const localDir = path.join(root, 'local');
    const deployedDir = path.join(root, 'deployed');

    writePluginFiles(localDir, { main: 'console.log("x")', styles: '.x{}', version: '0.2.0' });
    writePluginFiles(deployedDir, { main: 'console.log("x")', styles: '.x{}', version: '0.2.0' });

    const result = verifyPluginCopy({ localDir, pluginDir: deployedDir });
    expect(result.ok).toBe(true);
  });

  it('fails when deployed assets differ', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'budgetbase-verify-fail-'));
    const localDir = path.join(root, 'local');
    const deployedDir = path.join(root, 'deployed');

    writePluginFiles(localDir, { main: 'console.log("x")', styles: '.x{}', version: '0.2.0' });
    writePluginFiles(deployedDir, { main: 'console.log("y")', styles: '.x{}', version: '0.2.0' });

    const result = verifyPluginCopy({ localDir, pluginDir: deployedDir });
    expect(result.ok).toBe(false);
    expect(result.checks.some((check) => check.name === 'main.js sha256 matches' && !check.ok)).toBe(true);
  });

  it('resolves vault path from env, then .vault-path, then default iCloud path', () => {
    const envPath = resolveVaultPath({
      env: { VAULT: '/tmp/custom-vault' },
      cwd: '/tmp',
      homeDir: '/Users/tester'
    });
    expect(envPath).toBe('/tmp/custom-vault');

    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'budgetbase-vault-path-'));
    fs.writeFileSync(path.join(tempRoot, '.vault-path'), '/tmp/from-file', 'utf8');
    const filePath = resolveVaultPath({
      env: {},
      cwd: tempRoot,
      homeDir: '/Users/tester'
    });
    expect(filePath).toBe('/tmp/from-file');

    const fallbackPath = resolveVaultPath({
      env: {},
      cwd: path.join(tempRoot, 'missing'),
      homeDir: '/Users/tester'
    });
    expect(fallbackPath).toBe('/Users/tester/Library/Mobile Documents/iCloud~md~obsidian/Documents/vault');
  });

  it('builds plugin directory from vault path', () => {
    expect(buildPluginDir('/vault')).toBe('/vault/.obsidian/plugins/budgetbase');
  });
});
