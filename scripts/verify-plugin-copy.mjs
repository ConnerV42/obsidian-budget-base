#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const REQUIRED_FILES = ['main.js', 'styles.css', 'manifest.json'];
const DEFAULT_VAULT_PATH_SUFFIX = path.join(
  'Library',
  'Mobile Documents',
  'iCloud~md~obsidian',
  'Documents',
  'vault'
);

export function resolveVaultPath({
  env = process.env,
  cwd = process.cwd(),
  homeDir = os.homedir(),
  vaultPathFile = '.vault-path'
} = {}) {
  if (typeof env.VAULT === 'string' && env.VAULT.trim()) {
    return env.VAULT.trim();
  }

  const vaultPathFilePath = path.resolve(cwd, vaultPathFile);
  if (fs.existsSync(vaultPathFilePath)) {
    const fromFile = fs.readFileSync(vaultPathFilePath, 'utf8').trim();
    if (fromFile) {
      return fromFile;
    }
  }

  return path.join(homeDir, DEFAULT_VAULT_PATH_SUFFIX);
}

export function buildPluginDir(vaultPath, pluginId = 'budgetbase') {
  return path.join(vaultPath, '.obsidian', 'plugins', pluginId);
}

export function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function readManifestVersion(manifestPath) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  return typeof manifest.version === 'string' ? manifest.version.trim() : '';
}

export function verifyPluginCopy({ localDir = process.cwd(), pluginDir }) {
  const checks = [];

  const localFilePaths = Object.fromEntries(
    REQUIRED_FILES.map((fileName) => [fileName, path.resolve(localDir, fileName)])
  );
  const deployedFilePaths = Object.fromEntries(
    REQUIRED_FILES.map((fileName) => [fileName, path.resolve(pluginDir, fileName)])
  );

  for (const fileName of REQUIRED_FILES) {
    const localExists = fs.existsSync(localFilePaths[fileName]);
    const deployedExists = fs.existsSync(deployedFilePaths[fileName]);
    checks.push({
      name: `${fileName} exists locally`,
      ok: localExists,
      detail: localFilePaths[fileName]
    });
    checks.push({
      name: `${fileName} exists in plugin dir`,
      ok: deployedExists,
      detail: deployedFilePaths[fileName]
    });
  }

  for (const fileName of ['main.js', 'styles.css']) {
    const localPath = localFilePaths[fileName];
    const deployedPath = deployedFilePaths[fileName];
    if (!fs.existsSync(localPath) || !fs.existsSync(deployedPath)) {
      checks.push({
        name: `${fileName} sha256 matches`,
        ok: false,
        detail: 'Skipped hash compare because one or both files are missing'
      });
      continue;
    }

    const localHash = sha256File(localPath);
    const deployedHash = sha256File(deployedPath);
    checks.push({
      name: `${fileName} sha256 matches`,
      ok: localHash === deployedHash,
      detail: `local=${localHash} deployed=${deployedHash}`
    });
  }

  const localManifestPath = localFilePaths['manifest.json'];
  const deployedManifestPath = deployedFilePaths['manifest.json'];
  let localVersion = '';
  let deployedVersion = '';

  if (fs.existsSync(localManifestPath) && fs.existsSync(deployedManifestPath)) {
    localVersion = readManifestVersion(localManifestPath);
    deployedVersion = readManifestVersion(deployedManifestPath);
  }

  checks.push({
    name: 'manifest version matches',
    ok: localVersion.length > 0 && localVersion === deployedVersion,
    detail: `local=${localVersion || '(missing)'} deployed=${deployedVersion || '(missing)'}`
  });

  return {
    pluginDir,
    localVersion,
    deployedVersion,
    checks,
    ok: checks.every((check) => check.ok)
  };
}

export function parseArgs(argv) {
  const args = {
    vaultPath: null,
    pluginDir: null,
    localDir: '.',
    help: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '-h' || token === '--help') {
      args.help = true;
      continue;
    }

    if (token === '--vault') {
      const value = argv[i + 1];
      if (!value) {
        throw new Error('Missing value for --vault');
      }
      args.vaultPath = value;
      i += 1;
      continue;
    }

    if (token === '--plugin-dir') {
      const value = argv[i + 1];
      if (!value) {
        throw new Error('Missing value for --plugin-dir');
      }
      args.pluginDir = value;
      i += 1;
      continue;
    }

    if (token === '--local-dir') {
      const value = argv[i + 1];
      if (!value) {
        throw new Error('Missing value for --local-dir');
      }
      args.localDir = value;
      i += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${token}`);
  }

  return args;
}

function printHelp() {
  console.log(`Usage: node scripts/verify-plugin-copy.mjs [options]

Options:
  --vault <path>        Vault path (falls back to VAULT/.vault-path/default iCloud path)
  --plugin-dir <path>   Explicit plugin directory path (overrides --vault)
  --local-dir <path>    Local build directory (default: .)
  -h, --help            Show this help text
`);
}

function printReport(report, localDir) {
  console.log(`🔍 Verifying plugin copy`);
  console.log(`   Local:   ${path.resolve(localDir)}`);
  console.log(`   Deployed:${report.pluginDir}`);
  for (const check of report.checks) {
    const icon = check.ok ? '✅' : '❌';
    console.log(`${icon} ${check.name}`);
    console.log(`   ${check.detail}`);
  }
}

export function main(argv = process.argv.slice(2), cwd = process.cwd()) {
  const args = parseArgs(argv);
  if (args.help) {
    printHelp();
    return true;
  }

  const localDir = path.resolve(cwd, args.localDir);
  const pluginDir = args.pluginDir
    ? path.resolve(cwd, args.pluginDir)
    : buildPluginDir(
      args.vaultPath
        ? path.resolve(cwd, args.vaultPath)
        : resolveVaultPath({ cwd })
    );

  const report = verifyPluginCopy({ localDir, pluginDir });
  printReport(report, localDir);
  if (!report.ok) {
    console.error('❌ Deploy verification failed');
    return false;
  }
  console.log('✅ Deploy verification passed');
  return true;
}

const currentScriptPath = fileURLToPath(import.meta.url);
const cliInvocationPath = process.argv[1] ? path.resolve(process.argv[1]) : '';

if (cliInvocationPath === currentScriptPath) {
  try {
    const ok = main();
    if (!ok) {
      process.exit(1);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`❌ ${message}`);
    process.exit(1);
  }
}
