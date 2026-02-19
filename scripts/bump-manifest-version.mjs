#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const SEMVER_PATTERN = /^(\d+)\.(\d+)\.(\d+)$/;

function assertValidSemver(version) {
  if (!SEMVER_PATTERN.test(version)) {
    throw new Error(`Invalid semver version: ${version}`);
  }
}

export function bumpPatchVersion(version) {
  assertValidSemver(version);
  const match = version.match(SEMVER_PATTERN);
  if (!match) {
    throw new Error(`Invalid semver version: ${version}`);
  }
  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);
  return `${major}.${minor}.${patch + 1}`;
}

export function parseArgs(argv) {
  const args = {
    setVersion: null,
    manifestPath: 'manifest.json',
    help: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '-h' || token === '--help') {
      args.help = true;
      continue;
    }

    if (token === '--set') {
      const value = argv[i + 1];
      if (!value) {
        throw new Error('Missing value for --set');
      }
      args.setVersion = value;
      i += 1;
      continue;
    }

    if (token === '--manifest') {
      const value = argv[i + 1];
      if (!value) {
        throw new Error('Missing value for --manifest');
      }
      args.manifestPath = value;
      i += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${token}`);
  }

  return args;
}

export function updateManifestVersion(manifestPath, explicitVersion = null) {
  const raw = fs.readFileSync(manifestPath, 'utf8');
  const manifest = JSON.parse(raw);

  if (typeof manifest.version !== 'string' || !manifest.version.trim()) {
    throw new Error(`Manifest missing valid version at ${manifestPath}`);
  }

  const nextVersion = explicitVersion
    ? explicitVersion.trim()
    : bumpPatchVersion(manifest.version.trim());

  assertValidSemver(nextVersion);
  manifest.version = nextVersion;
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  return nextVersion;
}

function printHelp() {
  console.log(`Usage: node scripts/bump-manifest-version.mjs [options]

Options:
  --set <version>       Set explicit semver version (x.y.z)
  --manifest <path>     Manifest path (default: manifest.json)
  -h, --help            Show this help text
`);
}

export function main(argv = process.argv.slice(2), cwd = process.cwd()) {
  const args = parseArgs(argv);
  if (args.help) {
    printHelp();
    return null;
  }

  const manifestPath = path.resolve(cwd, args.manifestPath);
  const nextVersion = updateManifestVersion(manifestPath, args.setVersion);
  console.log(`✅ Manifest version updated: ${nextVersion}`);
  return nextVersion;
}

const currentScriptPath = fileURLToPath(import.meta.url);
const cliInvocationPath = process.argv[1] ? path.resolve(process.argv[1]) : '';

if (cliInvocationPath === currentScriptPath) {
  try {
    main();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`❌ ${message}`);
    process.exit(1);
  }
}
