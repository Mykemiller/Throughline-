import { useEffect, useMemo, useState } from 'react';
import { VoiceProvider, useVoice } from '@humeai/voice-react';
import type { SessionStateSnapshot } from '@throughline/shared';
import { createSession, fetchHumeToken, setSessionStatus } from './api';
import { useTranscriptPersistence } from './useTranscriptPersistence';

interface Ready {
  accessToken: string;
  configId: string;
  sessionId: string;
  snapshot: SessionStateSnapshot;
}

/**
 * Boots a First Thread session: mints a Hume access token and creates the
 * rot_capture_sessions row, then mounts the EVI VoiceProvider. The browser owns
 * the live audio loop (mic, STT, prosody, turn-taking, barge-in, playback);
 * Claude reasons behind Hume via the server's BYO-LLM endpoint.
 */
export function VoiceSession() {
  const [ready, setReady] = useState<Ready | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [{ accessToken, configId }, { sessionId, snapshot }] = await Promise.all([
          fetchHumeToken(),
          createSession(),
        ]);
        if (!cancelled) setReady({ accessToken, configId, sessionId, snapshot });
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <section className="ft-card ft-card--muted">
        <h2>Couldn’t start the session</h2>
        <p className="ft-error">{error}</p>
        <p>Check that the server is running with <code>FIRST_THREAD_VOICE=true</code> and all secrets set.</p>
      </section>
    );
  }

  if (!ready) {
    return (
      <section className="ft-card">
        <p>Preparing your First Thread…</p>
      </section>
    );
  }

  return <ConnectedSession {...ready} />;
}

function ConnectedSession({ accessToken, configId, sessionId, snapshot }: Ready) {
  const { handleMessage } = useTranscriptPersistence(sessionId);
  return (
    <VoiceProvider onMessage={handleMessage} onError={(e) => console.error('[hume]', e)}>
      <SethPanel accessToken={accessToken} configId={configId} sessionId={sessionId} snapshot={snapshot} />
    </VoiceProvider>
  );
}

const CHAPTER_LABELS: Record<string, string> = {
  opening: 'Opening',
  roots: 'Roots',
  childhood: 'Childhood',
  coming_of_age: 'Coming of age',
  work_and_craft: 'Work & craft',
  love_and_family: 'Love & family',
  reflection: 'Reflection',
};

function SethPanel({
  accessToken,
  configId,
  sessionId,
  snapshot,
}: {
  accessToken: string;
  configId: string;
  sessionId: string;
  snapshot: SessionStateSnapshot;
}) {
  const { connect, disconnect, status, isMuted, mute, unmute, messages } = useVoice();

  const connected = status.value === 'connected';
  const connecting = status.value === 'connecting';

  const start = async () => {
    try {
      await connect({
        auth: { type: 'accessToken', value: accessToken },
        configId,
        // custom_session_id is forwarded by Hume to our BYO-LLM endpoint so the
        // server can load the flow snapshot and persist state for this exact
        // session. On EVI it travels in session settings.
        sessionSettings: { type: 'session_settings', customSessionId: sessionId },
      });
    } catch (e) {
      console.error('[hume] connect failed', e);
    }
  };

  const end = async () => {
    disconnect();
    try {
      await setSessionStatus(sessionId, 'complete');
    } catch (e) {
      console.error('mark complete failed', e);
    }
  };

  const transcript = useMemo(
    () =>
      messages.filter(
        (m) => m.type === 'user_message' || m.type === 'assistant_message',
      ) as Array<{ type: string; message?: { content?: string } }>,
    [messages],
  );

  return (
    <section className="ft-card ft-session">
      <div className="ft-session__bar">
        <span className="ft-chapter">Chapter · {CHAPTER_LABELS[snapshot.chapterId] ?? snapshot.chapterId}</span>
        <span className={`ft-status ft-status--${status.value}`}>{status.value}</span>
      </div>

      <p className="ft-seth-intro">
        Seth is your First Thread Companion. Speak naturally — you can interrupt at any time, and if there’s anything
        you’d rather not talk about, just say so and we’ll leave it there.
      </p>

      <div className="ft-controls">
        {!connected ? (
          <button className="ft-btn ft-btn--primary" onClick={start} disabled={connecting}>
            {connecting ? 'Connecting…' : 'Begin with Seth'}
          </button>
        ) : (
          <>
            <button className="ft-btn" onClick={() => (isMuted ? unmute() : mute())}>
              {isMuted ? 'Unmute' : 'Mute'}
            </button>
            <button className="ft-btn ft-btn--end" onClick={end}>
              End session
            </button>
          </>
        )}
      </div>

      <ol className="ft-transcript">
        {transcript.map((m, i) => (
          <li key={i} className={m.type === 'assistant_message' ? 'ft-line ft-line--seth' : 'ft-line ft-line--you'}>
            <span className="ft-line__who">{m.type === 'assistant_message' ? 'Seth' : 'You'}</span>
            <span className="ft-line__text">{m.message?.content}</span>
          </li>
        ))}
        {transcript.length === 0 && <li className="ft-line ft-line--empty">Your conversation will appear here.</li>}
      </ol>
    </section>
  );
}
