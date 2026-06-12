# ZDR verification — First Thread voice runtime (THOUG-129)

**Scope:** Confirm that no subscriber **audio** is retained provider-side beyond
the live turn, end to end, for the Hume EVI 3 ↔ Claude voice loop. Owner-voice
only until the Hume DPA closes (**THOUG-99**) and the owner-voice gate is signed
off (**THOUG-100**). This note documents the method and where the evidence goes.

> Status: method + architectural guarantees in place. The empirical capture
> (§3) must be run on the owner's own voice once `first_thread_voice` is enabled
> with real keys, and the artifacts pasted into §4. Do **not** point any
> real-subscriber audio at this until THOUG-99 closes.

---

## 1. What "ZDR" means here

Two providers touch the turn; both must hold zero data retention for audio and
derived content:

| Provider | Role | ZDR obligation |
|---|---|---|
| **Hume EVI 3** | Transport, mic capture, STT, prosody, turn-taking, TTS | No audio (or transcript) at rest beyond the live turn. Set on the **Hume config** (`HUME_CONFIG_ID`) and covered by the Hume DPA (THOUG-99). |
| **Anthropic (Claude)** | BYO-LLM reasoning + Seth's words | Org-level zero/limited retention per THOUG-99/100. Claude only ever receives **text** (the running transcript), never audio. |

The Throughline side never receives or stores audio at all — see §2.

---

## 2. Architectural guarantees (already enforced in code)

These are structural, not configuration — they hold regardless of provider
settings:

1. **Audio never reaches our server.** The browser opens the Hume EVI WebSocket
   directly; microphone audio flows browser → Hume only. Our server sees only
   text: the OpenAI-style transcript Hume forwards to the BYO-LLM endpoint
   (`server/src/clm.ts`).
2. **Audio is never stored.** `first_thread_exchanges` has **no audio column**
   (verified against live schema, migration 005). `content` is text only; the
   writer (`server/src/supabase.ts`) only ever inserts uttered text.
   `apps/web/src/useTranscriptPersistence.ts` forwards transcript strings, never
   `AudioOutputMessage`/`audio_output` payloads.
3. **Secrets are server-side.** The browser holds only a short-lived Hume access
   token (`/api/hume/token`); long-lived Hume keys, the Anthropic key, and the
   Supabase service-role key never leave the server.
4. **Owner-voice gate.** The session writer always uses `OWNER_SUBSCRIBER_ID`
   (`server/src/supabase.ts:createSession`). There is no path to attach a
   real-subscriber id in this task.

---

## 3. Empirical audit procedure (run on the owner's own voice)

Prereqs: `first_thread_voice=true`, all secrets set, a Hume config whose ZDR
toggle is **on** and whose BYO-LLM custom language model points at
`/api/clm/chat/completions`.

**A. Confirm the Hume config is ZDR.**
- In the Hume portal, open the config referenced by `HUME_CONFIG_ID` and record
  the data-retention / "no data storage" setting. Screenshot → `evidence/`.
- Via API: `GET https://api.hume.ai/v0/evi/configs/{id}` and capture the
  retention-related fields. Paste the (key-redacted) JSON into §4.

**B. Watch the wire (browser → Hume).**
- Open the app, DevTools → Network → WS. Begin a session and speak.
- Confirm: the only audio-bearing connection is the **Hume** WebSocket (binary
  frames outbound). Confirm **no** audio frames go to our origin
  (`VITE_SERVER_ORIGIN`) — our only traffic is `POST /api/clm/chat/completions`
  (SSE, text), `POST /api/exchanges` (JSON text), `GET /api/hume/token`,
  `POST /api/sessions`. Save a HAR (audio frames are binary; verify our origin
  carries none) → `evidence/`.

**C. Confirm our server receives text only.**
- Tail the server. The CLM endpoint logs/handles `messages[]` (text) and
  `custom_session_id` only. There is no audio buffer, no file write, no blob.
- Inspect the request body shape — it is `ClmRequestBody` (text messages). No
  base64 audio, no media.

**D. Confirm nothing audio persisted.**
- After a session, query Supabase:
  ```sql
  select role, length(content) as chars, interrupted, created_at
  from first_thread_exchanges
  where session_id = '<session>'
  order by created_at;
  ```
  Confirm rows are text, sized like utterances (not base64 blobs), and that the
  table has no audio column (`\d first_thread_exchanges`).
- Confirm no object landed in Storage/R2 for the session (no writer exists).

**E. Confirm provider retention.**
- Hume: after ZDR, the chat should not be replayable/listenable in the portal
  beyond the live turn; note the chat's audio availability. Record per the DPA.
- Anthropic: confirm the org's retention posture (THOUG-99/100). Claude received
  only text regardless.

---

## 4. Evidence (fill in on first owner-voice run)

- [ ] Hume config retention setting — screenshot + redacted `GET config` JSON
- [ ] Network HAR / WS frame inspection showing audio only to Hume, none to our origin
- [ ] Server request-body sample proving text-only CLM input
- [ ] `first_thread_exchanges` query output (text-only, no audio column)
- [ ] Storage/R2 emptiness check for the session
- [ ] Provider retention confirmation (Hume DPA reference; Anthropic org setting)

> Paste artifacts under `docs/evidence/` and link them here. Until this section
> is filled, ZDR is **architecturally** enforced (§2) but not yet
> **empirically** signed off.

---

## 5. References

- **THOUG-99** — Hume DPA / data contract (blocks real-subscriber audio).
- **THOUG-100** — owner-voice gate sign-off.
- Durable rules #1 (Reverence), #6 (secrets via env), #7 (ZDR + owner-voice
  gate) in `CLAUDE.md`.
- Seth Vision & Architecture Spec v0.2 (Notion `37a89a0c16808174b54cebe9b4bab0f2`).
