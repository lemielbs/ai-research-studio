import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Theme } from "./themes";
import { buildPdf } from "./pdf";

export const mobilePdf = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((value) => z.object({ id: z.string().uuid(), kit: z.boolean().optional() }).parse(value))
  .handler(async ({ data, context }) => {
    const db = context.supabase;
    const { data: book, error } = await db.from("products").select("*").eq("id", data.id).eq("user_id", context.userId).single();
    if (error || !book) throw new Error("Book unavailable.");
    const result = await db.from("chapters").select("title,content,image_url").eq("product_id", book.id).order("position");
    if (result.error) throw new Error("Could not load chapters.");
    const chapters = result.data.filter((c: { content: string }) => c.content?.trim());
    if (!chapters.length) throw new Error("Write a chapter before exporting.");
    const design = book.design as {
      theme?: string; customStyle?: Theme; coverTemplate?: Theme["cover"]; coverLayout?: Theme["cover"];
      coverMode?: string; coverByline?: string; research?: { sources?: NonNullable<Parameters<typeof buildPdf>[0]["sources"]> };
    } | null;
    const presentation = { title: book.title, subtitle: book.subtitle, productType: book.product_type, cover: book.cover_url,
      theme: design?.theme ?? null, customStyle: design?.theme === "custom" ? design?.customStyle : undefined,
      coverLayout: design?.coverTemplate ?? design?.coverLayout, completeCover: design?.coverMode === "complete", coverByline: design?.coverByline,
      sources: design?.research?.sources, audience: book.audience, promise: book.promise };
    if (data.kit) {
      const { buildLaunchKit } = await import("./launch-kit");
      const listing = z.object({ headline: z.string(), description: z.string(), salesPage: z.string() }).safeParse(book.sales_kit);
      const bytes = await buildLaunchKit(presentation, result.data, listing.data);
      return new Response(new Uint8Array(bytes).buffer, { headers: { "Content-Type": "application/zip", "Cache-Control": "private, no-store" } });
    }
    const pdf = await buildPdf(presentation, chapters);
    return new Response(pdf.output("arraybuffer"), { headers: { "Content-Type": "application/pdf", "Cache-Control": "private, no-store" } });
  });
