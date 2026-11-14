# Use your own OpenAI key for all AI features

## What changes
- A secure form opens for you to save your OpenAI key (never shown in chat or code).
- All AI steps (topic ideas, angles, titles, outline, chapter writing, design pick, sales kit) and all pictures (cover + chapter images) run on your OpenAI account instead of Lovable AI credits.
- If your OpenAI balance runs out or the key is wrong, you see a clear message saying so.

## Technical details
- Request secret `OPENAI_API_KEY` via the secure form.
- In `src/lib/ai.functions.ts`, replace gateway calls with direct `fetch` to OpenAI (read key inside handlers):
  - Text: `POST /v1/chat/completions`, model `gpt-4o-mini` (JSON mode where used today).
  - Images: `POST /v1/images/generations`, model `gpt-image-1`, sizes 1024x1536 (cover) and 1536x1024 (chapters), quality low, returned as base64 data URLs (same as now).
- Map 401 -> "Your OpenAI key is invalid", 429/insufficient_quota -> "OpenAI balance used up or rate limited".
- Server functions stay auth-protected; no UI changes needed.
