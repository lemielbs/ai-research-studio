export const MINI_COURSE = "mini-course";

export const LESSON_SECTIONS = {
  outcome: "What you'll learn",
  lesson: "The lesson",
  example: "Worked example",
  practice: "Guided practice",
  check: "Knowledge check",
  application: "Final challenge",
  answer: "Answer and explanation",
} as const;

export function splitLesson(content: string) {
  const headings = [...content.matchAll(/^##[ \t]+([^\r\n]+)\r?$/gm)];
  const section = (label: string) => {
    const index = headings.findIndex((heading) => heading[1]!.trim().toLowerCase() === label.toLowerCase());
    if (index === -1) return undefined;
    const heading = headings[index]!;
    return {
      start: heading.index,
      end: headings[index + 1]?.index ?? content.length,
      text: content.slice(heading.index + heading[0].length, headings[index + 1]?.index).trim(),
    };
  };
  const answer = section(LESSON_SECTIONS.answer);
  return {
    outcome: section(LESSON_SECTIONS.outcome)?.text,
    answer: answer?.text,
    body: answer ? (content.slice(0, answer.start) + content.slice(answer.end)).trim() : content,
    missing: Object.entries(LESSON_SECTIONS)
      .filter(([key, label]) => key !== "application" && !section(label)?.text)
      .map(([, label]) => label),
    hasApplication: Boolean(section(LESSON_SECTIONS.application)?.text),
  };
}
