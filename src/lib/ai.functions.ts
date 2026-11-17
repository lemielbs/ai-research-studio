import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

import { generateChatCompletion, generateImage as gwImage, GatewayError } from "@lovable.dev/ai-gateway";

const MODEL = "gpt-4o-mini";
const GW_MODEL = "openai/gpt-6-astra" as const;
// The app owner's account uses Lovable AI credits first, then the owner's OPENAI_API_KEY.
// Everyone else must save their own OpenAI key.
export const OWNER_EMAIL = "reyeslanzjomaribs@gmail.com";

type Ctx = { supabase: any; userId: string; claims: any };
type Provider = { owner: true; key: string | undefined } | { owner: false; key: string };

async function provider(ctx: Ctx): Promise<Provider> {
  const email = String(ctx.claims?.email ?? "").toLowerCase();
  const { data } = await ctx.supabase.from("user_ai_keys").select("openai_key").eq("user_id", ctx.userId).maybeSingle();
  if (email === OWNER_EMAIL) return { owner: true, key: data?.openai_key || process.env["OPENAI_API_KEY"] };
  if (!data?.openai_key) throw new Error("Add your own OpenAI API key in Settings to start.");
  return { owner: false, key: data.openai_key };
}

function isOutOfCredits(e: unknown) {
  return e instanceof GatewayError && (e.code === "payment_required" || e.httpStatus === 402 || e.httpStatus === 429);
}

async function openai(key: string | undefined, path: string, body: unknown): Promise<any> {
  if (!key) throw new Error("Lovable AI credits are used up and no OpenAI key is saved.");
  const res = await fetch(`https://api.openai.com/v1/${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text();
    console.error("OpenAI error", res.status, t);
    if (res.status === 401) throw new Error("Your OpenAI key is invalid. Please update it in Settings.");
    if (res.status === 429 || t.includes("insufficient_quota"))
      throw new Error("OpenAI balance used up or rate limited. Check your OpenAI billing or wait a moment.");
    let msg = "";
    try { msg = JSON.parse(t)?.error?.message ?? ""; } catch {}
    throw new Error(msg ? `OpenAI: ${msg.slice(0, 200)}` : "The AI couldn't finish that. Please try again.");
  }
  return res.json();
}

const OPENAI_IMAGE_MODELS = ["gpt-image-2.5-flare", "gpt-image-2", "gpt-image-1.5", "gpt-image-1-mini"];

async function generateImage(ctx: Ctx, opts: { prompt: string; size: "1536x1024" | "1024x1536" }) {
  const p = await provider(ctx);
  if (p.owner) {
    try {
      return await gwImage({ model: "openai/gpt-image-2.5-sunburst", prompt: opts.prompt, size: opts.size, quality: "low", output_format: "png" });
    } catch (e) {
      if (!isOutOfCredits(e)) console.error("gateway image error", e);
    }
  }
  // Models confirmed on the user's OpenAI key; tried in order until one works.
  let last: unknown;
  for (const model of OPENAI_IMAGE_MODELS) {
    try {
      return await openai(p.key, "images/generations", { model, prompt: opts.prompt, size: opts.size, quality: "low", output_format: "png", n: 1 });
    } catch (e) {
      if (e instanceof Error && (e.message.includes("invalid") || e.message.includes("balance"))) throw e;
      console.error(`${model} failed, trying next`, e);
      last = e;
    }
  }
  throw last instanceof Error ? last : new Error("Couldn't create the picture. Please try again.");
}

async function ask(ctx: Ctx, system: string, user: string, json = false): Promise<string> {
  const p = await provider(ctx);
  const messages = [
    { role: "system" as const, content: system },
    { role: "user" as const, content: user },
  ];
  if (p.owner) {
    try {
      const r = await generateChatCompletion({ model: GW_MODEL, messages, ...(json ? { response_format: { type: "json_object" as const } } : {}) });
      const c = r.choices?.[0]?.message?.content;
      if (typeof c === "string" && c) return c;
    } catch (e) {
      if (!isOutOfCredits(e)) console.error("gateway chat error", e);
    }
  }
  const res = await openai(p.key, "chat/completions", { model: MODEL, messages, ...(json ? { response_format: { type: "json_object" } } : {}) });
  const content = res.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content) throw new Error("The AI couldn't finish that. Please try again.");
  return content;
}

function parseJson<T>(s: string): T {
  const m = s.match(/\{[\s\S]*\}/);
  return JSON.parse(m ? m[0] : s) as T;
}

const SYS =
  "You are an expert digital product creator who builds profitable ebooks, workbooks, checklists and mini-courses for niche audiences. You judge every idea by the 5 unlocks: Pain (a real felt problem), Worsening Pain (it gets worse over time), Transformation (clear Point A to Point B), Specificity (a narrow, defined buyer), Speed (fast, believable results). Buyers pay for transformation, not length. Write practical, specific, high-value content.";

const UNLOCKS = `"unlocks":{"pain":1-10,"worsening":1-10,"transformation":1-10,"specificity":1-10,"speed":1-10}`;
export type Unlocks = { pain: number; worsening: number; transformation: number; specificity: number; speed: number };

export const suggestTopics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ pillar: z.string().max(40), hint: z.string().max(300) }).parse(d))
  .handler(async ({ data, context }) => {
    const out = await ask(context, 
      SYS,
      `Suggest 5 profitable digital product ideas${data.pillar ? ` in the ${data.pillar} pillar` : " across wealth, health, relationships or practical hobbies"}.${data.hint ? ` User interests: ${data.hint}.` : ""} Each must target a very specific person with a painful, worsening problem. Return JSON: {"ideas":[{"topic":"short topic","audience":"very specific person","pain":"the painful problem","worsening":"why it gets worse if ignored",${UNLOCKS}}]}`,
      true,
    );
    return parseJson<{ ideas: { topic: string; audience: string; pain: string; worsening: string; unlocks: Unlocks }[] }>(out);
  });

export const suggestTitles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ topic: z.string().max(300), audience: z.string().max(300), current: z.string().max(200) }).parse(d))
  .handler(async ({ data, context }) => {
    const out = await ask(context, 
      SYS,
      `Topic: ${data.topic}. Audience: ${data.audience}. Current title: "${data.current}". Write 3 new punchy, outcome-led titles (result + timeframe, max 8 words) with a subtitle naming the specific person and pain. Return JSON: {"titles":[{"title":"...","subtitle":"..."}]}`,
      true,
    );
    return parseJson<{ titles: { title: string; subtitle: string }[] }>(out);
  });

export const recommendDesign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ title: z.string().max(200), topic: z.string().max(300), audience: z.string().max(300), tone: z.string().max(40) }).parse(d))
  .handler(async ({ data, context }) => {
    const out = await ask(context, 
      "You are a book designer.",
      `Pick the best PDF design style for "${data.title}" (topic ${data.topic}, audience ${data.audience}, tone ${data.tone}). Options: minimal, magazine, warm, corporate, playful. Return JSON: {"theme":"one id","reason":"one sentence"}`,
      true,
    );
    const r = parseJson<{ theme: string; reason: string }>(out);
    if (!["minimal", "magazine", "warm", "corporate", "playful"].includes(r.theme)) r.theme = "minimal";
    return r;
  });

export const planImages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ title: z.string().max(200), chapters: z.array(z.object({ id: z.string(), title: z.string().max(200), summary: z.string().max(1000) })).max(20) }).parse(d))
  .handler(async ({ data, context }) => {
    const out = await ask(context, 
      "You are an art director for ebooks.",
      `Ebook "${data.title}". Chapters:\n${data.chapters.map((c) => `${c.id}: ${c.title} — ${c.summary}`).join("\n")}\n\nChoose the chapters where a picture genuinely helps the reader (usually most, skip purely abstract ones). For each, describe one concrete visual scene (no text in image). Return JSON: {"images":[{"id":"chapter id","prompt":"scene description"}]}`,
      true,
    );
    return parseJson<{ images: { id: string; prompt: string }[] }>(out);
  });

export const generateSectionImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ prompt: z.string().max(1000), style: z.string().max(300) }).parse(d))
  .handler(async ({ data, context }) => {
    try {
      const res = await generateImage(context, {
                prompt: `${data.prompt}. Style: ${data.style}. No text, no letters, no watermark. Wide landscape composition.`,
        size: "1536x1024",
      });
      const b64 = res.data?.[0]?.b64_json;
      if (!b64) throw new Error("no image");
      return { dataUrl: `data:image/png;base64,${b64}` };
    } catch (e) {
      console.error("image error", e);
      throw e instanceof Error && (e.message.includes("OpenAI") || e.message.includes("Settings")) ? e : new Error("Couldn't create that image. Please try again.");
    }
  });

export const suggestAngles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ topic: z.string().min(2).max(300), audience: z.string().max(300), productType: z.string().max(40) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const out = await ask(context, 
      SYS,
      `Topic: ${data.topic}\nAudience: ${data.audience || "general"}\nProduct type: ${data.productType}\n\nSuggest 3 distinct, profitable niche angles. Titles must be punchy and outcome-led (result + timeframe, max 8 words, e.g. "Sleep Through the Night in 7 Nights"), never generic like "The Ultimate Guide to X". Subtitle names the specific person and pain. Promise follows: I help [specific person] who [painful, worsening problem] get [result] in [timeframe]. Return JSON: {"angles":[{"title":"...","subtitle":"...","why":"one sentence on why it sells","promise":"I help ...",${UNLOCKS}}]}`,
      true,
    );
    return parseJson<{ angles: { title: string; subtitle: string; why: string; promise: string; unlocks: Unlocks }[] }>(out);
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
  .handler(async ({ data, context }) => {
    const out = await ask(context, 
      SYS,
      `Create an outline for a ${data.productType} titled "${data.title}" (${data.subtitle}). Topic: ${data.topic}. Audience: ${data.audience}. Tone: ${data.tone}. Exactly ${data.chapters} chapters/sections, forming a step-by-step journey from Point A (the pain) to Point B (the result). Short, actionable, fast wins first. Return JSON: {"chapters":[{"title":"...","summary":"2 sentences on what it covers"}]}`,
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
  .handler(async ({ data, context }) => {
    const content = await ask(context, 
      SYS,
      `Product: "${data.productTitle}" (${data.productType}) for ${data.audience}. Tone: ${data.tone}.\nFull outline:\n${data.outline}\n\nWrite the full section "${data.chapterTitle}" — ${data.summary}\nUse Markdown with ## subheadings, short paragraphs, bullet lists and concrete examples. Include at least one line starting with "> Tip: ", one starting with "> Action: ", and a short checklist using "- [ ] " items. 500-800 words. Do not repeat the chapter title as a heading.`,
    );
    return { content };
  });

export const generateSalesKit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ title: z.string().max(200), subtitle: z.string().max(300), audience: z.string().max(300), outline: z.string().max(4000) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const out = await ask(context, 
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
  .handler(async ({ data, context }) => {
    try {
      const res = await generateImage(context, {
                prompt: `Premium minimalist ebook cover artwork, no text, no letters. Theme: ${data.topic}. Bold editorial composition, rich colors, high-end design, vertical book cover.`,
        size: "1024x1536",
      });
      const b64 = res.data?.[0]?.b64_json;
      if (!b64) throw new Error("no image");
      return { dataUrl: `data:image/png;base64,${b64}` };
    } catch (e) {
      console.error("cover error", e);
      if (e instanceof Error && (e.message.includes("Settings") || e.message.includes("OpenAI"))) throw e;
      throw new Error("Couldn't create the cover. Please try again.");
    }
  });

export const getAiStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const owner = String(context.claims?.email ?? "").toLowerCase() === OWNER_EMAIL;
    const { data } = await context.supabase.from("user_ai_keys").select("user_id").eq("user_id", context.userId).maybeSingle();
    return { owner, hasKey: !!data };
  });

export const saveMyKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ key: z.string().trim().min(20).max(300) }).parse(d))
  .handler(async ({ data, context }) => {
    const test = await fetch("https://api.openai.com/v1/models", { headers: { Authorization: `Bearer ${data.key}` } });
    if (!test.ok) throw new Error("That OpenAI key didn't work. Please check it and try again.");
    const { error } = await context.supabase.from("user_ai_keys").upsert({ user_id: context.userId, openai_key: data.key, updated_at: new Date().toISOString() });
    if (error) throw new Error("Couldn't save your key.");
    return { ok: true };
  });

export const removeMyKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await context.supabase.from("user_ai_keys").delete().eq("user_id", context.userId);
    return { ok: true };
  });

export type CreatorAnalysis = {
  niche: string; audience: string; tone: string; pains: string[]; themes: string[];
  ebook: { title: string; subtitle: string; promise: string; product_type: string; chapters: string[] };
  price: string;
};

export const analyzeCreator = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ handle: z.string().max(100), niche: z.string().max(200), followers: z.number().nullable(), content: z.string().min(30).max(15000), myName: z.string().max(100) }).parse(d))
  .handler(async ({ data, context }) => {
    const out = await ask(context, SYS,
      `Analyse this Instagram creator @${data.handle} (${data.niche || "niche unknown"}, ${data.followers ?? "?"} followers). Their bio, captions and video topics:\n"""${data.content}"""\n\nWork out their niche, exact audience, voice/tone, the audience's painful worsening problems, and recurring themes. Then design ONE personalised ebook in the creator's own voice that their audience would buy (outcome-led title with timeframe, subtitle, one-sentence promise, product type ebook/workbook/checklist/mini-course, 5-7 chapter titles as a Point A to Point B journey), plus a suggested price. Return JSON: {"niche":"","audience":"","tone":"","pains":[""],"themes":[""],"ebook":{"title":"","subtitle":"","promise":"","product_type":"ebook","chapters":[""]},"price":"$27"}`,
      true);
    const analysis = parseJson<CreatorAnalysis>(out);
    const offer = await ask(context,
      "You write short, warm, specific partnership pitches to micro-creators. No hype, no emojis spam, no generic lines like 'want to work together'. Plain text only.",
      `Write a ready-to-send email to @${data.handle} from ${data.myName || "[Your name]"}. Include: a subject line on the first line as "Subject: ...", a specific compliment referencing their content (${analysis.themes.slice(0, 3).join(", ")}), the observation that their audience (${analysis.audience}) struggles with ${analysis.pains[0]}, the personalised product idea "${analysis.ebook.title}" — ${analysis.ebook.promise}, that I build the whole product with their voice and branding at no cost to them, it's sold and delivered automatically with revenue split paid straight to both of us, and a simple low-pressure call to action (reply "yes" and I'll send a free preview). Under 170 words.`);
    return { analysis, offer };
  });

export const extractCreatorStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ text: z.string().min(10).max(15000) }).parse(d))
  .handler(async ({ data, context }) => {
    const out = await ask(context, "You extract Instagram profile facts from pasted text. Never invent numbers: use null when not stated. Convert 45.2K to 45200 and 1.2M to 1200000.",
      `Pasted profile/Reels text:\n"""${data.text}"""\nReturn JSON: {"handle":"without @ or null","niche":"short or null","followers":number|null,"top_video_views":number|null (highest Reel view count shown),"reel_views":[numbers of the most recent Reels views, up to 10],"email":"business email or null","sells_product":true if bio/links show their own course, ebook, coaching, shop or paid community}`, true);
    return parseJson<{ handle: string | null; niche: string | null; followers: number | null; top_video_views: number | null; reel_views: number[]; email: string | null; sells_product: boolean }>(out);
  });

export const suggestCreatorSearches = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ niche: z.string().min(2).max(200) }).parse(d))
  .handler(async ({ data, context }) => {
    const out = await ask(context, SYS,
      `Niche: ${data.niche}. Give 8 Instagram search phrases (industry + keyword creators in this niche use in content, e.g. "parenting tips") that surface micro-creators (10k-100k followers, 50k-200k view Reels) who are unlikely to already sell a product, plus 5 hashtags. Return JSON: {"searches":[{"phrase":"","why":"short"}],"hashtags":["#..."]}`, true);
    return parseJson<{ searches: { phrase: string; why: string }[]; hashtags: string[] }>(out);
  });
