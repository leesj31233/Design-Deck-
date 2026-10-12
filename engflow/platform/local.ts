import type { LearnerState } from "../core/types";
import type { StorageService } from "./types";

const KEY = "engflow:v1:state";

export function readLocal(): LearnerState | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as LearnerState) : null;
  } catch {
    return null;
  }
}

export function writeLocal(state: LearnerState): boolean {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function clearLocal(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* storage blocked */
  }
}

/** Browser-only persistence: used as the offline cache everywhere and as the demo-mode store. */
export function localStorageService(): StorageService {
  return {
    status: () => ({
      kind: "local",
      labelKo: "이 브라우저에만 저장",
      detailKo: "데모 모드: 학습 기록이 이 기기의 브라우저에만 저장됩니다. 브라우저 데이터를 지우면 사라집니다.",
      durable: false,
    }),
    load: async () => readLocal(),
    save: async (s) => {
      writeLocal(s);
    },
    clear: async () => clearLocal(),
  };
}
