// Tiny, safe markdown → HTML (escapes input first).
function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function inline(s: string) {
  return esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/\*(.+?)\*/g, "<em>$1</em>");
}
function tableCells(line: string): string[] {
  const cells = line.trim().split(/(?<!\\)\|/);
  if (cells[0] === "") cells.shift();
  if (cells.at(-1) === "") cells.pop();
  return cells.map((cell) => cell.trim().replace(/\\\|/g, "|"));
}

export function readMarkdownTable(lines: string[], start: number) {
  if (!lines[start]?.includes("|") || !lines[start + 1]?.includes("|")) return null;
  const headers = tableCells(lines[start]!);
  const divider = tableCells(lines[start + 1]!);
  if (headers.length < 2 || divider.length !== headers.length || !divider.every((cell) => /^:?-{3,}:?$/.test(cell))) return null;

  const rows: string[][] = [];
  let end = start + 2;
  for (; end < lines.length && lines[end]?.includes("|"); end++) {
    const row = tableCells(lines[end]!);
    if (row.length !== headers.length) break;
    rows.push(row);
  }
  return { headers, rows, end };
}

// Recover recognizable tables from older drafts and normalize new AI output.
export function normalizeMarkdownTables(markdown: string): string {
  const lines = markdown.split(/\r?\n/);
  const result: string[] = [];
  const dividerCell = /^:?-+:?$/;
  const bordered = (line: string) => /^\s*\|.*(?<!\\)\|\s*$/.test(line);
  const formatRow = (cells: string[]) => "| " + cells.map((cell) => cell.replace(/\|/g, "\\|")).join(" | ") + " |";

  for (let start = 0; start < lines.length;) {
    const opening = lines[start]!;
    const fence = opening.match(/^\s*(`{3,}|~{3,})\s*([\w-]*)\s*$/);
    let end = start;
    if (fence) {
      end++;
      const marker = fence[1]!;
      const closer = new RegExp("^\\s*" + marker[0] + "{" + marker.length + ",}\\s*$");
      while (end < lines.length && !closer.test(lines[end]!)) end++;
      if (end < lines.length && /^(?:markdown|md|table)?$/i.test(fence[2]!)) {
        const body = lines.slice(start + 1, end).join("\n").trim().split("\n");
        if (body.every((line) => line.includes("|"))) {
          const normalized = normalizeMarkdownTables(body.join("\n")).split("\n");
          const table = readMarkdownTable(normalized, 0);
          if (table?.end === normalized.length && table.rows.length) {
            result.push(...normalized);
            start = end + 1;
            continue;
          }
        }
      }
      result.push(...lines.slice(start, end + 1));
      start = end + 1;
      continue;
    }

    const quote = opening.match(/^\s*>\s*/);
    const getLine = (line: string) => quote ? line.replace(/^\s*>\s*/, "") : line;
    const header = getLine(opening);
    const headers = tableCells(header);
    if (!header.includes("|") || headers.length < 2 || headers.every((cell) => dividerCell.test(cell))) {
      result.push(opening);
      start++;
      continue;
    }

    const next = lines[start + 1] ?? "";
    const divider = tableCells(getLine(next));
    const hasDivider = (!quote || /^\s*>/.test(next))
      && divider.length === headers.length && divider.every((cell) => dividerCell.test(cell));
    end = start + (hasDivider ? 2 : 1);
    const rows: string[][] = [];
    for (; end < lines.length; end++) {
      const original = lines[end]!;
      if (quote && !/^\s*>/.test(original)) break;
      const line = getLine(original);
      if (!line.includes("|") || (!hasDivider && (!bordered(header) || !bordered(line)))) break;
      const row = tableCells(line);
      if (row.length > headers.length || (row.length !== headers.length && !bordered(line))) break;
      rows.push(headers.map((_, column) => row[column] ?? ""));
    }
    if (!rows.length) {
      result.push(opening);
      start++;
      continue;
    }
    if (quote) result.push("");
    result.push(formatRow(headers), formatRow(headers.map((_, i) => {
      const cell = hasDivider ? divider[i]! : "";
      return (cell.startsWith(":") ? ":" : "") + "---" + (cell.endsWith(":") ? ":" : "");
    })), ...rows.map(formatRow));
    if (quote) result.push("");
    start = end;
  }
  return result.join("\n");
}

export function mdToHtml(md: string): string {
  const lines = normalizeMarkdownTables(md).split("\n");
  let html = "";
  let list: "ul" | "ol" | null = null;
  const close = () => {
    if (list) html += `</${list}>`;
    list = null;
  };
  for (let index = 0; index < lines.length; index++) {
    const table = readMarkdownTable(lines, index);
    if (table) {
      close();
      const head = table.headers.map((cell) => '<th scope="col" class="border-b px-3 py-2 text-left">' + inline(cell) + '</th>').join("");
      const body = table.rows.map((row) => '<tr class="border-b even:bg-muted/40">' + row.map((cell) => '<td class="px-3 py-2 align-top">' + inline(cell) + '</td>').join("") + '</tr>').join("");
      html += '<div class="my-4 overflow-x-auto rounded-lg border"><table class="w-full border-collapse text-sm"><thead class="bg-muted"><tr>' + head + '</tr></thead><tbody>' + body + '</tbody></table></div>';
      index = table.end - 1;
      continue;
    }
    const l = lines[index]!.trim();
    if (!l) { close(); continue; }
    let m;
    if ((m = l.match(/^#{3,}\s+(.*)/))) { close(); html += `<h3>${inline(m[1] ?? "")}</h3>`; }
    else if ((m = l.match(/^#{1,2}\s+(.*)/))) { close(); html += `<h2>${inline(m[1] ?? "")}</h2>`; }
    else if ((m = l.match(/^[-*]\s+(.*)/))) { if (list !== "ul") { close(); html += "<ul>"; list = "ul"; } html += `<li>${inline(m[1] ?? "")}</li>`; }
    else if ((m = l.match(/^\d+[.)]\s+(.*)/))) { if (list !== "ol") { close(); html += "<ol>"; list = "ol"; } html += `<li>${inline(m[1] ?? "")}</li>`; }
    else { close(); html += `<p>${inline(l)}</p>`; }
  }
  close();
  return html;
}
