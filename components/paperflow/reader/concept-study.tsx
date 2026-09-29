"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { researchTerms } from "@/lib/paperflow/translation/research-style";
import { researchRequest } from "@/lib/paperflow/translation/research-api";
const definitions: Record<string, string> = {
  combustion: "fuel과 oxidizer의 반응으로 열이 발생하는 과정이다.",
  "co-firing": "둘 이상의 fuel을 같은 연소 설비에서 함께 사용하는 방식이다.", cofiring: "둘 이상의 fuel을 같은 연소 설비에서 함께 사용하는 방식이다.",
  mesh: "수치 계산을 위해 공간을 작은 cell로 나눈 구조이다.", turbulence: "유속과 압력이 시간·공간에 따라 불규칙하게 변하는 유동 상태이다.",
  "heat flux": "단위 면적을 통과하는 열전달률이다.", "boundary condition": "계산 영역 경계에 지정하는 유속·온도·압력 등의 조건이다.",
  "natural gas": "주로 methane으로 구성된 gaseous fuel이다.", boiler: "연소 등의 열원으로 물을 가열하거나 steam을 만드는 설비이다.",
};
export function ConceptStudy({ source, selected, page }: { source: string; selected: string; page: number | null }) {
  const terms = researchTerms.filter(term => source.toLowerCase().includes(term.toLowerCase())).slice(0, 12);
  const [term, setTerm] = useState(""), [answer, setAnswer] = useState(""), [pending, setPending] = useState(false), [error, setError] = useState("");
  useEffect(() => { setTerm(selected); setAnswer(""); setError(""); }, [source, selected]);
  const active = term || terms[0] || "";
  const evidence = source.split(/(?<=[.!?])\s+/).find(sentence => sentence.toLowerCase().includes(active.toLowerCase()));
  async function explain() { setPending(true); setError(""); try { const result = await researchRequest("explain", source, active); if (!result) throw new Error("OpenAI 연결 후 연구 맥락 설명을 사용할 수 있다. 아래에는 원문에서 직접 찾은 근거를 표시한다."); setAnswer(result.text); } catch (e) { setError(e instanceof Error ? e.message : "설명을 불러오지 못했다."); } finally { setPending(false); } }
  return <section className="pf-inspector-section pf-concept-study"><h3>개념 공부 <small>p. {page ?? "—"}</small></h3><p>원문·번역문을 드래그하거나 키워드를 선택하세요.</p><div className="pf-keywords">{terms.map(item => <Button key={item} size="sm" variant="ghost" aria-pressed={active === item} onClick={() => { setTerm(item); setAnswer(""); }}>{item}</Button>)}</div>
    {active && <><strong>{active}</strong>{definitions[active.toLowerCase()] && <p><small>일반 개념</small><br/>{definitions[active.toLowerCase()]}</p>}<p><small>이 문단의 원문 근거</small></p><blockquote>{evidence || "선택한 번역어의 역할은 아래 OpenAI 설명에서 원문 문맥과 함께 확인할 수 있다."}</blockquote><Button size="sm" disabled={pending || !source} onClick={() => void explain()}>{pending ? "근거 확인 중…" : "이 연구에서의 의미 설명"}</Button></>}
    {error && <p role="status">{error}</p>}{answer && <div className="pf-study-answer"><small>AI 설명 · 원문과 대조하여 확인</small><p style={{ whiteSpace: "pre-wrap" }}>{answer}</p></div>}
  </section>;
}
