"use client";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowRight, BookOpen, Languages, Highlighter, Network, Sparkles, Mail, RotateCw, ShieldCheck, Eye, EyeOff } from "lucide-react";
import { MIN_PASSWORD, authMessage, resendConfirmation, sendPasswordReset, signInWithGoogle, signInWithPassword, signUpWithPassword } from "@/lib/paperflow/cloud/browser";
import { googleEnabled } from "@/lib/paperflow/cloud/config";

const FEATURES = [
  { icon: Languages, title: "원문 형상 그대로 한국어로", text: "표·수식·첨자·인용 위치를 지킨 국문판 조판 번역" },
  { icon: Highlighter, title: "마킹과 메모, 그대로 내보내기", text: "형광펜·손글씨·메모를 PDF에 담아 저장" },
  { icon: Network, title: "나의 연구맵과 맞춤 추천", text: "읽은 논문으로 저자·저널·분야 지도를 그리고 다음 논문 찾기" },
  { icon: Sparkles, title: "AI 논문 가이드", text: "핵심 결과를 원문 근거 문장과 화살표로 연결" }
];
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
  const [error, setError] = useState(params.get("auth") === "failed" ? "확인 링크를 처리하지 못했다. 다시 시도해 달라." : "");
  useEffect(() => { if (wait <= 0) return; const timer = setTimeout(() => setWait(value => value - 1), 1000); return () => clearTimeout(timer); }, [wait]);

  const run = async (task: () => Promise<void>) => { setBusy(true); setError(""); try { await task(); } catch (cause) { setError(authMessage(cause)); } finally { setBusy(false); } };
  const login = (event: React.FormEvent) => { event.preventDefault(); void run(async () => {
    try { await signInWithPassword(email, password); }
    catch (cause) { setUnconfirmed(/이메일 확인/.test(authMessage(cause))); throw cause; }
    // A full navigation, so the server-side gate sees the new session cookie.
    window.location.replace(next);
  }); };
  const signup = (event: React.FormEvent) => { event.preventDefault(); void run(async () => {
    if (password !== confirm) throw new Error("두 비밀번호가 다르다.");
    await signUpWithPassword(email, password, next); setSent({ kind: "signup", email: email.trim() }); setWait(RESEND_SECONDS);
  }); };
  const forgot = (event: React.FormEvent) => { event.preventDefault(); void run(async () => { await sendPasswordReset(email); setSent({ kind: "reset", email: email.trim() }); setWait(RESEND_SECONDS); }); };
  const resend = () => void run(async () => { if (!sent || sent.kind === "signup") await resendConfirmation(sent?.email ?? email, next); else await sendPasswordReset(sent.email); setWait(RESEND_SECONDS); });
  const switchMode = (value: Mode) => { setMode(value); setSent(null); setError(""); setUnconfirmed(false); setConfirm(""); };
  const swap = reduced ? {} : { initial: { opacity: 0, x: 18 }, animate: { opacity: 1, x: 0 }, exit: { opacity: 0, x: -18 }, transition: { type: "spring" as const, stiffness: 340, damping: 32 } };
  const passwordField = (id: string, label: string, value: string, onChange: (value: string) => void, autoComplete: string) => <>
    <label htmlFor={id}>{label}</label>
    <span className="pf-login-password"><input id={id} type={show ? "text" : "password"} autoComplete={autoComplete} required minLength={mode === "login" ? undefined : MIN_PASSWORD} value={value} onChange={event => onChange(event.target.value)} placeholder={mode === "login" ? "비밀번호" : `${MIN_PASSWORD}자 이상`}/>
      <button type="button" onClick={() => setShow(value => !value)} aria-label={show ? "비밀번호 숨기기" : "비밀번호 보기"}>{show ? <EyeOff size={16}/> : <Eye size={16}/>}</button></span>
  </>;

  return <main className="pf-login">
    <section className="pf-login-story" aria-label="PAPERFLOW 소개">
      <div className="pf-login-brand"><span className="pf-logo"><BookOpen size={20}/></span><span>PAPERFLOW<small>RESEARCH WORKSPACE</small></span></div>
      <div className="pf-login-hero">
        <span className="pf-kicker">YOUR RESEARCH, GROUNDED.</span>
        <h1>논문을 원문 그대로,<br/>한국어로 깊이 읽는다.</h1>
        <p>한 편씩 모으고, 한 문장씩 깊이 읽는 나만의 연구 서재. 어느 기기에서 로그인해도 같은 서재가 열린다.</p>
      </div>
      <ul className="pf-login-features">{FEATURES.map(({ icon: Icon, title, text }, index) => <motion.li key={title} initial={reduced ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .08 + index * .06, type: "spring", stiffness: 260, damping: 28 }}>
        <span className="pf-login-feature-icon"><Icon size={16}/></span><span><b>{title}</b><small>{text}</small></span>
      </motion.li>)}</ul>
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
            <h2>{sent.kind === "signup" ? "확인 메일을 보냈다" : "비밀번호 설정 메일을 보냈다"}</h2>
            <p className="pf-login-lead"><b>{sent.email}</b>{sent.kind === "signup" ? "로 가입 확인 메일을 보냈다. 메일의 링크를 누르면 가입이 끝나고 서재가 열린다. 그다음부터는 이 이메일과 비밀번호로 어느 기기에서든 로그인한다." : "로 비밀번호 설정 링크를 보냈다. 링크를 열어 새 비밀번호를 정하면 바로 서재가 열린다."}</p>
            <ol className="pf-login-steps"><li>메일함에서 <b>Supabase Auth</b>가 보낸 메일을 연다 (스팸함도 확인)</li><li>링크를 누른다. 휴대폰에서 열어도 된다</li><li>{sent.kind === "signup" ? "가입 완료, 나의 연구 서재가 열린다" : "새 비밀번호를 정하면 서재가 열린다"}</li></ol>
            <div className="pf-login-secondary">
              <button type="button" onClick={resend} disabled={busy || wait > 0}><RotateCw size={13}/>{wait > 0 ? `다시 보내기 (${wait}s)` : "메일 다시 보내기"}</button>
              <button type="button" onClick={() => switchMode("login")}>로그인 화면으로</button>
            </div>
          </motion.div>
          : mode === "login" ? <motion.div key="login" {...swap}>
            <h2>다시 오신 것을 환영한다</h2>
            <p className="pf-login-lead">가입한 이메일과 비밀번호로 로그인하면, 어느 기기에서든 같은 서재가 열린다.</p>
            {googleEnabled && <><button type="button" className="pf-login-google" onClick={() => void signInWithGoogle(next).catch(cause => setError(authMessage(cause)))}><span className="pf-login-g" aria-hidden="true">G</span>Google로 계속하기</button><div className="pf-login-or"><span>또는</span></div></>}
            <form onSubmit={login} className="pf-login-form">
              <label htmlFor="pf-login-email">이메일</label>
              <input id="pf-login-email" type="email" inputMode="email" autoComplete="email" required placeholder="name@company.com" value={email} onChange={event => setEmail(event.target.value)} autoFocus/>
              {passwordField("pf-login-password", "비밀번호", password, setPassword, "current-password")}
              <button type="submit" className="pf-login-primary" disabled={busy || !email || !password}>{busy ? "로그인하는 중…" : <>로그인 <ArrowRight size={16}/></>}</button>
            </form>
            <div className="pf-login-secondary">
              <button type="button" onClick={() => switchMode("forgot")}>비밀번호 찾기 · 설정</button>
              {unconfirmed && <button type="button" onClick={resend} disabled={busy || wait > 0}><RotateCw size={13}/>{wait > 0 ? `확인 메일 (${wait}s)` : "확인 메일 다시 받기"}</button>}
            </div>
          </motion.div>
          : mode === "signup" ? <motion.div key="signup" {...swap}>
            <h2>PAPERFLOW 시작하기</h2>
            <p className="pf-login-lead">이메일과 비밀번호를 정하면 확인 메일을 보낸다. 메일의 링크를 누르는 순간 가입이 끝난다.</p>
            <form onSubmit={signup} className="pf-login-form">
              <label htmlFor="pf-signup-email">이메일</label>
              <input id="pf-signup-email" type="email" inputMode="email" autoComplete="email" required placeholder="name@company.com" value={email} onChange={event => setEmail(event.target.value)} autoFocus/>
              {passwordField("pf-signup-password", "비밀번호", password, setPassword, "new-password")}
              <label htmlFor="pf-signup-confirm">비밀번호 확인</label>
              <input id="pf-signup-confirm" type={show ? "text" : "password"} autoComplete="new-password" required value={confirm} onChange={event => setConfirm(event.target.value)} placeholder="한 번 더" aria-invalid={Boolean(confirm) && confirm !== password}/>
              {confirm && confirm !== password && <small className="pf-login-hint-bad">두 비밀번호가 다르다.</small>}
              <button type="submit" className="pf-login-primary" disabled={busy || !email || password.length < MIN_PASSWORD || password !== confirm}>{busy ? "가입하는 중…" : <>가입하고 확인 메일 받기 <ArrowRight size={16}/></>}</button>
            </form>
          </motion.div>
          : <motion.div key="forgot" {...swap}>
            <h2>비밀번호 찾기 · 설정</h2>
            <p className="pf-login-lead">가입한 이메일로 비밀번호 설정 링크를 보낸다. 메일 링크로 만든 계정에 처음 비밀번호를 정할 때도 이 방법을 쓴다.</p>
            <form onSubmit={forgot} className="pf-login-form">
              <label htmlFor="pf-forgot-email">이메일</label>
              <input id="pf-forgot-email" type="email" inputMode="email" autoComplete="email" required placeholder="name@company.com" value={email} onChange={event => setEmail(event.target.value)} autoFocus/>
              <button type="submit" className="pf-login-primary" disabled={busy || !email}>{busy ? "보내는 중…" : <>설정 링크 받기 <ArrowRight size={16}/></>}</button>
            </form>
            <div className="pf-login-secondary"><button type="button" onClick={() => switchMode("login")}>로그인으로 돌아가기</button></div>
          </motion.div>}
        </AnimatePresence>
        <AnimatePresence>{error && <motion.p key={error} className="pf-login-error" role="alert" initial={reduced ? false : { opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>{error}</motion.p>}</AnimatePresence>
        <p className="pf-login-trust"><ShieldCheck size={13}/> 서재·메모·번역은 내 계정에만 저장되고, PDF 원문은 수정하지 않는다.</p>
      </motion.div>
    </section>
  </main>;
}
