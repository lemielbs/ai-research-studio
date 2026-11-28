import { describe, expect, it } from "vitest";
import { jsPDF } from "jspdf";
import { checkPdf } from "@/lib/pdf";
import { createPdfCheck } from "@/lib/pdf-check";

describe("PDF export check", () => {
  it("clears the worksheet warning once there is a real fillable field", async () => {
    const book = { title: "Payday planner", productType: "workbook" };
    const chapter = { title: "Schedule bills", content: "List due dates.\n\n## Worksheet: My paydays\n\n> Instructions: Use your upcoming payday." };
    const before = await checkPdf(book, [chapter]);
    expect(before.issues).toContainEqual(expect.objectContaining({ chapterIndex: 0, page: 3, message: expect.stringContaining("no fillable answers") }));
    const after = await checkPdf(book, [{ ...chapter, content: chapter.content + "\n\n> Field: Next payday" }]);
    expect(after.issues).toEqual([]);
    expect(after.doc.output()).toContain("/Subtype /Widget");
  });

  it("finds malformed table rows and missing mini-course answers by page", async () => {
    const { issues } = await checkPdf({ title: "Payday basics", productType: "mini-course" }, [{
      title: "Plan a payday",
      content: "## What you'll learn\n\nSequence your upcoming bills.\n\n| Good column | Other column |\n| --- | --- |\n| One | Two |\n| Extra | Too many | Cells |",
    }]);
    expect(issues).toContainEqual(expect.objectContaining({ page: 3, chapterIndex: 0, message: expect.stringContaining("table row") }));
    expect(issues).toContainEqual(expect.objectContaining({ page: 3, chapterIndex: 0, message: expect.stringContaining("Answer and explanation") }));
  });

  it("reports text outside the page and pages without rendered content", () => {
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const check = createPdfCheck();
    check.text(doc)("Clipped", doc.internal.pageSize.getWidth() - 2, 50);
    doc.addPage();
    expect(check.finish(doc)).toEqual([
      { page: 1, message: "Text may extend past the PDF page edge." },
      { page: 2, message: "This page is blank or has no readable content." },
    ]);
  });
});
