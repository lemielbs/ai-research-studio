import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getAiStatus } from "@/lib/ai.functions";

export function KeyBanner() {
  const status = useServerFn(getAiStatus);
  const { data } = useQuery({ queryKey: ["ai-status"], queryFn: () => status() });
  if (!data) return null;

  const usesClaude =
    data.preference === "anthropic" || (data.preference === "automatic" && data.hasClaude);
  let message: string;
  if (usesClaude && !data.hasClaude)
    message = "Reconnect your Anthropic API key or choose OpenAI for writing.";
  else if (data.hasOpenAI || (data.owner && !usesClaude && data.preference === "automatic"))
    return null;
  else if (usesClaude)
    message = "Claude can write your book. Add an OpenAI API key for AI covers and illustrations.";
  else message = "Connect an API key to start generating books.";

  return (
    <div className="border-b border-primary/40 bg-primary/10">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-3 text-sm">
        <span>{message}</span>
        <Link to="/settings" className="font-semibold text-primary underline">
          AI settings
        </Link>
      </div>
    </div>
  );
}
