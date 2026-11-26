import type { jsPDF } from "jspdf";
import { getTheme, rgb, type RGB, type Theme } from "./themes";
import { normalizeMarkdownTables, readMarkdownTable } from "./markdown";

type Ch = { title: string; content: string; image_url?: string | null };
type Source = { title: string; url: string };
type P = { title: string; subtitle?: string | null; cover?: string | null; promise?: string | null; theme?: string | null; customStyle?: Theme | undefined; audience?: string | null; coverByline?: string | undefined; coverLayout?: Theme["cover"] | undefined; completeCover?: boolean; sources?: Source[] | undefined; productType?: string | null };

type CoverFont = Theme["heading"];
type CoverRect = [x: number, y: number, width: number, height: number];
type CoverText = { lines: string[]; font: CoverFont; weight: "normal" | "bold"; size: number; spacing: number; height: number };
type CoverSurface = {
  fill: (color: RGB, rect: CoverRect) => void;
  artwork: (rect: CoverRect, fit?: "contain") => void;
  text: (color: RGB, text: CoverText, x: number, y: number) => void;
};

function drawCover(p: P, doc: jsPDF, surface: CoverSurface) {
  const theme = p.customStyle ?? getTheme(p.theme);
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  if (p.completeCover && p.cover) {
    const page: CoverRect = [0, 0, w, h];
    surface.fill(theme.coverBg, page);
    surface.artwork(page, "contain");
    return;
  }
  const margin = 50;
  const layout = p.coverLayout ?? theme.cover;
  const split = layout === "split";
  const imageFirst = layout === "full";
  const innerWidth = w - 2 * margin;
  const gutter = 24;
  const sideWidth = innerWidth * 0.46;
  const textWidth = split && p.cover ? innerWidth - sideWidth - gutter : innerWidth;
  const footerY = h - margin;
  const byline = p.coverByline?.trim();
  const artBottom = footerY - (byline ? 66 : 10);
  const leadHeight = h * 0.41;
  const textTop = !p.cover ? h * (imageFirst ? 0.33 : split ? 0.29 : 0.24)
    : imageFirst ? margin + leadHeight + 44 : split ? h * 0.19 : 79;

  surface.fill(theme.coverBg, [0, 0, w, h]);
  if (!p.cover && split) surface.fill(theme.accent, [w - 14, 0, 14, h]);
  if (!p.cover && imageFirst) surface.fill(theme.soft, [0, 0, w, h * 0.2]);
  surface.fill(theme.accent, [margin, textTop - 25, 42, 3]);

  const fitText = (
    text: string,
    font: CoverFont,
    weight: CoverText["weight"],
    start: number,
    height: number,
    spacing: number,
    wrap: (value: string) => string[] = (value) => doc.splitTextToSize(value, textWidth),
  ): CoverText => {
    doc.setFont(font, weight);
    let size = start;
    doc.setFontSize(size);
    let wrapped = wrap(text);
    while (wrapped.length * size * spacing > height && size > 1) {
      doc.setFontSize(--size);
      wrapped = wrap(text);
    }
    return { lines: wrapped, font, weight, size, spacing, height: wrapped.length * size * spacing };
  };

  const wrapTitle = (value: string): string[] => {
    // Keep a number and its time unit together when the headline wraps.
    const protectedText = value.replace(/(\d+)[ \t]+(days?|weeks?|months?|years?|hours?|minutes?)\b/gi, "$1\u00a0$2");
    const wrapped: string[] = doc.splitTextToSize(protectedText, textWidth);
    const last = wrapped.at(-1);
    const previous = wrapped.at(-2);
    if (last && previous && doc.getTextWidth(last) < textWidth * 0.27) {
      const space = previous.lastIndexOf(" ");
      if (space > 0) {
        const balanced = previous.slice(space + 1) + " " + last;
        if (doc.getTextWidth(balanced) <= textWidth) {
          wrapped.splice(-2, 2, previous.slice(0, space), balanced);
        }
      }
    }
    return wrapped.map((line) => line.replace(/\u00a0/g, " "));
  };

  const subtitle = p.subtitle?.trim();
  const subtitleFit = subtitle ? fitText(subtitle, theme.body, "normal", 17, 82, 1.28) : null;
  const copyHeight = !p.cover ? 324 : layout === "band" ? 217 : artBottom - textTop;
  const titleSize = !p.cover ? 70 : split ? 47 : imageFirst ? 57 : 62;
  const titleFit = fitText(
    p.title.trim(), theme.heading, "bold", titleSize,
    copyHeight - (subtitleFit ? subtitleFit.height + 16 : 0), 1.02, wrapTitle,
  );
  const subtitleTop = textTop + titleFit.height + 16;

  if (p.cover) {
    let frame: CoverRect;
    if (imageFirst) {
      frame = [margin, margin, innerWidth, leadHeight];
    } else if (split) {
      frame = [margin + textWidth + gutter, margin, sideWidth, artBottom - margin];
    } else {
      const top = (subtitleFit ? subtitleTop + subtitleFit.height : textTop + titleFit.height) + 27;
      frame = [margin, top, innerWidth, Math.min(h * 0.42, artBottom - top)];
    }
    surface.fill(theme.soft, frame);
    surface.artwork(frame);
  }
  surface.text(theme.coverInk, titleFit, margin, textTop);
  if (subtitleFit) surface.text(theme.coverInk, subtitleFit, margin, subtitleTop);

  if (byline) {
    const fitted = fitText(byline, theme.body, "bold", 12, 30, 1.2);
    const y = footerY - fitted.height;
    surface.fill(theme.accent, [margin, y - 16, innerWidth, 0.75]);
    surface.text(theme.coverInk, fitted, margin, y);
  }
}

function artworkBounds([x, y, width, height]: CoverRect, imageWidth: number, imageHeight: number, fit?: "contain"): CoverRect {
  const scale = (fit === "contain" ? Math.min : Math.max)(width / imageWidth, height / imageHeight);
  const w = imageWidth * scale;
  const h = imageHeight * scale;
  return [x + (width - w) / 2, y + (height - h) / 2, w, h];
}

async function createCoverDocument() {
  const { jsPDF } = await import("jspdf");
  return new jsPDF({ unit: "pt", format: "a4" });
}

export async function buildCoverPdf(p: P) {
  const doc = await createCoverDocument();
  drawCover(p, doc, {
    fill(color, rect) {
      doc.setFillColor(...color);
      doc.rect(...rect, "F");
    },
    artwork(rect, fit) {
      if (!p.cover) return;
      doc.saveGraphicsState();
      try {
        const size = doc.getImageProperties(p.cover);
        // Keep the frame path open until jsPDF applies the clip.
        doc.rect(...rect, null).clip().discardPath();
        doc.addImage(p.cover, "JPEG", ...artworkBounds(rect, size.width, size.height, fit));
      } catch {
        // Keep the themed background if a previously saved image is invalid.
      } finally {
        doc.restoreGraphicsState();
      }
    },
    text(color, text, x, y) {
      doc.setFont(text.font, text.weight);
      doc.setFontSize(text.size);
      doc.setTextColor(...color);
      doc.text(text.lines, x, y, { baseline: "top", lineHeightFactor: text.spacing });
    },
  });
  return doc;
}

const CANVAS_COVER_FONTS: Record<CoverFont, string> = {
  helvetica: "Arial, sans-serif",
  times: '"Times New Roman", serif',
  courier: '"Courier New", monospace',
};

export async function buildCoverPng(p: P, pixelWidth = 1600): Promise<Blob> {
  const doc = await createCoverDocument();
  const canvas = document.createElement("canvas");
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  canvas.width = pixelWidth;
  canvas.height = Math.round(pixelWidth * height / width);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser couldn't export the cover PNG.");
  context.scale(canvas.width / width, canvas.height / height);
  context.imageSmoothingQuality = "high";

  let image: HTMLImageElement | undefined;
  if (p.cover) {
    const artwork = new Image();
    artwork.src = p.cover;
    try {
      await artwork.decode();
      image = artwork;
    } catch {
      // Keep the themed background when artwork cannot be decoded.
    }
  }

  drawCover(p, doc, {
    fill(color, rect) {
      context.fillStyle = rgb(color);
      context.fillRect(...rect);
    },
    artwork(rect, fit) {
      if (!image) return;
      context.save();
      try {
        context.beginPath();
        context.rect(...rect);
        context.clip();
        context.drawImage(image, ...artworkBounds(rect, image.naturalWidth, image.naturalHeight, fit));
      } finally {
        context.restore();
      }
    },
    text(color, text, x, y) {
      context.fillStyle = rgb(color);
      context.font = text.weight + " " + text.size + "px " + CANVAS_COVER_FONTS[text.font];
      context.textBaseline = "alphabetic";
      for (const [index, line] of text.lines.entries()) {
        // Match the baseline offset used by jsPDF's top alignment.
        const baseline = y + text.size * (0.8 + index * text.spacing);
        context.fillText(line, x, baseline);
      }
    },
  });
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("The cover PNG couldn't be created."));
    }, "image/png");
  });
}

export async function downloadCoverPng(book: P) {
  const png = await buildCoverPng(book);
  const url = URL.createObjectURL(png);
  const link = document.createElement("a");
  try {
    link.href = url;
    const slug = book.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    link.download = (slug || "synthforge") + "-cover.png";
    document.body.append(link);
    link.click();
  } finally {
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}

function referenceUrl(value: string) {
  try {
    const url = new URL(value);
    return /^https?:$/.test(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

function referenceLine(line: string) {
  const match = line.match(/^\s*[-*]\s+\[([^\]]+)\]\((https?:\/\/\S+)\)\s*$/i);
  const url = match && referenceUrl(match[2]!);
  return match && url ? { title: match[1]!, url } : null;
}

const worksheetHeading = /^(?:>\s*)?(?:#+\s*)+Worksheet\s*:\s*(\S.*)$/i;
const responseBlank = /^(?:_{2,}|\.{4,})$/;
const stripResponseBlank = (label: string) => label.replace(/\s*(?:_{2,}|\.{4,})\s*$/, "").trim();

function normalizeWorksheetLines(lines: string[]): string[] {
  const output: string[] = [];
  let inWorksheet = false;
  for (let index = 0; index < lines.length; index++) {
    const original = lines[index]!;
    const text = original.trim().replace(/\*\*(.+?)\*\*/g, "$1");
    const heading = text.match(worksheetHeading);
    if (heading) {
      output.push("## Worksheet: " + heading[1]!);
      inWorksheet = true;
      continue;
    }
    if (/^#{1,2}\s/.test(text) && !/^#{1,2}\s+(?:Instructions?|Fields|Required inputs)\b/i.test(text)) {
      inWorksheet = false;
    }

    const field = text.match(/^>\s*Field:\s*(.*)$/i);
    if (field && (!field[1] || responseBlank.test(field[1]))) {
      let next = index + 1;
      while (next < lines.length && /^\s*>?\s*$/.test(lines[next]!)) next++;
      const numberedBlank = /^\s*>?\s*(\d+)[.)]\s*(?:_{2,}|\.{4,})\s*$/;
      let numbered = lines[next]?.match(numberedBlank);
      if (numbered) {
        while (numbered) {
          output.push("> Field: Response " + numbered[1]!);
          index = next++;
          while (next < lines.length && /^\s*>?\s*$/.test(lines[next]!)) next++;
          numbered = lines[next]?.match(numberedBlank);
        }
        continue;
      }
      let preceding = output.length - 1;
      while (preceding >= 0 && !output[preceding]!.trim()) preceding--;
      const label = output[preceding]?.trim().replace(/\*\*(.+?)\*\*/g, "$1")
        .match(/^(?:[-*+]\s+|\d+[.)]\s+)([^\[|].{0,160}[?:])$/);
      if (inWorksheet && label) {
        output.length = preceding;
        output.push("> Field: " + label[1]!);
      } else if (field[1]) {
        output.push("> Field: Your answer");
      }
      continue;
    }

    const legacyLabel = inWorksheet && text.match(/^>\s*[-*+]\s+(.{1,160}:)\s*(?:_{2,}|\.{4,})$/);
    output.push(legacyLabel ? "> Field: " + legacyLabel[1]! : original);
  }
  return output;
}

export async function buildPdf(
  p: P,
  chapters: Ch[],
  onChapterPage?: (index: number, pageNumber: number) => void,
  { interactive = true, linkContents = true, onSamplePage }: {
    interactive?: boolean;
    linkContents?: boolean;
    onSamplePage?: (kind: "worksheet" | "example" | "example-table", page: number) => void;
  } = {},
) {
  const t = p.customStyle ?? getTheme(p.theme);
  const doc = await buildCoverPdf(p);
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 49;
  const contentBottom = H - 55;
  const innerWidth = W - M * 2;
  const fill = (c: RGB) => doc.setFillColor(...c);
  const ink = (c: RGB) => doc.setTextColor(...c);
  const tint = (color: RGB, strength: number): RGB => [
    Math.round(t.bg[0] + (color[0] - t.bg[0]) * strength),
    Math.round(t.bg[1] + (color[1] - t.bg[1]) * strength),
    Math.round(t.bg[2] + (color[2] - t.bg[2]) * strength),
  ];
  const rule = tint(t.ink, 0.25);
  const workbook = p.productType === "workbook";
  const panel = tint(t.soft, workbook ? 0.72 : 0.55);
  const forms = interactive ? await import("jspdf") : undefined;
  let fieldNumber = 0;
  const fieldName = (label: string) => {
    const readableLabel = label.replace(/[^a-z\d -]/gi, " ").replace(/\s+/g, " ").trim().slice(0, 100);
    return "Response " + (++fieldNumber) + (readableLabel ? " - " + readableLabel : "");
  };
  const addTextField = (label: string, [x, top, width, height]: [number, number, number, number], fontSize = 11, multiline = false) => {
    if (!forms) return;
    const response = new forms.AcroFormTextField();
    response.fieldName = fieldName(label);
    response.x = x;
    response.y = top;
    response.width = width;
    response.height = height;
    response.fontSize = fontSize;
    response.multiline = multiline;
    response.doNotScroll = true;
    response.showWhenPrinted = true;
    doc.addField(response);
  };
  let y = M;
  let worksheet = "";
  const breakPage = () => {
    doc.addPage(); fill(t.bg); doc.rect(0, 0, W, H, "F"); y = M;
    if (worksheet) {
      const previousFont = doc.getFont();
      const previousSize = doc.getFontSize();
      doc.setFont(t.body, "bold"); doc.setFontSize(10);
      const lines: string[] = doc.splitTextToSize(worksheet + " (continued)", innerWidth);
      ink(t.ink); doc.text(lines, M, y, { lineHeightFactor: 1.3 });
      y += lines.length * 13 + 12;
      doc.setFont(previousFont.fontName, previousFont.fontStyle); doc.setFontSize(previousSize);
    }
  };
  const ensure = (height: number) => { if (y + height > contentBottom) breakPage(); };
  const tableLeading = 13;
  const tableRowHeight = (lines: number, writable = false) => Math.max(lines * tableLeading + 14, writable ? 36 : 0);
  const measureTable = (table: NonNullable<ReturnType<typeof readMarkdownTable>>) => {
    const width = innerWidth / table.headers.length;
    const padding = Math.min(8, width / 6);
    const wrap = (cells: string[], header: boolean) => {
      doc.setFont(t.body, header ? "bold" : "normal");
      doc.setFontSize(10);
      const columns: string[][] = cells.map((cell) =>
        doc.splitTextToSize(cell.replace(/\*{1,2}([^*]+)\*{1,2}/g, "$1"), width - padding * 2),
      );
      const lines = header ? columns.map((column) => column.slice(0, 8)) : columns;
      return { lines, count: Math.max(1, ...lines.map((column) => column.length)) };
    };
    const header = wrap(table.headers, true);
    const rows = table.rows.map((row) => {
      const blankCells = row.map((cell) => !cell.trim() || responseBlank.test(cell.trim()));
      const writable = blankCells.every(Boolean) || (Boolean(worksheet) && blankCells.some(Boolean));
      const inputColumns = writable && (worksheet || workbook)
        ? blankCells.flatMap((blank, column) => blank ? [column] : [])
        : [];
      return { ...wrap(writable ? row.map((cell, i) => blankCells[i] ? "" : cell) : row, false), writable, inputColumns };
    });
    const height = rows.reduce((sum, row) => sum + tableRowHeight(row.count, row.writable), tableRowHeight(header.count));
    const startHeight = tableRowHeight(header.count) + (rows[0] ? tableRowHeight(1, rows[0].writable) : 0);
    return { width, padding, header, rows, height, startHeight };
  };
  const readChapterImage = (src?: string | null) => {
    if (!src) return null;
    try {
      const { width, height } = doc.getImageProperties(src);
      return width > 0 && height > 0 ? { src, width, height } : null;
    } catch {
      return null;
    }
  };

  const chapterTitle = (title: string) => title.replace(/^chapter\s+\d+\s*[:.\-??]\s*/i, "").trim() || title;

  const drawReference = (source: Source) => {
    doc.setFont(t.body, "normal"); doc.setFontSize(11.5);
    const rows: string[] = doc.splitTextToSize(source.title.trim() || source.url, innerWidth - 20);
    for (const row of rows) {
      ensure(17);
      ink(t.ink);
      doc.textWithLink(row, M + 16, y, { url: source.url });
      y += 17;
    }
    y += 5;
  };
  const listedSources = new Set<string>();

  const contentsRows: { page: number; y: number; height: number }[] = [];
  const startContents = () => {
    breakPage();
    fill(t.accent); doc.rect(M, y, 42, 3, "F");
    ink(t.ink); doc.setFont(t.heading, "bold"); doc.setFontSize(30);
    doc.text("Contents", M, y + 43);
    y += 70;
  };
  startContents();
  for (const [index, chapter] of chapters.entries()) {
    doc.setFont(t.body, "normal"); doc.setFontSize(12);
    const lines: string[] = doc.splitTextToSize(chapterTitle(chapter.title), innerWidth - 82);
    const height = Math.max(34, lines.length * 16 + 13);
    if (y + height > contentBottom) startContents();
    contentsRows.push({ page: doc.getNumberOfPages(), y, height });
    ink(t.ink); doc.setFont(t.body, "bold"); doc.setFontSize(10);
    doc.text(String(index + 1).padStart(2, "0"), M, y + 15);
    doc.setFont(t.body, "normal"); doc.setFontSize(12);
    doc.text(lines, M + 34, y + 15, { lineHeightFactor: 16 / 12 });
    doc.setDrawColor(...rule); doc.setLineWidth(0.4);
    doc.line(M, y + height - 1, W - M, y + height - 1);
    y += height;
  }

  const quoteDirective = /^>\s*(?:Example|Allocation|Timeline|Field|Tip|Try this|Action|Note|Instructions?|Checkpoint):/i;
  const checklistItem = /^(?:>\s*)?[-*+]\s+\[( |x)\]\s+(\S.*)$/i;
  const quoteText = (line: string) => line.trim().replace(/^(?:>\s*)+/, "")
    .replace(/\*\*(.+?)\*\*/g, "$1").replace(/\*(.+?)\*/g, "$1");

  const destinations: { page: number; top: number }[] = [];
  for (const [i, c] of chapters.entries()) {
    worksheet = "";
    const image = readChapterImage(c.image_url);
    const imageWidth = 192;
    const imageHeight = 128;
    const padding = 15;
    const titleWidth = innerWidth - padding * 2 - (image ? imageWidth + padding : 0);
    doc.setFont(t.heading, "bold"); doc.setFontSize(28);
    const titleLines: string[] = doc.splitTextToSize(chapterTitle(c.title), titleWidth);
    const textHeight = 44 + titleLines.length * 32;
    const headerHeight = image ? Math.max(textHeight, imageHeight + padding * 2) : textHeight;
    if (i === 0) breakPage();
    else ensure(headerHeight + 84);
    const chapterPage = doc.getNumberOfPages();
    destinations.push({ page: chapterPage, top: y });
    onChapterPage?.(i, chapterPage);

    fill(panel); doc.roundedRect(M, y, innerWidth, headerHeight, 5, 5, "F");
    fill(t.accent); doc.rect(M, y, 4, headerHeight, "F");
    ink(t.ink); doc.setFont(t.body, "bold"); doc.setFontSize(9);
    doc.text("CHAPTER " + (i + 1), M + 15, y + 20);
    doc.setFont(t.heading, "bold"); doc.setFontSize(28);
    doc.text(titleLines, M + padding, y + 48, { lineHeightFactor: 32 / 28 });
    if (image) {
      const frame: CoverRect = [W - M - padding - imageWidth, y + (headerHeight - imageHeight) / 2, imageWidth, imageHeight];
      doc.addImage(image.src, "JPEG", ...artworkBounds(frame, image.width, image.height, "contain"));
    }
    y += headerHeight + 15;
    const source = normalizeWorksheetLines(normalizeMarkdownTables(c.content).trim().split("\n"));
    let splitTableAt = -1;
    let lastWorksheet = -1;
    if (i === chapters.length - 1) {
      for (let position = source.length - 1; position >= 0; position--) {
        if (!worksheetHeading.test(source[position]!.trim())) continue;
        lastWorksheet = position;
        break;
      }
    }
    const opening = source[0]?.trim().match(/^#{1,3}\s+(.+)$/)?.[1]?.trim().toLowerCase();
    const title = chapterTitle(c.title).toLowerCase();
    const repeatedHeading = opening === title || opening === title.replace(/^(?:introduction|conclusion):\s*/, "");
    const readQuoteBody = (start: number) => {
      const body = [];
      let end = start + 1;
      while (end < source.length) {
        const next = source[end]!.trim();
        if (!next.startsWith(">") || quoteDirective.test(next) || checklistItem.test(next)
          || (worksheet && /^>\s*[-*]?\s*\S.*(?:_{2,}|\.{4,})$/.test(next))) break;
        const line = quoteText(next);
        if (line) body.push(line);
        end++;
      }
      return { body, end };
    };

    for (let index = repeatedHeading ? 1 : 0; index < source.length; index++) {
      const reference = referenceLine(source[index]!);
      if (reference) {
        drawReference(reference);
        listedSources.add(reference.url);
        continue;
      }
      const table = readMarkdownTable(source, index);
      if (table) {
        const { width, padding, header, rows, height, startHeight } = measureTable(table);
        const grid = rows.some((row) => row.writable);
        const drawRow = (cells: string[][], lineCount: number, header: boolean, shaded = false, writable = false) => {
          const height = tableRowHeight(lineCount, writable);
          fill(header || (shaded && !grid) ? t.soft : t.bg);
          doc.rect(M, y, W - M * 2, height, "F");
          if (grid) {
            doc.setDrawColor(...rule); doc.setLineWidth(0.5);
            doc.rect(M, y, innerWidth, height, "S");
            for (let column = 1; column < cells.length; column++) {
              doc.line(M + column * width, y, M + column * width, y + height);
            }
          } else {
            doc.setDrawColor(...t.accent); doc.setLineWidth(header ? 0.8 : 0.2);
            doc.line(M, y + height, W - M, y + height);
          }
          doc.setFont(t.body, header ? "bold" : "normal");
          doc.setFontSize(10);
          ink(t.ink);
          cells.forEach((lines, column) => {
            if (lines.length) doc.text(lines, M + column * width + padding, y + 15, { lineHeightFactor: tableLeading / 10 });
          });
          y += height;
        };
        ensure(height <= contentBottom - M && index !== splitTableAt ? height : startHeight);
        drawRow(header.lines, header.count, true);
        for (const [rowIndex, { lines: cells, count: totalLines, writable, inputColumns }] of rows.entries()) {
          let offset = 0;
          while (offset < totalLines) {
            let available = Math.floor((contentBottom - y - 14) / tableLeading);
            if (available < 1 || (writable && y + tableRowHeight(1, true) > contentBottom)) {
              breakPage();
              drawRow(header.lines, header.count, true);
              available = Math.floor((contentBottom - y - 14) / tableLeading);
            }
            const count = Math.min(available, totalLines - offset);
            const rowTop = y;
            drawRow(cells.map((lines) => lines.slice(offset, offset + count)), count, false, rowIndex % 2 === 0, writable);
            if (offset === 0) {
              const inset = Math.min(4, width / 8);
              for (const column of inputColumns) {
                const label = table.headers[column]!.trim() || "Column " + (column + 1);
                addTextField("Row " + (rowIndex + 1) + " - " + label,
                  [M + column * width + inset, rowTop + inset, width - inset * 2, y - rowTop - inset * 2],
                  10, true);
              }
            }
            offset += count;
          }
        }
        y += 14;
        index = table.end - 1;
        continue;
      }
      const l = source[index]!.trim().replace(/\*\*(.+?)\*\*/g, "$1").replace(/\*(.+?)\*/g, "$1");
      if (!l) {
        if (index > 0 && source[index - 1]?.trim() && !/^\s*>\s*Field:/i.test(source[index - 1]!)) y += 5;
        continue;
      }

      const worksheetTitle = l.match(/^#{1,3}\s+Worksheet:\s*(.+)$/i);
      if (worksheetTitle) {
        worksheet = "";
        doc.setFont(t.heading, "bold"); doc.setFontSize(20);
        const titleLines: string[] = doc.splitTextToSize(worksheetTitle[1]!, innerWidth - 30);
        const height = 35 + titleLines.length * 24;
        // A substantial closing exercise reads better on one dedicated page.
        const closingFields = index === lastWorksheet
          ? source.slice(index + 1).filter((line) => /^\s*>\s*Field:/i.test(line)).length
          : 0;
        const followsChapterContent = source.slice(repeatedHeading ? 1 : 0, index).some((line) => line.trim());
        if (closingFields >= 4 && followsChapterContent && y > M) breakPage();
        // Reserve the space for the opening instructions and first response.
        let openingHeight = 0;
        for (let next = index + 1; next < source.length; next++) {
          const line = source[next]!.trim();
          const firstTable = readMarkdownTable(source, next);
          if (firstTable) {
            worksheet = worksheetTitle[1]!;
            const table = measureTable(firstTable);
            worksheet = "";
            const room = contentBottom - M - height - 18 - openingHeight;
            if (table.height > room) splitTableAt = next;
            openingHeight += table.height <= room ? table.height : table.startHeight;
            break;
          }
          if (/^>\s*Field:/i.test(line)) { openingHeight += 82; break; }
          if (/^#{1,3}\s+Worksheet:/i.test(line) || openingHeight > 210) break;
          doc.setFont(t.body, "normal"); doc.setFontSize(12);
          openingHeight += line ? doc.splitTextToSize(line, innerWidth - 28).length * 19 + (/^>/.test(line) ? 28 : 7) : 5;
        }
        ensure(Math.min(contentBottom - M, height + 18 + Math.max(85, openingHeight)));
        worksheet = worksheetTitle[1]!;
        onSamplePage?.("worksheet", doc.getNumberOfPages());
        doc.setDrawColor(...rule); doc.setLineWidth(0.5);
        doc.roundedRect(M, y, innerWidth, height, 5, 5, "S");
        fill(t.accent); doc.rect(M + 14, y + 12, 18, 2, "F");
        ink(t.ink); doc.setFont(t.body, "bold"); doc.setFontSize(9);
        doc.text("WORKSHEET", M + 40, y + 17);
        doc.setFont(t.heading, "bold"); doc.setFontSize(20);
        doc.text(titleLines, M + 14, y + 40, { lineHeightFactor: 24 / 20 });
        y += height + 18;
        continue;
      }
      if (worksheet && /^#{1,2}\s/.test(l) && !/^#{1,2}\s+(?:Instructions?|Fields|Required inputs)\b/i.test(l)) worksheet = "";

      const example = l.match(/^>\s*Example:\s*(.*)$/i);
      if (example) {
        const { body, end } = readQuoteBody(index);
        index = end - 1;
        const title = example[1]!.trim();
        if (!title && !body.length) continue;
        let tableIndex = end;
        while (tableIndex < source.length && !source[tableIndex]!.trim()) tableIndex++;
        const nextTable = readMarkdownTable(source, tableIndex);
        const tableSize = nextTable ? measureTable(nextTable) : null;
        const columnWidth = innerWidth - 34;
        doc.setFont(t.body, "normal"); doc.setFontSize(11);
        const lines: string[] = body.flatMap((line) => doc.splitTextToSize(line, columnWidth));
        doc.setFont(t.heading, "bold"); doc.setFontSize(13);
        const titleLines: string[] = title ? doc.splitTextToSize(title, columnWidth) : [];
        const headingHeight = (titleLines.length ? 35 + titleLines.length * 15 : 31);
        const tableGap = 12 + (tableIndex > end ? 5 : 0);
        // Keep the last part of the example alongside the table header and at least one row.
        const spaceForTable = contentBottom - M - headingHeight - (lines.length ? 15 : 0) - tableGap;
        const tableReserve = tableSize && tableSize.startHeight <= spaceForTable
          ? tableGap + (tableSize.height <= spaceForTable ? tableSize.height : tableSize.startHeight)
          : 0;
        if (tableSize && tableReserve && tableReserve < tableGap + tableSize.height) splitTableAt = tableIndex;
        let offset = 0;
        do {
          const remaining = lines.length - offset;
          const combinedHeight = headingHeight + remaining * 15 + tableReserve;
          const keepTogether = tableReserve > 0 && (combinedHeight <= contentBottom - M - (worksheet ? 38 : 0) || remaining <= 1);
          ensure(keepTogether ? combinedHeight : headingHeight + Math.min(remaining, remaining <= 6 ? remaining : 3) * 15);
          let count = Math.max(1, Math.floor((contentBottom - y - headingHeight) / 15));
          if (tableReserve && remaining > 1 && count >= remaining && y + combinedHeight > contentBottom) count = remaining - 1;
          const part = lines.slice(offset, offset + count);
          const height = headingHeight + part.length * 15;
          if (!offset) onSamplePage?.("example", doc.getNumberOfPages());
          if (tableReserve && remaining === part.length && y + height + tableReserve <= contentBottom) {
            onSamplePage?.("example-table", doc.getNumberOfPages());
          }
          if (tableSize && tableReserve && remaining === part.length && y + height + tableGap + tableSize.height > contentBottom) {
            splitTableAt = tableIndex;
          }
          fill(panel); doc.roundedRect(M, y, innerWidth, height, 5, 5, "F");
          fill(t.accent); doc.rect(M, y, 3, height, "F");
          ink(t.ink); doc.setFont(t.body, "bold"); doc.setFontSize(9);
          doc.text(offset ? "WORKED EXAMPLE (CONTINUED)" : "WORKED EXAMPLE", M + 16, y + 16);
          if (titleLines.length) {
            doc.setFont(t.heading, "bold"); doc.setFontSize(13);
            doc.text(titleLines, M + 16, y + 32, { lineHeightFactor: 15 / 13 });
          }
          if (part.length) {
            doc.setFont(t.body, "normal"); doc.setFontSize(11);
            doc.text(part, M + 16, y + headingHeight - 5, { lineHeightFactor: 15 / 11 });
          }
          y += height + 12;
          offset += part.length;
          if (offset < lines.length) breakPage();
        } while (offset < lines.length);
        continue;
      }

      const diagram = l.match(/^>\s*(Allocation|Timeline):\s*(.+)$/i);
      if (diagram) {
        const allocation = diagram[1]!.toLowerCase() === "allocation";
        const entries = diagram[2]!.split("|").map((part) => {
          const [left, right] = part.split("=").map((s) => s.trim());
          const label = allocation ? left : right;
          const rawValue = (allocation ? right : left) ?? "";
          return { label: label ?? "", value: /^\d+$/.test(rawValue) ? Number(rawValue) : NaN };
        });
        const valid = entries.length >= 2 && entries.length <= 5
          && entries.every(({ label, value }) => label.length > 0 && label.length <= 34 && Number.isSafeInteger(value) && value > 0 && value <= 10000)
          && (allocation ? entries.reduce((sum, e) => sum + e.value, 0) === 100
            : entries.every((entry, i) => i === 0 || entry.value > entries[i - 1]!.value));
        if (valid) {
          const width = W - 2 * M;
          const column = width / entries.length;
          doc.setFont(t.body, "normal"); doc.setFontSize(10);
          const labels: string[][] = entries.map(({ label }) => doc.splitTextToSize(label, column - 12));
          const height = 82 + Math.max(...labels.map((label) => label.length)) * 13;
          ensure(height + 12);
          fill(t.soft); doc.roundedRect(M, y, width, height, 7, 7, "F");
          ink(t.ink); doc.setFont(t.heading, "bold"); doc.setFontSize(13);
          doc.text(allocation ? "Payday allocation" : "Progress milestones", M + 12, y + 22);
          const trackX = M + 14;
          const trackW = width - 28;
          const trackY = y + 37;
          if (allocation) {
            let x = trackX;
            entries.forEach(({ value }, i) => {
              const weight = 0.92 - i * 0.14;
              const color: RGB = [
                Math.round(t.accent[0] * weight + t.ink[0] * (1 - weight)),
                Math.round(t.accent[1] * weight + t.ink[1] * (1 - weight)),
                Math.round(t.accent[2] * weight + t.ink[2] * (1 - weight)),
              ];
              const segment = trackW * value / 100;
              fill(color); doc.rect(x, trackY, segment, 11, "F");
              fill(t.soft); doc.rect(x + segment - Math.min(1, segment), trackY, Math.min(1, segment), 11, "F");
              x += segment;
            });
          } else {
            fill(t.accent); doc.rect(trackX, trackY + 4, trackW, 3, "F");
            const firstMarker = M + column * 0.5;
            const step = column;
            entries.forEach((_, i) => {
              doc.circle(firstMarker + i * step, trackY + 5, 4, "F");
            });
          }
          entries.forEach(({ value }, i) => {
            const x = M + column * (i + 0.5);
            ink(t.ink); doc.setFont(t.heading, "bold"); doc.setFontSize(11);
            doc.text(allocation ? String(value) + "%" : "Day " + value, x, y + 67, { align: "center" });
            doc.setFont(t.body, "normal"); doc.setFontSize(10);
            doc.text(labels[i]!, x, y + 83, { align: "center", lineHeightFactor: 1.3 });
          });
          y += height + 16;
          continue;
        }
      }
      const field = l.match(/^>\s*Field:\s*(.+)$/i)
        ?? (worksheet ? l.match(/^>\s*[-*]?\s*(.+?(?:_{2,}|\.{4,}))$/) : null);
      if (field) {
        const label = stripResponseBlank(field[1]!) || "Your answer";
        doc.setFont(t.body, "normal"); doc.setFontSize(11);
        const lines = doc.splitTextToSize(label, innerWidth);
        const longAnswer = Boolean(worksheet && /^(?:describe|explain|reflect|summarize|list|what did you learn)\b/i.test(label));
        const responseHeight = longAnswer ? 52 : 22;
        const fieldGap = worksheet ? 11 : 13;
        ensure(lines.length * 16 + responseHeight + fieldGap - 6);
        ink(t.ink);
        doc.text(lines, M, y, { lineHeightFactor: 16 / 11 });
        y += lines.length * 16 - 6;
        doc.setDrawColor(...rule); doc.setLineWidth(0.5);
        doc.rect(M, y, innerWidth, responseHeight, "S");
        addTextField(label, [M, y, innerWidth, responseHeight], 11, longAnswer);
        y += responseHeight + fieldGap;
        continue;
      }
      const check = l.match(checklistItem);
      if (check) {
        const label = check[2]!;
        const checked = check[1]!.toLowerCase() === "x";
        doc.setFont(t.body, "normal"); doc.setFontSize(11);
        const lines = doc.splitTextToSize(label, innerWidth - 26);
        ensure(lines.length * 16 + 6);
        doc.setDrawColor(...t.accent); doc.setLineWidth(1.2); doc.rect(M, y - 10, 12, 12);
        if (forms) {
          const response = new forms.AcroFormCheckBox();
          response.fieldName = fieldName(label);
          response.x = M;
          response.y = y - 10;
          response.width = response.height = 12;
          response.value = response.appearanceState = checked ? "On" : "Off";
          response.showWhenPrinted = true;
          doc.addField(response);
        } else if (checked) {
          doc.line(M + 3, y - 4, M + 5, y - 1);
          doc.line(M + 5, y - 1, M + 10, y - 8);
        }
        ink(t.ink); doc.text(lines, M + 22, y, { lineHeightFactor: 16 / 11 }); y += lines.length * 16 + 6;
        continue;
      }
      if (l.startsWith(">")) {
        const callout = l.match(/^>\s*(?:Note:\s*)?(Instructions?|Checkpoint):\s*(.*)$/i)
          ?? l.match(/^>\s*(Tip|Try this|Action|Note):\s*(.*)$/i);
        const { body, end } = readQuoteBody(index);
        index = end - 1;
        const first = callout ? callout[2]?.trim() : quoteText(l);
        if (first) body.unshift(first);
        if (!body.length) continue;

        const label = callout?.[1] ?? "Note";
        const instructions = /^instructions?$/i.test(label);
        const checkpoint = /^checkpoint$/i.test(label);
        const compact = instructions || checkpoint;
        const inset = compact ? 0 : 13;
        const overhead = compact ? 26 : 37;
        doc.setFont(t.body, "normal"); doc.setFontSize(11);
        const lines: string[] = body.flatMap((line) => doc.splitTextToSize(line, compact ? innerWidth : innerWidth - 27));
        let offset = 0;
        while (offset < lines.length) {
          ensure(overhead + Math.min(2, lines.length - offset) * 15);
          const count = Math.max(1, Math.floor((contentBottom - y - overhead) / 15));
          const part = lines.slice(offset, offset + count);
          const height = overhead + part.length * 15;
          if (!instructions) {
            doc.setDrawColor(...t.accent); doc.setLineWidth(checkpoint ? 0.7 : 1);
            if (checkpoint) doc.line(M, y - 3, M + 28, y - 3);
            else doc.line(M + 1, y + 2, M + 1, y + height - 8);
          }
          ink(t.ink); doc.setFont(t.body, "bold"); doc.setFontSize(9);
          doc.text(!workbook && /^action$/i.test(label) ? "TRY THIS" : label.toUpperCase(), M + inset, y + (compact ? 9 : 14));
          doc.setFont(t.body, "normal"); doc.setFontSize(11);
          doc.text(part, M + inset, y + (compact ? 24 : 29), { lineHeightFactor: 15 / 11 });
          y += height + 6;
          offset += part.length;
          if (offset < lines.length) breakPage();
        }
        continue;
      }
      let size = workbook ? 11.5 : 12, bold = false, text = l, indent = 0, font = t.body;
      if (/^#{1,2}\s/.test(l)) { size = 16; bold = true; text = l.replace(/^#+\s/, ""); y += 9; font = t.heading; }
      else if (/^#{3,}\s/.test(l)) { size = 13; bold = true; text = l.replace(/^#+\s/, ""); y += 6; font = t.heading; }
      else if (/^[-*]\s/.test(l)) { text = "•  " + l.slice(2); indent = 12; }
      else if (/^\d+\.\s/.test(l)) { indent = 6; }
      doc.setFont(font, bold ? "bold" : "normal"); doc.setFontSize(size); ink(t.ink);
      const lines = doc.splitTextToSize(text, W - M * 2 - indent);
      const lineHeight = size * (workbook ? 1.55 : 1.5);
      if (!bold && !indent && lines.length <= 5 && source.slice(index + 1).every((line) => !line.trim())) {
        let previous = index - 1;
        while (previous >= 0 && !source[previous]!.trim()) previous--;
        const closingGap = worksheet && /^\s*>\s*Field:/i.test(source[previous] ?? "") ? 6 : 0;
        worksheet = "";
        if (y + closingGap + lines.length * lineHeight > contentBottom) breakPage();
        else y += closingGap;
      }
      if (bold) {
        let next = index + 1;
        while (next < source.length && !source[next]?.trim()) next++;
        const nextTable = readMarkdownTable(source, next);
        if (nextTable) {
          const { height, startHeight } = measureTable(nextTable);
          const headingHeight = lines.length * lineHeight + (next > index + 1 ? 5 : 0);
          const fitsTogether = headingHeight + height <= contentBottom - M;
          if (!fitsTogether) splitTableAt = next;
          ensure(headingHeight + (fitsTogether ? height : startHeight));
          doc.setFont(font, "bold"); doc.setFontSize(size);
        } else {
          ensure(lines.length * size * 1.55 + 38);
        }
      }
      for (const ln of lines) { ensure(lineHeight); doc.text(ln, M + indent, y); y += lineHeight; }
    }
  }

  const citedUrls = new Set(
    chapters.flatMap(({ content }) => [...content.matchAll(/https?:\/\/[^\s<>)\]]+/gi)]
      .map(([url]) => referenceUrl(url.replace(/[.,;:!?]+$/, "")))),
  );
  const references = (Array.isArray(p.sources) ? p.sources : []).flatMap((source) => {
    if (typeof source?.url !== "string" || typeof source.title !== "string") return [];
    const url = referenceUrl(source.url);
    if (!url || !citedUrls.has(url) || listedSources.has(url)) return [];
    listedSources.add(url);
    return [{ title: source.title, url }];
  });
  if (references.length) {
    ensure(78);
    y += 14;
    ink(t.ink); doc.setFont(t.heading, "bold"); doc.setFontSize(20);
    doc.text("References", M, y);
    y += 28;
    for (const reference of references) drawReference(reference);
  }

  // Resolve contents links once flowing chapters have their final positions.
  for (const [i, row] of contentsRows.entries()) {
    const target = destinations[i]!;
    doc.setPage(row.page);
    ink(t.ink); doc.setFont(t.body, "bold"); doc.setFontSize(10);
    doc.text(String(target.page), W - M, row.y + 15, { align: "right" });
    if (linkContents) doc.link(M, row.y, innerWidth, row.height, { pageNumber: target.page, top: target.top });
  }

  for (let i = 2; i <= doc.getNumberOfPages(); i++) {
    doc.setPage(i);
    doc.setDrawColor(...rule); doc.setLineWidth(0.4);
    doc.line(M, H - 41, W - M, H - 41);
    doc.setFont(t.body, "normal"); doc.setFontSize(9); ink(t.ink);
    const footer = doc.splitTextToSize(p.title, innerWidth - 32)[0] ?? "";
    doc.text(footer, M, H - 26);
    doc.text(String(i), W - M, H - 26, { align: "right" });
  }
  return doc;
}

export async function exportPdf(p: P, chapters: Ch[]) {
  const doc = await buildPdf(p, chapters);
  doc.save(`${p.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.pdf`);
}
