// Tiny, safe markdown → HTML (escapes input first).
function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function inline(s: string) {
  return esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/\*(.+?)\*/g, "<em>$1</em>");
}
export function mdToHtml(md: string): string {
  const lines = md.split("\n");
  let html = "";
  let list: "ul" | "ol" | null = null;
  const close = () => {
    if (list) html += `</${list}>`;
    list = null;
  };
  for (const raw of lines) {
    const l = raw.trim();
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
