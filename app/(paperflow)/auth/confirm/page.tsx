"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { BookOpen } from "lucide-react";
import { adoptEmailSession } from "@/lib/paperflow/cloud/browser";
import { readableError } from "@/lib/paperflow/errors";

/** Where the emailed sign-in link lands: keep the session it carries, then open the library. */
export default function ConfirmPage() {
  const [error, setError] = useState("");
  useEffect(() => {
    // Read the fragment before anything else touches the URL, then drop it from history.
    const hash = window.location.hash, query = new URLSearchParams(window.location.search);
    const value = query.get("next") ?? "/library", next = value.startsWith("/") && !value.startsWith("//") ? value : "/library";
    history.replaceState(null, "", window.location.pathname + window.location.search);
    adoptEmailSession(hash)
      .then(ok => { if (ok) window.location.replace(next); else setError("로그인 정보가 없는 링크다. 로그인 화면에서 다시 요청해 달라."); })
      .catch(cause => setError(readableError(cause)));
  }, []);
  return <main className="pf-login-confirm">
    <span className="pf-logo"><BookOpen size={20}/></span>
    {error ? <><h1>로그인하지 못했다</h1><p role="alert">{error}</p><Link href="/login" className="pf-login-primary">로그인 화면으로</Link></>
      : <><h1>서재를 여는 중…</h1><p>확인되었다. 잠시 후 나의 연구 서재로 이동한다.</p><span className="pf-loader" aria-hidden="true"/></>}
  </main>;
}
