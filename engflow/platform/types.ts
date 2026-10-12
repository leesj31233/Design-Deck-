import type { ExplainKind, GenerateRequest } from "../core/ai";
import type { Evaluation, LearnerState, Question } from "../core/types";

export type StorageKind = "artifact-db" | "server" | "local";

export interface StorageStatus {
  kind: StorageKind;
  /** Short label, e.g. "Claude 계정에 동기화". */
  labelKo: string;
  /** One-line explanation of where data lives. */
  detailKo: string;
  /** Persistence is durable beyond this browser. */
  durable: boolean;
}

export interface StorageService {
  status(): StorageStatus;
  load(): Promise<LearnerState | null>;
  /** Persist; implementations coalesce rapid saves and write only changed parts. */
  save(state: LearnerState): Promise<void>;
  /** Called when another device/tab changed the stored state. */
  subscribe?(onRemote: (state: LearnerState) => void): () => void;
  /** Permanently erase stored learning data. */
  clear(): Promise<void>;
}

export type AIKind = "artifact" | "server" | "none";

export interface AIStatus {
  kind: AIKind;
  available: boolean;
  labelKo: string;
  detailKo: string;
}

export class AIUnavailableError extends Error {
  constructor(public code: string, message: string, public permanent = false) {
    super(message);
  }
}

export interface AIService {
  status(): AIStatus;
  evaluate(q: Question, answer: string, local: Evaluation, depth: "quick" | "default", signal?: AbortSignal): Promise<Evaluation>;
  explain(kind: ExplainKind, q: Question, ev: Evaluation, question: string | undefined, onText: (text: string) => void, signal?: AbortSignal): Promise<string>;
  generate(req: GenerateRequest, signal?: AbortSignal): Promise<Question>;
}

export interface Platform {
  target: "artifact" | "web";
  storage: StorageService;
  ai: AIService;
  /** Offer a generated file (JSON export). Resolves false when the viewer declined or it is unsupported. */
  download(filename: string, data: string): Promise<boolean>;
}

export const NO_AI: AIService = {
  status: () => ({ kind: "none", available: false, labelKo: "AI 분석 꺼짐", detailKo: "규칙 기반 평가만 사용합니다." }),
  evaluate: () => Promise.reject(new AIUnavailableError("unavailable", "AI 분석을 사용할 수 없습니다.", true)),
  explain: () => Promise.reject(new AIUnavailableError("unavailable", "AI 설명을 사용할 수 없습니다.", true)),
  generate: () => Promise.reject(new AIUnavailableError("unavailable", "AI 문제 생성을 사용할 수 없습니다.", true)),
};
