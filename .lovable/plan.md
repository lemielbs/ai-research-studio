# AI Digital Product Builder (Synthesise-style)

An app where a user types a topic and AI builds a complete, sellable digital product (ebook / guide / mini-course) — following the "Develop, Distribute, Deliver" idea from the transcripts.

## Features
1. **Landing page** — bold hero ("Turn any idea into a sellable digital product in minutes"), how it works (Develop / Distribute / Deliver), pricing section (Free, Pro, Business tiers — display only for now), FAQ.
2. **Accounts** — email sign up / log in.
3. **Product wizard (Develop)** — enter topic, audience, product type (ebook, workbook, checklist, mini-course), tone, length. AI suggests 3 niche angles + titles; user picks one.
4. **AI generation** — outline first (editable), then full chapters written by AI, streaming in live.
5. **Editor** — edit chapters, regenerate any section, reorder.
6. **Sales kit (Distribute)** — AI writes sales page copy, product description, price suggestion, and 5 social posts.
7. **Export (Deliver)** — download as a styled PDF; AI-generated cover image.
8. **Dashboard** — list of all products with status.

## Design
Dark, editorial "studio" look: near-black background, warm off-white text, one vivid lime accent, Space Grotesk + DM Sans.

## Technical details
- Lovable Cloud: auth, `products` and `chapters` tables with per-user RLS, storage bucket for covers.
- Lovable AI Gateway via server functions for text (streaming) and cover image generation.
- PDF export client-side.
- Routes: `/`, `/auth`, `/_authenticated/dashboard`, `/new`, `/products/$id`.
- Pricing tiers are visual only; real payments can be added later with Stripe.
