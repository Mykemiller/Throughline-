/**
 * Shared types for the First Thread voice runtime (THOUG-129).
 *
 * These model the live Supabase schema (migration 005) exactly — do not add
 * fields that aren't columns. Where a column is an enum or has a CHECK
 * constraint, the union here mirrors the DB constraint so the app can't write
 * an invalid value.
 */

/* ── Persistence: first_thread_exchanges ──────────────────────────────────── */

/**
 * role on first_thread_exchanges. DB CHECK:
 *   role = ANY (ARRAY['companion','subscriber','system'])
 * - subscriber : what the owner/subscriber actually said (final STT transcript)
 * - companion  : what Seth actually uttered (may be truncated by barge-in)
 * - system     : a system-level audit marker (e.g. a reverence intervention).
 *                Not uttered audio.
 */
export type ExchangeRole = 'companion' | 'subscriber' | 'system';

/**
 * A row in first_thread_exchanges. Audio is NEVER stored — `content` holds only
 * the text that was actually uttered (or, for `system`, a concise audit marker).
 */
export interface FirstThreadExchange {
  id: string;
  session_id: string;
  role: ExchangeRole;
  /** Only what was actually uttered. Never the full intended text on a barge-in. */
  content: string;
  /** True when this turn was truncated by a barge-in / user interruption. */
  interrupted: boolean;
  created_at: string;
}

/** What the app supplies when appending an exchange (DB fills id/created_at). */
export interface NewExchange {
  session_id: string;
  role: ExchangeRole;
  content: string;
  interrupted?: boolean;
}

/* ── Persistence: rot_capture_sessions ────────────────────────────────────── */

/** rot_capture_sessions.status (enum session_status). */
export type SessionStatus = 'in_progress' | 'complete' | 'abandoned';

/** rot_capture_sessions.entry_point (enum entry_point) — we only ever set this. */
export type EntryPoint = 'first_thread';

/** rot_capture_sessions.companion (CHECK: 'seth' | 'miriam'). */
export type Companion = 'seth' | 'miriam';

/**
 * state_snapshot (jsonb) — the flow-engine node + context, persisted for
 * recovery. This is our shape inside the column, not a column set.
 */
export interface SessionStateSnapshot {
  /** Current chapter id in the seven-chapter machine. */
  chapterId: ChapterId;
  /** Whether the current chapter has already spent its one follow-up. */
  followUpSpent: boolean;
  /**
   * Topics/people/periods that hit a closed-door signal. The Reverence
   * Principle (P0): once closed, never re-approached. Persisted so recovery
   * keeps them closed.
   */
  closedScopes: ClosedScope[];
  /** Free-form carry between chapters (e.g. a name to reuse in a transition). */
  carry: Record<string, string>;
  /** Schema version for the snapshot shape itself. */
  v: 1;
}

export interface ClosedScope {
  /** The matched phrase that triggered the close (for audit). */
  phrase: string;
  /** ISO timestamp the scope was closed. */
  closedAt: string;
  /** Chapter the close happened in. */
  chapterId: ChapterId;
}

/* ── Seven-chapter flow (THOUG-131 contract) ──────────────────────────────── */

/**
 * The seven chapters of the First Thread script. The concrete ordering and
 * prompt copy are owned by THOUG-131 (sethScaffold.ts); the runtime only
 * depends on these ids.
 */
export type ChapterId =
  | 'opening'
  | 'roots'
  | 'childhood'
  | 'coming_of_age'
  | 'work_and_craft'
  | 'love_and_family'
  | 'reflection';

/* ── Two-channel structured output (the River-write boundary) ──────────────── */

/**
 * Each relevant Claude turn yields two channels:
 *   1. spoken text  → goes to Hume for TTS (the only thing the subscriber hears)
 *   2. an OPTIONAL typed payload → never spoken; the seed for a future River
 *      write. NOTHING writes to the River from the spoken channel.
 *
 * For THOUG-129 we establish the boundary and the types. The confirm/commit
 * path and the actual Moment/Story writes land in later tasks — see
 * server/src/riverWrites.ts where these are stubbed.
 */
export type FirstThreadPayload = MomentDraftPayload | StoryDraftPayload | ClosedTopicEventPayload;

export interface MomentDraftPayload {
  kind: 'moment_draft';
  /** Short title for the candidate Moment. */
  title: string;
  /** The grounded summary Seth would propose committing. */
  summary: string;
  /** Optional approximate period/date text as spoken (not parsed to a date). */
  whenText?: string;
  /** Career Arc clustering hint (flat cluster_tags, e.g. ['career_map']). */
  clusterTags?: string[];
  chapterId: ChapterId;
}

export interface StoryDraftPayload {
  kind: 'story_draft';
  title: string;
  /** The longer-form narrative draft. */
  body: string;
  chapterId: ChapterId;
}

/**
 * Emitted when a closed-door signal is honored. This is the structured record
 * of a Reverence close. It is produced deterministically by the pre-filter
 * (authoritative) and may ALSO be surfaced by Claude — but the pre-filter path
 * does not depend on Claude producing it.
 */
export interface ClosedTopicEventPayload {
  kind: 'closed_topic_event';
  /** The phrase that triggered the close. */
  phrase: string;
  /** How the close was detected. */
  source: 'reverence_prefilter' | 'claude';
  chapterId: ChapterId;
}

/* ── CLM transport (Hume BYO-LLM ↔ Claude) ────────────────────────────────── */

/**
 * Hume's custom-language-model endpoint speaks an OpenAI-compatible
 * chat-completions shape. These are the minimal fields we consume/emit. The
 * exact Hume payload is centralized here and in server/src/clm.ts so it's easy
 * to adjust against the current Hume EVI 3 contract.
 */
export interface ClmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ClmRequestBody {
  messages: ClmMessage[];
  /** Hume forwards the custom_session_id we set when opening the EVI socket. */
  custom_session_id?: string;
  /** Hume may also send these; we don't require them. */
  model?: string;
  stream?: boolean;
}
