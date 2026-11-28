import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { analyzeCreator, extractCreatorStats, suggestCreatorSearches, planCreatorDraft, discoverCreators, type CreatorCandidate, type CreatorAnalysis } from "@/lib/ai.functions";
import { runFilters, parseCount, typicalReelViews } from "@/lib/creatorFilters";

export const Route = createFileRoute("/_authenticated/creators")({
  head: () => ({ meta: [{ title: "Creator partners — Synthforge" }] }),
  component: Creators,
});

const num = parseCount;
const empty = { handle: "", niche: "", followers: "", top: "", avg: "", email: "", sells: false, content: "" };

function creatorIdentity(value: string, strict = true) {
  const raw = value.trim();
  let tiktok = raw.startsWith("tiktok:");
  let handle = tiktok ? raw.slice(7) : raw.replace(/^@/, "");
  if (/^https?:\/\//i.test(raw)) {
    const url = new URL(raw);
    const domain = url.hostname.replace(/^www\./, "");
    if (domain !== "instagram.com" && domain !== "tiktok.com") throw new Error("Invalid profile domain.");
    tiktok = domain === "tiktok.com";
    handle = url.pathname.replace(/^\/@?/, "").replace(/\/$/, "");
  }
  if (strict && !/^[\w.]{1,30}$/.test(handle)) throw new Error("Invalid creator username.");
  return {
    handle, stored: tiktok ? "tiktok:" + handle : handle,
    url: tiktok ? "https://www.tiktok.com/@" + encodeURIComponent(handle) : "https://www.instagram.com/" + encodeURIComponent(handle) + "/",
  };
}

const countInput = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).nullish();
const shortlistRow = z.object({
  profile: z.string().max(300).url().refine((value) => /^https:\/\/(?:www\.)?(?:instagram\.com\/[\w.]{1,30}|tiktok\.com\/@[\w.]{1,30})\/?$/i.test(value)),
  niche: z.string().trim().max(300).optional(),
  followers: countInput,
  top_video_views: countInput,
  avg_reel_views: countInput,
  sells_product: z.boolean().nullish(),
  email: z.string().trim().email().max(254).nullish(),
  sources: z.array(z.string().url().max(1000).refine((value) => /^https?:\/\//i.test(value))).max(8).default([]),
  notes: z.string().trim().max(3000).default(""),
});
const importMetadata = z.object({
  sources: shortlistRow.shape.sources,
  sellsKnown: z.boolean(),
});
type ShortlistRow = z.infer<typeof shortlistRow> & { handle: string };
const shortlistPrefix = "Synthforge shortlist v1: ";
function unpackCreatorContent(content: string | null) {
  if (!content?.startsWith(shortlistPrefix)) return { text: content ?? "", imported: null };
  const end = content.indexOf("\n");
  if (end < 0) return { text: content, imported: null };
  try {
    const imported = importMetadata.safeParse(JSON.parse(content.slice(shortlistPrefix.length, end)));
    if (imported.success) return { text: content.slice(end + 1), imported: imported.data };
  } catch { /* Keep older creator notes readable. */ }
  return { text: content, imported: null };
}
function shortlistChecks(stats: Parameters<typeof runFilters>[0], sellsKnown: boolean) {
  return runFilters(stats).map((check, index) => {
    if (index === 2 && !sellsKnown) return { ...check, pass: null, detail: "Product status unknown" };
    if (index === 4 && !stats.email) return { ...check, pass: null, detail: "Business email unknown" };
    return check;
  });
}
function parseShortlist(value: string): ShortlistRow[] {
  const rows = z.array(shortlistRow).min(1).max(25).parse(JSON.parse(value));
  const unique = new Map<string, ShortlistRow>();
  for (const row of rows) {
    const handle = creatorIdentity(row.profile).stored.toLowerCase();
    if (!unique.has(handle)) unique.set(handle, { ...row, handle });
  }
  return [...unique.values()];
}

function Creators() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const analyzeFn = useServerFn(analyzeCreator);
  const planDraft = useServerFn(planCreatorDraft);
  const [transcripts, setTranscripts] = useState<Record<string, string[]>>({});
  const [importText, setImportText] = useState("");
  const [shortlist, setShortlist] = useState<ShortlistRow[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [importError, setImportError] = useState("");
  const [kw, setKw] = useState("");
  const [f, setF] = useState(empty);
  const [busy, setBusy] = useState<string | null>(null);
  const [myName, setMyName] = useState("");
  const extractFn = useServerFn(extractCreatorStats);
  const searchFn = useServerFn(suggestCreatorSearches);
  const [ideas, setIdeas] = useState<{ searches: { phrase: string; why: string }[]; hashtags: string[] } | null>(null);
  const [auto, setAuto] = useState(false);

  const discoverFn = useServerFn(discoverCreators);
  const [platform, setPlatform] = useState<"both" | "instagram" | "tiktok">("both");
  const [candidates, setCandidates] = useState<CreatorCandidate[] | null>(null);
  const [foundFor, setFoundFor] = useState("");

  const findCandidates = async () => {
    if (busy || kw.trim().length < 2) return;
    const query = kw.trim();
    setBusy("discover");
    setCandidates(null);
    try {
      const result = await discoverFn({ data: { query, platform } });
      setFoundFor(query);
      setCandidates(result);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't find creator candidates.");
    } finally {
      setBusy(null);
    }
  };

  const findIdeas = async () => {
    setBusy("search");
    try { setIdeas(await searchFn({ data: { niche: kw } })); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't suggest searches"); }
    finally { setBusy(null); }
  };

  const autoFill = async () => {
    if (f.content.trim().length < 10) { toast.error("Paste their profile and Reels text first"); return; }
    setAuto(true);
    try {
      const r = await extractFn({ data: { text: f.content } });
      const avg = typicalReelViews(r.reel_views ?? []);
      setF((o) => ({
        ...o,
        handle: o.handle || r.handle || "", niche: o.niche || r.niche || "", email: o.email || r.email || "",
        followers: r.followers != null ? String(r.followers) : o.followers,
        top: r.top_video_views != null ? String(r.top_video_views) : o.top,
        avg: avg != null ? String(avg) : o.avg, sells: r.sells_product ?? o.sells,
      }));
      toast.success("Details filled in — check them, then add the creator");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't read that"); }
    finally { setAuto(false); }
  };

  const { data: list } = useQuery({
    queryKey: ["creators"],
    queryFn: async () => {
      const { data, error } = await supabase.from("creators").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const add = async () => {
    let identity;
    try { identity = creatorIdentity(f.handle); }
    catch { toast.error("Enter an Instagram or TikTok handle or profile URL."); return; }
    const { data: u } = await supabase.auth.getUser();
    const { data: row, error } = await supabase.from("creators").insert({
      user_id: u.user!.id, handle: identity.stored, niche: f.niche || null, followers: num(f.followers), top_video_views: num(f.top), avg_reel_views: num(f.avg),
      email: f.email.trim() || null, sells_product: f.sells, content: f.content || null,
    }).select("*").single();
    if (error) { toast.error(error.message); return; }
    setF(empty); qc.invalidateQueries({ queryKey: ["creators"] });
    if (row.content && row.content.length >= 30) analyze(row);
  };

  const analyze = async (c: NonNullable<typeof list>[number]) => {
    const { text: creatorNotes } = unpackCreatorContent(c.content);
    if (creatorNotes.length < 30) { toast.error("Paste their bio and a few captions/video topics first"); return; }
    setBusy(c.id);
    try {
      const r = await analyzeFn({ data: { handle: creatorIdentity(c.handle, false).handle, niche: c.niche ?? "", followers: c.followers, content: creatorNotes, myName } });
      await supabase.from("creators").update({ analysis: r.analysis, offer: r.offer }).eq("id", c.id);
      qc.invalidateQueries({ queryKey: ["creators"] });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Analysis failed"); }
    finally { setBusy(null); }
  };

  const build = async (c: NonNullable<typeof list>[number]) => {
    if (busy) return;
    const a = c.analysis as CreatorAnalysis | null;
    const videos = (transcripts[c.id] ?? []).map((text) => text.trim()).filter(Boolean);
    if (!a && !videos.length) return;
    setBusy(c.id);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Sign in before building a draft.");
      const userId = u.user.id;
      const plan = videos.length ? await planDraft({ data: { handle: creatorIdentity(c.handle, false).handle, niche: (c.niche ?? "").slice(0, 300), transcripts: videos } }) : null;
      const legacy = a?.ebook;
      const { data: p, error } = await supabase.from("products").insert({
        user_id: userId, title: plan?.title ?? legacy!.title, subtitle: plan?.subtitle ?? legacy!.subtitle,
        topic: (a?.niche || c.niche || c.handle).slice(0, 300), audience: plan?.audience ?? a!.audience,
        product_type: plan?.productType ?? (legacy?.product_type || "ebook"), tone: a?.tone.slice(0, 40) ?? "friendly",
        status: "outline", promise: plan?.promise ?? legacy!.promise,
        design: { theme: "magazine", reason: "Creator-branded", coverByline: c.handle.trim().slice(0, 100), ...(plan ? { creatorVoice: plan.profile } : {}) },
      }).select("id").single();
      if (error) throw error;
      const chapters = plan?.chapters ?? legacy!.chapters.map((title) => ({ title, summary: ("Creator tone: " + a!.tone + ". Themes: " + a!.themes.join(", ")).slice(0, 1000) }));
      const { error: chapterError } = await supabase.from("chapters").insert(chapters.map((chapter, position) => ({ ...chapter, product_id: p.id, user_id: userId, position })));
      if (chapterError) {
        const cleanup = await supabase.from("products").delete().eq("id", p.id);
        if (cleanup.error) throw new Error(chapterError.message + " An empty draft may appear in My products.");
        throw chapterError;
      }
      const linked = await supabase.from("creators").update({ product_id: p.id }).eq("id", c.id);
      if (linked.error) toast.error("Draft created. Find it in My products if the creator link did not save.");
      await qc.invalidateQueries({ queryKey: ["creators"] });
      navigate({ to: "/products/$id", params: { id: p.id }, search: { autowrite: true } });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't create"); setBusy(null); }
  };

  const previewShortlist = () => {
    try {
      const drafted = parseShortlist(importText);
      const existing = new Set((list ?? []).map((item) => item.handle.toLowerCase()));
      const available = drafted.filter((row) => !existing.has(row.handle));
      setShortlist(available);
      setSelected(available.map((row) => row.handle));
      setImportError(available.length ? "" : "Those creators are already saved.");
    } catch (error) {
      setShortlist([]);
      setSelected([]);
      setImportError(error instanceof z.ZodError
        ? "Check entry " + (Number(error.issues[0]?.path[0] ?? 0) + 1) + ". Use a public profile URL, integer counts, and null for unknowns. Import up to 25 at once."
        : "Paste a valid JSON list of creator profiles.");
    }
  };

  const saveShortlist = async () => {
    if (busy || !selected.length) return;
    setBusy("import");
    setImportError("");
    try {
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (authError || !auth.user) throw new Error("Sign in again before importing a shortlist.");
      const { data: existing, error: listError } = await supabase.from("creators").select("handle");
      if (listError) throw new Error(listError.message);
      const handles = new Set(existing.map((item) => item.handle.toLowerCase()));
      const rows = shortlist.filter((row) => selected.includes(row.handle) && !handles.has(row.handle));
      if (!rows.length) throw new Error("The selected creators are already saved.");
      const result = await supabase.from("creators").insert(rows.map((row) => ({
        user_id: auth.user!.id,
        handle: row.handle,
        niche: row.niche ?? null,
        followers: row.followers ?? null,
        top_video_views: row.top_video_views ?? null,
        avg_reel_views: row.avg_reel_views ?? null,
        sells_product: row.sells_product ?? false,
        email: row.email ?? null,
        content: shortlistPrefix + JSON.stringify({ sources: row.sources, sellsKnown: row.sells_product != null }) + "\n" + row.notes,
      })));
      if (result.error) throw new Error(result.error.message);
      setShortlist((current) => current.filter((row) => !selected.includes(row.handle)));
      setSelected([]);
      await qc.invalidateQueries({ queryKey: ["creators"] });
      toast.success("Saved " + rows.length + (rows.length === 1 ? " creator." : " creators."));
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Couldn’t save the shortlist.");
    } finally {
      setBusy(null);
    }
  };

  const copy = (t: string) => { navigator.clipboard.writeText(t); toast.success("Copied"); };
  const q = encodeURIComponent(kw);

  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      <h1 className="text-4xl font-bold">Creator partners</h1>
      <p className="mt-2 text-muted-foreground">Find micro-creators, check the 5 filters, analyse their content, then get a personalised ebook and a ready-to-send offer.</p>

      <details className="mt-6 rounded-2xl border bg-card p-5">
        <summary className="cursor-pointer font-semibold">Import shortlist</summary>
        <div className="mt-3 space-y-3">
          <label className="block text-sm">Paste a JSON shortlist from ChatGPT
            <Textarea rows={5} value={importText} disabled={busy === "import"} onChange={(event) => {
              setImportText(event.target.value); setShortlist([]); setSelected([]); setImportError("");
            }} placeholder={'[{"profile":"https://www.instagram.com/example/","followers":45000}]'} />
          </label>
          <Button size="sm" variant="outline" disabled={!!busy || !importText.trim()} onClick={previewShortlist}>Preview shortlist</Button>
          {importError && <p role="alert" className="text-sm text-destructive">{importError}</p>}
          {shortlist.map((row) => {
            const checks = shortlistChecks({
              followers: row.followers ?? null, top_video_views: row.top_video_views ?? null,
              avg_reel_views: row.avg_reel_views ?? null, sells_product: row.sells_product ?? false, email: row.email ?? null,
            }, row.sells_product != null);
            return (
              <div key={row.handle} className="rounded-xl border p-3 text-sm">
                <label className="flex items-center gap-2 font-medium">
                  <input type="checkbox" disabled={busy === "import"} checked={selected.includes(row.handle)} onChange={(event) =>
                    setSelected((current) => event.target.checked ? [...current, row.handle] : current.filter((handle) => handle !== row.handle))} />
                  @{creatorIdentity(row.handle).handle} · {row.handle.startsWith("tiktok:") ? "TikTok" : "Instagram"}
                </label>
                <ul className="mt-2 space-y-1">
                  {checks.map((check) => <li key={check.label}>{check.pass === true ? "Pass" : check.pass === false ? "Doesn’t pass" : "Needs checking"} · {check.label} ({check.detail})</li>)}
                </ul>
                {!!row.sources.length && <div className="mt-2 flex flex-wrap gap-3">{row.sources.map((url, index) => <a key={url + index} href={url} target="_blank" rel="noreferrer" className="text-primary underline">Source {index + 1}</a>)}</div>}
              </div>
            );
          })}
          {!!shortlist.length && <Button size="sm" disabled={!!busy || !selected.length} onClick={() => void saveShortlist()}>{busy === "import" ? "Saving…" : "Save selected creators"}</Button>}
        </div>
      </details>

      <section className="mt-8 rounded-2xl border bg-card p-6">
        <h2 className="text-lg font-semibold">1. Find creators</h2>
                <p className="mt-1 text-sm text-muted-foreground">Enter an industry and keyword to find public creator profiles.</p>
        <form className="mt-3 flex flex-wrap items-end gap-2" onSubmit={(event) => { event.preventDefault(); void findCandidates(); }}>
          <label className="text-sm">Industry and keyword
            <Input className="w-64 max-w-full" placeholder="Parenting: preschool activities" maxLength={200} disabled={busy === "discover"} value={kw} onChange={(e) => setKw(e.target.value)} />
          </label>
          <label className="text-sm">Platform
            <select className="block h-9 rounded-md border bg-background px-3" disabled={busy === "discover"} value={platform}
              onChange={(e) => setPlatform(e.target.value as typeof platform)}>
              <option value="both">Both</option><option value="instagram">Instagram</option><option value="tiktok">TikTok</option>
            </select>
          </label>
          <Button type="submit" disabled={!!busy || kw.trim().length < 2}>{busy === "discover" ? "Searching…" : "Find creators"}</Button>
        </form>
        {candidates?.length === 0 && <p role="status" className="mt-3 text-sm">No profiles with a reported follower count of 10K–100K came back. Try a different keyword or platform.</p>}
        {!!candidates?.length && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {candidates.map((c) => (
              <article key={c.profile} className="rounded-xl border p-4 text-sm">
                <a href={c.profile} target="_blank" rel="noreferrer" className="font-semibold text-primary underline">@{creatorIdentity(c.handle, false).handle} · {c.platform}</a>
                <p className="mt-2">{c.fit} <a href={c.source} target="_blank" rel="noreferrer" className="text-primary underline">Source</a></p>
                <p className="mt-1 text-muted-foreground">{c.followers.toLocaleString()} followers reported. Other filters still need checking.</p>
                <Button size="sm" variant="outline" className="mt-3" onClick={() => {
                  setF({ ...empty, handle: c.profile, niche: foundFor, followers: String(c.followers) });
                  document.getElementById("creator-handle")?.focus();
                }}>Use this creator</Button>
              </article>
            ))}
          </div>
        )}
        <details className="mt-3">
          <summary className="cursor-pointer text-sm font-medium">Manual search options</summary>
        <div className="mt-3 flex flex-wrap gap-2">
          <Input className="max-w-sm" placeholder="parenting tips" value={kw} onChange={(e) => setKw(e.target.value)} />
          <Button asChild variant="outline" disabled={!kw}><a href={`https://www.instagram.com/explore/search/keyword/?q=${q}`} target="_blank" rel="noreferrer">Search Instagram</a></Button>
          <Button disabled={!kw || busy === "search"} onClick={findIdeas}>{busy === "search" ? "Thinking…" : "AI: where to search"}</Button>
          <Button asChild variant="outline" disabled={!kw}><a href={`https://www.google.com/search?q=${encodeURIComponent(`site:instagram.com "${kw}" "@gmail.com" OR "business inquiries"`)}`} target="_blank" rel="noreferrer">Find ones with emails</a></Button>
        </div>
        {ideas && (
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {ideas.searches.map((s) => (
              <a key={s.phrase} href={`https://www.instagram.com/explore/search/keyword/?q=${encodeURIComponent(s.phrase)}`} target="_blank" rel="noreferrer" className="rounded-xl border p-3 text-sm hover:border-primary">
                <b>{s.phrase} ↗</b><div className="text-muted-foreground">{s.why}</div>
              </a>
            ))}
            <div className="text-sm sm:col-span-2">{ideas.hashtags.map((h) => <a key={h} className="mr-3 text-primary underline" target="_blank" rel="noreferrer" href={`https://www.instagram.com/explore/tags/${h.replace(/^#/, "")}/`}>{h}</a>)}</div>
          </div>
        )}
        </details>
      </section>

      <section className="mt-6 rounded-2xl border bg-card p-6">
        <h2 className="text-lg font-semibold">2. Add a creator</h2>
        <p className="mt-1 text-sm text-muted-foreground">Open their profile, select all (Ctrl+A), copy, and paste it below with their Reels tab. Click "Fill in from pasted text" and the AI reads followers, views, email and whether they sell something. Adding them runs the analysis and offer automatically.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <Input id="creator-handle" placeholder="@handle or Instagram/TikTok profile link" value={f.handle} onChange={(e) => setF({ ...f, handle: e.target.value })} />
          <Input placeholder="Niche (e.g. toddler sleep)" value={f.niche} onChange={(e) => setF({ ...f, niche: e.target.value })} />
          <Input placeholder="Business email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
          <Input placeholder="Followers (e.g. 45k)" value={f.followers} onChange={(e) => setF({ ...f, followers: e.target.value })} />
          <Input placeholder="Views on the video you found" value={f.top} onChange={(e) => setF({ ...f, top: e.target.value })} />
          <Input placeholder="Typical views, last 10 Reels" value={f.avg} onChange={(e) => setF({ ...f, avg: e.target.value })} />
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={f.sells} onChange={(e) => setF({ ...f, sells: e.target.checked })} /> Already sells their own course/ebook/coaching</label>
        <Textarea className="mt-3" rows={5} placeholder="Paste their bio, recent captions and video topics — the AI uses this to learn their voice." value={f.content} onChange={(e) => setF({ ...f, content: e.target.value })} />
        <div className="mt-3 flex gap-2">
          <Button variant="outline" disabled={auto} onClick={autoFill}>{auto ? "Reading…" : "Fill in from pasted text"}</Button>
          <Button onClick={add}>Add creator</Button>
        </div>
      </section>

      <div className="mt-6 flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Sign offers as:</span>
        <Input className="max-w-xs" placeholder="Your name" value={myName} onChange={(e) => setMyName(e.target.value)} />
      </div>

      <div className="mt-6 space-y-4">
        {list?.map((c) => {
          const videos = transcripts[c.id] ?? [];
          const { imported } = unpackCreatorContent(c.content);
          const checks = imported ? shortlistChecks(c, imported.sellsKnown) : runFilters(c);
          const ok = checks.every((check) => check.pass === true); const a = c.analysis as CreatorAnalysis | null;
          return (
            <article key={c.id} className="rounded-2xl border bg-card p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <a href={creatorIdentity(c.handle, false).url} target="_blank" rel="noreferrer" className="text-xl font-semibold text-primary hover:underline">@{c.handle} ↗</a>
                  <div className="text-sm text-muted-foreground">{c.niche} {c.followers ? `· ${c.followers.toLocaleString()} followers` : ""}</div>
                  {c.email && <a href={`mailto:${c.email}`} className="text-sm underline">{c.email}</a>}
                </div>
                <div className="flex gap-2">
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${ok ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>{ok ? "Passes all 5" : `${checks.filter((x) => x.pass).length}/5 filters`}</span>
                  <Button size="sm" variant="ghost" onClick={async () => { await supabase.from("creators").delete().eq("id", c.id); qc.invalidateQueries({ queryKey: ["creators"] }); }}>Remove</Button>
                </div>
              </div>
              {!!imported?.sources.length && <div className="mt-2 flex flex-wrap gap-3 text-sm">{imported.sources.map((url, index) => <a key={url + index} href={url} target="_blank" rel="noreferrer" className="text-primary underline">Source {index + 1}</a>)}</div>}
              <ul className="mt-3 grid gap-1 text-sm sm:grid-cols-2">
                {checks.map((x) => <li key={x.label} className={x.pass === false ? "text-destructive" : x.pass == null ? "text-muted-foreground" : ""}>{x.pass ? "✓" : x.pass === false ? "✗" : "?"} {x.label} <span className="text-muted-foreground">— {x.detail}</span></li>)}
              </ul>
              <details className="mt-4 rounded-xl border p-3">
                <summary className="cursor-pointer text-sm font-medium">Video transcripts{videos.length ? " (" + videos.length + "/5)" : " (optional)"}</summary>
                <div className="mt-3 space-y-3">
                  <p className="text-sm text-muted-foreground">Paste up to five transcripts. Three relevant videos are a good starting point. Use material you have permission to adapt.</p>
                  {videos.map((video, i) => (
                    <label key={i} className="block text-sm font-medium">Transcript {i + 1}
                      <Textarea rows={4} maxLength={24000} disabled={busy !== null} value={video}
                        onChange={(event) => setTranscripts((current) => ({ ...current, [c.id]: videos.map((text, index) => index === i ? event.target.value : text) }))} />
                      <span className="text-xs text-muted-foreground">{video.length.toLocaleString()}/24,000 characters</span>
                    </label>
                  ))}
                  <Button size="sm" variant="outline" disabled={busy !== null || videos.length >= 5}
                    onClick={() => setTranscripts((current) => ({ ...current, [c.id]: [...videos, ""] }))}>{videos.length ? "Add another transcript" : "Add transcript"}</Button>
                  {videos.length > 0 && <Button className="ml-2" size="sm" variant="ghost" disabled={busy !== null}
                    onClick={() => setTranscripts((current) => ({ ...current, [c.id]: videos.slice(0, -1) }))}>Remove last</Button>}
                </div>
              </details>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button size="sm" disabled={busy === c.id} onClick={() => analyze(c)}>{busy === c.id ? "Working…" : a ? "Re-analyse & rewrite offer" : "Analyse content & write offer"}</Button>
                {(c.product_id || a || videos.some((text) => text.trim())) && (c.product_id
                  ? <Button size="sm" variant="outline" onClick={() => navigate({ to: "/products/$id", params: { id: c.product_id! }, search: { autowrite: undefined } })}>Open their ebook</Button>
                  : <Button size="sm" variant="outline" disabled={busy === c.id} onClick={() => build(c)}>Build draft</Button>)}
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
