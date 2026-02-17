interface ObsidianYamlModule {
  parseYaml: (source: string) => unknown;
  stringifyYaml: (data: unknown) => string;
}

function getObsidianYamlModule(): ObsidianYamlModule | null {
  const maybeRequire = (globalThis as { require?: (id: string) => unknown }).require
    || (globalThis as { window?: { require?: (id: string) => unknown } }).window?.require;
  if (typeof maybeRequire !== 'function') return null;

  try {
    const obsidian = maybeRequire('obsidian') as Partial<ObsidianYamlModule>;
    if (typeof obsidian.parseYaml !== 'function' || typeof obsidian.stringifyYaml !== 'function') {
      return null;
    }
    return {
      parseYaml: obsidian.parseYaml,
      stringifyYaml: obsidian.stringifyYaml
    };
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function unquoteYamlString(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length < 2 || !trimmed.startsWith('"') || !trimmed.endsWith('"')) {
    return trimmed;
  }

  let result = '';
  for (let index = 1; index < trimmed.length - 1; index += 1) {
    const char = trimmed[index];
    if (char === '\\' && index + 1 < trimmed.length - 1) {
      result += trimmed[index + 1];
      index += 1;
      continue;
    }
    result += char;
  }
  return result;
}

function parseYamlScalar(value: string): unknown {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (trimmed === 'null' || trimmed === '~') return null;
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (/^[+-]?\d+(\.\d+)?$/.test(trimmed)) {
    const parsed = Number(trimmed);
    if (Number.isFinite(parsed)) return parsed;
  }
  return unquoteYamlString(trimmed);
}

function parseYamlKeyValueLine(line: string): { key: string; value: string } | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return null;

  if (trimmed.startsWith('"')) {
    let key = '';
    let index = 1;
    let closed = false;
    while (index < trimmed.length) {
      const char = trimmed[index];
      if (char === '\\' && index + 1 < trimmed.length) {
        key += trimmed[index + 1];
        index += 2;
        continue;
      }
      if (char === '"') {
        closed = true;
        index += 1;
        break;
      }
      key += char;
      index += 1;
    }
    if (!closed) return null;
    while (index < trimmed.length && /\s/.test(trimmed[index])) {
      index += 1;
    }
    if (trimmed[index] !== ':') return null;
    return { key, value: trimmed.slice(index + 1) };
  }

  const separatorIndex = trimmed.indexOf(':');
  if (separatorIndex === -1) return null;

  return {
    key: trimmed.slice(0, separatorIndex).trim(),
    value: trimmed.slice(separatorIndex + 1)
  };
}

function isSkippableYamlLine(line: string): boolean {
  const trimmed = line.trim();
  return !trimmed || trimmed.startsWith('#');
}

function isUnsupportedYamlToken(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (/^(\||>)[+-]?\d*$/.test(trimmed)) return true;
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) return true;
  return false;
}

function parseYamlFallback(source: string): Record<string, unknown> | null {
  const lines = source.split('\n');
  const result: Record<string, unknown> = {};

  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (isSkippableYamlLine(line)) {
      index += 1;
      continue;
    }
    if (/^\s/.test(line) || /^\s*-\s+/.test(line)) {
      return null;
    }

    const parsed = parseYamlKeyValueLine(line);
    if (!parsed || !parsed.key) return null;

    const rootValue = parsed.value.trim();
    if (isUnsupportedYamlToken(rootValue)) {
      return null;
    }

    if (!rootValue) {
      const nested: Record<string, unknown> = {};
      index += 1;
      while (index < lines.length) {
        const childLine = lines[index];
        if (isSkippableYamlLine(childLine)) {
          index += 1;
          continue;
        }
        if (!/^\s/.test(childLine)) {
          break;
        }

        // Fallback supports one nested object level with two-space indentation only.
        if (!/^ {2}\S/.test(childLine) || /^\s*-\s+/.test(childLine)) {
          return null;
        }

        const child = parseYamlKeyValueLine(childLine);
        if (!child || !child.key) return null;

        const childValue = child.value.trim();
        if (!childValue || isUnsupportedYamlToken(childValue)) {
          return null;
        }

        nested[child.key] = parseYamlScalar(child.value);
        index += 1;
      }

      result[parsed.key] = nested;
      continue;
    }

    result[parsed.key] = parseYamlScalar(parsed.value);
    index += 1;
  }

  return result;
}

function quoteYamlString(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function formatYamlKey(key: string): string {
  if (/^[A-Za-z0-9_-]+$/.test(key)) return key;
  return quoteYamlString(key);
}

function formatYamlScalar(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return quoteYamlString('');
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  return quoteYamlString(String(value));
}

function isSupportedYamlScalar(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'boolean') return true;
  if (typeof value === 'string') return !value.includes('\n');
  return false;
}

function assertSupportedYamlFallbackValue(value: unknown, depth: number) {
  if (Array.isArray(value)) {
    throw new Error('YAML fallback serializer does not support arrays.');
  }
  if (isRecord(value)) {
    if (depth >= 1) {
      throw new Error('YAML fallback serializer supports only one nested object level.');
    }
    for (const nestedValue of Object.values(value)) {
      if (Array.isArray(nestedValue) || isRecord(nestedValue) || !isSupportedYamlScalar(nestedValue)) {
        throw new Error('YAML fallback serializer encountered unsupported nested YAML value.');
      }
    }
    return;
  }
  if (!isSupportedYamlScalar(value)) {
    throw new Error('YAML fallback serializer encountered unsupported YAML value.');
  }
}

function stringifyYamlFallback(data: Record<string, unknown>): string {
  let output = '';
  for (const [key, value] of Object.entries(data)) {
    assertSupportedYamlFallbackValue(value, 0);
    if (isRecord(value)) {
      output += `${formatYamlKey(key)}:\n`;
      for (const [nestedKey, nestedValue] of Object.entries(value)) {
        output += `  ${formatYamlKey(nestedKey)}: ${formatYamlScalar(nestedValue)}\n`;
      }
      continue;
    }
    output += `${formatYamlKey(key)}: ${formatYamlScalar(value)}\n`;
  }
  return output;
}

export function parseYamlObject(source: string): Record<string, unknown> | null {
  const obsidianYaml = getObsidianYamlModule();
  if (obsidianYaml) {
    try {
      const parsed = obsidianYaml.parseYaml(source);
      return isRecord(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return parseYamlFallback(source);
}

export function stringifyYamlObject(data: Record<string, unknown>): string {
  const obsidianYaml = getObsidianYamlModule();
  if (obsidianYaml) {
    return obsidianYaml.stringifyYaml(data);
  }
  return stringifyYamlFallback(data);
}
