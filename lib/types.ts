export type Status = "strong" | "ok" | "weak" | "unknown";

export interface RoomSignals {
  label: string;
  locationQuery?: string;
  ageBucket?: string; // comma-separated Qloo buckets
  gender?: string;
  fanEntityIds?: string[];
  fanNames?: string[];
}

export interface Swap {
  entityId: string;
  entityName: string;
  entityType: string;
  affinity: number;
  sharedTags: string[];
  originalSentence: string;
  rewrittenSentence: string;
  sentenceStart: number; // offsets of originalSentence in the ORIGINAL text
  sentenceEnd: number;
  lengthDelta: number; // (rewritten - original) / original, e.g. 0.04 = +4%
  accepted: boolean; // default true; user can toggle (per sentence)
}

export interface ReferenceResult {
  id: string;
  surface: string; // text as written
  start: number; // offsets in ORIGINAL text
  end: number;
  sentenceIndex: number;
  entityId?: string;
  entityName?: string;
  entityType?: string;
  tags: { id: string; name: string }[];
  affinity?: number; // 0..1, from Qloo only
  omitted?: boolean; // resolved, but Qloo left it out of the room's results (stored as 0.05)
  status: Status;
  swap?: Swap;
}

export interface SnapshotEntry {
  entityId: string;
  name: string;
  affinity: number;
}

export interface RunResult {
  id?: string;
  text: string;
  room: RoomSignals;
  finalText: string;
  llmOnlyText: string;
  references: ReferenceResult[];
  roomScoreBefore: number;
  roomScoreAfter: number;
  snapshot: Record<string, SnapshotEntry[]>;
  suggestions?: { sentenceIndex: number; entityId: string; name: string; suggestedSentence: string }[];
  qlooCalls: number;
  rounds: number;
  createdAt: string;
  notes: string[];
  steps?: StepEvent[];
}

export type StepKey = "parse_room" | "extract" | "resolve" | "score" | "find_swaps" | "rewrite" | "verify" | "done";

export interface StepEvent {
  type: "step";
  key: StepKey;
  status: "running" | "done" | "error";
  detail: string;
  qlooCalls: number;
}
