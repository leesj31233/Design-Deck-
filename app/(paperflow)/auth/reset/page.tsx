"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Eye, EyeOff } from "lucide-react";
import { PaperflowMark } from "@/components/paperflow/shell/paperflow-logo";
import { MIN_PASSWORD, adoptEmailSession, authMessage, updatePassword } from "@/lib/paperflow/cloud/browser";

/** Where the password-reset link lands: keep the recovery session, set the new password, open the library. */
export default function ResetPage() {
  const [state, setState] = useState<"checking" | "ready" | "failed">("checking"), [error, setError] = useState("");
  const [password, setPassword] = useState(""), [confirm, setConfirm] = useState(""), [show, setShow] = useState(false), [busy, setBusy] = useState(false);
  useEffect(() => {
    const hash = window.location.hash;
    history.replaceState(null, "", window.location.pathname);
    adoptEmailSession(hash)
      .then(ok => { if (ok) setState("ready"); else { setState("failed"); setError("설정 정보가 없는 링크입니다. 로그인 화면에서 다시 요청해 주세요."); } })
      .catch(cause => { setState("failed"); setError(authMessage(cause)); });
  }, []);
  const save = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError("");
    try { if (password !== confirm) throw new Error("두 비밀번호가 다릅니다."); await updatePassword(password); window.location.replace("/library"); }
    catch (cause) { setError(authMessage(cause)); setBusy(false); }
  };
  return <main className="pf-login-confirm">
    <PaperflowMark size={44}/>
    {state === "checking" ? <><h1>링크를 확인하는 중…</h1><span className="pf-loader" aria-hidden="true"/></>
      : state === "failed" ? <><h1>링크를 쓸 수 없습니다</h1><p role="alert">{error}</p><Link href="/login" className="pf-login-primary">로그인 화면으로</Link></>
      : <div className="pf-login-card pf-login-reset">
        <h2>새 비밀번호</h2>
        <form onSubmit={event => void save(event)} className="pf-login-form">
          <label htmlFor="pf-reset-password">새 비밀번호</label>
          <span className="pf-login-password"><input id="pf-reset-password" type={show ? "text" : "password"} autoComplete="new-password" required minLength={MIN_PASSWORD} placeholder={`${MIN_PASSWORD}자 이상`} value={password} onChange={event => setPassword(event.target.value)} autoFocus/>
            <button type="button" onClick={() => setShow(value => !value)} aria-label={show ? "비밀번호 숨기기" : "비밀번호 보기"}>{show ? <EyeOff size={16}/> : <Eye size={16}/>}</button></span>
          <label htmlFor="pf-reset-confirm">비밀번호 확인</label>
          <input id="pf-reset-confirm" type={show ? "text" : "password"} autoComplete="new-password" required value={confirm} onChange={event => setConfirm(event.target.value)} placeholder="한 번 더"/>
          <button type="submit" className="pf-login-primary" disabled={busy || password.length < MIN_PASSWORD || password !== confirm}>{busy ? "저장하는 중…" : <>저장하고 서재 열기 <ArrowRight size={16}/></>}</button>
        </form>
        {error && <p className="pf-login-error" role="alert">{error}</p>}
      </div>}
  </main>;
}
