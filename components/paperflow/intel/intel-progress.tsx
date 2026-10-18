"use client";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { INTEL_PROGRESS, type IntelProgress } from "@/lib/paperflow/intel/repository";
import "./intel-progress.css";

/** A large download in progress (a new device's first sync, NAYSOR News' daily update): what, how far, a bar. */
export function IntelProgressBar() {
  const [progress, setProgress] = useState<IntelProgress | null>(null);
  useEffect(() => {
    let idle: ReturnType<typeof setTimeout> | undefined;
    const listen = (event: Event) => {
      const next = (event as CustomEvent<IntelProgress | null>).detail;
      setProgress(next);
      // A download that stops reporting (a lost connection) does not leave the bar up.
      clearTimeout(idle); if (next) idle = setTimeout(() => setProgress(null), 90_000);
    };
    window.addEventListener(INTEL_PROGRESS, listen);
    return () => { window.removeEventListener(INTEL_PROGRESS, listen); clearTimeout(idle); };
  }, []);
  if (!progress) return null;
  const share = progress.total ? Math.min(100, Math.round(progress.done / progress.total * 100)) : 0;
  return <div className="pf-intel-progress" role="status" aria-live="polite">
    <Loader2 size={16} className="pf-spin" aria-hidden="true"/>
    <span className="pf-intel-progress-label">{progress.label}</span>
    {progress.total > 0 && <span className="pf-intel-progress-count">{progress.done.toLocaleString()} / {progress.total.toLocaleString()}건 · {share}%</span>}
    <span className="pf-intel-progress-track" aria-hidden="true"><i style={{ width: `${share}%` }}/></span>
  </div>;
}
