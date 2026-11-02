import { lib, esc, parse, R, label, verseText, verseTextAsync, loadBook, words, lexicon, crossrefs, occurrences, parseKoRef, EDITIONS } from "./data.js";
import { rich } from "./layout.js";
import { describeMorph } from "../morph.js";
import { describeHebrew } from "./hebrew.js";
import { staticMap, geo, eraOf, ERAS, TYPE_KO } from "./map.js";
import { parseText, saveText, saveSettings } from "./store.js";
import { card as personCard } from "./people.js";

const $ = s => document.querySelector(s);
const KINDS = { linguistic: "원어·문법", historical: "역사·지리", interpretation: "해석", scripture: "성경 안의 연결", tradition: "후대 전승", caution: "주의" };

export function createStudy(ctx) {
  const drawer = $("#drawer"), body = $("#drawerBody"), title = $("#drawerTitle");
  const stack = [];

  const refLink = (ref, text = label(ref)) => `<a class="ref" href="#" data-go="${ref}">${esc(text)}</a>`;
  const img = (q, cls = "") => {
    const im = q && lib.images[q.query || q];
    if (!im) return "";
    return `<figure class="d-img ${cls}" data-photo="${esc(q.query || q)}"><img src="${esc(im.src)}" alt="" loading="lazy" style="aspect-ratio:${im.w}/${im.h}">
      <figcaption>${esc(q.caption || "")}<span>${esc(im.credit)} · ${esc(im.license)}</span></figcaption></figure>`;
  };
  // Verse snippets load their book on demand, then fill in.
  const snip = ref => `<div class="snip" data-snip="${ref}">${esc(verseText(ref) || "…")}</div>`;
  async function fillSnips() {
    for (const el of body.querySelectorAll("[data-snip]")) {
      if (el.textContent !== "…") continue;
      el.textContent = await verseTextAsync(el.dataset.snip);
    }
  }

  async function open(view, arg, { push = true } = {}) {
    if (push && drawer.dataset.view) stack.push([drawer.dataset.view, drawer.dataset.arg]);
    drawer.dataset.view = view;
    drawer.dataset.arg = arg ?? "";
    drawer.hidden = false;
    document.body.classList.add("drawer-open");
    body.innerHTML = `<p class="muted">불러오는 중…</p>`;
    const [t, html] = await VIEWS[view](arg);
    title.textContent = t;
    body.innerHTML = html;
    body.scrollTop = 0;
    $("#drawerBack").hidden = !stack.length;
    fillSnips();
  }
  function close() { drawer.hidden = true; drawer.dataset.view = ""; stack.length = 0; document.body.classList.remove("drawer-open"); }
  function back() { const p = stack.pop(); if (p) open(p[0], p[1], { push: false }); }

  // ---------- term ----------

  // Places come from the geocoding data, not from written notes.
  async function placeView(pid) {
    const p = lib.placeById.get(pid);
    if (!p) return ["장소", ""];
    const im = lib.placeImages[pid];
    const byBook = new Map();
    for (const r of p.refs) { const b = parse(r).b; if (!byBook.has(b)) byBook.set(b, []); byBook.get(b).push(r); }
    const eras = new Map();
    for (const r of p.refs) { const e = eraOf(r); if (e) eras.set(e, (eras.get(e) || 0) + 1); }
    const eraText = ERAS.filter(e => eras.get(e.id)).map(e => `${e.id} ${eras.get(e.id)}`).join(" · ");
    const type = TYPE_KO[p.type] || p.type || "장소";
    return [p.ko || p.en, `
      ${im ? `<figure class="d-img hero"><img src="${esc(im.src)}" alt="" style="aspect-ratio:${im.w}/${im.h}"><figcaption>${esc(p.ko)} · 오늘날 모습<span>${esc(im.credit)} · ${esc(im.license)}</span></figcaption></figure>` : ""}
      <div class="t-head"><h3>${esc(p.ko || p.en)} <span class="en">(${esc(p.en)})</span></h3>
        <div class="t-sub"><span class="t-kind">지명 · ${esc(type)}</span><span class="draft">OpenBible.info 지명 자료</span></div></div>
      ${lib.placeIntros[pid] ? `<div class="here"><span>소개</span>${rich(lib.placeIntros[pid])}</div>` : ""}
      <div class="here soft"><span>성경에서</span>${esc(p.ko || p.en)}은(는) 성경에 <b>${p.refs.length}회</b> 언급됨. 처음 나오는 곳은 ${refLink(p.refs[0])}.</div>
      <table class="facts">
        <tr><th>위치</th><td>북위 ${p.ll[0].toFixed(2)}° · 동경 ${p.ll[1].toFixed(2)}°</td></tr>
        <tr><th>유형</th><td>${esc(type)}</td></tr>
        <tr><th>언급</th><td>${p.refs.length}구절 · ${byBook.size}권</td></tr>
        ${eraText ? `<tr><th>시대별</th><td>${esc(eraText)}</td></tr>` : ""}
      </table>
      <div class="d-map" data-map='${esc(JSON.stringify({ places: [p.fid], title: p.ko || p.en }))}'>${staticMap([p.fid], { W: 400, H: 230 })}
        <div class="d-map-cap"><b>${esc(p.ko)}</b> ${esc(p.en)} <span>성경 지도에서 보기 ›</span></div></div>
      <section><h5>언급된 구절 · ${byBook.size}권</h5>
        <ul class="occ">${p.refs.slice(0, 6).map(r => `<li>${refLink(r)}${snip(r)}</li>`).join("")}</ul>
        ${[...byBook].map(([b, rs]) => `<div class="grp">${esc(lib.byId.get(b).ko)} ${rs.length}</div><div class="chips">${rs.slice(0, 40).map(r => refLink(r)).join(" ")}${rs.length > 40 ? ` <span class="muted">외 ${rs.length - 40}</span>` : ""}</div>`).join("")}
      </section>
      <p class="credit">지명·좌표 OpenBible.info Bible Geocoding Data (CC BY 4.0)${im ? " · 사진 Wikimedia Commons" : ""}</p>`];
  }

  // A person: the collectible card itself (flippable) and its details laid out for reading.
  async function personView(pid) {
    const p = lib.personById.get(pid);
    if (!p) return ["인물", ""];
    const book = lib.byId.get(p.book);
    const row = r => { const x = parseKoRef(r[0] || ""); return `<li>${x ? refLink(x.ref, r[0]) : esc(r[0])} <span class="why">${rich(r[1] || "")}</span>${x ? snip(x.ref) : ""}</li>`; };
    return [p.name, `
      <div class="d-card">${personCard(p, "")}</div>
      <div class="t-head"><h3>${esc(p.name)} <span class="en">(${esc(p.en)})</span></h3>
        <div class="t-sub"><span class="t-kind">인물 · ${esc(p.era)} · ${esc(book.ko)}</span><span class="draft">초안 · 검수 전</span></div></div>
      ${p.orig ? `<div class="t-orig"><span class="${book.t === "OT" ? "he" : "gr"}">${esc(p.orig)}</span>${p.meaning ? ` <span class="tl">${esc(p.meaning)}</span>` : ""}</div>` : ""}
      <div class="here"><span>요약</span>${rich(p.summary || "")}</div>
      ${p.facts?.length ? `<table class="facts">${p.years ? `<tr><th>연대</th><td>${esc(p.years)}</td></tr>` : ""}${p.facts.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${rich(String(v))}</td></tr>`).join("")}</table>` : ""}
      ${p.place && geo.byFid.get(p.place) ? `<div class="d-map" data-map='${esc(JSON.stringify({ places: [p.place], title: p.name }))}'>${staticMap([p.place], { W: 400, H: 200 })}<div class="d-map-cap"><b>${esc(geo.byFid.get(p.place).ko)}</b> <span>지도에서 보기 ›</span></div></div>` : ""}
      ${p.life?.length ? `<section><h5>생애</h5><ol class="life">${p.life.map(row).join("")}</ol></section>` : ""}
      ${p.nt?.length ? `<section><h5>${book.t === "OT" ? "신약에서" : "구약에서"}</h5><ul class="links">${p.nt.map(row).join("")}</ul></section>` : ""}
      <p class="credit"><a href="#" data-people="${esc(p.id)}">인물 카드 모음에서 보기 ›</a></p>`];
  }

  async function termView(key) {
    const [bid, id] = key.split("|");
    if (id.startsWith("@")) return placeView(id.slice(1));
    if (id.startsWith("#")) return personView(id.slice(1));
    await loadBook(bid);
    const st = lib.study.get(bid);
    const t = st?.termById.get(id);
    if (!t) return ["해설", `<p class="muted">항목을 찾을 수 없습니다.</p>`];
    const ot = lib.byId.get(bid).t === "OT";
    const ref0 = R(bid, ...t.scope[0].split("-")[0].split(":").map(Number));
    const place = t.place && geo.byFid.get(t.place);
    const occ = (await Promise.all((t.strong || []).map(s => occurrences(s)))).flat();
    const uniq = [...new Set(occ)];
    const inBook = uniq.filter(r => parse(r).b === bid);
    const otRefs = uniq.filter(r => parse(r).b !== bid && lib.byId.get(parse(r).b).t === "OT");
    const ntRefs = uniq.filter(r => parse(r).b !== bid && lib.byId.get(parse(r).b).t === "NT");
    const occList = (list, n) => `<ul class="occ">${list.slice(0, n).map(r => `<li>${refLink(r)}${snip(r)}</li>`).join("")}</ul>${list.length > n
      ? `<div class="chips">${list.slice(n, n + 60).map(r => refLink(r)).join(" ")}${list.length > n + 60 ? ` <span class="muted">외 ${list.length - n - 60}곳</span>` : ""}</div>` : ""}`;
    return [t.label, `
      ${img(t.img, "hero")}
      <div class="t-head"><h3>${esc(t.label)} <span class="en">(${esc(t.en)})</span></h3>
        <div class="t-sub"><span class="t-kind">${esc(t.kind)}</span><span class="draft">초안 · 검수 전</span></div></div>
      <div class="t-orig"><span class="${ot ? "he" : "gr"}">${esc(t.orig)}</span>${t.orig2 ? ` · <span class="${ot ? "gr" : "he"}">${esc(t.orig2)}</span>` : ""}
        <span class="tl">${esc(t.translit)}</span> ${(t.strong || []).map(s => `<a href="#" class="chip" data-strong="${s}">${s}</a>`).join(" ")}</div>
      ${t.here ? `<div class="here"><span>${esc(label(ref0))}에서</span>${rich(t.here)}</div>` : `<div class="here">${rich(t.quick)}</div>`}
      ${t.facts?.length ? `<table class="facts">${t.facts.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${rich(String(v))}</td></tr>`).join("")}</table>` : ""}
      ${place ? `<div class="d-map" data-map='${esc(JSON.stringify({ places: [t.place], title: place.ko || place.en }))}'>${staticMap([t.place], { W: 400, H: 230 })}
        <div class="d-map-cap"><b>${esc(place.ko)}</b> ${esc(place.en)} · ${place.ll[0].toFixed(2)}°N ${place.ll[1].toFixed(2)}°E · 성경 ${place.refs.length}회 <span>지도에서 보기 ›</span></div></div>` : ""}
      ${(t.sections || []).map(s => `<section class="claim k-${s.k}"><h5>${esc(KINDS[s.k] || s.k)}</h5><p>${rich(s.t)}</p></section>`).join("")}
      ${t.links?.length ? `<section><h5>구약 ↔ 신약 연결</h5><ul class="links">${t.links.map(l => {
        const r = parseKoRef(l.ref || "");
        return `<li><span class="lk">${esc(l.kind)}</span>${r ? refLink(r.ref, l.ref) : esc(l.ref)} <span class="why">${rich(l.why || "")}</span>${r ? snip(r.ref) : ""}</li>`;
      }).join("")}</ul></section>` : ""}
      ${uniq.length ? `<section><h5>같은 원어가 쓰인 곳 · 성경 전체 ${uniq.length}구절</h5>
        ${inBook.length ? `<div class="grp">${esc(lib.byId.get(bid).ko)} ${inBook.length}</div>${occList(inBook, 6)}` : ""}
        ${otRefs.length ? `<details><summary>구약 ${otRefs.length}구절</summary>${occList(otRefs, 6)}</details>` : ""}
        ${ntRefs.length ? `<details><summary>신약 ${ntRefs.length}구절</summary>${occList(ntRefs, 6)}</details>` : ""}</section>` : ""}`];
  }

  // ---------- verse ----------

  async function verseView(ref) {
    const { b, c, v } = parse(ref);
    await loadBook(b);
    const [ws, xr] = await Promise.all([words(b), crossrefs(b)]);
    const w = ws[`${c}:${v}`] || [];
    const niv = lib.user.niv[ref];
    const memos = ctx.ann.memosFor(ref);
    const ot = lib.byId.get(b).t === "OT";
    const xrefs = xr[`${c}:${v}`] || [];
    return [label(ref, { full: true }), `
      <div class="tr-block">
        <div class="tr"><span class="tag">개역한글</span>${esc(verseText(ref))}</div>
        <div class="tr en"><span class="tag">KJV</span>${esc(verseText(ref, "kjv"))}</div>
        <div class="tr en"><span class="tag">NIV</span>${niv ? esc(niv) : `<span class="muted">본문 없음 · <a href="#" data-view="import">넣기</a></span>`}</div>
      </div>
      <section><h5>${ot ? "히브리어" : "헬라어"} 원문 · 단어를 누르면 원어 연구</h5>
        <div class="grk ${ot ? "rtl" : ""}">${w.map((x, i) => `<button class="w${x[7] === "t" ? " only-tr" : x[7] === "n" ? " only-na" : ""}" data-word="${ref}|${i}">
          <span class="g ${ot ? "he" : "gr"}">${esc(x[0])}</span><span class="tl">${esc(x[1])}</span><span class="e">${esc(x[2])}</span>${x[7] === "t" ? `<span class="ed">TR</span>` : x[7] === "n" ? `<span class="ed">NA</span>` : ""}</button>`).join("")}</div>
      </section>
      ${xrefs.length ? `<section><h5>관주</h5><ul class="occ">${xrefs.map(x => { const r = x.split("-")[0]; return `<li>${refLink(r)}${snip(r)}</li>`; }).join("")}</ul></section>` : ""}
      <section><h5>나의 메모</h5>
        ${memos.map(m => `<div class="memo">${m.quote ? `<q>${esc(m.quote)}</q>` : ""}<textarea data-memo-edit="${ref}|${m.id}">${esc(m.text)}</textarea>
          <button class="link danger" data-memo-del="${ref}|${m.id}">삭제</button></div>`).join("")}
        <textarea id="newMemo" placeholder="이 구절에 대한 생각을 적어 보세요"></textarea>
        <div class="row"><span class="grow"></span><button class="btn" data-memo-add="${ref}">메모 저장</button></div>
      </section>`];
  }

  // ---------- original word ----------

  async function wordView(key) {
    const [ref, i] = key.split("|");
    const { b, c, v } = parse(ref);
    const ws = await words(b);
    const w = ws[`${c}:${v}`][+i];
    return [w[0], await strongBody(w[3], w, ref)];
  }
  async function strongView(sid) { const lex = await lexicon(sid[0]); return [`${sid} ${lex[sid]?.lemma || ""}`, await strongBody(sid)]; }

  async function strongBody(sid, w, ref) {
    const heb = sid?.[0] === "H";
    const lex = sid ? (await lexicon(sid[0]))[sid] || {} : {};
    const refs = sid ? await occurrences(sid) : [];
    const otRefs = refs.filter(r => lib.byId.get(parse(r).b).t === "OT"), ntRefs = refs.filter(r => lib.byId.get(parse(r).b).t === "NT");
    const morph = w ? (heb ? describeHebrew(w[4]) : describeMorph(w[4])) : "";
    const edition = !w || heb ? "" : w[7] === "t" ? "공인본문(TR, KJV의 원문)에만 있음" : w[7] === "n" ? "현대 비평본(NA28)에만 있음" : "모든 주요 사본에 있음";
    const list = l => `<div class="chips">${l.slice(0, 120).map(r => refLink(r)).join(" ")}${l.length > 120 ? ` <span class="muted">외 ${l.length - 120}곳</span>` : ""}</div>`;
    const lemma = lex.lemma || w?.[5] || "";
    return `
      ${w ? `<div class="big ${heb ? "he" : "gr"}">${esc(w[0])}</div><div class="muted">${esc(w[1])} · ${esc(w[2])}</div>` : ""}
      <table class="facts">
        ${w ? `<tr><th>문법</th><td>${esc(morph)} <span class="muted">${esc(w[4])}</span></td></tr>` : ""}
        <tr><th>사전형</th><td><span class="${heb ? "he" : "gr"}">${esc(lemma)}</span> <span class="muted">${esc(lex.xlit || lex.translit || "")} ${esc(lex.pron || "")}</span></td></tr>
        <tr><th>Strong</th><td>${esc(sid || "—")}</td></tr>
        ${w ? `<tr><th>기본 뜻</th><td>${esc(w[6] || w[2])}</td></tr>` : ""}
        ${edition ? `<tr><th>사본</th><td>${edition}</td></tr>` : ""}
      </table>
      ${lex.derivation || lex.strongs_def ? `<section><h5>Strong 사전 · 어원과 정의</h5>${lex.derivation ? `<p>${esc(lex.derivation)}</p>` : ""}${lex.strongs_def ? `<p>${esc(String(lex.strongs_def).trim())}</p>` : ""}${lex.kjv_def ? `<p class="muted">KJV 번역어: ${esc(lex.kjv_def)}</p>` : ""}</section>` : ""}
      ${refs.length ? `<section><h5>성경 전체 ${refs.length}구절</h5>${ref ? `<ul class="occ">${refs.filter(r => r !== ref).slice(0, 5).map(r => `<li>${refLink(r)}${snip(r)}</li>`).join("")}</ul>` : ""}
        ${otRefs.length ? `<details ${heb ? "open" : ""}><summary>구약 ${otRefs.length}</summary>${list(otRefs)}</details>` : ""}${ntRefs.length ? `<details ${heb ? "" : "open"}><summary>신약 ${ntRefs.length}</summary>${list(ntRefs)}</details>` : ""}</section>` : ""}
      <p class="credit">원문·문법 STEPBible TAHOT/TAGNT (CC BY 4.0) · 사전 Strong's (OpenScriptures, CC BY-SA)</p>`;
  }

  // ---------- contents, notes, settings, import, photo ----------

  async function tocView() {
    const testaments = [["OT", "구약전서"], ["NT", "신약전서"]];
    return ["목차", testaments.map(([t, name]) => `<section><h5>${name}</h5><div class="toc-books ${t}">${lib.books.filter(b => b.t === t).map(b =>
      `<details><summary><a href="#" data-book="${b.id}">${esc(b.ko)}</a> <span class="muted">${b.chapters}</span></summary>
        <div class="chap-grid">${Array.from({ length: b.chapters }, (_, i) => `<a href="#" data-go="${R(b.id, i + 1, 1)}">${i + 1}</a>`).join("")}</div></details>`).join("")}</div></section>`).join("")];
  }

  function notesView() {
    const hl = Object.entries(ctx.ann.hl).flatMap(([k, list]) => { const [ed, ref] = k.split("|"); return list.map(h => ({ ed, ref, ...h })); });
    const memos = Object.entries(ctx.ann.memos).flatMap(([ref, list]) => list.map(m => ({ ref, ...m })));
    const marks = ctx.ann.marks;
    const snippet = h => verseText(h.ref, h.ed).split(/\s+/).slice(h.a, h.b + 1).join(" ") || "…";
    return ["독서 노트", `
      <section><h5>책갈피 ${marks.length}</h5>${marks.length ? `<ul class="occ">${marks.map(m => `<li>${refLink(m.ref)}</li>`).join("")}</ul>` : `<p class="muted">위 막대의 책갈피 단추로 지금 쪽에 책갈피를 꽂습니다.</p>`}</section>
      <section><h5>형광펜 ${hl.length}</h5>${hl.length ? `<ul class="occ">${hl.map(h => `<li>${refLink(h.ref)}<div class="snip"><span class="hl-${h.c}">${esc(snippet(h))}</span></div></li>`).join("")}</ul>` : `<p class="muted">본문을 끌어 선택하면 형광펜을 칠할 수 있습니다.</p>`}</section>
      <section><h5>메모 ${memos.length}</h5>${memos.length ? `<ul class="occ">${memos.map(m => `<li>${refLink(m.ref)}${m.quote ? `<q>${esc(m.quote)}</q>` : ""}<div class="snip">${esc(m.text)}</div></li>`).join("")}</ul>` : `<p class="muted">절 번호를 누르거나 본문을 선택해 메모를 남깁니다.</p>`}</section>
      <section><h5>필기 ${ctx.ann.ink.length}획</h5><p class="muted">필기는 그 자리의 글자에 붙어 저장되어, 글자 크기를 바꿔도 따라 움직입니다.</p></section>
      <section><h5>백업</h5><div class="row"><button class="btn ghost" data-backup="export">내보내기</button><label class="btn ghost">가져오기<input type="file" accept="application/json" data-backup="import" hidden></label></div></section>`];
  }

  function settingsView() {
    const s = ctx.settings;
    const opt = (name, value, text) => `<label class="opt"><input type="radio" name="${name}" value="${value}" ${String(s[name]) === String(value) ? "checked" : ""}>${text}</label>`;
    const hasNiv = Object.keys(lib.user.niv).length;
    return ["보기 설정", `<form class="settings" data-settings>
      <section><h5>글자 크기</h5><div class="stepper"><button type="button" data-fs="-1">가</button><output>${s.fs}</output><button type="button" data-fs="1" class="lg">가</button></div></section>
      <section><h5>줄 간격</h5>${opt("lh", 1.6, "좁게")}${opt("lh", 1.75, "보통")}${opt("lh", 1.95, "넓게")}</section>
      <section><h5>본문</h5>${Object.entries(EDITIONS).map(([k, v]) => opt("main", k, v)).join("")}${hasNiv ? "" : `<p class="muted">NIV는 <a href="#" data-view="import">본문 넣기</a>에서 붙여 넣으면 쓸 수 있습니다. 없는 절은 개역한글로 보입니다.</p>`}</section>
      <section><h5>대조 본문 (각 절 아래)</h5>${opt("par", "none", "없음")}${Object.entries(EDITIONS).map(([k, v]) => opt("par", k, v)).join("")}</section>
      <section><h5>단</h5>${opt("cols", "auto", "자동")}${opt("cols", 1, "1단")}${opt("cols", 2, "2단")}</section>
      <section><h5>배경</h5>${opt("theme", "paper", "종이")}${opt("theme", "sepia", "세피아")}${opt("theme", "dark", "어둡게")}</section>
      <section><h5>책장 넘김</h5>${opt("anim", true, "넘기는 효과")}${opt("anim", false, "바로 바뀜")}</section></form>`];
  }

  function importView() {
    const n = Object.keys(lib.user.niv).length;
    return ["NIV 본문 넣기", `
      <p class="muted">개역한글과 KJV는 공개 본문이라 앱에 들어 있습니다. NIV는 저작권이 있는 번역이라 넣지 않았습니다. 가지고 계신 NIV 본문을 붙여 넣으면 이 브라우저에만 저장되고, '보기'에서 본문이나 대조 본문으로 고를 수 있습니다.</p>
      <p class="muted">현재 ${n}절 저장됨</p>
      <textarea id="importText" class="big-ta" spellcheck="false" placeholder="한 줄에 한 절씩: 책 장:절 본문&#10;&#10;Matthew 2:1 After Jesus was born in Bethlehem …&#10;Gen 1:1 In the beginning …&#10;마 2:2 …&#10;&#10;책 이름 줄('Matthew 2') 다음에 '1 …'처럼 절 번호만 써도 됩니다."></textarea>
      <p id="importMsg" class="muted" role="status"></p>
      <div class="row"><button class="btn ghost" data-import-clear>지우기</button><span class="grow"></span><button class="btn" data-import-save>저장하고 책 다시 짜기</button></div>`];
  }

  async function photoView(q) {
    const im = lib.images[q];
    if (!im) return ["사진", ""];
    return [im.title || "사진", `<figure class="d-img full"><img src="${esc(im.full || im.src)}" alt=""><figcaption>${esc(im.desc || "")}<span>${esc(im.credit)} · ${esc(im.license)} · <a href="${esc(im.page)}" target="_blank" rel="noopener">원본</a></span></figcaption></figure>`];
  }

  const VIEWS = { term: termView, verse: verseView, word: wordView, strong: strongView, toc: tocView, notes: notesView, settings: settingsView, import: importView, photo: photoView };

  // ---------- drawer events ----------

  body.addEventListener("click", async e => {
    const pc = e.target.closest(".d-card .pcard");
    if (pc && !e.target.closest("[data-go]")) { pc.classList.toggle("flipped"); return; }
    const pl = e.target.closest("[data-people]");
    if (pl) { e.preventDefault(); close(); import("./people.js").then(m => m.openPeople(ctx.goToRef, pl.dataset.people)); return; }
    const a = e.target.closest("[data-go],[data-book],[data-term],[data-strong],[data-word],[data-view],[data-memo-add],[data-memo-del],[data-import-save],[data-import-clear],[data-backup='export'],[data-fs],[data-map],[data-photo]");
    if (!a) return;
    e.preventDefault();
    const d = a.dataset;
    if (d.go) { ctx.goToRef(d.go, { flash: true }); if (ctx.isNarrow()) close(); }
    else if (d.book) { ctx.goToPart(d.book, 0); if (ctx.isNarrow()) close(); }
    else if (d.term) open("term", d.term);
    else if (d.strong) open("strong", d.strong);
    else if (d.word) open("word", d.word);
    else if (d.view) open(d.view, d.arg, { push: d.view !== drawer.dataset.view });
    else if (d.map) ctx.openMap(JSON.parse(d.map));
    else if (d.photo) open("photo", d.photo);
    else if (d.memoAdd) {
      const t = $("#newMemo").value.trim();
      if (!t) return;
      ctx.ann.addMemo(d.memoAdd, t);
      ctx.refresh();
      open("verse", d.memoAdd, { push: false });
    } else if (d.memoDel) {
      const [ref, id] = d.memoDel.split("|");
      ctx.ann.deleteMemo(ref, id);
      ctx.refresh();
      open("verse", ref, { push: false });
    } else if (d.importSave != null) {
      const parsed = parseText($("#importText").value, lib);
      const n = Object.keys(parsed).length;
      if (!n) { $("#importMsg").textContent = "절을 찾지 못했습니다. 'Matthew 2:1 본문' 형식인지 확인해 주세요."; return; }
      Object.assign(lib.user.niv, parsed);
      const ok = saveText("niv", lib.user.niv);
      ctx.rebuild();
      await open("import", "", { push: false });
      $("#importMsg").textContent = `${n}절을 넣었습니다.${ok ? "" : " 브라우저 저장소가 가득 차서 이번 창에서만 보입니다."}`;
    } else if (d.importClear != null) {
      if (!confirm("NIV 본문을 이 브라우저에서 지울까요?")) return;
      lib.user.niv = {};
      saveText("niv", {});
      ctx.rebuild();
      open("import", "", { push: false });
    } else if (d.backup === "export") {
      const blob = new Blob([ctx.ann.exportAll()], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      Object.assign(document.createElement("a"), { href: url, download: "성경-독서노트.json" }).click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } else if (d.fs) {
      ctx.settings.fs = Math.min(24, Math.max(12, ctx.settings.fs + +d.fs));
      ctx.rebuild();
      open("settings", "", { push: false });
    }
  });

  body.addEventListener("change", async e => {
    if (e.target.closest("[data-settings]") && e.target.name) {
      const conv = { lh: Number, cols: x => (x === "auto" ? "auto" : Number(x)), anim: x => x === "true" };
      const { name, value } = e.target;
      ctx.settings[name] = conv[name] ? conv[name](value) : value;
      saveSettings(ctx.settings);
      ctx.rebuild();
      return;
    }
    if (e.target.dataset.backup === "import" && e.target.files[0]) {
      try { ctx.ann.importAll(await e.target.files[0].text()); ctx.refresh(); open("notes", "", { push: false }); }
      catch { alert("백업 파일을 읽지 못했습니다."); }
      return;
    }
    const me = e.target.dataset.memoEdit;
    if (me) { const [ref, id] = me.split("|"); ctx.ann.updateMemo(ref, id, e.target.value); }
  });

  $("#drawerClose").addEventListener("click", close);
  $("#drawerBack").addEventListener("click", back);

  // ---------- hover tooltip ----------

  const tip = $("#tip");
  let tipFor = null;
  function showTip(el) {
    const bid = parse(el.closest(".vs").dataset.ref).b;
    if (el.dataset.term.startsWith("@")) return showPlaceTip(el);
    if (el.dataset.term.startsWith("#")) return showPersonTip(el);
    const t = lib.study.get(bid)?.termById.get(el.dataset.term);
    if (!t) return;
    tipFor = el.dataset.term;
    const im = t.img && lib.images[t.img.query];
    const ot = lib.byId.get(bid).t === "OT";
    tip.innerHTML = `${im ? `<img class="tip-img" src="${esc(im.src)}" alt="">` : ""}<div class="tip-b">
      <div class="tip-h"><b>${esc(t.label)} <span class="en">(${esc(t.en)})</span></b><span>${esc(t.kind)}</span></div>
      <div class="tip-o"><span class="${ot ? "he" : "gr"}">${esc(t.orig)}</span>${t.orig2 ? ` · <span class="${ot ? "gr" : "he"}">${esc(t.orig2)}</span>` : ""}</div>
      <div class="tip-tl">${esc(t.translit)}${t.strong?.length ? ` · ${esc(t.strong.join(" · "))}` : ""}</div>
      <p>${rich(t.quick)}</p><div class="tip-more">누르면 자세한 해설</div></div>`;
    tip.hidden = false;
    const r = el.getBoundingClientRect();
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    const x = Math.min(Math.max(8, r.left + r.width / 2 - tw / 2), innerWidth - tw - 8);
    let y = r.top - th - 10;
    if (y < 8) y = r.bottom + 10;
    tip.style.transform = `translate(${x}px, ${y}px)`;
  }
  function showPlaceTip(el) {
    const p = lib.placeById.get(el.dataset.term.slice(1));
    if (!p) return;
    tipFor = el.dataset.term;
    const im = lib.placeImages[p.id];
    tip.innerHTML = `${im ? `<img class="tip-img" src="${esc(im.src)}" alt="">` : `<div class="tip-map">${staticMap([p.fid], { W: 160, H: 120 })}</div>`}<div class="tip-b">
      <div class="tip-h"><b>${esc(p.ko)} <span class="en">(${esc(p.en)})</span></b><span>지명</span></div>
      <div class="tip-tl">북위 ${p.ll[0].toFixed(1)}° · 동경 ${p.ll[1].toFixed(1)}° · 성경 ${p.refs.length}회 언급</div>
      ${lib.placeIntros[p.id] ? `<p>${rich(lib.placeIntros[p.id])}</p>` : ""}
      ${im ? `<div class="tip-map small">${staticMap([p.fid], { W: 220, H: 90 })}</div>` : ""}
      <div class="tip-more">누르면 지도와 언급 구절</div></div>`;
    tip.hidden = false;
    placeTip(el);
  }
  function showPersonTip(el) {
    const p = lib.personById.get(el.dataset.term.slice(1));
    if (!p) return;
    tipFor = el.dataset.term;
    const im = p.img && lib.images[p.img.query];
    tip.innerHTML = `${im ? `<img class="tip-img" src="${esc(im.src)}" alt="">` : ""}<div class="tip-b">
      <div class="tip-h"><b>${esc(p.name)} <span class="en">(${esc(p.en)})</span></b><span>인물 · ${esc(p.era)}</span></div>
      ${p.orig ? `<div class="tip-tl">${esc(p.orig)}${p.meaning ? ` · ${esc(p.meaning)}` : ""}</div>` : ""}
      <p>${rich(p.summary || "")}</p><div class="tip-more">누르면 인물 카드와 상세 정보</div></div>`;
    tip.hidden = false;
    placeTip(el);
  }
  function placeTip(el) {
    const r = el.getBoundingClientRect();
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    const x = Math.min(Math.max(8, r.left + r.width / 2 - tw / 2), innerWidth - tw - 8);
    let y = r.top - th - 10;
    if (y < 8) y = r.bottom + 10;
    tip.style.transform = `translate(${x}px, ${y}px)`;
  }
  function hideTip() { tip.hidden = true; tipFor = null; }
  const fine = matchMedia("(hover: hover) and (pointer: fine)");
  document.addEventListener("pointerover", e => {
    if (!fine.matches || ctx.isInking()) return;
    const el = e.target.closest?.(".book .tm");
    if (el) { if (tipFor !== el.dataset.term || tip.hidden) showTip(el); }
    else if (!e.target.closest?.("#tip")) hideTip();
  });

  return {
    open, close, hideTip,
    openPhoto: q => open("photo", q),
    refreshIfOpen() { if (!drawer.hidden && drawer.dataset.view) open(drawer.dataset.view, drawer.dataset.arg, { push: false }); },
  };
}
