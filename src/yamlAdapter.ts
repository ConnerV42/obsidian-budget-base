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
  if (trimmed.startsWith('&') || trimmed.startsWith('*')) return true;
  return false;
}

interface ParsedYamlNode {
  value: unknown;
  nextIndex: number;
}

function getLineIndent(line: string): number {
  let indent = 0;
  while (indent < line.length && line[indent] === ' ') {
    indent += 1;
  }

  if (indent < line.length && line[indent] === '\t') {
    throw new Error('Tabs are not supported in YAML fallback parser.');
  }

  if (indent % 2 !== 0) {
    throw new Error('YAML fallback parser requires two-space indentation.');
  }

  return indent;
}

function skipSkippableLines(lines: string[], startIndex: number): number {
  let index = startIndex;
  while (index < lines.length && isSkippableYamlLine(lines[index])) {
    index += 1;
  }
  return index;
}

function parseYamlMappingBlock(
  lines: string[],
  startIndex: number,
  indent: number,
  seed: Record<string, unknown> = {}
): ParsedYamlNode {
  const result: Record<string, unknown> = seed;
  let index = startIndex;

  while (index < lines.length) {
    index = skipSkippableLines(lines, index);
    if (index >= lines.length) {
      break;
    }

    const line = lines[index];
    const lineIndent = getLineIndent(line);
    if (lineIndent < indent) {
      break;
    }
    if (lineIndent > indent) {
      throw new Error('Unexpected indentation in YAML fallback parser.');
    }

    const trimmed = line.slice(indent);
    if (trimmed.startsWith('-')) {
      throw new Error('Unexpected list item in mapping block.');
    }

    const parsed = parseYamlKeyValueLine(trimmed);
    if (!parsed || !parsed.key) {
      throw new Error('Failed to parse mapping entry in YAML fallback parser.');
    }

    const valueText = parsed.value.trim();
    index += 1;

    if (!valueText) {
      const nested = parseYamlBlock(lines, index, indent + 2);
      if (!nested) {
        result[parsed.key] = {};
        continue;
      }
      result[parsed.key] = nested.value;
      index = nested.nextIndex;
      continue;
    }

    if (isUnsupportedYamlToken(valueText)) {
      throw new Error('Unsupported YAML token in fallback parser.');
    }

    result[parsed.key] = parseYamlScalar(parsed.value);
  }

  return { value: result, nextIndex: index };
}

function parseYamlSequenceBlock(lines: string[], startIndex: number, indent: number): ParsedYamlNode {
  const result: unknown[] = [];
  let index = startIndex;

  while (index < lines.length) {
    index = skipSkippableLines(lines, index);
    if (index >= lines.length) {
      break;
    }

    const line = lines[index];
    const lineIndent = getLineIndent(line);
    if (lineIndent < indent) {
      break;
    }
    if (lineIndent > indent) {
      throw new Error('Unexpected indentation in YAML list block.');
    }

    const trimmed = line.slice(indent);
    if (!(trimmed === '-' || trimmed.startsWith('- '))) {
      break;
    }

    const inlineValue = trimmed === '-'
      ? ''
      : trimmed.slice(2);
    index += 1;

    if (!inlineValue.trim()) {
      const nested = parseYamlBlock(lines, index, indent + 2);
      if (!nested) {
        throw new Error('List entry missing nested value in YAML fallback parser.');
      }
      result.push(nested.value);
      index = nested.nextIndex;
      continue;
    }

    if (isUnsupportedYamlToken(inlineValue)) {
      throw new Error('Unsupported inline token in YAML list block.');
    }

    const inlineMapEntry = parseYamlKeyValueLine(inlineValue);
    if (inlineMapEntry && inlineMapEntry.key) {
      const item: Record<string, unknown> = {};
      const inlineMapValue = inlineMapEntry.value.trim();
      if (!inlineMapValue) {
        const nestedForInlineValue = parseYamlBlock(lines, index, indent + 4);
        item[inlineMapEntry.key] = nestedForInlineValue
          ? nestedForInlineValue.value
          : {};
        if (nestedForInlineValue) {
          index = nestedForInlineValue.nextIndex;
        }
      } else {
        if (isUnsupportedYamlToken(inlineMapValue)) {
          throw new Error('Unsupported inline map token in YAML list block.');
        }
        item[inlineMapEntry.key] = parseYamlScalar(inlineMapEntry.value);
      }

      const restOfItem = parseYamlMappingBlock(lines, index, indent + 2, item);
      result.push(restOfItem.value);
      index = restOfItem.nextIndex;
      continue;
    }

    result.push(parseYamlScalar(inlineValue));
  }

  return { value: result, nextIndex: index };
}

function parseYamlBlock(lines: string[], startIndex: number, indent: number): ParsedYamlNode | null {
  const index = skipSkippableLines(lines, startIndex);
  if (index >= lines.length) {
    return null;
  }

  const line = lines[index];
  const lineIndent = getLineIndent(line);
  if (lineIndent < indent) {
    return null;
  }
  if (lineIndent !== indent) {
    throw new Error('Unexpected indentation depth in YAML fallback parser.');
  }

  const trimmed = line.slice(indent);
  if (trimmed.startsWith('-')) {
    return parseYamlSequenceBlock(lines, index, indent);
  }
  return parseYamlMappingBlock(lines, index, indent);
}

function parseYamlFallback(source: string): Record<string, unknown> | null {
  const lines = source.split('\n');
  try {
    const parsed = parseYamlBlock(lines, 0, 0);
    if (!parsed || !isRecord(parsed.value)) {
      return null;
    }
    const trailingIndex = skipSkippableLines(lines, parsed.nextIndex);
    if (trailingIndex < lines.length) {
      return null;
    }
    return parsed.value;
  } catch {
    return null;
  }
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

function assertSupportedYamlFallbackValue(value: unknown) {
  if (Array.isArray(value)) {
    for (const item of value) {
      assertSupportedYamlFallbackValue(item);
    }
    return;
  }

  if (isRecord(value)) {
    for (const nestedValue of Object.values(value)) {
      assertSupportedYamlFallbackValue(nestedValue);
    }
    return;
  }

  if (!isSupportedYamlScalar(value)) {
    throw new Error('YAML fallback serializer encountered unsupported YAML value.');
  }
}

function stringifyYamlFallbackValue(value: unknown, indent: number): string {
  const spacing = ' '.repeat(indent);

  if (Array.isArray(value)) {
    let output = '';
    for (const item of value) {
      if (isRecord(item) || Array.isArray(item)) {
        output += `${spacing}-\n`;
        output += stringifyYamlFallbackValue(item, indent + 2);
        continue;
      }
      output += `${spacing}- ${formatYamlScalar(item)}\n`;
    }
    return output;
  }

  if (isRecord(value)) {
    let output = '';
    for (const [key, nestedValue] of Object.entries(value)) {
      if (isRecord(nestedValue) || Array.isArray(nestedValue)) {
        output += `${spacing}${formatYamlKey(key)}:\n`;
        output += stringifyYamlFallbackValue(nestedValue, indent + 2);
        continue;
      }
      output += `${spacing}${formatYamlKey(key)}: ${formatYamlScalar(nestedValue)}\n`;
    }
    return output;
  }

  return `${spacing}${formatYamlScalar(value)}\n`;
}

function stringifyYamlFallback(data: Record<string, unknown>): string {
  assertSupportedYamlFallbackValue(data);
  return stringifyYamlFallbackValue(data, 0);
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
