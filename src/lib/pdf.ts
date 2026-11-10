type Ch = { title: string; content: string };

export async function exportPdf(p: { title: string; subtitle?: string | null; cover?: string | null }, chapters: Ch[]) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 60;

  // Cover
  if (p.cover) {
    try { doc.addImage(p.cover, "JPEG", 0, 0, W, H); } catch { /* ignore */ }
    doc.setFillColor(15, 15, 12);
    doc.rect(0, H - 220, W, 220, "F");
  } else {
    doc.setFillColor(20, 20, 16);
    doc.rect(0, 0, W, H, "F");
  }
  doc.setTextColor(214, 250, 90);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(30);
  doc.text(doc.splitTextToSize(p.title, W - M * 2), M, H - 160);
  if (p.subtitle) {
    doc.setTextColor(240, 238, 230);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(13);
    doc.text(doc.splitTextToSize(p.subtitle, W - M * 2), M, H - 80);
  }

  // Contents
  doc.addPage();
  doc.setTextColor(20, 20, 20);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text("Contents", M, M + 10);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  chapters.forEach((c, i) => doc.text(`${i + 1}.  ${c.title}`, M, M + 50 + i * 22));

  for (const [i, c] of chapters.entries()) {
    doc.addPage();
    let y = M;
    const ensure = (h: number) => { if (y + h > H - M) { doc.addPage(); y = M; } };
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(110, 140, 20);
    doc.text(`CHAPTER ${i + 1}`, M, y); y += 24;
    doc.setTextColor(20, 20, 20);
    doc.setFontSize(22);
    const t = doc.splitTextToSize(c.title, W - M * 2);
    doc.text(t, M, y); y += t.length * 26 + 10;

    for (const raw of c.content.split("\n")) {
      const l = raw.trim().replace(/\*\*(.+?)\*\*/g, "$1").replace(/\*(.+?)\*/g, "$1");
      if (!l) { y += 6; continue; }
      let size = 11, bold = false, text = l, indent = 0;
      if (/^#{1,2}\s/.test(l)) { size = 15; bold = true; text = l.replace(/^#+\s/, ""); y += 8; }
      else if (/^#{3,}\s/.test(l)) { size = 13; bold = true; text = l.replace(/^#+\s/, ""); y += 4; }
      else if (/^[-*]\s/.test(l)) { text = "•  " + l.slice(2); indent = 12; }
      doc.setFont("helvetica", bold ? "bold" : "normal");
      doc.setFontSize(size);
      const lines = doc.splitTextToSize(text, W - M * 2 - indent);
      for (const ln of lines) { ensure(size * 1.5); doc.text(ln, M + indent, y); y += size * 1.5; }
    }
  }
  doc.save(`${p.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.pdf`);
}
