// Robinson morphology codes (as used by STEPBible TAGNT) -> Korean labels.
const CASE = { N: "주격", G: "속격", D: "여격", A: "대격", V: "호격" };
const NUM = { S: "단수", P: "복수" };
const GEN = { M: "남성", F: "여성", N: "중성" };
const TENSE = { P: "현재", I: "미완료", F: "미래", A: "부정과거", R: "완료", L: "과거완료" };
const VOICE = {
  A: "능동", M: "중간", P: "수동", E: "중간/수동",
  D: "중간(디포넌트)", O: "수동(디포넌트)", N: "중간/수동(디포넌트)",
};
const MOOD = {
  I: "직설법", S: "가정법", O: "희구법", M: "명령법", N: "부정사", P: "분사",
};
const POS = {
  N: "명사", A: "형용사", T: "관사", P: "인칭대명사", R: "관계대명사",
  D: "지시대명사", C: "상호대명사", X: "부정대명사", Q: "상관대명사",
  I: "의문대명사", K: "상관대명사", F: "재귀대명사", S: "소유대명사", V: "동사",
};
const WHOLE = {
  CONJ: "접속사", PREP: "전치사", ADV: "부사", PRT: "불변화사", "PRT-N": "부정 불변화사",
  "PRT-I": "의문 불변화사", COND: "조건 접속사", INJ: "감탄사", HEB: "히브리어 음역",
  ARAM: "아람어 음역",
};
const SUFFIX = { P: "인명", L: "지명", T: "칭호", G: "민족명", S: "최상급", C: "비교급", N: "부정" };

function caseNumGen(s) {
  // e.g. "NSF", "GSM", or with person "1NS"
  const out = [];
  let i = 0;
  if (/[123]/.test(s[0])) { out.push(`${s[0]}인칭`); i = 1; }
  if (CASE[s[i]]) out.push(CASE[s[i]]);
  if (NUM[s[i + 1]]) out.push(NUM[s[i + 1]]);
  if (GEN[s[i + 2]]) out.push(GEN[s[i + 2]]);
  return out;
}

export function describeMorph(code) {
  if (!code) return "";
  if (WHOLE[code]) return WHOLE[code];
  const [head, ...rest] = code.split("-");
  if (WHOLE[head]) return [WHOLE[head], ...rest.map(r => SUFFIX[r] || r)].join(" · ");

  if (head === "V") {
    const tvm = rest[0] || "";
    const m = tvm.match(/^(2?)([PIFARL])([AMPEDON])([ISOMNP])$/);
    if (!m) return `동사 ${code}`;
    const parts = ["동사", (m[1] ? "제2" : "") + TENSE[m[2]], VOICE[m[3]], MOOD[m[4]]];
    const tail = rest[1];
    if (tail) {
      if (m[4] === "P") parts.push(...caseNumGen(tail));
      else if (/^[123][SP]$/.test(tail)) parts.push(`${tail[0]}인칭`, NUM[tail[1]]);
    }
    return parts.join(" · ");
  }

  const parts = [POS[head] || head];
  for (const r of rest) {
    if (/^[123]?[NGDAV][SP][MFN]?$/.test(r)) parts.push(...caseNumGen(r));
    else if (SUFFIX[r]) parts.push(SUFFIX[r]);
    else parts.push(r);
  }
  return parts.join(" · ");
}
