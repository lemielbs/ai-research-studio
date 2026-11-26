import type { jsPDF } from "jspdf";

export type PdfIssue = {
  page: number;
  message: string;
  chapterIndex?: number;
  edit?: string;
};

export function createPdfCheck() {
  const issues: PdfIssue[] = [];
  const markedPages = new Set<number>();
  let chapterIndex: number | undefined;
  let fields = 0;

  const page = (doc: jsPDF) => doc.getCurrentPageInfo().pageNumber;
  const issue = (pageNumber: number, message: string, edit?: string) => {
    if (issues.some((item) => item.page === pageNumber && item.message === message && item.chapterIndex === chapterIndex)) return;
    issues.push({ page: pageNumber, message, ...(chapterIndex === undefined ? {} : { chapterIndex }), ...(edit ? { edit } : {}) });
  };

  return {
    issues,
    chapter(index?: number) { chapterIndex = index; },
    issue,
    mark(doc: jsPDF) { markedPages.add(page(doc)); },
    text(doc: jsPDF): jsPDF["text"] {
      return (value, x, y, options) => {
        const lines = typeof value === "string" ? value.split("\n") : value;
        if (lines.some((line) => line.trim())) {
          const width = Math.max(...lines.map((line) => doc.getTextWidth(line)));
          const size = doc.getFontSize();
          const leading = options?.lineHeightFactor ?? doc.getLineHeightFactor();
          const left = x - (options?.align === "right" ? width : options?.align === "center" ? width / 2 : 0);
          const top = options?.baseline === "top" ? y : y - size;
          const bottom = top + (lines.length - 1) * size * leading + size * 1.16;
          const current = page(doc);
          markedPages.add(current);
          if (left < -1 || left + width > doc.internal.pageSize.getWidth() + 1 || top < -1 || bottom > doc.internal.pageSize.getHeight() + 1) {
            issue(current, "Text may extend past the PDF page edge.");
          }
        }
        return doc.text(value, x, y, options);
      };
    },
    field(doc: jsPDF, added: boolean, [x, y, width, height]: readonly [number, number, number, number]) {
      if (added && x >= 0 && y >= 0 && width > 0 && height > 0 && x + width <= doc.internal.pageSize.getWidth() && y + height <= doc.internal.pageSize.getHeight()) {
        fields++;
        return;
      }
      issue(page(doc), "An answer field is missing or falls outside the page.");
    },
    finish(doc: jsPDF) {
      chapterIndex = undefined;
      for (let current = 1; current <= doc.getNumberOfPages(); current++) {
        if (!markedPages.has(current)) issue(current, "This page is blank or has no readable content.");
      }
      if (fields && (doc.output().match(/^\/Subtype \/Widget\s*$/gm)?.length ?? 0) < fields) {
        issue(1, "Some fillable fields are missing from the exported PDF.");
      }
      return issues.sort((a, b) => a.page - b.page);
    },
  };
}

export type PdfCheck = ReturnType<typeof createPdfCheck>;
