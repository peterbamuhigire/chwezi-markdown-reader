export interface SearchOptions {
  readonly matchCase: boolean;
  readonly wholeWord: boolean;
}

export interface TextMatch {
  readonly start: number;
  readonly end: number;
}

const WORD_CHARACTER = /[\p{Letter}\p{Number}\p{Mark}_]/u;

function escapeRegularExpression(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isWordCharacter(value: string | undefined): boolean {
  return value !== undefined && WORD_CHARACTER.test(value);
}

function codePointBefore(value: string, index: number): string | undefined {
  return Array.from(value.slice(0, index)).at(-1);
}

function codePointAt(value: string, index: number): string | undefined {
  return Array.from(value.slice(index))[0];
}

export function findTextMatches(text: string, query: string, options: SearchOptions): TextMatch[] {
  if (query === "") {
    return [];
  }
  const expression = new RegExp(escapeRegularExpression(query), options.matchCase ? "gu" : "giu");
  const matches: TextMatch[] = [];
  for (const match of text.matchAll(expression)) {
    const start = match.index;
    const value = match[0];
    if (start === undefined || value === undefined || value.length === 0) {
      continue;
    }
    const end = start + value.length;
    if (options.wholeWord && (isWordCharacter(codePointBefore(text, start)) || isWordCharacter(codePointAt(text, end)))) {
      continue;
    }
    matches.push({ start, end });
  }
  return matches;
}

export function isRelativeMarkdownHref(href: string): boolean {
  const value = href.trim();
  if (value === "" || value.startsWith("#") || /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(value)) {
    return false;
  }
  const path = value.split(/[?#]/u, 1)[0] ?? "";
  return /\.(?:md|markdown|mdown|mkd)$/iu.test(path);
}
