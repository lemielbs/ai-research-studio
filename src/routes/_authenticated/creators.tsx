import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { analyzeCreator, type CreatorAnalysis } from "@/lib/ai.functions";
import { runFilters, passesAll } from "@/lib/creatorFilters";

export const Route = createFileRoute("/_authenticated/creators")({
  head: () => ({ meta: [{ title: "Creator partners — Synthforge" }] }),
  component: Creators,
});

const num = (v: string) => (v.trim() ? Math.round(Number(v.replace(/[^\d.]/g, "")) * (/k$/i.test(v.trim()) ? 1000 : 1)) : null);
const empty = { handle: "", niche: "", followers: "", top: "", avg: "", email: "", sells: false, content: "" };

function Creators() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const analyzeFn = useServerFn(analyzeCreator);
  const [kw, setKw] = useState("");
  const [f, setF] = useState(empty);
  const [busy, setBusy] = useState<string | null>(null);
  const [myName, setMyName] = useState("");

  const { data: list } = useQuery({
    queryKey: ["creators"],
    queryFn: async () => {
      const { data, error } = await supabase.from("creators").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const add = async () => {
    const handle = f.handle.replace(/^@/, "").replace(/.*instagram\.com\//, "").replace(/\/.*$/, "").trim();
    if (!handle) return toast.error("Add their Instagram handle");
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("creators").insert({
      user_id: u.user!.id, handle, niche: f.niche || null, followers: num(f.followers), top_video_views: num(f.top), avg_reel_views: num(f.avg),
      email: f.email.trim() || null, sells_product: f.sells, content: f.content || null,
    });
    if (error) return toast.error(error.message);
    setF(empty); qc.invalidateQueries({ queryKey: ["creators"] });
  };

  const analyze = async (c: NonNullable<typeof list>[number]) => {
    if (!c.content || c.content.length < 30) return toast.error("Paste their bio and a few captions/video topics first");
    setBusy(c.id);
    try {
      const r = await analyzeFn({ data: { handle: c.handle, niche: c.niche ?? "", followers: c.followers, content: c.content, myName } });
      await supabase.from("creators").update({ analysis: r.analysis, offer: r.offer }).eq("id", c.id);
      qc.invalidateQueries({ queryKey: ["creators"] });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Analysis failed"); }
    finally { setBusy(null); }
  };

  const build = async (c: NonNullable<typeof list>[number]) => {
    const a = c.analysis as CreatorAnalysis;
    setBusy(c.id);
    try {
      const { data: u } = await supabase.auth.getUser();
      const { data: p, error } = await supabase.from("products").insert({
        user_id: u.user!.id, title: a.ebook.title, subtitle: a.ebook.subtitle, topic: `${a.niche} — by @${c.handle}`, audience: a.audience,
        product_type: a.ebook.product_type || "ebook", tone: a.tone.slice(0, 40), status: "outline", promise: a.ebook.promise, design: { theme: "magazine", reason: "Creator-branded" },
      }).select("id").single();
      if (error) throw error;
      await supabase.from("chapters").insert(a.ebook.chapters.map((t, i) => ({ product_id: p.id, user_id: u.user!.id, position: i, title: t, summary: `Written in @${c.handle}'s voice (${a.tone}). Themes: ${a.themes.join(", ")}` })));
      await supabase.from("creators").update({ product_id: p.id }).eq("id", c.id);
      navigate({ to: "/products/$id", params: { id: p.id }, search: { autowrite: true } });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't create"); setBusy(null); }
  };

  const copy = (t: string) => { navigator.clipboard.writeText(t); toast.success("Copied"); };
  const q = encodeURIComponent(kw);

  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      <h1 className="text-4xl font-bold">Creator partners</h1>
      <p className="mt-2 text-muted-foreground">Find micro-creators, check the 5 filters, analyse their content, then get a personalised ebook and a ready-to-send offer.</p>

      <section className="mt-8 rounded-2xl border bg-card p-6">
        <h2 className="text-lg font-semibold">1. Find creators</h2>
        <p className="mt-1 text-sm text-muted-foreground">Type an industry + keyword (e.g. "parenting tips"). Skip the million-view videos and look for 50k–200k.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Input className="max-w-sm" placeholder="parenting tips" value={kw} onChange={(e) => setKw(e.target.value)} />
          <Button asChild variant="outline" disabled={!kw}><a href={`https://www.instagram.com/explore/search/keyword/?q=${q}`} target="_blank" rel="noreferrer">Search Instagram</a></Button>
          <Button asChild variant="outline" disabled={!kw}><a href={`https://www.google.com/search?q=${encodeURIComponent(`site:instagram.com "${kw}" "@gmail.com" OR "business inquiries"`)}`} target="_blank" rel="noreferrer">Find ones with emails</a></Button>
        </div>
      </section>

      <section className="mt-6 rounded-2xl border bg-card p-6">
        <h2 className="text-lg font-semibold">2. Add a creator</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <Input placeholder="@handle or profile link" value={f.handle} onChange={(e) => setF({ ...f, handle: e.target.value })} />
          <Input placeholder="Niche (e.g. toddler sleep)" value={f.niche} onChange={(e) => setF({ ...f, niche: e.target.value })} />
          <Input placeholder="Business email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
          <Input placeholder="Followers (e.g. 45k)" value={f.followers} onChange={(e) => setF({ ...f, followers: e.target.value })} />
          <Input placeholder="Views on the video you found" value={f.top} onChange={(e) => setF({ ...f, top: e.target.value })} />
          <Input placeholder="Avg views, last 10 Reels" value={f.avg} onChange={(e) => setF({ ...f, avg: e.target.value })} />
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={f.sells} onChange={(e) => setF({ ...f, sells: e.target.checked })} /> Already sells their own course/ebook/coaching</label>
        <Textarea className="mt-3" rows={5} placeholder="Paste their bio, recent captions and video topics — the AI uses this to learn their voice." value={f.content} onChange={(e) => setF({ ...f, content: e.target.value })} />
        <Button className="mt-3" onClick={add}>Add creator</Button>
      </section>

      <div className="mt-6 flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Sign offers as:</span>
        <Input className="max-w-xs" placeholder="Your name" value={myName} onChange={(e) => setMyName(e.target.value)} />
      </div>

      <div className="mt-6 space-y-4">
        {list?.map((c) => {
          const checks = runFilters(c); const ok = passesAll(c); const a = c.analysis as CreatorAnalysis | null;
          return (
            <article key={c.id} className="rounded-2xl border bg-card p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <a href={`https://instagram.com/${c.handle}`} target="_blank" rel="noreferrer" className="text-xl font-semibold text-primary hover:underline">@{c.handle} ↗</a>
                  <div className="text-sm text-muted-foreground">{c.niche} {c.followers ? `· ${c.followers.toLocaleString()} followers` : ""}</div>
                  {c.email && <a href={`mailto:${c.email}`} className="text-sm underline">{c.email}</a>}
                </div>
                <div className="flex gap-2">
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${ok ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>{ok ? "Passes all 5" : `${checks.filter((x) => x.pass).length}/5 filters`}</span>
                  <Button size="sm" variant="ghost" onClick={async () => { await supabase.from("creators").delete().eq("id", c.id); qc.invalidateQueries({ queryKey: ["creators"] }); }}>Remove</Button>
                </div>
              </div>
              <ul className="mt-3 grid gap-1 text-sm sm:grid-cols-2">
                {checks.map((x) => <li key={x.label} className={x.pass ? "" : "text-muted-foreground line-through"}>{x.pass ? "✓" : "✗"} {x.label}</li>)}
              </ul>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button size="sm" disabled={busy === c.id} onClick={() => analyze(c)}>{busy === c.id ? "Working…" : a ? "Re-analyse & rewrite offer" : "Analyse content & write offer"}</Button>
                {a && (c.product_id
                  ? <Button size="sm" variant="outline" onClick={() => navigate({ to: "/products/$id", params: { id: c.product_id! }, search: { autowrite: undefined } })}>Open their ebook</Button>
                  : <Button size="sm" variant="outline" disabled={busy === c.id} onClick={() => build(c)}>Build their ebook</Button>)}
              </div>
              {a && (
                <div className="mt-5 grid gap-5 lg:grid-cols-2">
                  <div className="text-sm">
                    <div className="text-xs uppercase tracking-widest text-primary">Analysis</div>
                    <p className="mt-2"><b>Audience:</b> {a.audience}</p>
                    <p><b>Voice:</b> {a.tone}</p>
                    <p><b>Pains:</b> {a.pains.join("; ")}</p>
                    <div className="mt-3 text-xs uppercase tracking-widest text-primary">Their ebook · {a.price}</div>
                    <p className="mt-1 text-lg font-semibold">{a.ebook.title}</p>
                    <p className="text-muted-foreground">{a.ebook.subtitle}</p>
                    <ol className="mt-2 list-decimal pl-5">{a.ebook.chapters.map((t) => <li key={t}>{t}</li>)}</ol>
                  </div>
                  <div>
                    <div className="flex items-center justify-between"><span className="text-xs uppercase tracking-widest text-primary">Offer — copy & paste</span><Button size="sm" variant="outline" onClick={() => copy(c.offer ?? "")}>Copy</Button></div>
                    <pre className="mt-2 whitespace-pre-wrap rounded-xl bg-muted p-4 font-sans text-sm">{c.offer}</pre>
                    {c.email && <Button asChild size="sm" className="mt-2"><a href={`mailto:${c.email}?subject=${encodeURIComponent((c.offer ?? "").match(/^Subject:\s*(.*)$/m)?.[1] ?? "Partnership idea")}&body=${encodeURIComponent((c.offer ?? "").replace(/^Subject:.*\n+/m, ""))}`}>Open in email</a></Button>}
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </main>
  );
}
