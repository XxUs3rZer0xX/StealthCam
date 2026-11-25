// Records short, self-contained clips (one per motion event) and uploads each
// as a single finalized file to /api/recordings.
//
// Recording a whole clip in one MediaRecorder session — rather than appending
// timesliced chunks to disk — produces a WebM with a complete header. We then
// stamp the real duration in with fix-webm-duration so the browser can seek
// (fast-forward / rewind) during playback.

import fixWebmDuration from 'fix-webm-duration';

const pickMimeType = (): string => {
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ];
  return candidates.find(type => MediaRecorder.isTypeSupported(type)) || '';
};

const makeRecordingId = (): string => {
  const d = new Date();
  const pad = (n: number, len = 2) => String(n).padStart(len, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_` +
    `${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}-` +
    `${pad(d.getMilliseconds(), 3)}`;
};

export class ClipRecorder {
  private recorder: MediaRecorder | null = null;
  private token: string;
  private onErrorCallback?: (message: string) => void;
  private onSavedCallback?: (id: string) => void;

  constructor(token: string) {
    this.token = token;
  }

  /** True while a clip is actively being captured. */
  get active(): boolean {
    return this.recorder !== null;
  }

  /** Begin capturing a new clip from the stream. No-op if one is already running. */
  startClip(stream: MediaStream): void {
    if (this.recorder) return;

    const mimeType = pickMimeType();
    const id = makeRecordingId();
    const chunks: Blob[] = [];
    const startedAt = Date.now();

    const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);

    rec.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };

    rec.onstop = async () => {
      const duration = Date.now() - startedAt;
      let blob = new Blob(chunks, { type: mimeType || 'video/webm' });
      try {
        // Inject the Duration element so the clip is seekable in Chrome.
        blob = await fixWebmDuration(blob, duration);
      } catch (err) {
        console.error('Duration fix failed, uploading as-is:', err);
      }
      await this.upload(id, blob);
      this.onSavedCallback?.(id);
    };

    rec.onerror = () => this.onErrorCallback?.('Recorder error');

    this.recorder = rec;
    // No timeslice: buffer the whole clip, emit a single blob on stop.
    rec.start();
    console.log(`Clip recording started: ${id}.webm`);
  }

  /** Stop the current clip; its onstop handler finalizes and uploads it. */
  stopClip(): void {
    const rec = this.recorder;
    this.recorder = null;
    if (rec && rec.state !== 'inactive') {
      rec.stop();
    }
  }

  onError(callback: (message: string) => void): void {
    this.onErrorCallback = callback;
  }

  onSaved(callback: (id: string) => void): void {
    this.onSavedCallback = callback;
  }

  private async upload(id: string, clip: Blob): Promise<void> {
    try {
      const response = await fetch(`/api/recordings?id=${encodeURIComponent(id)}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/octet-stream',
        },
        body: clip,
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || `Upload failed with status ${response.status}`);
      }
      console.log(`Clip uploaded: ${id}.webm (${clip.size} bytes)`);
    } catch (error) {
      console.error('Recording upload error:', error);
      this.onErrorCallback?.(error instanceof Error ? error.message : 'Recording upload failed');
    }
  }
}
