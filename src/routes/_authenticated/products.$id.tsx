import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { writeChapter, generateSalesKit, generateCover, planImages, generateSectionImage } from "@/lib/ai.functions";
import { THEMES, getTheme, rgb } from "@/lib/themes";
import { mdToHtml } from "@/lib/markdown";
import { exportPdf } from "@/lib/pdf";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/products/$id")({
  validateSearch: (s: Record<string, unknown>) => ({ autowrite: s['autowrite'] === true || s['autowrite'] === "true" ? true : undefined }),
  head: () => ({ meta: [{ title: "Edit product — Synthforge" }] }),
  component: ProductPage,
});

type SalesKit = { headline: string; salesPage: string; description: string; price: string; priceReason: string; socialPosts: string[] };

function ProductPage() {
  const { id } = Route.useParams();
  const { autowrite } = Route.useSearch();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const writeFn = useServerFn(writeChapter);
  const kitFn = useServerFn(generateSalesKit);
  const coverFn = useServerFn(generateCover);
  const planFn = useServerFn(planImages);
  const imgFn = useServerFn(generateSectionImage);
  const [imgProgress, setImgProgress] = useState<{ done: number; total: number } | null>(null);
  const [imgBusy, setImgBusy] = useState<string | null>(null);
  const [writing, setWriting] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const started = useRef(false);

  const { data } = useQuery({
    queryKey: ["product", id],
    queryFn: async () => {
      const [{ data: p, error }, { data: ch, error: e2 }] = await Promise.all([
        supabase.from("products").select("*").eq("id", id).single(),
        supabase.from("chapters").select("*").eq("product_id", id).order("position"),
      ]);
      if (error) throw error;
      if (e2) throw e2;
      return { p, ch: ch ?? [] };
    },
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["product", id] });

  const outlineText = (data?.ch ?? []).map((c, i) => `${i + 1}. ${c.title} — ${c.summary ?? ""}`).join("\n");

  const writeOne = async (c: { id: string; title: string; summary: string | null }) => {
    if (!data) return;
    setWriting(c.id);
    try {
      const r = await writeFn({ data: {
        productTitle: data.p.title, productType: data.p.product_type, audience: data.p.audience ?? "", tone: data.p.tone ?? "friendly",
        chapterTitle: c.title, summary: c.summary ?? "", outline: outlineText,
      } });
      await supabase.from("chapters").update({ content: r.content }).eq("id", c.id);
      await refresh();
    } catch (e) { toast.error((e as Error).message); throw e; }
    finally { setWriting(null); }
  };

  const writeAll = async () => {
    if (!data) return;
    try {
      for (const c of data.ch) if (!c.content) await writeOne(c);
      await supabase.from("products").update({ status: "written" }).eq("id", id);
      await refresh();
      toast.success("All chapters written!");
    } catch { /* toast shown */ }
  };

  useEffect(() => {
    if (autowrite && data && !started.current && data.ch.some((c) => !c.content)) {
      started.current = true;
      navigate({ to: "/products/$id", params: { id }, search: { autowrite: undefined }, replace: true });
      void writeAll();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autowrite, data]);

  const task = async (name: string, fn: () => Promise<void>) => {
    setBusy(name);
    try { await fn(); await refresh(); } catch (e) { toast.error((e as Error).message); } finally { setBusy(null); }
  };

  const makeKit = () => task("kit", async () => {
    const k = await kitFn({ data: { title: data!.p.title, subtitle: data!.p.subtitle ?? "", audience: data!.p.audience ?? "", outline: outlineText } });
    const { error } = await supabase.from("products").update({ sales_kit: k }).eq("id", id);
    if (error) throw error;
  });

  const makeCover = () => task("cover", async () => {
    const r = await coverFn({ data: { title: data!.p.title, topic: data!.p.topic } });
    const { error } = await supabase.from("products").update({ cover_url: r.dataUrl }).eq("id", id);
    if (error) throw error;
  });

  const design = (data?.p.design ?? null) as { theme?: string; reason?: string } | null;
  const theme = getTheme(design?.theme);

  const setTheme = (tid: string) => task("theme", async () => {
    const { error } = await supabase.from("products").update({ design: { ...(design ?? {}), theme: tid } }).eq("id", id);
    if (error) throw error;
  });

  const oneImage = async (cid: string, prompt: string) => {
    const r = await imgFn({ data: { prompt, style: theme.imageStyle } });
    const { error } = await supabase.from("chapters").update({ image_url: r.dataUrl, image_prompt: prompt }).eq("id", cid);
    if (error) throw error;
  };

  const makeImages = async () => {
    if (!data) return;
    try {
      setImgProgress({ done: 0, total: 1 });
      const plan = await planFn({ data: { title: data.p.title, chapters: data.ch.map((c) => ({ id: c.id, title: c.title, summary: (c.summary ?? "").slice(0, 900) })) } });
      const items = plan.images.filter((x) => data.ch.some((c) => c.id === x.id));
      setImgProgress({ done: 0, total: items.length });
      for (const [k, it] of items.entries()) {
        try { await oneImage(it.id, it.prompt); } catch (e) { toast.error((e as Error).message); }
        setImgProgress({ done: k + 1, total: items.length });
        await refresh();
      }
      toast.success("Pictures ready!");
    } catch (e) { toast.error((e as Error).message); }
    finally { setImgProgress(null); }
  };

  const redoImage = async (c: { id: string; title: string; summary: string | null; image_prompt: string | null }) => {
    setImgBusy(c.id);
    try { await oneImage(c.id, c.image_prompt || `${c.title}: ${c.summary ?? ""}`); await refresh(); }
    catch (e) { toast.error((e as Error).message); } finally { setImgBusy(null); }
  };

  const removeImage = (cid: string) => task("rmimg", async () => {
    await supabase.from("chapters").update({ image_url: null }).eq("id", cid);
  });

  const download = () => data && exportPdf(
    { title: data.p.title, subtitle: data.p.subtitle, cover: data.p.cover_url, promise: data.p.promise, theme: theme.id, audience: data.p.audience },
    data.ch.filter((c) => c.content),
  );

  const move = (i: number, d: number) => task("move", async () => {
    const ch = data!.ch; const j = i + d;
    if (j < 0 || j >= ch.length) return;
    await supabase.from("chapters").update({ position: j }).eq("id", ch[i]!.id);
    await supabase.from("chapters").update({ position: i }).eq("id", ch[j]!.id);
  });

  const del = async () => {
    if (!confirm("Delete this product?")) return;
    await supabase.from("products").delete().eq("id", id);
    await qc.invalidateQueries({ queryKey: ["products"] });
    navigate({ to: "/dashboard" });
  };

  if (!data) return <p className="p-12 text-muted-foreground">Loading…</p>;
  const { p, ch } = data;
  const kit = p.sales_kit as SalesKit | null;
  const done = ch.filter((c) => c.content).length;

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-widest text-primary">{p.product_type} · {done}/{ch.length} chapters</div>
          <h1 className="mt-2 text-4xl font-bold">{p.title}</h1>
          {p.subtitle && <p className="mt-2 max-w-2xl text-muted-foreground">{p.subtitle}</p>}
          {p.promise && <p className="mt-3 max-w-2xl text-sm italic">"{p.promise}"</p>}
        </div>
        <div className="flex gap-2">
          {done < ch.length && <Button disabled={!!writing} onClick={writeAll}>{writing ? "Writing…" : "Write remaining"}</Button>}
          <Button variant="outline" disabled={!done} onClick={download}>Download PDF</Button>
          <Button variant="ghost" onClick={del}>Delete</Button>
        </div>
      </div>

      <Tabs defaultValue="content">
        <TabsList>
          <TabsTrigger value="content">Develop</TabsTrigger>
          <TabsTrigger value="sales">Distribute</TabsTrigger>
          <TabsTrigger value="design">Design & pictures</TabsTrigger>
          <TabsTrigger value="cover">Deliver</TabsTrigger>
        </TabsList>

        <TabsContent value="content" className="mt-6 space-y-4">
          {ch.map((c, i) => (
            <section key={c.id} className="rounded-2xl border bg-card p-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-xl font-semibold"><span className="mr-2 text-primary">{i + 1}.</span>{c.title}</h2>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => move(i, -1)}>↑</Button>
                  <Button size="sm" variant="ghost" onClick={() => move(i, 1)}>↓</Button>
                  {c.content && <Button size="sm" variant="ghost" onClick={() => { setEditing(c.id); setDraft(c.content); }}>Edit</Button>}
                  <Button size="sm" variant="outline" disabled={!!writing} onClick={() => writeOne(c).catch(() => {})}>
                    {writing === c.id ? "Writing…" : c.content ? "Regenerate" : "Write"}
                  </Button>
                </div>
              </div>
              {editing === c.id ? (
                <div className="mt-4 space-y-2">
                  <Textarea rows={16} value={draft} onChange={(e) => setDraft(e.target.value)} className="font-mono text-sm" />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => task("save", async () => { await supabase.from("chapters").update({ content: draft }).eq("id", c.id); setEditing(null); })}>Save</Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
                  </div>
                </div>
              ) : c.content ? (
                <div className="prose-doc mt-4 max-h-96 overflow-y-auto pr-2" dangerouslySetInnerHTML={{ __html: mdToHtml(c.content) }} />
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">{writing === c.id ? "AI is writing this chapter…" : c.summary}</p>
              )}
            </section>
          ))}
        </TabsContent>

        <TabsContent value="sales" className="mt-6">
          {!kit ? (
            <div className="rounded-2xl border border-dashed p-12 text-center">
              <h2 className="text-2xl font-semibold">Generate your sales kit</h2>
              <p className="mt-2 text-muted-foreground">Sales page, description, price suggestion and 5 social posts.</p>
              <Button className="mt-6" disabled={busy === "kit"} onClick={makeKit}>{busy === "kit" ? "Writing copy…" : "Generate sales kit"}</Button>
            </div>
          ) : (
            <div className="grid gap-6 lg:grid-cols-3">
              <div className="space-y-6 lg:col-span-2">
                <div className="rounded-2xl border bg-card p-6">
                  <h2 className="text-2xl font-bold">{kit.headline}</h2>
                  <div className="prose-doc mt-4" dangerouslySetInnerHTML={{ __html: mdToHtml(kit.salesPage) }} />
                  <CopyBtn text={kit.salesPage} />
                </div>
              </div>
              <div className="space-y-6">
                <div className="rounded-2xl border border-primary bg-card p-6">
                  <div className="text-xs uppercase tracking-widest text-muted-foreground">Suggested price</div>
                  <div className="mt-1 font-display text-4xl font-bold text-primary">{kit.price}</div>
                  <p className="mt-2 text-sm text-muted-foreground">{kit.priceReason}</p>
                </div>
                <div className="rounded-2xl border bg-card p-6">
                  <h3 className="font-semibold">Description</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{kit.description}</p>
                  <CopyBtn text={kit.description} />
                </div>
                <div className="rounded-2xl border bg-card p-6">
                  <h3 className="font-semibold">Social posts</h3>
                  <div className="mt-3 space-y-3">
                    {kit.socialPosts.map((s, i) => (
                      <div key={i} className="rounded-lg bg-muted p-3 text-sm">{s}<CopyBtn text={s} /></div>
                    ))}
                  </div>
                </div>
                <Button variant="outline" className="w-full" disabled={busy === "kit"} onClick={makeKit}>{busy === "kit" ? "Rewriting…" : "Regenerate"}</Button>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="design" className="mt-6 space-y-10">
          <section>
            <h2 className="text-2xl font-bold">PDF style</h2>
            {design?.reason && <p className="mt-1 text-sm text-muted-foreground">AI pick: {design.reason}</p>}
            <div className="mt-4 grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
              {THEMES.map((t) => (
                <button key={t.id} disabled={busy === "theme"} onClick={() => setTheme(t.id)}
                  className={`rounded-xl border p-2 text-left transition ${theme.id === t.id ? "border-primary ring-2 ring-primary" : "hover:border-primary"}`}>
                  <div className="aspect-[3/4] overflow-hidden rounded-md" style={{ background: rgb(t.coverBg) }}>
                    <div className="h-1/2" style={{ background: rgb(t.accent), opacity: 0.85 }} />
                    <div className="p-2" style={{ color: rgb(t.coverInk), fontFamily: t.heading === "times" ? "Georgia, serif" : "inherit" }}>
                      <div className="text-xs font-bold leading-tight">{p.title.slice(0, 40)}</div>
                      <div className="mt-1 h-0.5 w-6" style={{ background: rgb(t.accent) }} />
                    </div>
                  </div>
                  <div className="mt-2 text-sm font-semibold">{t.name}{design?.theme === t.id && " ★"}</div>
                  <div className="text-xs text-muted-foreground">{t.blurb}</div>
                </button>
              ))}
            </div>
          </section>
          <section>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-2xl font-bold">Pictures inside the PDF</h2>
                <p className="text-sm text-muted-foreground">AI picks the chapters that need a picture and draws them in your style. About 20s each.</p>
              </div>
              <Button disabled={!!imgProgress} onClick={makeImages}>
                {imgProgress ? `Creating ${imgProgress.done}/${imgProgress.total}…` : ch.some((c) => c.image_url) ? "Redo all pictures" : "Add pictures"}
              </Button>
            </div>
            {imgProgress && <div className="mt-3 h-2 rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(imgProgress.done / Math.max(1, imgProgress.total)) * 100}%` }} /></div>}
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {ch.map((c, i) => (
                <div key={c.id} className="overflow-hidden rounded-xl border bg-card">
                  <div className="aspect-[3/2] bg-muted">
                    {c.image_url ? <img src={c.image_url} alt={c.title} className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center text-xs text-muted-foreground">No picture</div>}
                  </div>
                  <div className="p-3">
                    <div className="text-sm font-medium">{i + 1}. {c.title}</div>
                    <div className="mt-2 flex gap-1">
                      <Button size="sm" variant="outline" disabled={!!imgBusy || !!imgProgress} onClick={() => redoImage(c)}>{imgBusy === c.id ? "Drawing…" : c.image_url ? "Regenerate" : "Add"}</Button>
                      {c.image_url && <Button size="sm" variant="ghost" onClick={() => removeImage(c.id)}>Remove</Button>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </TabsContent>

        <TabsContent value="cover" className="mt-6">
          <div className="grid gap-8 md:grid-cols-2">
            <div className="aspect-[2/3] overflow-hidden rounded-2xl border bg-muted">
              {p.cover_url ? (
                <div className="relative h-full w-full">
                  <img src={p.cover_url} alt="Cover" className="h-full w-full object-cover" />
                  <div className="absolute inset-x-0 bottom-0 bg-background/85 p-6">
                    <div className="font-display text-2xl font-bold text-primary">{p.title}</div>
                    <div className="mt-1 text-sm">{p.subtitle}</div>
                  </div>
                </div>
              ) : <div className="grid-bg grid h-full place-items-center text-muted-foreground">No cover yet</div>}
            </div>
            <div className="space-y-4">
              <h2 className="text-2xl font-bold">Deliver</h2>
              <p className="text-muted-foreground">Create an AI cover, then download your finished PDF and upload it to Gumroad, Etsy, Stan or Payhip.</p>
              <Button disabled={busy === "cover"} onClick={makeCover}>{busy === "cover" ? "Designing cover… (~30s)" : p.cover_url ? "New cover" : "Generate cover"}</Button>
              <div>
                <Button variant="outline" disabled={!done} onClick={download}>Download PDF</Button>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </main>
  );
}

function CopyBtn({ text }: { text: string }) {
  return (
    <button className="mt-2 block text-xs text-primary hover:underline" onClick={() => { navigator.clipboard.writeText(text); toast.success("Copied"); }}>
      Copy
    </button>
  );
}
