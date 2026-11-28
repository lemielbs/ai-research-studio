type BookPromise = { title: string; subtitle?: string | null };
type WrittenChapter = { title: string; content: string };
type Finding = { category: "promise" | "deliverable"; location: string; issue: string; action: string };

const ITEM = "(template|worksheet|checklist|tracker|exercise|recipe|step)s?";
const itemClaims = new RegExp("(?:^|[\\s(])([1-9]\\d{0,2})(?:\\s+|[-–])" + ITEM + "\\b", "gi");

export function checkDraftDeliverables(book: BookPromise, chapters: WrittenChapter[]): Finding[] {
  const claims = [book.title, book.subtitle ?? ""].join("\n").replace(/[\u2010-\u2015]/g, "-");
  const manuscriptLabels = chapters.flatMap(({ title, content }) => [
    title,
    ...content.split("\n").filter((line) => /^\s*#{1,6}\s/.test(line)),
  ]).map((line) => line.replace(/^\s*#{1,6}\s+/, "").trim());
  const findings: Finding[] = [];

  const duration = [...claims.matchAll(/\b([1-9]\d{0,2})(?:\s+|[-–])(days?|weeks?)\b/gi)]
    .map((match) => Number(match[1]) * (/^week/i.test(match[2]!) ? 7 : 1));
  const lengths = new Set(duration);
  if (lengths.size === 1) {
    const promised = duration[0]!;
    const covered = new Set<number>();
    const scheduleLines = [
      ...manuscriptLabels,
      ...chapters.flatMap(({ content }) => content.split("\n")
        .filter((line) => /^\s*\|\s*(?:days?|weeks?)\s+\d+\b/i.test(line)
          || /^\s*(?:days?|weeks?)\s+\d+\s*(?:[:.)]|[-\u2010-\u2015])/i.test(line))),
    ];
    for (const line of scheduleLines) {
      const match = line.replace(/[\u2010-\u2015]/g, "-").match(/^\s*(?:\|\s*)?(Days?|Weeks?)\s+(\d+)(?:\s*(?:-|to)\s*(\d+))?\b/i);
      if (!match) continue;
      const unit = /^week/i.test(match[1]!) ? 7 : 1;
      const first = (Number(match[2]) - 1) * unit + 1;
      const last = Math.min(Number(match[3] ?? match[2]) * unit, promised);
      if (first < 1 || first > last) continue;
      for (let day = first; day <= last; day++) covered.add(day);
    }
    if (covered.size === 0) {
      findings.push({
        category: "promise",
        location: "Book schedule",
        issue: "The title or subtitle names a " + promised + "-day duration, but the draft has no recognizable day or week labels.",
        action: "Map the schedule from day 1 through day " + promised + " and give each period a concrete activity and checkpoint.",
      });
    } else if (covered.size < promised) {
      const gaps: string[] = [];
      let day = 1;
      while (day <= promised) {
        if (covered.has(day)) { day++; continue; }
        const first = day++;
        while (day <= promised && !covered.has(day)) day++;
        gaps.push(first === day - 1 ? String(first) : first + "–" + (day - 1));
      }
      const missing = gaps.slice(0, 4).join(", ") + (gaps.length > 4 ? ", and more" : "");
      findings.push({
        category: "promise",
        location: "Book schedule",
        issue: "The title or subtitle promises " + promised + " days. The labeled schedule leaves days " + missing + " uncovered.",
        action: "Label the missing periods and give each one a concrete activity. Add a final checkpoint through day " + promised + ".",
      });
    }
  }

  const declared = new Map<string, number>();
  for (const match of claims.matchAll(itemClaims)) declared.set(match[2]!.toLowerCase(), Number(match[1]));
  for (const [kind, count] of declared) {
    const label = new RegExp("^(?:(?:\\d+[.):]\\s+)?"+kind+"\\b(?:\\s+(\\d+)|:\\s*(.+))|(?:\\d+[.):]\\s+)?(.+)\\s+"+kind+"\\s*(\\d*)$)", "i");
    const matches = new Set<string>();
    for (const heading of manuscriptLabels) {
      const match = heading.match(label);
      if (!match) continue;
      const trailing = heading.slice(match[0].length);
      if (trailing && !/^\s*[:.\-–—]/.test(trailing)) continue;
      const id = match[1] || match[2] || match[3] || match[4];
      if (id) matches.add(id.trim().toLowerCase());
    }
    if (matches.size !== count) {
      findings.push({
        category: "deliverable",
        location: "Title and subtitle",
        issue: "The book promises " + count + " " + kind + "s, but the headings identify " + matches.size + ".",
        action: "Label each included " + kind + " separately, then align the number of included items with the advertised count.",
      });
    }
  }

  return findings;
}
