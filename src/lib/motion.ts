// Lightweight frame-difference motion detector.
//
// Runs entirely in the browser on the computer (camera) client: it samples the
// local MediaStream onto a small off-screen canvas, compares each frame against
// the previous one, and fires `onMotion` when enough pixels change. A cooldown
// prevents a single event (e.g. someone walking through the room) from firing
// dozens of alerts.

export interface MotionDetectorOptions {
  /** Downscaled analysis width in px. Smaller = cheaper + less noise-sensitive. */
  sampleWidth?: number;
  /** Downscaled analysis height in px. */
  sampleHeight?: number;
  /** How often to sample frames, in ms. */
  intervalMs?: number;
  /** Per-pixel luma delta (0-255) that counts a pixel as "changed". */
  pixelThreshold?: number;
  /** Fraction of changed pixels (0-1) needed to call it motion. */
  motionThreshold?: number;
  /** Minimum gap between motion alert events, in ms. */
  cooldownMs?: number;
  /** How long motion must be quiet before a motion window is considered over, in ms. */
  postMotionMs?: number;
}

export class MotionDetector {
  private video: HTMLVideoElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private prev: Uint8ClampedArray | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastTrigger = 0;
  private active = false;
  private lastActive = 0;
  private opts: Required<MotionDetectorOptions>;
  private motionCb: ((score: number) => void) | null = null;
  private motionStartCb: (() => void) | null = null;
  private motionEndCb: (() => void) | null = null;

  constructor(options: MotionDetectorOptions = {}) {
    this.opts = {
      sampleWidth: options.sampleWidth ?? 64,
      sampleHeight: options.sampleHeight ?? 48,
      intervalMs: options.intervalMs ?? 400,
      pixelThreshold: options.pixelThreshold ?? 25,
      motionThreshold: options.motionThreshold ?? 0.04,
      cooldownMs: options.cooldownMs ?? 15000,
      postMotionMs: options.postMotionMs ?? 6000,
    };

    this.video = document.createElement('video');
    this.video.muted = true;
    this.video.playsInline = true;

    this.canvas = document.createElement('canvas');
    this.canvas.width = this.opts.sampleWidth;
    this.canvas.height = this.opts.sampleHeight;

    const ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Canvas 2D context unavailable for motion detection');
    this.ctx = ctx;
  }

  /** Register the callback invoked when motion crosses the threshold (edge, rate-limited by cooldown). */
  onMotion(cb: (score: number) => void): void {
    this.motionCb = cb;
  }

  /** Fired once when a motion window begins (used to start recording). */
  onMotionStart(cb: () => void): void {
    this.motionStartCb = cb;
  }

  /** Fired once when a motion window ends after `postMotionMs` of quiet (used to stop recording). */
  onMotionEnd(cb: () => void): void {
    this.motionEndCb = cb;
  }

  /** Begin analysing the given stream. Resolves once the hidden video is playing. */
  async start(stream: MediaStream): Promise<void> {
    this.video.srcObject = stream;
    this.prev = null;
    await this.video.play().catch(() => {
      /* autoplay of a muted, in-memory video should not reject, but ignore if it does */
    });
    this.timer = setInterval(() => this.tick(), this.opts.intervalMs);
  }

  private tick(): void {
    const { sampleWidth: w, sampleHeight: h, pixelThreshold, motionThreshold, cooldownMs } = this.opts;

    // readyState < 2 means not enough data to draw a frame yet.
    if (this.video.readyState < 2) return;

    this.ctx.drawImage(this.video, 0, 0, w, h);
    const frame = this.ctx.getImageData(0, 0, w, h).data;

    if (this.prev) {
      let changed = 0;
      const total = w * h;
      for (let i = 0; i < frame.length; i += 4) {
        // Rec. 601 luma; comparing brightness is cheaper and steadier than RGB.
        const lumaNow = (frame[i] * 299 + frame[i + 1] * 587 + frame[i + 2] * 114) / 1000;
        const lumaPrev = (this.prev[i] * 299 + this.prev[i + 1] * 587 + this.prev[i + 2] * 114) / 1000;
        if (Math.abs(lumaNow - lumaPrev) > pixelThreshold) changed++;
      }

      const score = changed / total;
      const now = Date.now();
      if (score > motionThreshold) {
        this.lastActive = now;
        // Open a motion window on the rising edge.
        if (!this.active) {
          this.active = true;
          this.motionStartCb?.();
        }
        // Rate-limited alert edge.
        if (now - this.lastTrigger > cooldownMs) {
          this.lastTrigger = now;
          this.motionCb?.(score);
        }
      } else if (this.active && now - this.lastActive > this.opts.postMotionMs) {
        // Close the window once things have been quiet long enough.
        this.active = false;
        this.motionEndCb?.();
      }
    }

    this.prev = frame;
  }

  /** Stop analysing and release the stream reference. */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    // Flush an open motion window so any in-progress recording gets closed.
    if (this.active) {
      this.active = false;
      this.motionEndCb?.();
    }
    this.video.srcObject = null;
    this.prev = null;
  }
}
