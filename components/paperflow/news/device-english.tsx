"use client";
import { useEffect, useState } from "react";
import { Languages, Loader2, X } from "lucide-react";
import { useLang } from "@/lib/paperflow/i18n/context";
import { checkDevice, onDeviceStatus, prepare, type DeviceStatus } from "@/lib/paperflow/i18n/device-translate";
import { startDomEnglish } from "@/lib/paperflow/i18n/dom-english";

const DISMISS_KEY = "naysor-news-device-notice";

/**
 * In English, the text that has no English yet (the research routine writes `en` for new material; older items
 * may not have it) is translated on this device by the browser, for free, and kept in this browser. This shows
 * what that is doing: a small status while it works, a one-line notice when the browser cannot do it.
 */
export function DeviceEnglish() {
  const { lang } = useLang();
  const [status, setStatus] = useState<DeviceStatus | null>(null), [dismissed, setDismissed] = useState(false);
  useEffect(() => onDeviceStatus(setStatus), []);
  useEffect(() => { try { setDismissed(sessionStorage.getItem(DISMISS_KEY) === "1"); } catch { /* shown */ } }, []);
  useEffect(() => {
    if (lang !== "en") return;
    void checkDevice();
    return startDomEnglish(document.body);
  }, [lang]);
  if (lang !== "en" || !status) return null;
  const dismiss = () => { setDismissed(true); try { sessionStorage.setItem(DISMISS_KEY, "1"); } catch { /* this view only */ } };

  if (status.state === "unsupported" || status.state === "unavailable" || status.state === "error") return dismissed ? null : <p className="pf-news-device" role="status" data-kind="notice" data-no-device-translation>
    <Languages size={14} aria-hidden="true"/><span>This browser cannot translate articles on your device, so text without an English version stays in Korean. The interface is in English. For full English, open NAYSOR News in a current version of Chrome or Edge.</span>
    <button type="button" aria-label="Dismiss" onClick={dismiss}><X size={13}/></button>
  </p>;
  if (status.state === "downloadable") return dismissed ? null : <p className="pf-news-device" role="status" data-kind="notice" data-no-device-translation>
    <Languages size={14} aria-hidden="true"/><span>Some articles have no English version yet. Your browser can translate them on this device, free and private, after a one-time download.</span>
    <button type="button" className="pf-news-device-go" onClick={() => void prepare()}>Translate on this device</button>
    <button type="button" aria-label="Dismiss" onClick={dismiss}><X size={13}/></button>
  </p>;
  if (status.state === "downloading") return <p className="pf-news-device" role="status" data-kind="pill" data-no-device-translation><Loader2 size={13} className="pf-spin" aria-hidden="true"/>Downloading the translation model{status.progress !== undefined ? ` · ${status.progress}%` : "…"}</p>;
  if (status.state === "ready" && status.pending > 0) return <p className="pf-news-device" role="status" data-kind="pill" data-no-device-translation><Loader2 size={13} className="pf-spin" aria-hidden="true"/>Translating on this device… {status.pending}</p>;
  return null;
}
