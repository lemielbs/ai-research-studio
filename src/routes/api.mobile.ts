import { createFileRoute } from "@tanstack/react-router";
import { startAndroidLogin } from "@/lib/android-login";
import { generateOutline, suggestAngles, writeChapter } from "@/lib/ai.functions";
import { mobilePdf } from "@/lib/mobile-pdf.functions";

export const Route = createFileRoute("/api/mobile")({
  server: { handlers: {
    GET: ({ request }) => startAndroidLogin(request),
    POST: async ({ request }) => {
      if (!request.headers.get("Authorization")?.startsWith("Bearer ")) return Response.json({ error: "Sign in to continue." }, { status: 401 });
      try {
        const { action, data } = await request.json();
        const headers = { Authorization: request.headers.get("Authorization")! };
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
