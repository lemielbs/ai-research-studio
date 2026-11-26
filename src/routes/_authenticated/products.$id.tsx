import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { writeChapter, generateSalesKit, generateCover, planImages, generateSectionImage, recommendDesign, reviewProductDraft, previewDraftFix, applyDraftFix, type DraftFix, type DraftReview, type ProductBrief, type ProductResearch, type CreatorVoice } from "@/lib/ai.functions";
import { COVER_LAYOUTS, COVER_TEMPLATE_IDS, THEMES, getTheme, rgb, type Theme } from "@/lib/themes";
import { mdToHtml } from "@/lib/markdown";
import { isMarketCountry, marketCountryName } from "@/lib/markets";
import { checkDraftDeliverables } from "@/lib/draft-deliverables";
import { buildCoverPdf, buildCoverPng, buildPdf, downloadCoverPng, exportPdf } from "@/lib/pdf";
import { buildLaunchKitSample, downloadLaunchKit } from "@/lib/launch-kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/products/$id")({
  validateSearch: (s: Record<string, unknown>) => ({ autowrite: s['autowrite'] === true || s['autowrite'] === "true" ? true : undefined }),
  head: () => ({ meta: [{ title: "Edit product — Synthforge" }] }),
  component: ProductPage,
});

function researchLinks(text: string, sources: ProductResearch["sources"]) {
  return text.split(/(\[\d+\])/g).map((part, index) => {
    const match = part.match(/^\[(\d+)\]$/);
    const source = match ? sources[Number(match[1]) - 1] : undefined;
    if (!source || !/^https?:\/\//i.test(source.url)) return part;
    return <a key={index} href={source.url} title={source.title} target="_blank" rel="noreferrer" className="font-medium text-primary underline">{part}</a>;
  });
}

const REVIEW_LABELS = {
  deliverable: "Missing deliverable",
  consistency: "Consistency",
  promise: "Product promise",
  source: "Source check",
  voice: "Creator voice",
} as const;

type Manuscript = Parameters<typeof buildPdf>[0];
type Chapter = Parameters<typeof buildPdf>[1][number] & { id: string };

const CHAPTER_PHOTO_FORMATS = "image/jpeg,image/png,image/webp";
const MAX_CHAPTER_PHOTO_BYTES = 15 * 1024 * 1024;

async function preparePhoto(file: File) {
  const supported = file.type
    ? CHAPTER_PHOTO_FORMATS.split(",").includes(file.type)
    : /\.(jpe?g|png|webp)$/i.test(file.name);
  if (!supported) throw new Error("Choose a JPG, PNG, or WebP photo.");
  if (file.size > MAX_CHAPTER_PHOTO_BYTES) throw new Error("Choose a photo that is 15 MB or smaller.");

  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode().catch(() => { throw new Error("This photo could not be opened."); });

    const canvas = document.createElement("canvas");
    const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser could not prepare the photo.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function CoverPreview({ book }: { book: Manuscript }) {
  const [exporting, setExporting] = useState(false);
  const savePng = async () => {
    setExporting(true);
    try {
      await downloadCoverPng(book);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't download the cover PNG.");
    } finally {
      setExporting(false);
    }
  };
  const [preview, setPreview] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [thumbnail, setThumbnail] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    let url: string | undefined;
    let thumbnailUrl: string | undefined;
    setPreview(null);
    setThumbnail(null);
    setFailed(false);
    void buildCoverPdf(book).then((pdf) => {
      if (!active) return;
      url = URL.createObjectURL(pdf.output("blob"));
      setPreview(url);
    }).catch(() => { if (active) setFailed(true); });
    void buildCoverPng(book, 320).then((png) => {
      if (!active) return;
      thumbnailUrl = URL.createObjectURL(png);
      setThumbnail(thumbnailUrl);
    }).catch(() => { if (active) setThumbnail(null); });
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
      if (thumbnailUrl) URL.revokeObjectURL(thumbnailUrl);
    };
  }, [book]);

  if (!preview) return <p role="status">{failed ? "Couldn’t load the cover preview." : "Preparing cover preview…"}</p>;
  return (
    <div className="space-y-2">
      <div className={thumbnail ? "grid items-start gap-3 xl:grid-cols-[minmax(0,1fr)_7rem]" : undefined}>
        <iframe title="Exported PDF cover" src={preview + "#toolbar=0&view=Fit"} className="aspect-[210/297] w-full rounded-xl border bg-muted" />
        {thumbnail && (
          <figure className="w-28">
            <img src={thumbnail} alt="Book cover at storefront size" className="w-full rounded border" />
            <figcaption className="mt-1 text-xs text-muted-foreground">Storefront size</figcaption>
          </figure>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" size="sm" disabled={exporting} onClick={savePng}>
          {exporting ? "Preparing cover PNG…" : "Download cover PNG"}
        </Button>
        <a className="text-sm font-medium text-primary underline" href={preview} target="_blank" rel="noreferrer">Open cover PDF</a>
      </div>
    </div>
  );
}

function PdfEditor({ book, chapters, locked, onSave }: {
  book: Manuscript;
  chapters: Chapter[];
  locked: boolean;
  onSave: (chapter: Chapter, content: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState<{ id: string; before: string; text: string } | null>(null);
  const [preview, setPreview] = useState<{ url: string; chapterPage?: number } | null>(null);
  const [jump, setJump] = useState(0);
  const [phonePreview, setPhonePreview] = useState(false);
  const [generating, setGenerating] = useState(true);
  const [previewError, setPreviewError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  const field = useRef<HTMLTextAreaElement>(null);
  const chapter = chapters.find((item) => item.id === draft?.id) ?? chapters[0];
  const currentDraft = draft?.id === chapter?.id ? draft : null;
  const text = currentDraft?.text ?? chapter?.content ?? "";
  const dirty = Boolean(currentDraft && text !== chapter?.content);
  const [query, setQuery] = useState("");
  const [match, setMatch] = useState(-1);
  const needle = query.trim().replace(/[.*+?^$${}()|[\]\\]/g, "\\$&");
  const matches = useMemo(() => needle ? Array.from(text.matchAll(new RegExp(needle, "gi"))) : [], [needle, text]);
  const find = (direction: number) => {
    if (!matches.length) return;
    const next = match < 0 ? (direction > 0 ? 0 : matches.length - 1)
      : (match + direction + matches.length) % matches.length;
    const result = matches[next]!;
    const input = field.current;
    if (!input) return;
    input.focus();
    input.setSelectionRange(result.index!, result.index! + result[0].length);
    setMatch(next);
  };


  useEffect(() => {
    let active = true;
    let url: string | undefined;
    setGenerating(true);
    setPreviewError("");
    setPreview(null);
    const timer = window.setTimeout(async () => {
      try {
        const included = chapters.map((item) =>
          item.id === chapter?.id ? { ...item, content: text } : item
        ).filter((item) => item.content.trim());
        const selected = included.findIndex((item) => item.id === chapter?.id);
        let chapterPage: number | undefined;
        const doc = await buildPdf(book, included, (index, pageNumber) => {
          if (index === selected) chapterPage = pageNumber;
        });
        if (!active) return;
        const blob = doc.output("blob");
        url = URL.createObjectURL(blob);
        setPreview({ url, ...(chapterPage === undefined ? {} : { chapterPage }) });
      } catch {
        if (active) setPreviewError("Couldn’t render this preview. Try switching tabs and coming back.");
      } finally {
        if (active) setGenerating(false);
      }
    }, 450);
    return () => {
      active = false;
      window.clearTimeout(timer);
      if (url) URL.revokeObjectURL(url);
    };
  }, [book, chapters, chapter?.id, text]);

  const changeText = (value: string) => {
    if (!chapter) return;
    setDraft({ id: chapter.id, before: currentDraft?.before ?? chapter.content, text: value });
    setMatch(-1);
    setSaveError("");
  };

  const formatLine = (prefix: string) => {
    const input = field.current;
    if (!input) return;
    const start = input.selectionStart;
    const lineStart = text.lastIndexOf("\n", start - 1) + 1;
    const next = text.slice(0, lineStart) + prefix + text.slice(lineStart);
    changeText(next);
    requestAnimationFrame(() => { input.focus(); input.setSelectionRange(start + prefix.length, start + prefix.length); });
  };

  const save = async () => {
    if (!chapter || !currentDraft || !dirty || locked || saving) return;
    setSaving(true);
    try {
      await onSave({ ...chapter, content: currentDraft.before }, text);
      setDraft(null);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Couldn’t save the chapter.");
    } finally {
      setSaving(false);
    }
  };

  if (!chapter) return <p className="text-sm text-muted-foreground">Write a chapter to preview the book.</p>;
  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <section className="space-y-3 rounded-xl border bg-card p-4">
        <label className="block text-sm font-medium" htmlFor="pdf-edit-chapter">Chapter</label>
        <select id="pdf-edit-chapter" className="w-full rounded-md border bg-background p-2 text-sm" value={chapter.id}
          disabled={dirty || saving} onChange={(event) => {
            const next = chapters.find((item) => item.id === event.target.value);
            if (next) setDraft({ id: next.id, before: next.content, text: next.content });
            setMatch(-1);
          }}>
          {chapters.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
        </select>
        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor="pdf-chapter-find">Find in this chapter</label>
          <div className="flex flex-wrap gap-2">
            <Input id="pdf-chapter-find" className="min-w-32 flex-1" value={query} onChange={(event) => {
              setQuery(event.target.value);
              setMatch(-1);
            }} onKeyDown={(event) => {
              if (event.key === "Enter") { event.preventDefault(); find(event.shiftKey ? -1 : 1); }
            }} />
            <Button size="sm" variant="outline" disabled={!matches.length || locked || saving} onClick={() => find(-1)}>Previous</Button>
            <Button size="sm" variant="outline" disabled={!matches.length || locked || saving} onClick={() => find(1)}>Next</Button>
          </div>
          {needle && <p role="status" className="text-xs text-muted-foreground">{matches.length ? (match < 0 ? matches.length + " matches" : (match + 1) + " of " + matches.length) : "No matches"}</p>}
        </div>
        <div className="flex flex-wrap gap-1" aria-label="Text formatting">
          <Button size="sm" variant="outline" disabled={locked || saving} onClick={() => formatLine("## ")}>Heading</Button>
          <Button size="sm" variant="outline" disabled={locked || saving} onClick={() => formatLine("- ")}>Bullet</Button>
          <Button size="sm" variant="outline" disabled={locked || saving} onClick={() => formatLine("- [ ] ")}>Checkbox</Button>
          <Button size="sm" variant="outline" disabled={locked || saving} onClick={() => formatLine("> Field: ")}>Answer line</Button>
        </div>
        <label className="sr-only" htmlFor="pdf-edit-text">Chapter text</label>
        <Textarea id="pdf-edit-text" ref={field} className="min-h-[24rem] text-sm leading-relaxed" value={text}
          disabled={locked || saving} onChange={(event) => changeText(event.target.value)} />
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" disabled={!dirty || !text.trim() || locked || saving} onClick={() => void save()}>{saving ? "Saving…" : "Save chapter"}</Button>
          {dirty && <Button size="sm" variant="ghost" disabled={saving} onClick={() => {
            setDraft({ id: chapter.id, before: chapter.content, text: chapter.content });
            setSaveError("");
          }}>Discard edits</Button>}
          {dirty && <span className="text-xs text-muted-foreground">Unsaved edits appear in the preview.</span>}
        </div>
        {saveError && <p role="alert" className="text-sm text-destructive">{saveError}</p>}
      </section>
      <section className="min-w-0 space-y-2" aria-label="PDF preview" aria-busy={generating}>
        <div className="flex min-h-9 flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">PDF preview</h2>
          {preview && <a href={preview.url} target="_blank" rel="noreferrer" className="text-sm text-primary underline">Open preview in a new tab</a>}
        </div>
        <div role="group" aria-label="Preview size" className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant={phonePreview ? "outline" : "secondary"}
            aria-pressed={!phonePreview} onClick={() => setPhonePreview(false)}>Desktop</Button>
          <Button type="button" size="sm" variant={phonePreview ? "secondary" : "outline"}
            aria-pressed={phonePreview} onClick={() => setPhonePreview(true)}>Mobile</Button>
        </div>
        {preview?.chapterPage && <Button size="sm" variant="outline" onClick={() => setJump((value) => value + 1)}>Jump to chapter (page {preview.chapterPage})</Button>}
        {previewError && <p role="alert" className="text-sm text-destructive">{previewError}</p>}
        {preview ? (
          <div className={phonePreview ? "mx-auto w-full max-w-[390px]" : "w-full"}>
            <iframe key={jump} title="Book PDF preview"
              src={preview.url + (phonePreview ? `#page=${preview.chapterPage ?? 1}&view=FitH&toolbar=0` : preview.chapterPage ? "#page=" + preview.chapterPage : "")}
              className="h-[70vh] min-h-[28rem] w-full rounded-lg border bg-muted" />
          </div>
        ) : generating && <p role="status" className="rounded-lg border bg-muted p-5 text-sm">Rendering PDF preview…</p>}
      </section>
    </div>
  );
}


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
  const styleFn = useServerFn(recommendDesign);
  const reviewFn = useServerFn(reviewProductDraft);
  const previewFixFn = useServerFn(previewDraftFix);
  const applyFixFn = useServerFn(applyDraftFix);
  const [activeFix, setActiveFix] = useState<{ source: "review" | "delivery"; index: number } | null>(null);
  const [intendedValue, setIntendedValue] = useState("");
  const [proposal, setProposal] = useState<DraftFix | null>(null);
  const [fixBusy, setFixBusy] = useState(false);
  const [fixError, setFixError] = useState("");
  const [review, setReview] = useState<{ productId: string; result: DraftReview } | null>(null);
  const [reviewError, setReviewError] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [showAllFindings, setShowAllFindings] = useState(false);
  const [writingAll, setWritingAll] = useState(false);
  const reviewInProgress = useRef(false);
  const writingAllInProgress = useRef(false);
  const [savingStyle, setSavingStyle] = useState(false);
  const [imgProgress, setImgProgress] = useState<{ done: number; total: number } | null>(null);
  const [imgBusy, setImgBusy] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState<string | null>(null);
  const photoPicker = useRef<HTMLInputElement>(null);
  const photoChapter = useRef<string | null>(null);
  const [writing, setWriting] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [samplePreview, setSamplePreview] = useState<{
    productId: string; url: string; first: number; last: number; previewed: string; selection: string;
  } | null>(null);
  const sampleUrl = samplePreview?.url;
  useEffect(() => () => { if (sampleUrl) URL.revokeObjectURL(sampleUrl); }, [sampleUrl]);
  const picturesBusy = Boolean(imgBusy || imgProgress || photoBusy || busy === "rmimg");
  const [bylineEdit, setBylineEdit] = useState<{ productId: string; value: string } | null>(null);
  const bylineDraft = bylineEdit?.productId === id ? bylineEdit.value : null;
  const [coverReferenceId, setCoverReferenceId] = useState("");
  const coverPicker = useRef<HTMLInputElement>(null);
  const completeCoverPicker = useRef<HTMLInputElement>(null);
  const [bookDetails, setBookDetails] = useState<{ id: string; title: string; subtitle: string } | null>(null);
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
        subtitle: (data.p.subtitle ?? "").slice(0, 300), promise: (data.p.promise ?? "").slice(0, 500),
        isFinalChapter: data.ch.at(-1)?.id === c.id,
        chapterTitle: c.title, summary: c.summary ?? "", outline: outlineText.slice(0, 4000), brief: design?.brief ?? undefined, research: design?.research ?? undefined, creatorVoice: design?.creatorVoice ?? undefined, marketCountry,
      } });
      const { error } = await supabase.from("chapters").update({ content: r.content }).eq("id", c.id);
      if (error) throw error;
      setReview(null);
      setReviewError("");
      await refresh();
    } catch (e) { toast.error((e as Error).message); throw e; }
    finally { setWriting(null); }
  };

  const runReview = async () => {
    if (reviewInProgress.current) return;
    reviewInProgress.current = true;
    setReviewing(true);
    setReviewError("");
    try {
      setActiveFix(null);
      setProposal(null);
      setShowAllFindings(false);
      const result = await reviewFn({ data: { productId: id } });
      setReview({ productId: id, result });
    } catch (error) {
      setReviewError((error as Error).message);
    } finally {
      reviewInProgress.current = false;
      setReviewing(false);
    }
  };

  const makePreview = async (finding: DraftReview["findings"][number], value: string, verifyCoverage = false) => {
    if (fixBusy) return;
    setFixBusy(true);
    setProposal(null);
    setFixError("");
    try {
      setProposal(await previewFixFn({ data: { productId: id, finding, intendedValue: value.trim() || undefined, verifyCoverage } }));
    } catch (error) {
      setFixError(error instanceof Error ? error.message : "The fix could not be completed.");
    } finally {
      setFixBusy(false);
    }
  };

  const applyPreview = async () => {
    if (activeFix === null || !proposal || fixBusy) return;
    setFixBusy(true);
    setFixError("");
    try {
      await applyFixFn({ data: { productId: id, edit: proposal.edit } });
      setActiveFix(null);
      setProposal(null);
      setReview(null);
      await refresh();
      toast.success("Fix applied.");
    } catch (error) {
      setFixError(error instanceof Error ? error.message : "The fix could not be completed.");
    } finally {
      setFixBusy(false);
    }
  };

  const writeAll = async () => {
    if (!data || writingAllInProgress.current || reviewInProgress.current) return;
    writingAllInProgress.current = true;
    setWritingAll(true);
    try {
      for (const c of data.ch) if (!c.content.trim()) await writeOne(c);
      const { error } = await supabase.from("products").update({ status: "written" }).eq("id", id);
      if (error) {
        toast.error(error.message);
        return;
      }
      await refresh();
      toast.success("All chapters written!");
      await runReview();
    } catch { /* Chapter writing already shows its error. */ }
    finally {
      writingAllInProgress.current = false;
      setWritingAll(false);
    }
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

  const design = (data?.p.design ?? null) as { theme?: string; reason?: string; customStyle?: Theme | null; brief?: ProductBrief | null; research?: ProductResearch | null; creatorVoice?: CreatorVoice; coverByline?: string; coverLayout?: Theme["cover"] | null; coverTemplate?: Theme["cover"] | null; coverMode?: "complete" | null; templateArtwork?: string | null; marketCountry?: string } | null;
  const marketCountry = typeof design?.marketCountry === "string" && isMarketCountry(design.marketCountry)
    ? design.marketCountry : undefined;
  const [voiceEdit, setVoiceEdit] = useState<CreatorVoice | null>(null);
  const customStyle = design?.theme === "custom" ? design.customStyle ?? undefined : undefined;
  const theme = customStyle ?? getTheme(design?.theme);
  const coverTemplate = design?.coverTemplate ?? null;
  const coverLayout = coverTemplate ?? design?.coverLayout ?? theme.cover;

  const chooseCoverTemplate = (template: Theme["cover"] | null) => task("cover-template", async () => {
    const { error } = await supabase.from("products").update({ design: { ...design, coverTemplate: template } }).eq("id", id);
    if (error) throw error;
  });
  const coverByline = design?.coverByline ?? "";
  const completeCover = design?.coverMode === "complete";
  const coverBusy = busy !== null || savingStyle;

  const updateCover = async (artwork: string | null, settings: typeof design = design) => {
    const { error } = await supabase.from("products").update({
      cover_url: artwork,
      ...(settings ? { design: settings } : {}),
    }).eq("id", id);
    if (error) throw error;
  };

  const saveCompleteCover = (artwork: string) => updateCover(artwork, {
    ...design,
    coverMode: "complete",
    templateArtwork: completeCover ? design?.templateArtwork ?? null : data?.p.cover_url ?? null,
  });

  const useTemplateCover = () => task("cover", () => updateCover(design?.templateArtwork ?? null, {
    ...design,
    coverMode: null,
    templateArtwork: null,
  }));

  const uploadCover = (file: File, complete: boolean) => task("cover", async () => {
    const image = await preparePhoto(file);
    if (complete) await saveCompleteCover(image);
    else await updateCover(image);
  });

  const imageChapters = data?.ch.filter((chapter) => chapter.image_url) ?? [];
  const coverReference = imageChapters.find((chapter) => chapter.id === coverReferenceId)
    ?? imageChapters.find((chapter) => chapter.image_prompt) ?? imageChapters[0];

  const useChapterArtwork = () => task("cover", async () => {
    if (!coverReference?.image_url) return;
    await updateCover(coverReference.image_url, { ...design, coverMode: null, templateArtwork: null });
  });

  const makeCover = (mode: "complete" | "artwork") => task("cover", async () => {
    const r = await coverFn({ data: {
      title: data!.p.title.slice(0, 200), topic: data!.p.topic.slice(0, 300),
      subtitle: (data!.p.subtitle ?? "").slice(0, 300), promise: (data!.p.promise ?? "").slice(0, 400),
      audience: (data!.p.audience ?? "").slice(0, 300), style: theme.imageStyle,
      mode,
      marketCountry,
      referenceImage: coverReference?.image_url ?? undefined,
      ...(mode === "complete" ? { byline: coverByline } : { template: coverLayout }),
      palette: [theme.coverBg, theme.coverInk, theme.accent, theme.soft],
    } });
    if (mode === "complete") await saveCompleteCover(r.dataUrl);
    else await updateCover(r.dataUrl);
  });

  const saveByline = (value: string) => task("byline", async () => {
    const { error } = await supabase.from("products").update({ design: { ...design, coverByline: value.trim() } }).eq("id", id);
    if (error) throw error;
    setBylineEdit(null);
    toast.success("Cover byline saved.");
  });

  const setTheme = (tid: string) => task("theme", async () => {
    const { error } = await supabase.from("products").update({ design: { ...(design ?? {}), theme: tid, reason: null, customStyle: null, coverLayout: null } }).eq("id", id);
    if (error) throw error;
  });

  const generateStyle = async () => {
    if (!data || savingStyle || busy !== null) return;
    setSavingStyle(true);
    try {
      const { p, ch } = data;
      const chapterBudget = Math.floor(14000 / Math.max(ch.length, 1));
      const contents = ch
        .map((chapter) => [
          chapter.title,
          (chapter.content.trim() || chapter.summary || "").slice(0, chapterBudget),
        ].join("\n"))
        .join("\n\n")
        .slice(0, 16000);
      const style = await styleFn({ data: {
        title: p.title.slice(0, 200),
        subtitle: (p.subtitle ?? "").slice(0, 300),
        promise: (p.promise ?? "").slice(0, 400),
        topic: p.topic.slice(0, 300),
        audience: (p.audience ?? "").slice(0, 300),
        tone: (p.tone ?? "").slice(0, 40),
        contents,
        custom: true,
        marketCountry,
        baseTheme: theme.id,
      } });
      if ("keepCurrentStyle" in style && style.keepCurrentStyle) {
        toast.error("The AI couldn’t create a usable palette. Your current style is still saved.");
        return;
      }
      const { error } = await supabase.from("products")
        .update({ design: { ...(design ?? {}), coverLayout: null, ...style } })
        .eq("id", id);
      if (error) throw error;
      await refresh();
      toast.success("PDF style applied.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSavingStyle(false);
    }
  };

  const oneImage = async (cid: string, prompt: string, referenceImage?: string, preserveUploads = false) => {
    const r = await imgFn({ data: { prompt, style: theme.imageStyle, referenceImage } });
    const update = supabase.from("chapters").update({ image_url: r.dataUrl, image_prompt: prompt })
      .eq("product_id", id).eq("id", cid);
    // Uploaded pictures have no AI prompt. Recheck before saving in case another tab uploaded one.
    const { error } = await (preserveUploads ? update.or("image_url.is.null,image_prompt.not.is.null") : update);
    if (error) throw error;
    return r.dataUrl;
  };

  const uploadPhoto = async (cid: string, file: File) => {
    if (picturesBusy) return;
    setPhotoBusy(cid);
    try {
      const imageUrl = await preparePhoto(file);
      const { data: saved, error } = await supabase.from("chapters")
        .update({ image_url: imageUrl, image_prompt: null })
        .eq("product_id", id).eq("id", cid).select("id").maybeSingle();
      if (error) throw error;
      if (!saved) throw new Error("The chapter photo could not be saved.");
      await refresh();
      toast.success("Chapter photo saved.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPhotoBusy(null);
    }
  };

  const makeImages = async () => {
    if (!data || picturesBusy) return;
    const eligible = data.ch.filter((c) => !c.image_url || c.image_prompt !== null);
    if (!eligible.length) return;
    try {
      setImgProgress({ done: 0, total: 1 });
      const plan = await planFn({ data: { title: data.p.title, chapters: eligible.map((c) => ({ id: c.id, title: c.title, summary: (c.summary ?? "").slice(0, 900) })) } });
      const items = plan.images.filter((x) => eligible.some((c) => c.id === x.id));
      setImgProgress({ done: 0, total: items.length });
      let referenceImage = coverReference?.image_url ?? data.p.cover_url ?? undefined;
      for (const [k, it] of items.entries()) {
        try {
          const image = await oneImage(it.id, it.prompt, referenceImage, true);
          referenceImage ??= image;
        } catch (e) { toast.error((e as Error).message); }
        setImgProgress({ done: k + 1, total: items.length });
        await refresh();
      }
      toast.success("Pictures ready!");
    } catch (e) { toast.error((e as Error).message); }
    finally { setImgProgress(null); }
  };

  const redoImage = async (c: { id: string; title: string; summary: string | null; image_prompt: string | null }) => {
    setImgBusy(c.id);
    try {
      await oneImage(c.id, c.image_prompt || `${c.title}: ${c.summary ?? ""}`, coverReference?.image_url ?? data?.p.cover_url ?? undefined);
      await refresh();
    }
    catch (e) { toast.error((e as Error).message); } finally { setImgBusy(null); }
  };

  const removeImage = (cid: string) => task("rmimg", async () => {
    const { error } = await supabase.from("chapters").update({ image_url: null }).eq("product_id", id).eq("id", cid);
    if (error) throw error;
  });

  const product = data?.p;
  const sources = design?.research?.sources;
  const pdfBook = useMemo(() => product && ({
    title: product.title, subtitle: product.subtitle, cover: product.cover_url, promise: product.promise,
    theme: theme.id, customStyle, audience: product.audience, coverByline, coverLayout, completeCover, sources,
    productType: product.product_type,
  }), [product, theme.id, customStyle, coverByline, coverLayout, completeCover, sources]);
  const download = () => data && pdfBook && exportPdf(pdfBook, data.ch.filter((c) => c.content.trim()));

  const savePreviewChapter = async (chapter: Chapter, content: string) => {
    const { data: saved, error } = await supabase.from("chapters").update({ content })
      .eq("product_id", id).eq("id", chapter.id).eq("content", chapter.content).select("id").maybeSingle();
    if (error) throw new Error(error.message);
    if (!saved) throw new Error("The saved chapter changed while you were editing. Copy your edits before reloading.");
    setReview(null);
    setReviewError("");
    setProposal(null);
    setActiveFix(null);
    await refresh();
    toast.success("Chapter saved.");
  };

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
  const done = ch.filter((c) => c.content.trim()).length;
  const allWritten = ch.length > 0 && done === ch.length;
  const deliveryFindings = allWritten ? checkDraftDeliverables(p, ch) : [];
  const sample = samplePreview?.productId === id ? samplePreview : null;
  const previewSample = (selection?: string) => task("sample-preview", async () => {
    if (!pdfBook || !allWritten) return;
    const { pdf, first, last, pages } = await buildLaunchKitSample(pdfBook, ch, selection);
    const previewed = pages.join(", ");
    const url = URL.createObjectURL(pdf.output("blob"));
    setSamplePreview({ productId: id, url, first, last, previewed, selection: previewed });
  });
  const launchKit = () => task("launch-kit", async () => {
    if (pdfBook && allWritten) await downloadLaunchKit(pdfBook, ch, kit, sample?.selection);
  });
  const draftReview = review?.productId === id ? review.result : null;
  const reviewBusy = Boolean(writing || writingAll || reviewing || fixBusy || busy === "voice" || busy === "save" || busy === "details");

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-widest text-primary">{p.product_type} · {done}/{ch.length} chapters</div>
          <h1 className="mt-2 text-4xl font-bold">{p.title}</h1>
          {marketCountry && <p className="mt-1 text-sm text-muted-foreground">Target market: {marketCountryName(marketCountry)}</p>}
          {p.subtitle && <p className="mt-2 max-w-2xl text-muted-foreground">{p.subtitle}</p>}
          {bookDetails?.id === id ? (
            <form className="mt-3 space-y-3" onSubmit={(event) => {
              event.preventDefault();
              if (!bookDetails.title.trim() || reviewBusy) return;
              void task("details", async () => {
                const { error } = await supabase.from("products").update({
                  title: bookDetails.title.trim(),
                  subtitle: bookDetails.subtitle.trim() || null,
                }).eq("id", id);
                if (error) throw error;
                setBookDetails(null);
                setReview(null);
                setReviewError("");
                setProposal(null);
                setActiveFix(null);
                await qc.invalidateQueries({ queryKey: ["products"] });
              });
            }}>
              <label className="block text-sm font-medium">Title
                <Input required maxLength={200} value={bookDetails.title} onChange={(event) => setBookDetails({ ...bookDetails, title: event.target.value })} />
              </label>
              <label className="block text-sm font-medium">Subtitle
                <Input maxLength={300} value={bookDetails.subtitle} onChange={(event) => setBookDetails({ ...bookDetails, subtitle: event.target.value })} />
              </label>
              <div className="flex gap-2">
                <Button size="sm" type="submit" disabled={reviewBusy || !bookDetails.title.trim()}>Save details</Button>
                <Button size="sm" type="button" variant="ghost" disabled={busy === "details"} onClick={() => setBookDetails(null)}>Cancel</Button>
              </div>
            </form>
          ) : (
            <Button className="mt-2" size="sm" variant="ghost" disabled={reviewBusy} onClick={() => setBookDetails({
              id, title: p.title, subtitle: p.subtitle ?? "",
            })}>Edit title and subtitle</Button>
          )}
          {p.promise && <p className="mt-3 max-w-2xl text-sm italic">"{p.promise}"</p>}
        </div>
        <div className="flex gap-2">
          {done < ch.length && <Button disabled={reviewBusy} onClick={writeAll}>{writing ? "Writing…" : "Write remaining"}</Button>}
          <Button variant="outline" disabled={!done} onClick={download}>Download PDF</Button>
          <Button variant="ghost" onClick={del}>Delete</Button>
        </div>
      </div>

      <Tabs defaultValue="content">
        <TabsList className="h-auto flex-wrap justify-start">
          <TabsTrigger value="content">Develop</TabsTrigger>
          <TabsTrigger value="preview">Preview & edit</TabsTrigger>
          <TabsTrigger value="sales">Distribute</TabsTrigger>
          <TabsTrigger value="design">Design & pictures</TabsTrigger>
          <TabsTrigger value="cover">Deliver</TabsTrigger>
        </TabsList>

        <TabsContent value="preview" forceMount className="mt-6 data-[state=inactive]:hidden">
          {pdfBook && <PdfEditor key={id} book={pdfBook} chapters={ch} locked={reviewBusy} onSave={savePreviewChapter} />}
        </TabsContent>

        <TabsContent value="content" className="mt-6 space-y-4">
          {design?.creatorVoice && (
            <details className="rounded-xl border bg-card p-4">
              <summary className="cursor-pointer font-semibold">Creator voice profile</summary>
              <div className="mt-3 space-y-3 text-sm">
                <p className="whitespace-pre-wrap">{design.creatorVoice.voice}</p>
                <p className="whitespace-pre-wrap">{design.creatorVoice.teaching}</p>
                {design.creatorVoice.examples && <p className="whitespace-pre-wrap">{design.creatorVoice.examples}</p>}
                {voiceEdit ? (
                  <form className="space-y-2" onSubmit={(event) => {
                    event.preventDefault();
                    if (busy || writing || writingAll || reviewing || fixBusy) return;
                    const voice = voiceEdit.voice.trim();
                    const teaching = voiceEdit.teaching.trim();
                    if (!voice || !teaching) return;
                    void task("voice", async () => {
                      const { data: saved, error } = await supabase.from("products")
                        .update({ design: { ...design, creatorVoice: { voice, teaching, examples: voiceEdit.examples.trim() } } })
                        .eq("id", id).eq("design", JSON.stringify(data.p.design)).select("id").maybeSingle();
                      if (error || !saved) throw new Error(error?.message ?? "The product changed. Reopen the voice profile and try again.");
                      setVoiceEdit(null);
                      setReview(null);
                      setProposal(null);
                      setActiveFix(null);
                    });
                  }}>
                    <label className="block">Voice and tone<Textarea required maxLength={1800} value={voiceEdit.voice} onChange={(event) => setVoiceEdit({ ...voiceEdit, voice: event.target.value })} /></label>
                    <label className="block">Teaching methods<Textarea required maxLength={2200} value={voiceEdit.teaching} onChange={(event) => setVoiceEdit({ ...voiceEdit, teaching: event.target.value })} /></label>
                    <label className="block">Examples from transcripts<Textarea maxLength={2200} value={voiceEdit.examples} onChange={(event) => setVoiceEdit({ ...voiceEdit, examples: event.target.value })} /></label>
                    <Button size="sm" type="submit" disabled={reviewBusy || busy !== null}>Save voice profile</Button>
                    <Button size="sm" type="button" variant="ghost" disabled={busy === "voice"} onClick={() => setVoiceEdit(null)}>Cancel</Button>
                  </form>
                ) : <Button size="sm" variant="outline" disabled={reviewBusy || busy !== null} onClick={() => setVoiceEdit(design.creatorVoice!)}>Edit voice profile</Button>}
                <p className="text-muted-foreground">Get the creator’s approval before publishing under their name.</p>
              </div>
            </details>
          )}
          {design?.research !== undefined && (
            <details className="rounded-xl border bg-card p-4">
              <summary className="cursor-pointer font-semibold">Research and sources</summary>
              {design.research ? (
                <div className="mt-3 space-y-4 text-sm">
                  <div><h3 className="font-medium">Buyer signals</h3><p className="whitespace-pre-wrap">{researchLinks(design.research.demand, design.research.sources)}</p></div>
                  <div><h3 className="font-medium">Sources for the book</h3><p className="whitespace-pre-wrap">{researchLinks(design.research.facts, design.research.sources)}</p></div>
                  <ol className="list-decimal space-y-1 pl-5">
                    {design.research.sources.map(({ title, url }) => (
                      <li key={url}><a className="text-primary underline" href={url} target="_blank" rel="noreferrer">{title || url}</a></li>
                    ))}
                  </ol>
                  <p className="text-muted-foreground">Buyer signals suggest what to test. Draft review flags claims that still need checking.</p>
                </div>
              ) : <p className="mt-2 text-sm text-muted-foreground">Web research was unavailable for this draft. Treat demand and factual claims as unverified.</p>}
            </details>
          )}
          {(writingAll || reviewing) && (
            <div className="rounded-xl border bg-card p-4" role="status">
              <p className="font-medium">{reviewing ? "Reviewing your draft…" : "Writing your book…"}</p>
              <p className="mt-1 text-sm text-muted-foreground">{done} of {ch.length} chapters written</p>
            </div>
          )}
          {(allWritten || reviewing) && (
            <section className="rounded-2xl border bg-card p-5" aria-busy={reviewing}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-semibold">Draft review</h2>
                <Button size="sm" variant="outline" disabled={reviewBusy || editing !== null} onClick={() => void runReview()}>
                  {reviewing ? "Reviewing?" : draftReview ? "Review again" : "Review draft"}
                </Button>
              </div>
              {reviewing && <p className="mt-2 text-sm text-muted-foreground">Checking the promise, examples, worksheets, and source evidence.</p>}
              {reviewError && <p className="mt-2 text-sm text-destructive" role="alert">{reviewError} Your chapters are saved.</p>}
              {draftReview?.sampled && <p className="mt-2 text-sm text-muted-foreground">Long chapters were reviewed using excerpts.</p>}
              {draftReview?.findings.length === 0 && <p className="mt-2 text-sm text-muted-foreground">No clear issues found in the draft review.</p>}
              {draftReview?.sourceReview && <SourceReviewPanel review={draftReview.sourceReview} />}
              {draftReview && draftReview.findings.length > 0 && (
                <ul className="mt-4 divide-y">
                  {draftReview.findings.slice(0, showAllFindings ? undefined : 3).map((finding, i) => (
                    <li key={i} className="py-3 text-sm">
                      <p className="font-semibold">{REVIEW_LABELS[finding.category]} ? {finding.location}</p>
                      <p className="mt-1">{finding.issue}</p>
                      <p className="mt-1 text-muted-foreground">{finding.action}</p>
                      {activeFix?.source === "review" && activeFix.index === i ? (
                        <div className="mt-3 space-y-3 rounded-lg border bg-muted/30 p-3">
                          {finding.category === "consistency" && (
                            <label className="block space-y-1">
                              <span>Value or wording to keep</span>
                              <Input value={intendedValue} maxLength={160} disabled={fixBusy} onChange={(e) => {
                                setIntendedValue(e.target.value);
                                setProposal(null);
                              }} />
                            </label>
                          )}
                          {fixBusy && <p role="status">Working on this edit…</p>}
                          {fixError && <p role="alert" className="text-destructive">{fixError}</p>}
                          {proposal && <DraftFixComparison proposal={proposal} />}
                          <div className="flex gap-2">
                            {proposal ? (
                              <Button size="sm" disabled={reviewBusy} onClick={() => void applyPreview()}>Apply fix</Button>
                            ) : (
                              <Button size="sm" disabled={reviewBusy || (finding.category === "consistency" && !intendedValue.trim())} onClick={() => void makePreview(finding, intendedValue)}>Generate preview</Button>
                            )}
                            <Button size="sm" variant="ghost" disabled={fixBusy} onClick={() => { setActiveFix(null); setProposal(null); }}>Cancel</Button>
                          </div>
                        </div>
                      ) : (
                        <Button className="mt-3" size="sm" variant="outline" disabled={reviewBusy || editing !== null} onClick={() => {
                          setActiveFix({ source: "review", index: i });
                          setIntendedValue("");
                          setProposal(null);
                          setFixError("");
                          if (finding.category !== "consistency") void makePreview(finding, "");
                        }}>Preview fix</Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {draftReview && draftReview.findings.length > 3 && (
                <Button size="sm" variant="ghost" aria-expanded={showAllFindings} disabled={reviewBusy} onClick={() => setShowAllFindings((open) => !open)}>
                  {showAllFindings ? "Show fewer findings" : "See more findings (" + (draftReview.findings.length - 3) + ")"}
                </Button>
              )}
            </section>
          )}
          {ch.map((c, i) => (
            <section key={c.id} className="rounded-2xl border bg-card p-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-xl font-semibold"><span className="mr-2 text-primary">{i + 1}.</span>{c.title}</h2>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => move(i, -1)}>↑</Button>
                  <Button size="sm" variant="ghost" onClick={() => move(i, 1)}>↓</Button>
                  {c.content && <Button size="sm" variant="ghost" onClick={() => { setEditing(c.id); setDraft(c.content); }}>Edit</Button>}
                  <Button size="sm" variant="outline" disabled={reviewBusy} onClick={() => writeOne(c).catch(() => {})}>
                    {writing === c.id ? "Writing…" : c.content ? "Regenerate" : "Write"}
                  </Button>
                </div>
              </div>
              {editing === c.id ? (
                <div className="mt-4 space-y-2">
                  <Textarea rows={16} value={draft} onChange={(e) => setDraft(e.target.value)} className="font-mono text-sm" />
                  <div className="flex gap-2">
                    <Button size="sm" disabled={reviewBusy} onClick={() => task("save", async () => {
                      const { error } = await supabase.from("chapters").update({ content: draft }).eq("id", c.id);
                      if (error) throw error;
                      setReview(null);
                      setReviewError("");
                      setEditing(null);
                    })}>Save</Button>
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
                    {(Array.isArray(kit.socialPosts) ? kit.socialPosts : []).map((s, i) => (
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
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-2xl font-bold">PDF style</h2>
              <Button
                variant="outline"
                disabled={savingStyle || !!writing || busy !== null}
                onClick={generateStyle}
              >
                {savingStyle ? "Reviewing content?" : "Generate style with AI"}
              </Button>
            </div>
            {customStyle && (
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <span className="font-semibold">{customStyle.name}</span>
                <div className="flex gap-1" aria-label="Generated color palette">
                  {[customStyle.bg, customStyle.ink, customStyle.accent, customStyle.soft, customStyle.coverBg, customStyle.coverInk].map((color, index) => (
                    <span key={index} className="h-5 w-5 rounded border" style={{ backgroundColor: rgb(color) }} />
                  ))}
                </div>
              </div>
            )}
            {design?.reason && <p className="mt-1 text-sm text-muted-foreground">AI pick: {design.reason}</p>}
            <div className="mt-4 grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
              {THEMES.map((t) => (
                <button key={t.id} disabled={savingStyle || busy !== null} onClick={() => setTheme(t.id)}
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
                <p className="text-sm text-muted-foreground">Upload a JPG, PNG, or WebP up to 15 MB, or generate pictures with AI.</p>
              </div>
              <Button disabled={picturesBusy || !ch.some((c) => !c.image_url || c.image_prompt !== null)} onClick={makeImages}>
                {imgProgress ? `Creating ${imgProgress.done}/${imgProgress.total}…` : ch.some((c) => c.image_url && c.image_prompt !== null) ? "Redo AI pictures" : "Generate pictures"}
              </Button>
            </div>
            <input
              ref={photoPicker}
              type="file"
              accept={CHAPTER_PHOTO_FORMATS}
              hidden
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                const cid = photoChapter.current;
                event.currentTarget.value = "";
                photoChapter.current = null;
                if (file && cid) void uploadPhoto(cid, file);
              }}
            />
            {imgProgress && <div className="mt-3 h-2 rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(imgProgress.done / Math.max(1, imgProgress.total)) * 100}%` }} /></div>}
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {ch.map((c, i) => (
                <div key={c.id} className="overflow-hidden rounded-xl border bg-card">
                  <div className="aspect-[3/2] bg-muted">
                    {c.image_url ? <img src={c.image_url} alt={c.title} className="h-full w-full object-contain" /> : <div className="grid h-full place-items-center text-xs text-muted-foreground">No picture</div>}
                  </div>
                  <div className="p-3">
                    <div className="text-sm font-medium">{i + 1}. {c.title}</div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      <Button size="sm" variant="outline" disabled={picturesBusy} onClick={() => {
                        photoChapter.current = c.id;
                        photoPicker.current?.click();
                      }}>
                        {photoBusy === c.id ? "Saving photo…" : c.image_url ? "Replace with photo" : "Upload photo"}
                      </Button>
                      {(!c.image_url || c.image_prompt !== null) && (
                        <Button size="sm" variant="outline" disabled={picturesBusy} onClick={() => redoImage(c)}>
                          {imgBusy === c.id ? "Drawing…" : c.image_url ? "Regenerate" : "Generate with AI"}
                        </Button>
                      )}
                      {c.image_url && <Button size="sm" variant="ghost" disabled={picturesBusy} onClick={() => removeImage(c.id)}>Remove</Button>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </TabsContent>

        <TabsContent value="cover" className="mt-6">
          <div className="grid gap-8 md:grid-cols-2">
            {pdfBook && <CoverPreview book={pdfBook} />}
            <div className="space-y-4">
              <h2 className="text-2xl font-bold">Cover & delivery</h2>
              {coverReference && (
                <div className="space-y-2">
                  <label htmlFor="cover-reference" className="block text-sm font-medium">Match chapter artwork</label>
                  <select id="cover-reference" className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                    value={coverReference.id} disabled={coverBusy} onChange={(event) => setCoverReferenceId(event.target.value)}>
                    {imageChapters.map((chapter) => <option key={chapter.id} value={chapter.id}>{chapter.title}</option>)}
                  </select>
                  <Button type="button" variant="outline" disabled={coverBusy} onClick={useChapterArtwork}>Use chapter artwork on cover</Button>
                </div>
              )}
              <section className="space-y-2">
                <h3 className="font-semibold">Complete cover</h3>
                <p className="text-sm text-muted-foreground">Generate a cover with lettering and layout, or upload a finished cover.</p>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" disabled={coverBusy} onClick={() => makeCover("complete")}>Generate cover with AI</Button>
                  <Button type="button" variant="outline" disabled={coverBusy} onClick={() => completeCoverPicker.current?.click()}>Upload finished cover</Button>
                </div>
                <input ref={completeCoverPicker} type="file" accept={CHAPTER_PHOTO_FORMATS} hidden onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  event.currentTarget.value = "";
                  if (file && !coverBusy) void uploadCover(file, true);
                }} />
                {completeCover && <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Review the title, subtitle, and byline in the image before downloading.</p>
                  <Button type="button" size="sm" variant="outline" disabled={coverBusy} onClick={useTemplateCover}>Return to template cover</Button>
                </div>}
              </section>
              {!completeCover && <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-semibold">Cover template</h3>
                  <Button type="button" size="sm" variant="outline" disabled={busy !== null || savingStyle || coverTemplate === null}
                    onClick={() => chooseCoverTemplate(null)}>
                    {coverTemplate === null ? "AI chooses the template" : "Let AI choose"}
                  </Button>
                </div>
                <div role="group" aria-label="Cover templates" className="grid grid-cols-3 gap-2">
                  {COVER_TEMPLATE_IDS.map((template) => (
                    <button type="button" key={template} aria-pressed={coverLayout === template}
                      title={COVER_LAYOUTS[template].description} disabled={busy !== null || savingStyle}
                      className={"rounded-lg border p-2 text-left hover:border-primary " + (coverLayout === template ? "border-primary" : "")}
                      onClick={() => chooseCoverTemplate(template)}>
                      <span aria-hidden="true" className={"mx-auto mb-2 flex aspect-[210/297] max-w-20 gap-1 rounded p-2 "
                        + (template === "split" ? "flex-row" : template === "full" ? "flex-col-reverse" : "flex-col")}
                        style={{ background: rgb(theme.coverBg) }}>
                        <span className="flex flex-1 flex-col justify-center gap-1">
                          <span className="h-1 rounded-sm" style={{ background: rgb(theme.coverInk) }} />
                          <span className="h-1 w-3/4 rounded-sm" style={{ background: rgb(theme.coverInk) }} />
                        </span>
                        <span className={template === "split" ? "w-2/5 rounded-sm" : "h-1/2 rounded-sm"} style={{ background: rgb(theme.accent) }} />
                      </span>
                      <span className="block text-xs font-medium sm:text-sm">{COVER_LAYOUTS[template].name}</span>
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">Picking a template uses your existing artwork.</p>
              </div>}
              <form className="space-y-2" onSubmit={(event) => {
                event.preventDefault();
                if (busy === null && !savingStyle && bylineDraft !== null) void saveByline(bylineDraft);
              }}>
                <label className="block text-sm font-medium" htmlFor="cover-byline">Brand or author name</label>
                <Input id="cover-byline" value={bylineDraft ?? coverByline} maxLength={100}
                  onChange={(event) => setBylineEdit({ productId: id, value: event.target.value })} />
                <Button type="submit" size="sm" variant="outline" disabled={busy !== null || savingStyle || (bylineDraft ?? coverByline).trim() === coverByline}>Save name</Button>
              </form>
              {!completeCover && <section className="space-y-2">
              <input ref={coverPicker} type="file" accept={CHAPTER_PHOTO_FORMATS} hidden onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = "";
                if (file && !coverBusy) void uploadCover(file, false);
              }} />
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" disabled={coverBusy} onClick={() => coverPicker.current?.click()}>Upload template artwork</Button>
                <Button variant="outline" disabled={coverBusy} onClick={() => makeCover("artwork")}>Generate template artwork</Button>
                {p.cover_url && <Button variant="ghost" disabled={coverBusy} onClick={() => task("cover", () => updateCover(null))}>Use typography only</Button>}
              </div>
              </section>}
              {busy === "cover" && <p role="status" className="text-sm text-muted-foreground">Updating cover…</p>}
              <hr />
              {draftReview?.sourceReview?.claims.some((claim) => claim.assessment === "needs_review") && (
                <p className="text-sm text-muted-foreground">Some claims still need source review. See Draft review in Develop.</p>
              )}
              {deliveryFindings.length > 0 && (
                <aside aria-label="Draft checks" className="space-y-2 rounded-lg border border-amber-500/40 p-3 text-sm">
                  <h3 className="font-medium">Check before exporting</h3>
                  <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                    {deliveryFindings.map((finding, index) => (
                      <li key={finding.issue} className="space-y-2">
                        <p>{finding.issue}</p>
                        {activeFix?.source === "delivery" && activeFix.index === index ? (
                          <div className="space-y-3 rounded-lg border p-3">
                            {fixBusy && <p role="status">{proposal ? "Applying the fix…" : "Drafting a fix…"}</p>}
                            {fixError && <p role="alert" className="text-destructive">{fixError}</p>}
                            {proposal && <DraftFixComparison proposal={proposal} />}
                            <div className="flex flex-wrap gap-2">
                              {proposal ? (
                                <Button size="sm" disabled={reviewBusy} onClick={() => void applyPreview()}>Apply fix</Button>
                              ) : !fixBusy && (
                                <Button size="sm" disabled={reviewBusy} onClick={() => void makePreview(finding, "", true)}>Try again</Button>
                              )}
                              <Button size="sm" variant="ghost" disabled={fixBusy} onClick={() => { setActiveFix(null); setProposal(null); }}>Cancel</Button>
                            </div>
                          </div>
                        ) : (
                          <Button type="button" size="sm" variant="outline" disabled={reviewBusy || editing !== null} onClick={() => {
                            setActiveFix({ source: "delivery", index });
                            void makePreview(finding, "", true);
                          }}>Fix with AI</Button>
                        )}
                      </li>
                    ))}
                  </ul>
                </aside>
              )}
              {allWritten && <section className="space-y-3" aria-label="Launch kit sample">
                {sample ? (
                  <>
                    <label htmlFor="sample-pages" className="block text-sm font-medium">Sample pages</label>
                    <Input id="sample-pages" value={sample.selection} disabled={busy !== null || !!writing || writingAll}
                      aria-describedby="sample-pages-help"
                      onChange={(event) => {
                        const selection = event.currentTarget.value;
                        setSamplePreview((current) => current?.productId === id ? { ...current, selection } : current);
                      }} />
                    <p id="sample-pages-help" className="text-sm text-muted-foreground">
                      Enter page numbers from {sample.first} to {sample.last}, separated by commas. The cover is included.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" variant="outline" onClick={() => previewSample(sample.selection)}
                        disabled={busy !== null || !!writing || writingAll}>Preview sample</Button>
                      <Button type="button" variant="ghost" onClick={() => previewSample()}
                        disabled={busy !== null || !!writing || writingAll}>Use suggested pages</Button>
                    </div>
                    {sample.selection === sample.previewed && (
                      <>
                        <iframe title="Launch kit sample preview" src={sample.url} className="h-96 w-full rounded-lg border" />
                        <a className="text-sm underline" href={sample.url} target="_blank" rel="noreferrer">Open sample preview</a>
                      </>
                    )}
                  </>
                ) : (
                  <Button type="button" variant="outline" onClick={() => previewSample()}
                    disabled={busy !== null || !!writing || writingAll}>Choose sample pages</Button>
                )}
                {busy === "sample-preview" && <p role="status" className="text-sm text-muted-foreground">Preparing sample preview.</p>}
              </section>}
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" disabled={!done} onClick={download}>Download PDF</Button>
                <Button disabled={!allWritten || busy !== null || !!writing || writingAll} onClick={launchKit}>
                  {busy === "launch-kit" ? "Packing files…" : "Download launch kit"}
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">{allWritten
                ? "A ZIP with your book, cover, sample pages, and Whop listing copy."
                : "Finish writing the chapters to download the launch kit."}</p>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </main>
  );
}

function SourceReviewPanel({ review }: { review: DraftReview["sourceReview"] }) {
  if (!review.claims.length) return null;
  return (
    <section aria-label="Source checks" className="mt-4 space-y-3 rounded-xl border p-4 text-sm">
      <h3 className="font-semibold">Source checks</h3>
      {review.status === "unavailable" && <p className="text-muted-foreground">Web checking was unavailable. Check your OpenAI API key in Settings or run Draft review again later.</p>}
      <p className="text-muted-foreground">Open the cited page to confirm the AI’s evidence summary before publishing.</p>
      <ul className="divide-y">
        {review.claims.map((claim) => (
          <li key={claim.quote} className="space-y-2 py-3">
            <p className="font-medium">{claim.assessment === "evidence" ? "Evidence found" : "Needs review"} · {claim.chapterTitle}</p>
            <blockquote className="border-l-2 pl-3">{claim.quote}</blockquote>
            <p className="text-muted-foreground">{claim.summary}</p>
            {claim.sources.length > 0 && (
              <ul className="space-y-1">
                {claim.sources.map((source) => (
                  <li key={source.url}><a className="text-primary underline" href={source.url} target="_blank" rel="noreferrer">{source.title || source.url}</a></li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function DraftFixComparison({ proposal }: { proposal: DraftFix }) {
  return (
    <div className="space-y-2">
      {proposal.evidence.map(({ title, quote }, index) => (
        <blockquote key={index} className="border-l-2 pl-3">
          <p className="font-medium">{title}</p>
          <p className="whitespace-pre-wrap">{quote}</p>
        </blockquote>
      ))}
      <p className="font-medium">{proposal.location}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><p className="font-medium">Before</p><p className="whitespace-pre-wrap break-words">{proposal.edit.before || "Empty"}</p></div>
        <div><p className="font-medium">After</p><p className="whitespace-pre-wrap break-words">{proposal.edit.after || "Remove this passage"}</p></div>
      </div>
    </div>
  );
}

function CopyBtn({ text }: { text: string }) {
  return (
    <button className="mt-2 block text-xs text-primary hover:underline" onClick={() => { navigator.clipboard.writeText(text); toast.success("Copied"); }}>
      Copy
    </button>
  );
}
