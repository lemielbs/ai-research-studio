import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { generateChatCompletion, generateImage, GatewayError } from "@lovable.dev/ai-gateway";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const MODEL = "openai/gpt-6-astra" as const;

async function ask(system: string, user: string, json = false): Promise<string> {
  try {
    const res = await generateChatCompletion({
      model: MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      ...(json ? { response_format: { type: "json_object" as const } } : {}),
    });
    const content = res.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content) throw new Error("Empty AI response");
    return content;
  } catch (e) {
    console.error("AI error", e);
    if (e instanceof GatewayError) {
      if (e.code === "payment_required" || e.httpStatus === 402)
        throw new Error("AI credits are used up. Please add credits and try again.");
      if (e.httpStatus === 429) throw new Error("Too many requests right now. Please wait a moment.");
    }
    throw new Error("The AI couldn't finish that. Please try again.");
  }
}

function parseJson<T>(s: string): T {
  const m = s.match(/\{[\s\S]*\}/);
  return JSON.parse(m ? m[0] : s) as T;
}

const SYS =
  "You are an expert digital product creator who builds profitable ebooks, workbooks, checklists and mini-courses for niche audiences. Write practical, specific, high-value content.";

export const suggestAngles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ topic: z.string().min(2).max(300), audience: z.string().max(300), productType: z.string().max(40) }).parse(d),
  )
  .handler(async ({ data }) => {
    const out = await ask(
      SYS,
      `Topic: ${data.topic}\nAudience: ${data.audience || "general"}\nProduct type: ${data.productType}\n\nSuggest 3 distinct, profitable niche angles. Return JSON: {"angles":[{"title":"...","subtitle":"...","why":"one sentence on why it sells"}]}`,
      true,
    );
    return parseJson<{ angles: { title: string; subtitle: string; why: string }[] }>(out);
  });

export const generateOutline = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        title: z.string().max(200),
        subtitle: z.string().max(300),
        topic: z.string().max(300),
        audience: z.string().max(300),
        productType: z.string().max(40),
        tone: z.string().max(40),
        chapters: z.number().int().min(3).max(12),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const out = await ask(
      SYS,
      `Create an outline for a ${data.productType} titled "${data.title}" (${data.subtitle}). Topic: ${data.topic}. Audience: ${data.audience}. Tone: ${data.tone}. Exactly ${data.chapters} chapters/sections. Return JSON: {"chapters":[{"title":"...","summary":"2 sentences on what it covers"}]}`,
      true,
    );
    return parseJson<{ chapters: { title: string; summary: string }[] }>(out);
  });

export const writeChapter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        productTitle: z.string().max(200),
        productType: z.string().max(40),
        audience: z.string().max(300),
        tone: z.string().max(40),
        chapterTitle: z.string().max(200),
        summary: z.string().max(1000),
        outline: z.string().max(4000),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const content = await ask(
      SYS,
      `Product: "${data.productTitle}" (${data.productType}) for ${data.audience}. Tone: ${data.tone}.\nFull outline:\n${data.outline}\n\nWrite the full section "${data.chapterTitle}" — ${data.summary}\nUse Markdown with ## subheadings, short paragraphs, bullet lists, and concrete examples or action steps. 600-900 words. Do not repeat the chapter title as a heading.`,
    );
    return { content };
  });

export const generateSalesKit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ title: z.string().max(200), subtitle: z.string().max(300), audience: z.string().max(300), outline: z.string().max(4000) }).parse(d),
  )
  .handler(async ({ data }) => {
    const out = await ask(
      SYS + " You are also a direct-response copywriter.",
      `Product: "${data.title}" — ${data.subtitle}. Audience: ${data.audience}. Outline:\n${data.outline}\n\nReturn JSON: {"headline":"...","salesPage":"Markdown sales page 300-450 words with benefits and a call to action","description":"60-word marketplace description","price":"suggested price like $17","priceReason":"one sentence","socialPosts":["5 short social media posts"]}`,
      true,
    );
    return parseJson<{
      headline: string;
      salesPage: string;
      description: string;
      price: string;
      priceReason: string;
      socialPosts: string[];
    }>(out);
  });

export const generateCover = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ title: z.string().max(200), topic: z.string().max(300) }).parse(d))
  .handler(async ({ data }) => {
    try {
      const res = await generateImage({
        model: "openai/gpt-image-2.5-sunburst",
        prompt: `Premium minimalist ebook cover artwork, no text, no letters. Theme: ${data.topic}. Bold editorial composition, rich colors, high-end design, vertical book cover.`,
        size: "1024x1536",
        quality: "low",
        output_format: "jpeg",
        output_compression: 70,
      });
      const b64 = res.data?.[0]?.b64_json;
      if (!b64) throw new Error("no image");
      return { dataUrl: `data:image/jpeg;base64,${b64}` };
    } catch (e) {
      console.error("cover error", e);
      throw new Error("Couldn't create the cover. Please try again.");
    }
  });
