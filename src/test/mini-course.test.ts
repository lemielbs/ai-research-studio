import { describe, expect, it } from "vitest";
import { splitLesson } from "@/lib/mini-course";
import { buildPdf } from "@/lib/pdf";

const lesson = {
  title: "Plan a payday",
  content: [
    "## What you'll learn\n\nPut bills in date order.",
    "## The lesson\n\nList the dates your bills are due.",
    "## Worked example\n\nMia marks rent as due three days before payday.",
    "## Guided practice\n\nSchedule Mia's next two bills.",
    "## Knowledge check\n\nWhat should Mia schedule first?",
    "## Final challenge\n\nPlan a different week with two paydays and three bills.",
    "## Answer and explanation\n\nStart with rent because it has the earliest due date.",
  ].join("\n\n"),
};

describe("mini-course PDF", () => {
  it("renders a lesson map, numbered lessons and an answer key after the challenge", async () => {
    const pdf = await buildPdf({ title: "Payday basics", productType: "mini-course" }, [lesson]);
    const output = pdf.output();
    expect(output).toContain("MINI-COURSE");
    expect(output).toContain("Lesson map");
    expect(output).toContain("Put bills in date order.");
    expect(output).toContain("LESSON 1");
    expect(output).toContain("Final challenge");
    const key = output.indexOf("Answer key");
    expect(key).toBeGreaterThan(output.indexOf("Final challenge"));
    expect(output.indexOf("Start with rent because")).toBeGreaterThan(key);
    expect(output).not.toContain("Answer and explanation");
  });

  it("checks course sections while allowing legacy drafts and preserving workbook fields", async () => {
    expect(splitLesson(lesson.content)).toMatchObject({ missing: [], hasApplication: true });
    expect(splitLesson("An existing lesson.")).toMatchObject({ body: "An existing lesson.", hasApplication: false });
    const pdf = await buildPdf({ title: "Payday planner", productType: "workbook" }, [
      { title: "My paydays", content: "## Worksheet: Payday planner\n\n> Field: Next payday" },
    ]);
    const output = pdf.output();
    expect(output).toContain("Contents");
    expect(output).toContain("CHAPTER 1");
    expect(output).toContain("/AcroForm");
    expect(output).not.toContain("Lesson map");
  });
});
