"use client";
import * as React from "react";
import { Cloud, Copy, Cpu, Download, HardDrive, KeyRound, Monitor, Moon, Sparkles, Sun, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { exportState, importState } from "../../core/store";
import type { Settings } from "../../core/types";
import { learnerKey, setLearnerKey } from "../../platform/web";
import { clock, useApp } from "../store";
import { Card, ConfirmDialog, Eyebrow, cn } from "../kit";

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 py-3.5 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="text-[14px] font-medium">{label}</div>
        {hint ? <p className="ef-ko mt-0.5 text-[12px] text-[var(--muted)]">{hint}</p> : null}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Choice<T extends string>({ value, options, onChange, label }: { value: T; options: { v: T; label: React.ReactNode }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="inline-flex rounded-xl border border-[var(--line)] bg-black/[.035] p-1 dark:bg-white/[.055]" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.v}
          role="radio"
          aria-checked={value === o.v}
          onClick={() => onChange(o.v)}
          className={cn("dd-focus inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium", value === o.v ? "bg-[var(--surface-strong)] text-[var(--foreground)] shadow-sm" : "text-[var(--muted)]")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function SettingsScreen() {
  const app = useApp();
  const s = app.state.settings;
  const set = (p: Partial<Settings>) => app.updateSettings(p);
  const [confirmReset, setConfirmReset] = React.useState(false);
  const [keyInput, setKeyInput] = React.useState("");
  const fileRef = React.useRef<HTMLInputElement>(null);
  const isWeb = app.platform.target === "web";
  const offsetDays = Math.round(clock.offset() / 86400000);

  const doExport = async () => {
    const ok = await app.platform.download(`engflow-backup-${new Date().toISOString().slice(0, 10)}.json`, exportState(app.state));
    if (ok) toast.success("학습 기록 파일을 내보냈습니다.");
    else toast.error("파일을 저장하지 못했습니다. 이 화면에서 다운로드가 허용되지 않았을 수 있습니다.");
  };

  const doImport = async (file: File) => {
    try {
      const next = importState(await file.text());
      app.replaceState(next);
      toast.success("학습 기록을 가져왔습니다.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "가져오지 못했습니다.");
    }
  };

  const shift = (days: number) => {
    clock.setOffset(days ? clock.offset() + days * 86400000 : 0);
    app.refreshStatus();
    toast(days ? `테스트용으로 시간을 ${days}일 앞당겼습니다.` : "실제 시간으로 돌아왔습니다.");
  };

  return (
    <div className="space-y-5">
      <div>
        <Eyebrow>설정</Eyebrow>
        <h1 className="mt-1.5 text-[28px] font-semibold tracking-[-.04em]">학습 환경</h1>
      </div>

      <Card className="divide-y divide-[var(--line)] px-4 md:px-5">
        <Row label="저장 위치" hint={app.storage.detailKo}>
          <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold", app.storage.durable ? "bg-[var(--ef-ok-soft)] text-[var(--ef-ok)]" : "bg-[var(--ef-warn-soft)] text-[var(--ef-warn)]")}>
            {app.storage.kind === "local" ? <HardDrive className="size-3.5" /> : <Cloud className="size-3.5" />}
            {app.storage.labelKo}
          </span>
        </Row>
        <Row label="답안 평가" hint={app.ai.detailKo}>
          <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold", app.ai.available ? "bg-[var(--ef-accent-soft)] text-[var(--ef-accent-ink)]" : "bg-[var(--ef-track)] text-[var(--ef-ink-2)]")}>
            {app.ai.available ? <Sparkles className="size-3.5" /> : <Cpu className="size-3.5" />}
            {app.ai.labelKo}
          </span>
        </Row>
        {isWeb && app.storage.kind === "server" ? (
          <Row label="동기화 키" hint="다른 기기에서 같은 학습 기록을 쓰려면 이 키를 그 기기의 설정에 입력하세요. 비밀번호처럼 보관하세요.">
            <div className="flex flex-col gap-2 sm:items-end">
              <button
                onClick={() => navigator.clipboard?.writeText(learnerKey()).then(() => toast.success("복사했습니다."), () => toast.error("복사하지 못했습니다."))}
                className="dd-focus inline-flex h-9 items-center gap-1.5 rounded-xl border border-[var(--line)] px-3 text-[12px]"
              >
                <KeyRound className="size-3.5" /> <span className="ef-mono">{learnerKey().slice(0, 8)}…</span> <Copy className="size-3.5" />
              </button>
              <form
                className="flex gap-1.5"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (setLearnerKey(keyInput)) location.reload();
                  else toast.error("키 형식이 올바르지 않습니다 (48자리 16진수).");
                }}
              >
                <label htmlFor="ef-sync-key" className="sr-only">동기화 키 입력</label>
                <input id="ef-sync-key" value={keyInput} onChange={(e) => setKeyInput(e.target.value)} placeholder="다른 기기의 키 붙여넣기" className="dd-focus h-9 w-56 rounded-xl border border-[var(--line)] bg-[var(--background)] px-3 text-[16px] sm:text-[13px]" />
                <button className="dd-focus h-9 rounded-xl bg-[var(--foreground)] px-3 text-[12px] font-semibold text-[var(--background)]">연결</button>
              </form>
            </div>
          </Row>
        ) : null}
      </Card>

      <Card className="divide-y divide-[var(--line)] px-4 md:px-5">
        <Row label="하루 목표" hint="오늘 화면의 목표 문항 수입니다.">
          <Choice value={String(s.dailyTarget)} label="하루 목표" options={["6", "12", "20", "30"].map((v) => ({ v, label: `${v}문항` }))} onChange={(v) => set({ dailyTarget: Number(v) })} />
        </Row>
        <Row label="AI 평가" hint="자동: 문장 구성과 확신이 낮은 구문 답을 Claude가 다시 평가합니다. 요청 시: 버튼을 눌렀을 때만. 끄기: 규칙 기반만.">
          <Choice value={s.ai} label="AI 평가" options={[{ v: "auto", label: "자동" }, { v: "on-request", label: "요청 시" }, { v: "off", label: "끄기" }]} onChange={(v) => set({ ai: v })} />
        </Row>
        <Row label="문장 평가 정밀도" hint="정밀은 더 깊이 생각하지만 결과가 늦게 옵니다(규칙 기반 결과는 즉시 표시).">
          <Choice value={s.aiDepth} label="평가 정밀도" options={[{ v: "default", label: "정밀" }, { v: "quick", label: "빠름" }]} onChange={(v) => set({ aiDepth: v })} />
        </Row>
        <Row label="복습 간격" hint="적응형: 1→3→7→14→30일로 시작해 두 번 성공하면 FSRS가 기억 상태에 맞춰 조정합니다. 고정: 항상 사다리 간격.">
          <Choice value={s.scheduler} label="복습 간격" options={[{ v: "adaptive", label: "적응형 FSRS" }, { v: "ladder", label: "고정 간격" }]} onChange={(v) => set({ scheduler: v })} />
        </Row>
        <Row label="자동 수정 (iOS·Android)" hint="끄면 키보드가 철자를 고치지 않아 실제 실력대로 평가됩니다. 권장: 끄기.">
          <Choice value={s.autocorrect ? "on" : "off"} label="자동 수정" options={[{ v: "off", label: "끄기" }, { v: "on", label: "켜기" }]} onChange={(v) => set({ autocorrect: v === "on" })} />
        </Row>
        <Row label="자연스러운 한국어 기본 표시" hint="문장 구성 문제에서 영어 어순 의미 단위와 함께 자연스러운 한국어 문장을 처음부터 보여 줍니다.">
          <Choice value={s.showNaturalKorean ? "on" : "off"} label="자연스러운 한국어" options={[{ v: "off", label: "숨김" }, { v: "on", label: "표시" }]} onChange={(v) => set({ showNaturalKorean: v === "on" })} />
        </Row>
        <Row label="테마">
          <Choice
            value={s.theme}
            label="테마"
            options={[
              { v: "system", label: <><Monitor className="size-3.5" />시스템</> },
              { v: "light", label: <><Sun className="size-3.5" />라이트</> },
              { v: "dark", label: <><Moon className="size-3.5" />다크</> },
            ]}
            onChange={(v) => set({ theme: v })}
          />
        </Row>
        <Row label="움직임 줄이기" hint="애니메이션을 최소화합니다. 시스템 설정도 자동으로 따릅니다.">
          <Choice value={s.reducedMotion} label="움직임" options={[{ v: "system", label: "시스템" }, { v: "reduce", label: "줄이기" }]} onChange={(v) => set({ reducedMotion: v })} />
        </Row>
      </Card>

      <Card className="divide-y divide-[var(--line)] px-4 md:px-5">
        <Row label="학습 기록 내보내기" hint="JSON 파일로 백업합니다.">
          <button onClick={doExport} className="dd-focus inline-flex h-9 items-center gap-1.5 rounded-xl border border-[var(--line)] px-3 text-[13px] font-medium">
            <Download className="size-3.5" /> 내보내기
          </button>
        </Row>
        <Row label="학습 기록 가져오기" hint="내보낸 JSON 파일로 현재 기록을 바꿉니다.">
          <>
            <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => e.target.files?.[0] && doImport(e.target.files[0])} />
            <button onClick={() => fileRef.current?.click()} className="dd-focus inline-flex h-9 items-center gap-1.5 rounded-xl border border-[var(--line)] px-3 text-[13px] font-medium">
              <Upload className="size-3.5" /> 가져오기
            </button>
          </>
        </Row>
        <Row label="처음부터 다시 시작" hint="모든 답변·복습·실수 기록을 지우고 가져온 과거 실수 7개만 남깁니다.">
          <button onClick={() => setConfirmReset(true)} className="dd-focus inline-flex h-9 items-center gap-1.5 rounded-xl bg-[var(--ef-bad-soft)] px-3 text-[13px] font-semibold text-[var(--ef-bad)]">
            <Trash2 className="size-3.5" /> 초기화
          </button>
        </Row>
      </Card>

      <Card className="p-4 md:p-5">
        <Eyebrow>채점 방식</Eyebrow>
        <ul className="ef-ko mt-2 space-y-1.5 text-[13px] text-[var(--ef-ink-2)]">
          <li>· 문장 구성: 의미 30% · 문법 30% · 기술 용어 20% · 구조·자연스러움 20%. 회의 전달력은 문법 점수와 따로 표시합니다.</li>
          <li>· 규칙 기반 분석은 즉시, 오프라인으로 동작합니다: 기준 답안과 다른 정답들, 의미 단위, 문항별 오답 패턴, 일반 문법 규칙을 사용합니다. 처음 보는 표현에서는 오류를 놓칠 수 있어 신뢰도를 함께 표시합니다.</li>
          <li>· Claude 분석은 같은 기준표로 다시 평가하고 결과를 형식 검증(JSON 스키마)한 뒤에만 보여 줍니다. 실패하면 규칙 기반 결과를 유지합니다.</li>
          <li>· 같은 오류는 한 항목에서만 감점합니다. 사소한 철자는 작게 감점합니다.</li>
          <li>· 힌트를 쓰면 그 답은 독립 숙련 증거로 덜 반영되고 복습 간격도 짧아집니다.</li>
        </ul>
      </Card>

      <Card className="p-4 md:p-5">
        <Eyebrow>개발자 도구 · 복습 일정 확인용</Eyebrow>
        <p className="ef-ko mt-1.5 text-[12px] text-[var(--muted)]">시간을 앞당겨 며칠 뒤 복습 문제가 어떻게 나오는지 확인합니다. 학습 기록의 시간도 이 기준으로 저장되니 확인 후 반드시 해제하세요.</p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {[1, 3, 7, 14].map((d) => (
            <button key={d} onClick={() => shift(d)} className="dd-focus h-9 rounded-xl border border-[var(--line)] px-3 text-[13px]">+{d}일</button>
          ))}
          <button onClick={() => shift(0)} disabled={!offsetDays} className="dd-focus h-9 rounded-xl bg-[var(--foreground)] px-3 text-[13px] font-semibold text-[var(--background)] disabled:opacity-40">
            실제 시간으로 {offsetDays ? `(현재 +${offsetDays}일)` : ""}
          </button>
        </div>
      </Card>

      <p className="ef-ko pb-4 text-center text-[11px] text-[var(--muted)]">EngFlow · Design Deck 기반 · {app.platform.target === "artifact" ? "claude.ai 아티팩트" : "웹 앱"}</p>
      <ConfirmDialog open={confirmReset} onOpenChange={setConfirmReset} title="학습 기록을 초기화할까요?" body="모든 답변, 복습 일정, 레벨 테스트 결과가 삭제됩니다. 되돌릴 수 없습니다." confirmLabel="초기화" danger onConfirm={() => void app.reset().then(() => toast("초기화했습니다."))} />
    </div>
  );
}
