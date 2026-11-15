import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getAiStatus } from "@/lib/ai.functions";

export function KeyBanner() {
  const status = useServerFn(getAiStatus);
  const { data } = useQuery({ queryKey: ["ai-status"], queryFn: () => status() });
  if (!data || data.hasKey) return null;
  return (
    <div className="border-b border-primary/40 bg-primary/10">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-3 text-sm">
        <span>To start, add your own OpenAI API key — AI features run on your own OpenAI account.</span>
        <Link to="/settings" className="font-semibold text-primary underline">Add my key →</Link>
      </div>
    </div>
  );
}
