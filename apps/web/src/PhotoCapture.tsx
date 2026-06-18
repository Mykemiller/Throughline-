/**
 * Mid-interview photo capture (E13-05/06). Take or choose a photograph; EXIF
 * is parsed AND stripped on-device (see exif.ts); only the clean derivative
 * (plus validated text metadata) is uploaded — the original only on explicit
 * retain opt-in.
 *
 * The picker is always available while connected: you can choose one photo or
 * several at once, and they upload immediately. If a Moment is already in
 * focus the photo pins to it; if not (e.g. during the Introduction) the server
 * HOLDS the analyzed photo and attaches it automatically once you and Seth
 * place a Moment — Seth can already see it in the meantime. A batch uploads
 * sequentially; the server queues them so Seth takes them one at a time.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { uploadPhoto } from './api';
import { diag } from './diagnostics';
import { blobToBase64, parseExif, stripExif } from './exif';

type PreparedPhoto = Parameters<typeof uploadPhoto>[0];

export function PhotoCapture({
  sessionId,
  hasActiveMoment,
  onPinned,
}: {
  sessionId: string;
  hasActiveMoment: boolean;
  onPinned: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [retainOriginal, setRetainOriginal] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  // Local preview of the most recent selected (EXIF-stripped) photo.
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const uploadingRef = useRef(false);

  // Revoke the object URL when it changes or the component unmounts.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  // Upload a batch sequentially. The server pins to the active Moment, or HOLDS
  // (uploads + analyzes) when there isn't one yet — either way it's sent now.
  const uploadAll = useCallback(
    async (payloads: PreparedPhoto[]) => {
      if (uploadingRef.current || payloads.length === 0) return;
      uploadingRef.current = true;
      setBusy(true);
      diag.info('photo.upload.start', { count: payloads.length, sessionId });
      let anyHeld = false;
      try {
        for (const payload of payloads) {
          const result = await uploadPhoto(payload);
          if ('held' in result) {
            anyHeld = true;
            diag.info('photo.upload.held', { note: 'analyzed + held; pins when a Moment is placed' });
          } else {
            diag.info('photo.upload.ok', {
              assetId: result.assetId,
              momentId: result.momentId,
              whenText: payload.whenText,
            });
          }
        }
        const many = payloads.length > 1;
        setNote(
          anyHeld
            ? many
              ? `${payloads.length} photographs shared — Seth can see them and will keep them with your story as you go.`
              : 'Photograph shared — Seth can see it and will keep it with your story as you go.'
            : many
              ? `${payloads.length} photographs placed — Seth will take them one at a time.`
              : 'Photograph placed with this Moment — tell Seth about it.',
        );
        onPinned();
      } catch (e) {
        diag.error('photo.upload.error', { message: (e as Error).message });
        setNote(`Couldn’t add the photograph: ${(e as Error).message}`);
      } finally {
        setBusy(false);
        uploadingRef.current = false;
      }
    },
    [onPinned, sessionId],
  );

  const onFiles = async (fileList: FileList | null) => {
    const files = fileList ? Array.from(fileList) : [];
    if (files.length === 0 || busy) return;
    setBusy(true);
    setNote(null);
    diag.info('photo.selected', {
      count: files.length,
      names: files.map((f) => f.name),
      sizes: files.map((f) => f.size),
      hasActiveMoment,
      retainOriginal,
    });
    try {
      const payloads: PreparedPhoto[] = [];
      let lastStripped: Blob | null = null;
      for (const file of files) {
        const bytes = await file.arrayBuffer();
        const exif = parseExif(bytes);
        const stripped = await stripExif(file);
        lastStripped = stripped;
        const payload: PreparedPhoto = {
          sessionId,
          strippedBase64: await blobToBase64(stripped),
          retainOriginal,
          whenText: exif.whenText,
          whereText: exif.whereText,
        };
        if (retainOriginal) payload.originalBase64 = await blobToBase64(file);
        payloads.push(payload);
        diag.info('photo.prepared', {
          name: file.name,
          originalBytes: file.size,
          strippedBytes: stripped.size,
          whenText: exif.whenText ?? null,
          whereText: exif.whereText ?? null,
        });
      }
      // Show the cleaned derivative of the last selected photo straight away.
      if (lastStripped) {
        const blob = lastStripped;
        setPreviewUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return URL.createObjectURL(blob);
        });
      }
      // Always upload now — the server pins or holds as appropriate.
      await uploadAll(payloads);
    } catch (e) {
      diag.error('photo.prepare.error', { message: (e as Error).message });
      setNote(`Couldn’t prepare the photograph: ${(e as Error).message}`);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const label = busy ? 'Sharing…' : 'Add a photograph';

  return (
    <div className="ft-photo">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => void onFiles(e.target.files)}
      />
      <button
        className="ft-btn"
        type="button"
        disabled={busy}
        title="Choose or take a photograph"
        onClick={() => inputRef.current?.click()}
      >
        {label}
      </button>
      <label className="ft-photo__retain">
        <input
          type="checkbox"
          checked={retainOriginal}
          onChange={(e) => setRetainOriginal(e.target.checked)}
        />
        Keep my original file too
      </label>
      {previewUrl && (
        <figure className="ft-photo__preview">
          <img className="ft-photo__preview-img" src={previewUrl} alt="The photograph you just chose" />
        </figure>
      )}
      {!hasActiveMoment && !note && (
        <p className="ft-photo__note">
          You can add a photograph anytime — Seth can see it right away, and it attaches to your story
          as the two of you place a Moment.
        </p>
      )}
      {note && <p className="ft-photo__note">{note}</p>}
    </div>
  );
}
