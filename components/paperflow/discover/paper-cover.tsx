"use client";

/** Publisher colours (house palettes), matched loosely by name; others get a calm colour from the journal name. */
const PUBLISHERS: [RegExp, string, string][] = [
  [/elsevier|cell press/i, "#e9711c", "#fff6ee"], [/springer|nature/i, "#1f2d3d", "#f2f4f6"], [/wiley/i, "#1c5d99", "#eef4fa"],
  [/american chemical|acs/i, "#1d4f91", "#edf2f9"], [/mdpi/i, "#2c5f8a", "#eef3f7"], [/royal society of chemistry|rsc/i, "#004976", "#ecf3f7"],
  [/taylor|francis/i, "#25335c", "#eef0f5"], [/ieee/i, "#00629b", "#ebf4f9"], [/frontiers/i, "#d6262d", "#fcefef"],
  [/public library of science|plos/i, "#3c3f8f", "#f0f0f8"], [/oxford/i, "#002147", "#eef1f5"], [/cambridge/i, "#a51c30", "#f9eef0"],
  [/sage/i, "#00838f", "#eaf6f7"], [/copernicus/i, "#00796b", "#eaf5f3"], [/iop|institute of physics/i, "#4a2c6b", "#f3eff7"]
];
const SOFT = [["#3d5a80", "#eef2f7"], ["#2d6a4f", "#edf5f0"], ["#6d4c7d", "#f3eff6"], ["#9c4a2f", "#f8f0ec"], ["#1f6f8b", "#ecf4f7"], ["#5c5f2e", "#f3f3ea"]];
function paletteOf(publisher = "", journal = "") {
  const found = PUBLISHERS.find(([pattern]) => pattern.test(publisher) || pattern.test(journal));
  if (found) return { ink: found[1], paper: found[2] };
  let hash = 0;
  for (const char of journal || publisher || "paper") hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  const [ink, paper] = SOFT[hash % SOFT.length];
  return { ink, paper };
}

/**
 * A journal-style cover drawn from the paper's own data (no publisher artwork is copied): the house
 * colour as a band, the journal name set large, the year and topic as an issue line.
 */
export function PaperCover({ journal, publisher, year, topic, openAccess, review, size = "md" }: { journal?: string; publisher?: string; year?: number; topic?: string; openAccess?: boolean; review?: boolean; size?: "md" | "lg" }) {
  const { ink, paper } = paletteOf(publisher, journal);
  const name = journal || "Journal article";
  return <div className="pf-cover" data-size={size} style={{ "--cover-ink": ink, "--cover-paper": paper } as React.CSSProperties} aria-hidden="true">
    <div className="pf-cover-band"><span>{publisher?.replace(/\s*\(.*\)$/, "").slice(0, 28) || "Article"}</span>{year && <span>{year}</span>}</div>
    <div className="pf-cover-title" data-long={name.length > 34 || undefined}>{name}</div>
    <div className="pf-cover-rules"><i/><i/><i/></div>
    {topic && <div className="pf-cover-topic">{topic}</div>}
    <div className="pf-cover-tags">{review && <b>REVIEW</b>}{openAccess && <b data-oa="">OPEN ACCESS</b>}</div>
  </div>;
}
