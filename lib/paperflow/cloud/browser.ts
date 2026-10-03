"use client";
import { createBrowserClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cloudAnonKey, cloudEnabled, cloudUrl } from "./config";

let client: SupabaseClient | null = null;
/** The browser's Supabase client (session in cookies, refreshed automatically); null without cloud config. */
export function cloudClient(): SupabaseClient | null {
  if (!cloudEnabled || typeof window === "undefined") return null;
  client ??= createBrowserClient(cloudUrl, cloudAnonKey);
  return client;
}

export async function signInWithGoogle(next = "/library") {
  const supabase = cloudClient();
  if (!supabase) throw new Error("클라우드 계정이 아직 설정되지 않았다.");
  const redirectTo = `${location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
  const { error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo, queryParams: { prompt: "select_account" } } });
  if (error) throw error;
}

/**
 * Emails (sign-up confirmation, password reset) are requested with the implicit flow: the link
 * itself carries the session, so it works in whichever browser or device opens it, unlike a PKCE
 * link that only works where it was requested.
 */
function mailer() {
  if (!cloudEnabled) throw new Error("클라우드 계정이 아직 설정되지 않았다.");
  return createClient(cloudUrl, cloudAnonKey, { auth: { flowType: "implicit", persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}
const confirmUrl = (next: string) => `${location.origin}/auth/confirm?next=${encodeURIComponent(next)}`;
export const MIN_PASSWORD = 8;
function checkEmail(email: string) {
  const address = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) throw new Error("이메일 주소를 확인해 달라.");
  return address;
}
/** Supabase's English auth errors, in the reader's words. */
export function authMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (/invalid login credentials/i.test(message)) return "이메일 또는 비밀번호가 맞지 않다.";
  if (/email not confirmed/i.test(message)) return "아직 이메일 확인이 끝나지 않았다. 확인 메일의 링크를 눌러 달라.";
  if (/already registered|already been registered|user already exists/i.test(message)) return "이미 가입된 이메일이다. 로그인하거나 비밀번호 찾기를 이용해 달라.";
  if (/rate limit|security purposes|too many/i.test(message)) return "메일 발송 한도에 걸렸다. 잠시 뒤에 다시 시도해 달라.";
  if (/password should be|weak password|at least/i.test(message)) return `비밀번호는 ${MIN_PASSWORD}자 이상으로, 쉽게 추측할 수 없게 정해 달라.`;
  if (/same.*password|different from the old/i.test(message)) return "이전과 다른 비밀번호를 입력해 달라.";
  return message || "요청을 처리하지 못했다.";
}

/** Sign up with email and password; the account opens once the emailed link is confirmed. */
export async function signUpWithPassword(email: string, password: string, next = "/library") {
  if (password.length < MIN_PASSWORD) throw new Error(`비밀번호는 ${MIN_PASSWORD}자 이상이어야 한다.`);
  const { data, error } = await mailer().auth.signUp({ email: checkEmail(email), password, options: { emailRedirectTo: confirmUrl(next) } });
  if (error) throw new Error(authMessage(error));
  // An address that is already registered comes back with no identities (no email is sent).
  if (data.user && !data.user.identities?.length) throw new Error(authMessage("already registered"));
}

/** Sign in on this device; the session lives in cookies so the server sees it too. */
export async function signInWithPassword(email: string, password: string) {
  const supabase = cloudClient();
  if (!supabase) throw new Error("클라우드 계정이 아직 설정되지 않았다.");
  const { error } = await supabase.auth.signInWithPassword({ email: checkEmail(email), password });
  if (error) throw new Error(authMessage(error));
}

export async function resendConfirmation(email: string, next = "/library") {
  const { error } = await mailer().auth.resend({ type: "signup", email: checkEmail(email), options: { emailRedirectTo: confirmUrl(next) } });
  if (error) throw new Error(authMessage(error));
}

/** Password reset (or first password for an account made without one) by emailed link. */
export async function sendPasswordReset(email: string) {
  const { error } = await mailer().auth.resetPasswordForEmail(checkEmail(email), { redirectTo: `${location.origin}/auth/reset` });
  if (error) throw new Error(authMessage(error));
}

export async function updatePassword(password: string) {
  if (password.length < MIN_PASSWORD) throw new Error(`비밀번호는 ${MIN_PASSWORD}자 이상이어야 한다.`);
  const supabase = cloudClient();
  if (!supabase) throw new Error("클라우드 계정이 아직 설정되지 않았다.");
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw new Error(authMessage(error));
}

/**
 * The landing side of the email link: the session arrives in the URL fragment and is stored in the
 * cookie-backed client, so the server sees the sign-in too. Returns false when there is no session.
 */
export async function adoptEmailSession(hash: string): Promise<boolean> {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const failure = params.get("error_description") ?? params.get("error");
  if (failure) throw new Error(/expired|invalid/i.test(failure) ? "링크가 만료되었거나 이미 사용되었다. 로그인 화면에서 다시 요청해 달라." : failure.replace(/\+/g, " "));
  const access_token = params.get("access_token"), refresh_token = params.get("refresh_token");
  const supabase = cloudClient();
  if (!access_token || !refresh_token || !supabase) return false;
  const { error } = await supabase.auth.setSession({ access_token, refresh_token });
  if (error) throw error;
  return true;
}

export async function signOut() { await cloudClient()?.auth.signOut(); }
