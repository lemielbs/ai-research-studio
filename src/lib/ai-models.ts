import { z } from "zod";

export const claudeModels = [
  { id: "claude-sonnet-5-5", name: "Claude Sonnet 5.5" },
  { id: "claude-haiku-5-5", name: "Claude Haiku 5.5" },
] as const;

export const claudeModelSchema = z.enum([claudeModels[0].id, claudeModels[1].id]);
export const contentProviderSchema = z.enum(["automatic", "openai", "anthropic"]);
export const defaultClaudeModel = claudeModels[0].id;

export type ClaudeModel = z.infer<typeof claudeModelSchema>;
export type ContentProvider = z.infer<typeof contentProviderSchema>;
