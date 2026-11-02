// OpenScriptures Hebrew morphology codes (as used by STEPBible TAHOT) -> Korean labels.
// A code is a language letter (H Hebrew, A Aramaic) followed by "/"-separated segments,
// e.g. "HR/Ncfsa" = preposition + noun common feminine singular absolute.

const GENDER = { m: "남성", f: "여성", c: "통성", b: "양성" };
const NUMBER = { s: "단수", p: "복수", d: "쌍수" };
const STATE = { a: "절대형", c: "연계형", d: "한정형" };
const PERSON = { 1: "1인칭", 2: "2인칭", 3: "3인칭" };
const STEM_H = {
  q: "칼", N: "닙팔", p: "피엘", P: "푸알", h: "히필", H: "호팔", t: "히트파엘", o: "폴렐", O: "폴랄", r: "히트폴렐",
  m: "포엘", M: "포알", k: "팔렐", K: "풀랄", Q: "칼 수동", l: "필펠", L: "폴팔", f: "히트팔펠", D: "니트파엘",
  j: "페알랄", i: "필렐", u: "호트파알", c: "티필", v: "히쉬타펠", w: "니트팔렐", y: "니트포엘", z: "히트포엘",
};
const STEM_A = { q: "페알", Q: "페일", u: "히트페엘", N: "닙알", p: "파엘", P: "푸알", M: "히트파알", a: "아펠", h: "하펠", s: "샤펠", e: "호팔", H: "히트파알", i: "이트펠", t: "히트파엘", v: "이쉬타펠", w: "히쉬타펠", o: "폴렐", z: "히트폴렐", m: "포엘", r: "이트폴렐", f: "히트팔펠", b: "히트팔렐", c: "티필", k: "팔렐", l: "필펠", L: "폴팔", y: "이트파알" };
const CONJ = {
  p: "완료", q: "연속 완료", i: "미완료", w: "연속 미완료", h: "청유형", j: "지시형", v: "명령형",
  r: "능동 분사", s: "수동 분사", a: "부정사 절대형", c: "부정사 연계형",
};
const PARTICLE = { a: "긍정사", d: "정관사", e: "권유사", i: "의문사", j: "감탄사", m: "지시사", n: "부정사(否定)", o: "목적격 표지", r: "관계사" };
const PRONOUN = { d: "지시대명사", f: "부정대명사", i: "의문대명사", p: "인칭대명사", r: "관계대명사" };
const SUFFIX = { d: "방향 접미사", h: "강조 접미사", n: "강조 눈", p: "대명사 접미사" };

function gns(s, i) {
  const out = [];
  if (PERSON[s[i]]) out.push(PERSON[s[i++]]);
  if (GENDER[s[i]]) out.push(GENDER[s[i++]]);
  if (NUMBER[s[i]]) out.push(NUMBER[s[i++]]);
  if (STATE[s[i]]) out.push(STATE[s[i++]]);
  return out;
}

function segment(seg, aramaic) {
  const pos = seg[0];
  switch (pos) {
    case "N": {
      const kind = { c: "명사", g: "민족명", p: "고유명사", t: "칭호" }[seg[1]] || "명사";
      return [kind, ...gns(seg, 2)].join(" ");
    }
    case "A": {
      const kind = { a: "형용사", c: "기수", g: "민족 형용사", o: "서수" }[seg[1]] || "형용사";
      return [kind, ...gns(seg, 2)].join(" ");
    }
    case "V": {
      const stem = (aramaic ? STEM_A : STEM_H)[seg[1]] || seg[1];
      const conj = CONJ[seg[2]] || seg[2] || "";
      return ["동사", stem, conj, ...gns(seg, 3)].filter(Boolean).join(" ");
    }
    case "P": return [PRONOUN[seg[1]] || "대명사", ...gns(seg, 2)].join(" ");
    case "S": return [SUFFIX[seg[1]] || "접미사", ...gns(seg, 2)].join(" ");
    case "T": return PARTICLE[seg[1]] || "불변화사";
    case "R": return seg[1] === "d" ? "전치사+관사" : "전치사";
    case "C": return "접속사";
    case "D": return "부사";
    default: return seg;
  }
}

export function describeHebrew(code) {
  if (!code) return "";
  const aramaic = code[0] === "A";
  const body = code[0] === "H" || code[0] === "A" ? code.slice(1) : code;
  return (aramaic ? "아람어 · " : "") + body.split("/").filter(Boolean).map(s => segment(s, aramaic)).join(" + ");
}
