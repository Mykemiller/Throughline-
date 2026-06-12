# First Thread voice runtime (THOUG-129)

A live two-way voice loop for **Seth**, the First Thread Companion: **Hume EVI 3**
owns the voice (transport, STT, prosody, turn-taking, barge-in, TTS) and
**Claude** is the BYO-LLM brain (reasoning + the scripted First Thread flow).
Everything ships behind the `first_thread_voice` flag, **off by default**.

## Architecture

```
 Browser (apps/web)                 Server (server/)                Providers
 ─────────────────                  ───────────────                ─────────
 mic / playback  ── audio ─────►  ▢ Hume EVI 3 socket  ◄───────────  Hume (ZDR)
 VoiceProvider                    │  (token from /api/hume/token)
   │ transcript events            │
   │ (text only)                  ▼  per assistant turn, Hume calls:
   ├─ POST /api/exchanges ─────►  POST /api/clm/chat/completions  (BYO-LLM)
   │   (subscriber/companion,        1. reverence pre-filter (P0, deterministic)
   │    interrupted flag)            2. Claude streams Seth's spoken text ──► Hume (TTS)
   └─ POST /api/sessions             3. optional typed payload (tool use, NOT spoken)
                                     4. state_snapshot persisted          │
                                  Supabase (service role) ◄───────────────┘
                                    rot_capture_sessions, first_thread_exchanges
                                  Anthropic (Claude, text only) ◄──────────
```

Why a server: Hume's BYO-LLM ("custom language model") calls **your** endpoint
and you stream Claude back to it. That endpoint needs the Anthropic key, runs
the P0 reverence pre-filter, and persists — so it cannot live in the browser.

Key files:
- `packages/shared/src/reverenceFilter.ts` — deterministic P0 closed-door filter
- `packages/shared/src/sethScaffold.ts` — **THOUG-131** prompt scaffold (consumed, not redefined)
- `server/src/clm.ts` — Hume BYO-LLM endpoint (reverence → Claude → SSE)
- `server/src/claude.ts` — Claude streaming + two-channel structured output
- `server/src/riverWrites.ts` — River-write boundary (**stubbed** for THOUG-129)
- `apps/web/src/VoiceSession.tsx` — EVI VoiceProvider + Seth panel
- `apps/web/src/useTranscriptPersistence.ts` — uttered-text persistence + barge-in
- `docs/zdr-verification.md` — ZDR audit method + evidence (THOUG-99/100)

## Run it

1. `cp .env.example .env` and fill in secrets (server stops with a clear message
   if any are missing). Set both `FIRST_THREAD_VOICE=true` and
   `VITE_FIRST_THREAD_VOICE=true`.
2. On the Hume side, configure the EVI config (`HUME_CONFIG_ID`) with:
   - **ZDR enabled** (see `docs/zdr-verification.md`).
   - **Custom language model** (BYO-LLM) pointing at your server's
     `POST /api/clm/chat/completions` (OpenAI-compatible SSE).
3. `npm install`
4. `npm run dev` (runs the server on `:8787` and Vite on `:5173`; Vite proxies
   `/api` to the server).
5. Open the web app, click **Begin with Seth**, and speak. Barge-in works;
   say a closed-door phrase ("I'd rather not talk about that") to see the
   deterministic reverence intervention override Claude's next turn.

## Checks

- `npm run typecheck` (per workspace) — types against the live schema.
- `npm test --workspace @throughline/shared` — reverence pre-filter tests.

## Boundaries honored (durable rules)

- **Reverence (P0):** deterministic filter runs *before* Claude; a hit overrides
  the next prompt even if Claude omits a payload. Closed scopes persist in
  `state_snapshot` and are never re-approached.
- **No silent River writes:** the spoken channel never writes. Drafts ride a
  separate tool-use channel and are **stubbed** (`riverWrites.ts`) pending the
  confirm/commit path in later tasks.
- **Schema before build:** no migrations written; code targets migration-005
  columns exactly.
- **Secrets via env only;** **owner-voice only** (`OWNER_SUBSCRIBER_ID`);
  **flag off by default.**
