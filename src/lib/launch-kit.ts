import { buildPdf } from "./pdf";

type Listing = { headline: string; description: string; salesPage: string };
type Book = Parameters<typeof buildPdf>[0];
type Chapters = Parameters<typeof buildPdf>[1];

function requireCompleteBook(chapters: Chapters) {
  if (!chapters.length || chapters.some(({ content }) => !content.trim())) {
    throw new Error("Finish writing all chapters before downloading the launch kit.");
  }
}

export async function buildLaunchKitSample(book: Book, chapters: Chapters, selection?: string) {
  requireCompleteBook(chapters);
  const chapterPages: number[] = [];
  let examplePage: number | undefined;
  let exampleTablePage: number | undefined;
  let worksheetPage: number | undefined;
  // The sample has no form widgets and no links pointing to omitted pages.
  const pdf = await buildPdf(book, chapters, (index, page) => { chapterPages[index] = page; }, {
    interactive: false,
    linkContents: false,
    onSamplePage(kind, page) {
      if (kind === "example") examplePage ??= page;
      if (kind === "example-table") exampleTablePage ??= page;
      if (kind === "worksheet") worksheetPage = page;
    },
  });
  const first = chapterPages[0]!;
  const last = pdf.getNumberOfPages();
  const lessonEnd = Math.min(first + 2, Math.max(first, (chapterPages[1] ?? last + 1) - 1));
  const lesson = Array.from({ length: lessonEnd - first + 1 }, (_, index) => first + index);
  const suggested = book.productType === "workbook"
    ? [...new Set([exampleTablePage ?? examplePage ?? first, worksheetPage ?? first, first])].slice(0, 2)
    : lesson;
  const requested = selection === undefined ? suggested : selection.split(",").map((page) => Number(page.trim()));
  if (requested.some((page) => !Number.isInteger(page) || page < first || page > last)) {
    throw new Error(`Enter interior page numbers from ${first} to ${last}, separated by commas.`);
  }
  const pages = [...new Set(requested)].sort((a, b) => a - b);
  const keep = new Set([1, ...pages]);
  for (let index = last; index > 1; index--) {
    if (!keep.has(index)) pdf.deletePage(index);
  }
  pdf.setPage(1);
  return { pdf, first, last, pages };
}

export async function buildLaunchKit(book: Book, chapters: Chapters, listing?: Listing | null, selection?: string) {
  const { pdf } = await buildLaunchKitSample(book, chapters, selection);
  const sample = new Uint8Array(pdf.output("arraybuffer"));
  for (let index = pdf.getNumberOfPages(); index > 1; index--) pdf.deletePage(index);
  pdf.setPage(1);
  const cover = new Uint8Array(pdf.output("arraybuffer"));
  const finishedBook = new Uint8Array((await buildPdf(book, chapters)).output("arraybuffer"));
  const { zip, strToU8 } = await import("fflate");

  const description = listing?.description?.trim() || book.promise?.trim() || book.subtitle?.trim();
  const listingCopy = [
    "# " + book.title,
    book.subtitle,
    listing?.headline && "## Headline\n" + listing.headline,
    description && "## Short description\n" + description,
    listing?.salesPage?.trim() && "## Listing copy\n" + listing.salesPage.trim(),
    "## What's included\n- Digital PDF with " + chapters.length + " chapters",
    "## Contents\n" + chapters.map(({ title }) => "- " + title).join("\n"),
  ].filter(Boolean).join("\n\n") + "\n";
  const files: Record<string, Uint8Array> = {
    "book.pdf": finishedBook,
    "sample-pages.pdf": sample,
    "cover.pdf": cover,
    "whop-listing.md": strToU8(listingCopy),
  };
  const coverImage = book.cover?.match(/^data:image\/(png|jpe?g|webp);base64,(.+)$/i);
  if (coverImage) {
    const extension = coverImage[1]!.toLowerCase().replace("jpeg", "jpg");
    files["cover-artwork." + extension] = Uint8Array.from(atob(coverImage[2]!), (value) => value.charCodeAt(0));
  }

  return new Promise<Uint8Array>((resolve, reject) => {
    zip(files, { level: 0 }, (error, bytes) => error ? reject(error) : resolve(bytes));
  });
}

export async function downloadLaunchKit(book: Book, chapters: Chapters, listing?: Listing | null, selection?: string) {
  const bytes = await buildLaunchKit(book, chapters, listing, selection);
  const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "application/zip" }));
  const link = document.createElement("a");
  try {
    link.href = url;
    link.download = (book.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "synthforge") + "-launch-kit.zip";
    document.body.append(link);
    link.click();
  } finally {
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}
