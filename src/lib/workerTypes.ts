export type EncodeJob = {
  id: number;
  type: 'gif' | 'apng' | 'png';
  width: number;
  height: number;
  delayMs: number;
  quality: number;
  maxBytes: number;
  enforceLimit?: boolean;
  colors?: number;
};

export type EncodeMessage =
  | { type: 'init'; job: EncodeJob }
  | { type: 'frame'; id: number; index: number; frame: ArrayBuffer; delayMs: number }
  | { type: 'finish'; id: number };

export type EncodeWorkerEvent =
  | { id: number; type: 'ready' }
  | { id: number; type: 'ack'; index: number }
  | { id: number; type: 'progress'; progress: number; phase: string }
  | { id: number; type: 'error'; error: string }
  | ({ id: number; type: 'done' } & EncodeResult);

export type EncodeResult = {
  buffer: ArrayBuffer;
  colors: number;
  width: number;
  height: number;
  frameCount: number;
  durationMs: number;
  withinLimit: boolean;
  lossless: boolean;
};
