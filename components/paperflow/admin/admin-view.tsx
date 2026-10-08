"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, useReducedMotion } from "motion/react";
import { ArrowLeft, Layers, Search, ShieldCheck } from "lucide-react";
import { PLANS, PLAN_TIERS, papersFor, type PlanTier } from "@/lib/paperflow/cloud/plans";
import { PaperflowMark } from "../shell/paperflow-logo";

interface AdminUser { id: string; email: string; owner: boolean; plan: PlanTier; confirmed: boolean; createdAt: string; lastSignInAt: string | null; usedBytes: number; quotaBytes: number | null; creditsUsed: number; creditsLimit: number | null }
const mb = (bytes: number) => bytes >= 1073741824 ? `${(bytes / 1073741824).toFixed(1)}GB` : `${Math.round(bytes / 1048576)}MB`;
const day = (value: string | null) => value ? new Date(value).toLocaleDateString("ko-KR", { year: "2-digit", month: "2-digit", day: "2-digit" }) : "—";

async function request<T>(init?: RequestInit): Promise<T> {
  const response = await fetch("/api/admin/users", { ...init, headers: { "Content-Type": "application/json" } });
  const body = await response.json().catch(() => ({ error: "응답을 읽지 못했습니다." }));
  if (!response.ok) throw new Error(body.error || "요청을 처리하지 못했습니다.");
  return body as T;
}

/** Administrator page: every account, its plan (Tester / Basic / Pro / 관리자), storage and credits. */
export function AdminView() {
  const client = useQueryClient(), reduced = useReducedMotion();
  const [query, setQuery] = useState(""), [notice, setNotice] = useState("");
  const users = useQuery({ queryKey: ["admin-users"], queryFn: () => request<{ users: AdminUser[]; month: string }>() });
  const change = useMutation({
    mutationFn: ({ userId, plan }: { userId: string; plan: PlanTier }) => request<{ ok: true }>({ method: "POST", body: JSON.stringify({ userId, plan }) }),
    onSuccess: (_, { plan }) => { setNotice(`등급을 ${PLANS[plan].label}(으)로 바꿨습니다.`); void client.invalidateQueries({ queryKey: ["admin-users"] }); },
    onError: error => setNotice(error instanceof Error ? error.message : "등급을 바꾸지 못했습니다.")
  });
  const list = useMemo(() => (users.data?.users ?? []).filter(user => user.email.toLowerCase().includes(query.trim().toLowerCase())), [users.data, query]);
  const counts = useMemo(() => Object.fromEntries(PLAN_TIERS.map(tier => [tier, (users.data?.users ?? []).filter(user => user.plan === tier).length])), [users.data]);

  return <main className="pf-admin">
    <header className="pf-admin-top">
      <Link href="/library" className="pf-admin-back"><ArrowLeft size={16}/> 서재</Link>
      <span className="pf-admin-title"><PaperflowMark size={30}/> 관리자</span>
      <Link href="/design-deck" className="pf-admin-link"><Layers size={14}/> Design Deck</Link>
    </header>
    <section className="pf-admin-body">
      <div className="pf-admin-summary">
        <div><b>{users.data?.users.length ?? "–"}</b><span>가입자</span></div>
        {PLAN_TIERS.map(tier => <div key={tier} data-tier={tier}><b>{counts[tier] ?? 0}</b><span>{PLANS[tier].label}</span></div>)}
      </div>
      <div className="pf-admin-tools">
        <label className="pf-admin-search"><Search size={14}/><input aria-label="이메일 검색" placeholder="이메일 검색" value={query} onChange={event => setQuery(event.target.value)}/></label>
        {notice && <span className="pf-admin-notice" role="status">{notice}</span>}
      </div>
      {users.error ? <p className="pf-error" role="alert">{(users.error as Error).message}</p>
        : users.isPending ? <p className="pf-admin-empty">불러오는 중…</p>
        : <div className="pf-admin-table" role="table" aria-label="가입자 목록">
          <div className="pf-admin-row pf-admin-head" role="row"><span>이메일</span><span>가입</span><span>최근 로그인</span><span>등급</span><span>저장</span><span>이번 달 크레딧</span></div>
          {list.map((user, index) => <motion.div key={user.id} className="pf-admin-row" role="row" initial={reduced ? false : { opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index, 12) * .02 }}>
            <span className="pf-admin-email">{user.email}{!user.confirmed && <em>메일 미확인</em>}{user.owner && <ShieldCheck size={13} aria-label="관리자 이메일"/>}</span>
            <span>{day(user.createdAt)}</span>
            <span>{day(user.lastSignInAt)}</span>
            <span><select aria-label={`${user.email} 등급`} value={user.plan} disabled={user.owner || change.isPending} data-tier={user.plan} onChange={event => change.mutate({ userId: user.id, plan: event.target.value as PlanTier })}>
              {PLAN_TIERS.map(tier => <option key={tier} value={tier}>{PLANS[tier].label}</option>)}
            </select></span>
            <span>{mb(user.usedBytes)} / {user.quotaBytes === null ? "무제한" : mb(user.quotaBytes)}</span>
            <span>{user.creditsUsed.toLocaleString()} / {user.creditsLimit === null ? "무제한" : `${user.creditsLimit.toLocaleString()} (번역 약 ${papersFor(user.creditsLimit)}편)`}</span>
          </motion.div>)}
          {list.length === 0 && <p className="pf-admin-empty">일치하는 계정이 없습니다.</p>}
        </div>}
    </section>
  </main>;
}
