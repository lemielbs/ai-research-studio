import { getTheme, type RGB } from "./themes";

type Ch = { title: string; content: string; image_url?: string | null };
type P = { title: string; subtitle?: string | null; cover?: string | null; promise?: string | null; theme?: string | null; audience?: string | null };

export async function exportPdf(p: P, chapters: Ch[]) {
  const { jsPDF } = await import("jspdf");
  const t = getTheme(p.theme);
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 56;
  const fill = (c: RGB) => doc.setFillColor(c[0], c[1], c[2]);
  const ink = (c: RGB) => doc.setTextColor(c[0], c[1], c[2]);
  const page = () => { doc.addPage(); fill(t.bg); doc.rect(0, 0, W, H, "F"); };
  const img = (src: string, x: number, y: number, w: number, h: number) => { try { doc.addImage(src, "JPEG", x, y, w, h); return true; } catch { return false; } };

  // Cover
  fill(t.coverBg); doc.rect(0, 0, W, H, "F");
  doc.setFont(t.heading, "bold");
  if (t.cover === "full") {
    if (p.cover) img(p.cover, 0, 0, W, H);
    fill(t.coverBg); doc.rect(0, H * 0.58, W, H * 0.42, "F");
    fill(t.accent); doc.rect(M, H * 0.58 + 36, 60, 6, "F");
    ink(t.coverInk); doc.setFontSize(40);
    const tl = doc.splitTextToSize(p.title.toUpperCase(), W - M * 2); doc.text(tl, M, H * 0.58 + 90);
    doc.setFont(t.body, "normal"); doc.setFontSize(14);
    if (p.subtitle) doc.text(doc.splitTextToSize(p.subtitle, W - M * 2), M, H * 0.58 + 100 + tl.length * 42);
  } else if (t.cover === "split") {
    if (p.cover) img(p.cover, W * 0.42, 0, W * 0.58, H); else { fill(t.accent); doc.rect(W * 0.42, 0, W * 0.58, H, "F"); }
    ink(t.coverInk); doc.setFontSize(30);
    const tl = doc.splitTextToSize(p.title, W * 0.42 - M - 16); doc.text(tl, M, 160);
    fill(t.accent); doc.rect(M, 175 + tl.length * 32, 40, 4, "F");
    doc.setFont(t.body, "normal"); doc.setFontSize(12);
    if (p.subtitle) doc.text(doc.splitTextToSize(p.subtitle, W * 0.42 - M - 16), M, 205 + tl.length * 32);
  } else {
    if (p.cover) img(p.cover, 0, 0, W, H * 0.65);
    fill(t.coverBg); doc.rect(0, H * 0.65, W, H * 0.35, "F");
    fill(t.accent); doc.rect(0, H * 0.65, W, 8, "F");
    ink(t.coverInk); doc.setFontSize(32);
    const tl = doc.splitTextToSize(p.title, W - M * 2); doc.text(tl, M, H * 0.65 + 70);
    doc.setFont(t.body, "normal"); doc.setFontSize(13);
    if (p.subtitle) doc.text(doc.splitTextToSize(p.subtitle, W - M * 2), M, H * 0.65 + 80 + tl.length * 34);
  }

  // Promise page
  if (p.promise) {
    page();
    fill(t.soft); doc.rect(0, 0, W, H, "F");
    ink(t.accent); doc.setFont(t.heading, "bold"); doc.setFontSize(12); doc.text("THE PROMISE", M, 180);
    ink(t.ink); doc.setFont(t.heading, "bold"); doc.setFontSize(24);
    doc.text(doc.splitTextToSize(p.promise, W - M * 2), M, 220, { lineHeightFactor: 1.35 });
  }

  // Contents
  page();
  ink(t.accent); doc.setFont(t.heading, "bold"); doc.setFontSize(12); doc.text("CONTENTS", M, M + 20);
  doc.setFontSize(26); ink(t.ink); doc.text("Inside this guide", M, M + 56);
  chapters.forEach((c, i) => {
    const y = M + 110 + i * 40;
    ink(t.accent); doc.setFont(t.heading, "bold"); doc.setFontSize(18); doc.text(String(i + 1).padStart(2, "0"), M, y);
    ink(t.ink); doc.setFont(t.body, "normal"); doc.setFontSize(13); doc.text(doc.splitTextToSize(c.title, W - M * 2 - 50)[0], M + 44, y);
    doc.setDrawColor(t.soft[0], t.soft[1], t.soft[2]); doc.line(M, y + 14, W - M, y + 14);
  });

  for (const [i, c] of chapters.entries()) {
    // Opener
    page();
    let y: number;
    if (c.image_url && img(c.image_url, 0, 0, W, H * 0.45)) {
      fill(t.accent); doc.rect(M, H * 0.45 - 28, 70, 56, "F");
      ink(t.bg); doc.setFont(t.heading, "bold"); doc.setFontSize(28); doc.text(String(i + 1).padStart(2, "0"), M + 35, H * 0.45 + 10, { align: "center" });
      y = H * 0.45 + 70;
    } else {
      fill(t.accent); doc.rect(0, 0, 10, H, "F");
      ink(t.accent); doc.setFont(t.heading, "bold"); doc.setFontSize(72); doc.text(String(i + 1).padStart(2, "0"), M, 150);
      y = 200;
    }
    ink(t.accent); doc.setFont(t.heading, "bold"); doc.setFontSize(10); doc.text(`CHAPTER ${i + 1}`, M, y); y += 28;
    ink(t.ink); doc.setFontSize(26);
    const tl = doc.splitTextToSize(c.title, W - M * 2); doc.text(tl, M, y); y += tl.length * 30 + 16;

    const ensure = (h: number) => { if (y + h > H - M) { page(); y = M + 20; } };
    for (const raw of c.content.split("\n")) {
      const l = raw.trim().replace(/\*\*(.+?)\*\*/g, "$1").replace(/\*(.+?)\*/g, "$1");
      if (!l) { y += 6; continue; }
      const callout = l.match(/^>\s*(Tip|Action|Note)?:?\s*(.*)$/i);
      if (callout) {
        const label = (callout[1] || "Note").toUpperCase();
        doc.setFont(t.body, "normal"); doc.setFontSize(11);
        const lines = doc.splitTextToSize(callout[2] ?? "", W - M * 2 - 36);
        const h = lines.length * 16 + 38;
        ensure(h + 10);
        fill(t.soft); doc.roundedRect(M, y, W - M * 2, h, 6, 6, "F");
        fill(t.accent); doc.rect(M, y, 4, h, "F");
        ink(t.accent); doc.setFont(t.heading, "bold"); doc.setFontSize(9); doc.text(label, M + 18, y + 18);
        ink(t.ink); doc.setFont(t.body, "normal"); doc.setFontSize(11); doc.text(lines, M + 18, y + 34);
        y += h + 14; continue;
      }
      const check = l.match(/^[-*]\s*\[( |x)\]\s*(.*)$/i);
      if (check) {
        doc.setFont(t.body, "normal"); doc.setFontSize(11);
        const lines = doc.splitTextToSize(check[2] ?? "", W - M * 2 - 26);
        ensure(lines.length * 16 + 6);
        doc.setDrawColor(t.accent[0], t.accent[1], t.accent[2]); doc.setLineWidth(1.2); doc.rect(M, y - 10, 12, 12);
        ink(t.ink); doc.text(lines, M + 22, y); y += lines.length * 16 + 6; continue;
      }
      let size = 11, bold = false, text = l, indent = 0, color = t.ink, font = t.body;
      if (/^#{1,2}\s/.test(l)) { size = 16; bold = true; text = l.replace(/^#+\s/, ""); y += 12; color = t.accent; font = t.heading; }
      else if (/^#{3,}\s/.test(l)) { size = 13; bold = true; text = l.replace(/^#+\s/, ""); y += 6; font = t.heading; }
      else if (/^[-*]\s/.test(l)) { text = "•  " + l.slice(2); indent = 12; }
      else if (/^\d+\.\s/.test(l)) { indent = 6; }
      doc.setFont(font, bold ? "bold" : "normal"); doc.setFontSize(size); ink(color);
      const lines = doc.splitTextToSize(text, W - M * 2 - indent);
      for (const ln of lines) { ensure(size * 1.55); doc.text(ln, M + indent, y); y += size * 1.55; }
    }
  }

  // Next steps
  page();
  fill(t.coverBg); doc.rect(0, 0, W, H, "F");
  ink(t.coverInk); doc.setFont(t.heading, "bold"); doc.setFontSize(32); doc.text("Your next steps", M, 200);
  doc.setFont(t.body, "normal"); doc.setFontSize(13);
  ["Pick one action from Chapter 1 and do it today.", "Work through one chapter at a time — small wins compound.", "Come back to the checklists and tick them off as you go.", "Revisit this guide in a week and measure how far you've come."]
    .forEach((s, i) => doc.text(`${i + 1}.  ${s}`, M, 250 + i * 30));

  // Page numbers + running header (skip cover and last page)
  const n = doc.getNumberOfPages();
  for (let i = 2; i < n; i++) {
    doc.setPage(i);
    doc.setFont(t.body, "normal"); doc.setFontSize(9); ink(t.accent);
    doc.text(String(i), W - M, H - 28, { align: "right" });
    doc.text(p.title.slice(0, 70), M, H - 28);
  }
  doc.save(`${p.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.pdf`);
}
