import { createFileRoute } from "@tanstack/react-router";
import { startAndroidLogin } from "@/lib/android-login";
import { generateOutline, suggestAngles, writeChapter, getAiStatus, saveMyKey, removeMyKey, suggestTopics, discoverCreators, recommendDesign, generateSalesKit, generateCover, reviewProductDraft, planCreatorDraft, previewDraftFix, applyDraftFix, generateSectionImage } from "@/lib/ai.functions";
import { mobilePdf } from "@/lib/mobile-pdf.functions";

export const Route = createFileRoute("/api/mobile")({
  server: { handlers: {
    GET: ({ request }) => startAndroidLogin(request),
    POST: async ({ request }) => {
      if (!request.headers.get("Authorization")?.startsWith("Bearer ")) return Response.json({ error: "Sign in to continue." }, { status: 401 });
      try {
        const { action, data } = await request.json();
        const headers = { Authorization: request.headers.get("Authorization")! };
        if (action === "creatorPlan") return Response.json(await planCreatorDraft({ data, headers }));
        if (action === "previewFix") return Response.json(await previewDraftFix({ data, headers }));
        if (action === "applyFix") return Response.json(await applyDraftFix({ data, headers }));
        if (action === "illustrate") return Response.json(await generateSectionImage({ data, headers }));
        if (action === "settings") return Response.json(await getAiStatus({ headers }));
        if (action === "key") return Response.json(await saveMyKey({ data, headers }));
        if (action === "removeKey") return Response.json(await removeMyKey({ headers }));
        if (action === "topics") return Response.json(await suggestTopics({ data, headers }));
        if (action === "creators") return Response.json({ items: await discoverCreators({ data, headers }) });
        if (action === "style") return Response.json(await recommendDesign({ data, headers }));
        if (action === "sales") return Response.json(await generateSalesKit({ data, headers }));
        if (action === "cover") return Response.json(await generateCover({ data, headers }));
        if (action === "review") return Response.json(await reviewProductDraft({ data, headers }));
        if (action === "pdf") return await mobilePdf({ data, headers });
        if (action === "angles") return Response.json(await suggestAngles({ data, headers }));
        if (action === "outline") return Response.json(await generateOutline({ data, headers }));
        if (action === "write") return Response.json(await writeChapter({ data, headers }));
        return Response.json({ error: "Unknown mobile action." }, { status: 400 });
      } catch (e) {
        const message = e instanceof Error ? e.message : "Request failed.";
        return Response.json({ error: message.slice(0, 250) }, { status: message.startsWith("Unauthorized") ? 401 : 400 });
      }
    },
  } },
});
