import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import css from "highlight.js/lib/languages/css";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import markdown from "highlight.js/lib/languages/markdown";
import powershell from "highlight.js/lib/languages/powershell";
import python from "highlight.js/lib/languages/python";
import sql from "highlight.js/lib/languages/sql";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";

const LANGUAGE_NAMES: Readonly<Record<string, string>> = {
  bash: "Bash",
  css: "CSS",
  html: "HTML",
  javascript: "JavaScript",
  js: "JavaScript",
  json: "JSON",
  markdown: "Markdown",
  md: "Markdown",
  powershell: "PowerShell",
  ps1: "PowerShell",
  python: "Python",
  py: "Python",
  shell: "Shell",
  sql: "SQL",
  ts: "TypeScript",
  typescript: "TypeScript",
  xml: "XML",
  yaml: "YAML",
  yml: "YAML",
};

hljs.registerLanguage("bash", bash);
hljs.registerLanguage("css", css);
hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("json", json);
hljs.registerLanguage("markdown", markdown);
hljs.registerLanguage("powershell", powershell);
hljs.registerLanguage("python", python);
hljs.registerLanguage("sql", sql);
hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("xml", xml);
hljs.registerLanguage("yaml", yaml);

const LANGUAGE_ALIASES: Readonly<Record<string, string>> = {
  html: "xml",
  js: "javascript",
  md: "markdown",
  ps1: "powershell",
  py: "python",
  shell: "bash",
  ts: "typescript",
  yml: "yaml",
};

function declaredLanguage(code: HTMLElement): string | null {
  for (const className of code.classList) {
    if (className.startsWith("language-") && className.length > 9) {
      return className.slice(9).toLocaleLowerCase();
    }
  }
  return null;
}

export function enhanceCodeBlocks(root: HTMLElement, copyCode: (code: string) => Promise<void>): void {
  for (const code of root.querySelectorAll<HTMLElement>("pre > code")) {
    const pre = code.parentElement;
    if (!(pre instanceof HTMLPreElement) || pre.parentElement?.classList.contains("code-block")) {
      continue;
    }
    const source = code.textContent ?? "";
    const declared = declaredLanguage(code);
    const registered = declared === null ? null : (LANGUAGE_ALIASES[declared] ?? declared);
    if (registered !== null && hljs.getLanguage(registered) !== undefined) {
      // highlight.js escapes source text and returns span-only markup for the selected grammar.
      code.innerHTML = hljs.highlight(source, { language: registered, ignoreIllegals: true }).value;
      code.classList.add("hljs");
    }

    const wrapper = document.createElement("div");
    wrapper.className = "code-block";
    const toolbar = document.createElement("div");
    toolbar.className = "code-toolbar";
    toolbar.dataset.chweziUi = "true";
    const label = document.createElement("span");
    label.textContent = declared === null ? "Code" : (LANGUAGE_NAMES[declared] ?? declared.toLocaleUpperCase());
    const button = document.createElement("button");
    button.type = "button";
    button.className = "copy-code-button";
    button.textContent = "Copy code";
    button.setAttribute("aria-label", `Copy ${label.textContent} block`);
    button.addEventListener("click", () => void copyCode(source));
    toolbar.append(label, button);
    pre.before(wrapper);
    wrapper.append(toolbar, pre);
  }
}
