"use client";
import { useState } from "react";
import { Cloud, HardDrive, LogIn, LogOut, Mail, RefreshCw } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { useCloud, syncAll } from "@/lib/paperflow/cloud/sync";
import { signInWithEmail, signInWithGoogle, signOut } from "@/lib/paperflow/cloud/browser";
import { usePaperflow } from "./paperflow-context";
import { readableError } from "@/lib/paperflow/errors";

const mb = (bytes: number) => bytes >= 1073741824 ? `${(bytes / 1073741824).toFixed(1)}GB` : `${Math.round(bytes / 1048576)}MB`;

/** Account, storage plan and sync state at the foot of the sidebar. */
export function AccountCard() {
  const cloud = useCloud(), { notify } = usePaperflow();
  if (cloud.status === "disabled") return <small className="pf-account-local"><HardDrive size={12}/> 로컬 저장 · 이 브라우저</small>;
  if (cloud.status === "loading") return <small className="pf-account-local">계정 확인 중…</small>;
  if (cloud.status === "signed-out") return <SignIn/>;
  const plan = cloud.plan, local = plan?.mode === "local";
  const ratio = plan && plan.quotaBytes ? Math.min(1, plan.usedBytes / plan.quotaBytes) : 0;
  return <div className="pf-account">
    <div className="pf-account-who"><Avatar src={cloud.avatar} alt={cloud.name ?? cloud.email ?? "계정"} fallback={(cloud.name ?? cloud.email ?? "?").slice(0, 1).toUpperCase()}/><span><b>{cloud.name ?? cloud.email}</b><small>{cloud.email}</small></span></div>
    <div className="pf-account-plan" data-mode={plan?.mode}>
      {local ? <><HardDrive size={12}/> 기기 저장 · 용량 무제한</> : <><Cloud size={12}/> 클라우드 {plan ? `${mb(plan.usedBytes)} / ${plan.quotaBytes ? mb(plan.quotaBytes) : "무제한"}` : ""}</>}
    </div>
    {!local && plan?.quotaBytes ? <div className="pf-account-meter" role="meter" aria-valuemin={0} aria-valuemax={plan.quotaBytes} aria-valuenow={plan.usedBytes} aria-label="클라우드 저장 사용량"><i style={{ width: `${ratio * 100}%` }} data-full={ratio > .9 || undefined}/></div> : null}
    <div className="pf-account-actions">
      <button type="button" onClick={() => void syncAll()} disabled={cloud.syncing} aria-label="지금 동기화"><RefreshCw size={12} className={cloud.syncing ? "pf-spin" : undefined}/>{cloud.syncing ? "동기화 중" : cloud.lastSyncedAt ? `동기화 ${new Date(cloud.lastSyncedAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}` : "동기화"}</button>
      <button type="button" onClick={() => void signOut()} aria-label="로그아웃"><LogOut size={12}/>로그아웃</button>
    </div>
    {cloud.error && <small className="pf-account-error">{cloud.error}</small>}
  </div>;
}

/** Signed out: Google, or a one-time link by email. Either one creates the account on first use. */
function SignIn() {
  const { notify } = usePaperflow();
  const [email, setEmail] = useState(""), [open, setOpen] = useState(false), [sending, setSending] = useState(false), [sentTo, setSentTo] = useState("");
  const send = async (event: React.FormEvent) => {
    event.preventDefault(); setSending(true);
    try { await signInWithEmail(email, location.pathname); setSentTo(email.trim()); } catch (error) { notify(readableError(error)); } finally { setSending(false); }
  };
  return <div className="pf-account-signin-group">
    <button type="button" className="pf-account-signin" onClick={() => void signInWithGoogle(location.pathname).catch(error => notify(readableError(error)))}><LogIn size={14}/> Google로 로그인<small>모든 기기에서 서재·메모 이어 보기</small></button>
    {sentTo ? <p className="pf-account-sent" role="status"><Mail size={12}/> {sentTo}로 로그인 링크를 보냈다. 메일의 링크를 누르면 로그인된다.</p>
      : open ? <form className="pf-account-email" onSubmit={event => void send(event)}>
        <input type="email" autoComplete="email" required aria-label="로그인 이메일" placeholder="이메일 주소" value={email} onChange={event => setEmail(event.target.value)} autoFocus/>
        <button type="submit" disabled={sending || !email}>{sending ? "보내는 중" : "링크 받기"}</button>
      </form>
      : <button type="button" className="pf-account-email-toggle" onClick={() => setOpen(true)}><Mail size={12}/> 이메일로 로그인 · 가입</button>}
  </div>;
}
