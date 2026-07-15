export interface FrontMatterField {
  readonly name: string;
  readonly value: string;
}

export interface FrontMatterDocument {
  readonly body: string;
  readonly fields: readonly FrontMatterField[];
}

const MAX_FRONT_MATTER_BYTES = 64 * 1024;
const MAX_FRONT_MATTER_FIELDS = 100;

function stripMatchingQuotes(value: string): string {
  if (value.length < 2) return value;
  const first = value[0];
  const last = value[value.length - 1];
  return (first === last && (first === '"' || first === "'")) ? value.slice(1, -1) : value;
}

/**
 * Extracts the common scalar subset of YAML front matter without executing tags,
 * resolving aliases, or adding a general YAML parser to the reader.
 * Unsupported YAML is left in the Markdown source unchanged.
 */
export function extractFrontMatter(markdown: string): FrontMatterDocument {
  const opening = /^(?:\uFEFF)?---[ \t]*(?:\r?\n)/u.exec(markdown);
  if (opening === null) return { body: markdown, fields: [] };

  const contentStart = opening[0].length;
  const closingPattern = /^(?:---|\.\.\.)[ \t]*$/u;
  const fields: FrontMatterField[] = [];
  const encoder = new TextEncoder();
  let consumedCharacters = contentStart;
  let consumedBytes = encoder.encode(opening[0]).byteLength;
  let foundClosingDelimiter = false;

  for (const match of markdown.slice(contentStart).matchAll(/([^\r\n]*)(?:\r\n|\n|$)/gu)) {
    const line = match[1] ?? "";
    consumedCharacters += match[0].length;
    consumedBytes += encoder.encode(match[0]).byteLength;
    if (consumedBytes > MAX_FRONT_MATTER_BYTES) {
      return { body: markdown, fields: [] };
    }
    if (closingPattern.test(line)) {
      foundClosingDelimiter = true;
      break;
    }
    if (fields.length >= MAX_FRONT_MATTER_FIELDS) {
      return { body: markdown, fields: [] };
    }
    if (/^[ \t]*(?:#.*)?$/u.test(line)) continue;
    const field = /^([\p{Letter}\p{Number}_][\p{Letter}\p{Number}_. -]{0,79}):[ \t]*(.*)$/u.exec(line);
    if (field === null) return { body: markdown, fields: [] };
    const name = field[1]?.trim();
    const value = field[2]?.trim();
    if (name === undefined || name === "" || value === undefined) return { body: markdown, fields: [] };
    fields.push({ name, value: stripMatchingQuotes(value) });
  }

  if (!foundClosingDelimiter || fields.length === 0) return { body: markdown, fields: [] };
  return { body: markdown.slice(consumedCharacters), fields };
}
