# Richer PDFs, AI topic ideas and stronger titles

Built around your session notes: the 5 unlocks (Pain, Worsening Pain, Transformation, Specificity, Speed) and the Product Promise formula.

## 1. "I don't know what to make" — AI topic ideas
- New "Suggest ideas for me" button on the first step of the wizard.
- Pick an area (Wealth, Health, Relationships, Hobbies) or leave it blank.
- AI returns 5 ideas, each with: who it's for, the painful problem, why it gets worse, and a score for each of the 5 unlocks.
- Click an idea to fill in topic and audience automatically.

## 2. Stronger titles using the Product Promise
- Angle step now shows, for each of the 3 angles:
  - A punchy, outcome-led title + subtitle (specific person + result + timeframe, e.g. "Sleep Through the Night in 7 Nights").
  - The one-sentence Product Promise ("I help ... who ... get ... in ...").
  - The 5-unlock scores so you can see why it sells.
- "Rewrite title" button gives 3 more title options.
- Outline and chapters are written as a step-by-step journey from Point A (pain) to Point B (result), short and actionable rather than long.

## 3. PDF design that changes per product
- 5 design styles: Minimal, Bold Magazine, Warm & Friendly, Corporate, Playful.
- AI recommends a style (fonts, colors, layout) based on topic and audience; you can switch on the product page, with a small preview of each.
- Every style gets: designed cover with title over artwork, styled contents page, chapter opener pages with number and image, colored headings, callout boxes for tips/action steps, checklists with tick boxes, page numbers and running header.
- A "Promise" page near the start and a "Your next steps" page at the end.

## 4. Images inside the PDF
- AI decides which chapters benefit from a picture and writes the image idea for each (e.g. a calm bedroom for a sleep chapter).
- Images are created on the product page with a progress bar; you can regenerate or remove any image before downloading.
- Images appear as chapter openers and, where useful, inside the chapter.
- Image style matches the chosen design (e.g. soft watercolor for Warm, clean photo look for Corporate).

## Technical details
- New AI server functions in the existing AI file: suggestTopics, suggestTitles, recommendDesign, planImages, generateSectionImage (low quality JPEG, compressed, to keep PDFs light).
- Database: add `promise`, `unlocks` (json) and `design` (json: theme, colors, fonts) to products; add `image_url` and `image_prompt` to chapters. Images stored as data in the row, same as covers.
- PDF builder rewritten with a theme system (palette, fonts, cover layout, heading style) and helpers for callouts (lines starting with "> Tip:" / "> Action:"), checklists ("- [ ]"), images and page numbers.
- Chapter-writing prompt updated to use these markers so the PDF can style them.

## Not included
- Real photos from stock sites (images are AI-made).
- Payments (unchanged).
