"use client";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowRight, Mail, RotateCw, Eye, EyeOff } from "lucide-react";
import { MIN_PASSWORD, authMessage, resendConfirmation, sendPasswordReset, signInWithGoogle, signInWithPassword, signUpWithPassword } from "@/lib/paperflow/cloud/browser";
import { googleEnabled } from "@/lib/paperflow/cloud/config";
import { PaperflowWordmark } from "../shell/paperflow-logo";

const RESEND_SECONDS = 60;
type Mode = "login" | "signup" | "forgot";
type Sent = { kind: "signup" | "reset"; email: string } | null;

/**
 * The first screen for everyone while accounts are on. Sign up with email and password, confirm by
 * the emailed link, then sign in with the same email and password on any device.
 */
export function LoginView() {
  const params = useSearchParams(), reduced = useReducedMotion();
  const next = (() => { const value = params.get("next") ?? "/library"; return value.startsWith("/") && !value.startsWith("//") && value !== "/login" ? value : "/library"; })();
  const [mode, setMode] = useState<Mode>("login"), [sent, setSent] = useState<Sent>(null);
  const [email, setEmail] = useState(""), [password, setPassword] = useState(""), [confirm, setConfirm] = useState(""), [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false), [wait, setWait] = useState(0), [unconfirmed, setUnconfirmed] = useState(false);
  const [error, setError] = useState(params.get("auth") === "failed" ? "확인 링크를 처리하지 못했습니다. 다시 시도해 주세요." : "");
  useEffect(() => { if (wait <= 0) return; const timer = setTimeout(() => setWait(value => value - 1), 1000); return () => clearTimeout(timer); }, [wait]);

  const run = async (task: () => Promise<void>) => { setBusy(true); setError(""); try { await task(); } catch (cause) { setError(authMessage(cause)); } finally { setBusy(false); } };
  const login = (event: React.FormEvent) => { event.preventDefault(); void run(async () => {
    try { await signInWithPassword(email, password); }
    catch (cause) { setUnconfirmed(/이메일 확인/.test(authMessage(cause))); throw cause; }
    // A full navigation, so the server-side gate sees the new session cookie.
    window.location.replace(next);
  }); };
  const signup = (event: React.FormEvent) => { event.preventDefault(); void run(async () => {
    if (password !== confirm) throw new Error("두 비밀번호가 다릅니다.");
    await signUpWithPassword(email, password, next); setSent({ kind: "signup", email: email.trim() }); setWait(RESEND_SECONDS);
  }); };
  const forgot = (event: React.FormEvent) => { event.preventDefault(); void run(async () => { await sendPasswordReset(email); setSent({ kind: "reset", email: email.trim() }); setWait(RESEND_SECONDS); }); };
  const resend = () => void run(async () => { if (!sent || sent.kind === "signup") await resendConfirmation(sent?.email ?? email, next); else await sendPasswordReset(sent.email); setWait(RESEND_SECONDS); });
  const switchMode = (value: Mode) => { setMode(value); setSent(null); setError(""); setUnconfirmed(false); setConfirm(""); };
  const swap = reduced ? {} : { initial: { opacity: 0, x: 18 }, animate: { opacity: 1, x: 0 }, exit: { opacity: 0, x: -18 }, transition: { type: "spring" as const, stiffness: 340, damping: 32 } };
  const passwordField = (id: string, label: string, value: string, onChange: (value: string) => void, autoComplete: string) => <>
    <label htmlFor={id}>{label}</label>
    <span className="pf-login-password"><input id={id} type={show ? "text" : "password"} autoComplete={autoComplete} required minLength={mode === "login" ? undefined : MIN_PASSWORD} value={value} onChange={event => onChange(event.target.value)} placeholder={mode === "login" ? "" : `${MIN_PASSWORD}자 이상`}/>
      <button type="button" onClick={() => setShow(value => !value)} aria-label={show ? "비밀번호 숨기기" : "비밀번호 보기"}>{show ? <EyeOff size={16}/> : <Eye size={16}/>}</button></span>
  </>;

  return <main className="pf-login">
    <section className="pf-login-story" aria-label="PAPERFLOW">
      <PaperflowWordmark size={40}/>
      <motion.div className="pf-login-hero" initial={reduced ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring", stiffness: 220, damping: 28 }}>
        <h1>원문 그대로,<br/><em>한국어로 읽는 논문.</em></h1>
        <ul className="pf-login-tags"><li>국문판 조판 번역</li><li>마킹 · 메모</li><li>연구맵 · 추천</li><li>AI 가이드</li></ul>
      </motion.div>
      <div className="pf-login-stack" aria-hidden="true"><i/><i/><i/></div>
    </section>

    <section className="pf-login-panel">
      <motion.div className="pf-login-card" initial={reduced ? false : { opacity: 0, y: 14, scale: .985 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: "spring", stiffness: 260, damping: 28 }}>
        {!sent && mode !== "forgot" && <div className="pf-login-tabs" role="tablist" aria-label="로그인 또는 회원가입">
          {(["login", "signup"] as const).map(value => <button key={value} type="button" role="tab" aria-selected={mode === value} onClick={() => switchMode(value)}>
            {mode === value && <motion.span layoutId="pf-login-tab" className="pf-login-tab-pill" transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 480, damping: 36 }}/>}
            <span>{value === "login" ? "로그인" : "회원가입"}</span>
          </button>)}
        </div>}
        <AnimatePresence mode="wait" initial={false}>
          {sent ? <motion.div key="sent" {...swap}>
            <span className="pf-login-mail"><Mail size={20}/></span>
            <h2>메일함을 확인해 주세요</h2>
            <p className="pf-login-sent"><b>{sent.email}</b>{sent.kind === "signup" ? "로 보낸 링크를 누르면 가입이 완료됩니다." : "로 보낸 링크에서 새 비밀번호를 정해 주세요."}</p>
            <div className="pf-login-secondary">
              <button type="button" onClick={resend} disabled={busy || wait > 0}><RotateCw size={13}/>{wait > 0 ? `다시 보내기 ${wait}초` : "메일 다시 보내기"}</button>
              <button type="button" onClick={() => switchMode("login")}>로그인으로</button>
            </div>
          </motion.div>
          : mode === "login" ? <motion.div key="login" {...swap}>
            <h2>로그인</h2>
            {googleEnabled && <><button type="button" className="pf-login-google" onClick={() => void signInWithGoogle(next).catch(cause => setError(authMessage(cause)))}><span className="pf-login-g" aria-hidden="true">G</span>Google로 계속하기</button><div className="pf-login-or"><span>또는</span></div></>}
            <form onSubmit={login} className="pf-login-form">
              <label htmlFor="pf-login-email">이메일</label>
              <input id="pf-login-email" type="email" inputMode="email" autoComplete="email" required placeholder="name@company.com" value={email} onChange={event => setEmail(event.target.value)} autoFocus/>
              {passwordField("pf-login-password", "비밀번호", password, setPassword, "current-password")}
              <button type="submit" className="pf-login-primary" disabled={busy || !email || !password}>{busy ? "로그인 중…" : <>로그인 <ArrowRight size={16}/></>}</button>
            </form>
            <div className="pf-login-secondary">
              <button type="button" onClick={() => switchMode("forgot")}>비밀번호를 잊으셨나요?</button>
              {unconfirmed && <button type="button" onClick={resend} disabled={busy || wait > 0}><RotateCw size={13}/>{wait > 0 ? `확인 메일 ${wait}초` : "확인 메일 다시 받기"}</button>}
            </div>
          </motion.div>
          : mode === "signup" ? <motion.div key="signup" {...swap}>
            <h2>회원가입</h2>
            <form onSubmit={signup} className="pf-login-form">
              <label htmlFor="pf-signup-email">이메일</label>
              <input id="pf-signup-email" type="email" inputMode="email" autoComplete="email" required placeholder="name@company.com" value={email} onChange={event => setEmail(event.target.value)} autoFocus/>
              {passwordField("pf-signup-password", "비밀번호", password, setPassword, "new-password")}
              <label htmlFor="pf-signup-confirm">비밀번호 확인</label>
              <input id="pf-signup-confirm" type={show ? "text" : "password"} autoComplete="new-password" required value={confirm} onChange={event => setConfirm(event.target.value)} aria-invalid={Boolean(confirm) && confirm !== password}/>
              {confirm && confirm !== password && <small className="pf-login-hint-bad">비밀번호가 일치하지 않습니다.</small>}
              <button type="submit" className="pf-login-primary" disabled={busy || !email || password.length < MIN_PASSWORD || password !== confirm}>{busy ? "가입 중…" : <>가입하기 <ArrowRight size={16}/></>}</button>
            </form>
          </motion.div>
          : <motion.div key="forgot" {...swap}>
            <h2>비밀번호 재설정</h2>
            <form onSubmit={forgot} className="pf-login-form">
              <label htmlFor="pf-forgot-email">가입한 이메일</label>
              <input id="pf-forgot-email" type="email" inputMode="email" autoComplete="email" required placeholder="name@company.com" value={email} onChange={event => setEmail(event.target.value)} autoFocus/>
              <button type="submit" className="pf-login-primary" disabled={busy || !email}>{busy ? "보내는 중…" : <>재설정 링크 받기 <ArrowRight size={16}/></>}</button>
            </form>
            <div className="pf-login-secondary"><button type="button" onClick={() => switchMode("login")}>로그인으로</button></div>
          </motion.div>}
        </AnimatePresence>
        <AnimatePresence>{error && <motion.p key={error} className="pf-login-error" role="alert" initial={reduced ? false : { opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>{error}</motion.p>}</AnimatePresence>
      </motion.div>
    </section>
  </main>;
}
