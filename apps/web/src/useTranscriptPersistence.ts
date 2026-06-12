/**
 * Drives transcript persistence from live Hume EVI events.
 *
 * Hume is the source of truth for what was ACTUALLY uttered (final STT for the
 * subscriber, spoken text for the companion) and for barge-in. We persist:
 *   - subscriber turns: on a final user_message
 *   - companion turns:  accumulated assistant_message text, flushed on
 *     assistant_end, with interrupted=true if a user_interruption (barge-in)
 *     occurred during that turn.
 * Audio is never sent anywhere — only text.
 *
 * The deterministic reverence pre-filter and the `system` audit row live
 * server-side in the CLM endpoint; this only handles uttered audio turns.
 */
import { useCallback, useRef } from 'react';
import { appendExchange } from './api';

/** Minimal shape of the Hume EVI messages we care about. */
interface HumeEviMessage {
  type: string;
  message?: { role?: string; content?: string };
  interim?: boolean;
}

export function useTranscriptPersistence(sessionId: string | null) {
  // Accumulates the current companion turn until assistant_end.
  const companionBuf = useRef('');
  const companionInterrupted = useRef(false);
  const companionActive = useRef(false);

  const flushCompanion = useCallback(() => {
    if (!sessionId || !companionActive.current) return;
    const content = companionBuf.current.trim();
    const interrupted = companionInterrupted.current;
    companionBuf.current = '';
    companionInterrupted.current = false;
    companionActive.current = false;
    if (!content) return;
    void appendExchange({ sessionId, role: 'companion', content, interrupted }).catch((e) =>
      console.error('persist companion failed', e),
    );
  }, [sessionId]);

  const handleMessage = useCallback(
    (raw: unknown) => {
      const msg = raw as HumeEviMessage;
      if (!sessionId) return;

      switch (msg.type) {
        case 'user_message': {
          // Only persist the final transcript, not interim hypotheses.
          if (msg.interim) return;
          const content = (msg.message?.content ?? '').trim();
          if (content) {
            void appendExchange({ sessionId, role: 'subscriber', content }).catch((e) =>
              console.error('persist subscriber failed', e),
            );
          }
          return;
        }
        case 'assistant_message': {
          companionActive.current = true;
          const piece = msg.message?.content ?? '';
          companionBuf.current += companionBuf.current && piece ? ` ${piece}` : piece;
          return;
        }
        case 'user_interruption': {
          // Barge-in: the companion turn currently being spoken was truncated.
          if (companionActive.current) companionInterrupted.current = true;
          flushCompanion();
          return;
        }
        case 'assistant_end': {
          flushCompanion();
          return;
        }
        default:
          return;
      }
    },
    [sessionId, flushCompanion],
  );

  return { handleMessage };
}
