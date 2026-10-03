"use client";
import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
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

/** One-time sign-in link by email (also creates the account on first use); returns through the same callback. */
export async function signInWithEmail(email: string, next = "/library") {
  const supabase = cloudClient();
  if (!supabase) throw new Error("클라우드 계정이 아직 설정되지 않았다.");
  const address = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) throw new Error("이메일 주소를 확인해 달라.");
  const emailRedirectTo = `${location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
  const { error } = await supabase.auth.signInWithOtp({ email: address, options: { emailRedirectTo, shouldCreateUser: true } });
  if (error) throw error;
}

export async function signOut() { await cloudClient()?.auth.signOut(); }
