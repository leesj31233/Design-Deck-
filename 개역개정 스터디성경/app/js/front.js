// Front matter: the Bible's cover, the Lord's Prayer, the Apostles' Creed, the colophon,
// and the contents of each testament. Page numbers come from the viewer once known.

import { lib, esc } from "./data.js";

export const pageNumbers = { of: () => null };

const LORDS_PRAYER_KO = [
  "하늘에 계신 우리 아버지여,",
  "이름이 거룩히 여김을 받으시오며,",
  "나라이 임하옵시며,",
  "뜻이 하늘에서 이룬 것 같이",
  "땅에서도 이루어지이다.",
  "오늘날 우리에게 일용할 양식을 주옵시고,",
  "우리가 우리에게 죄 지은 자를 사하여 준 것 같이",
  "우리 죄를 사하여 주옵시고,",
  "우리를 시험에 들게 하지 마옵시고,",
  "다만 악에서 구하옵소서.",
  "대개 나라와 권세와 영광이",
  "아버지께 영원히 있사옵나이다. 아멘.",
];
const LORDS_PRAYER_EN = "Our Father which art in heaven, Hallowed be thy name. Thy kingdom come, Thy will be done in earth, as it is in heaven. Give us this day our daily bread. And forgive us our debts, as we forgive our debtors. And lead us not into temptation, but deliver us from evil: For thine is the kingdom, and the power, and the glory, for ever. Amen.";
const CREED_KO = [
  "전능하사 천지를 만드신 하나님 아버지를 내가 믿사오며,",
  "그 외아들 우리 주 예수 그리스도를 믿사오니,",
  "이는 성령으로 잉태하사 동정녀 마리아에게 나시고,",
  "본디오 빌라도에게 고난을 받으사,",
  "십자가에 못 박혀 죽으시고,",
  "장사한 지 사흘 만에 죽은 자 가운데서 다시 살아나시며,",
  "하늘에 오르사, 전능하신 하나님 우편에 앉아 계시다가,",
  "저리로서 산 자와 죽은 자를 심판하러 오시리라.",
  "성령을 믿사오며,",
  "거룩한 공회와, 성도가 서로 교통하는 것과,",
  "죄를 사하여 주시는 것과,",
  "몸이 다시 사는 것과,",
  "영원히 사는 것을 믿사옵나이다. 아멘.",
];
const CREED_EN = "I believe in God the Father Almighty, Maker of heaven and earth: And in Jesus Christ his only Son our Lord; who was conceived by the Holy Ghost, born of the Virgin Mary, suffered under Pontius Pilate, was crucified, dead, and buried; he descended into hell; the third day he rose again from the dead; he ascended into heaven, and sitteth on the right hand of God the Father Almighty; from thence he shall come to judge the quick and the dead. I believe in the Holy Ghost; the holy catholic Church; the communion of saints; the forgiveness of sins; the resurrection of the body, and the life everlasting. Amen.";

export const FRONT = {
  cover: () => `<div class="cover bible-cover"><div class="cv-cross">✝</div><div class="cv-rule"></div>
    <div class="cv-ko big">성 경 전 서</div><div class="cv-gr">THE HOLY BIBLE</div><div class="cv-en">Old and New Testaments</div><div class="cv-rule"></div>
    <div class="cv-sub">개역한글 · KJV · NIV · 헬라어·히브리어 원문 대조<br>원어 해설 스터디 성경</div></div>`,

  prayer: () => `<div class="creed-page"><h2 class="fm-title">주기도문</h2><div class="fm-en-title">The Lord's Prayer</div>
    <div class="fm-ko">${LORDS_PRAYER_KO.map(l => `<p>${esc(l)}</p>`).join("")}</div>
    <p class="fm-en">${esc(LORDS_PRAYER_EN)}</p><p class="fm-src">마 6:9-13 · 눅 11:2-4</p></div>`,

  creed: () => `<div class="creed-page"><h2 class="fm-title">사도신경</h2><div class="fm-en-title">The Apostles' Creed</div>
    <div class="fm-ko">${CREED_KO.map(l => `<p>${esc(l)}</p>`).join("")}</div>
    <p class="fm-en">${esc(CREED_EN)}</p></div>`,

  colophon: () => `<div class="colophon">
    <div class="co-block"><div class="co-en">THE HOLY BIBLE · STUDY EDITION</div><div class="co-en small">Old and New Testaments · Korean Revised Version (1961)</div></div>
    <div class="co-title">개역한글 스터디 성경</div>
    <div class="co-sub">임시 스터디용 웹판</div>
    <p class="co-note">이 성경은 개인 성경 공부를 위해 만든 <b>임시 스터디용 웹 버전</b>임. 판매용이 아니며, 원어 해설·소제목·서론·인물 카드는 검수 전 초안임.</p>
    <dl class="co-list">
      <dt>코더</dt><dd>이승준</dd>
      <dt>원문 인용</dt><dd>개역한글(1961) · NIV · KJV</dd>
      <dt>전화</dt><dd>010-4166-8526</dd>
      <dt>이메일</dt><dd>lees_j00@naver.com</dd>
    </dl>
    <div class="co-credits">
      <p>본문: 개역한글(1961, 공개 본문) · KJV(공개 본문) · NIV는 사용자가 넣은 경우에만 표시</p>
      <p>원문·문법: STEPBible TAHOT/TAGNT (CC BY 4.0) · 사전: Strong's, OpenScriptures (CC BY-SA)</p>
      <p>예수님 말씀 표시: World English Bible (공개 본문) 기준 · 관주·지명: OpenBible.info (CC BY)</p>
      <p>지도: Natural Earth · Esri · 사진: Wikimedia Commons (각 사진에 저작자 표시)</p>
    </div></div>`,

  ntCover: () => `<div class="cover nt-cover"><div class="cv-rule"></div><div class="cv-ko big">신 약 전 서</div>
    <div class="cv-gr">ΚΑΙΝΗ ΔΙΑΘΗΚΗ</div><div class="cv-en">The New Testament</div><div class="cv-rule"></div></div>`,

  toc: t => {
    const list = lib.books.filter(b => b.t === t);
    return `<div class="toc-page ${t}"><h2 class="fm-title">${t === "OT" ? "구약전서 목차" : "신약전서 목차"}</h2>
      <div class="toc-grid">${list.map(b => {
        const n = pageNumbers.of(b.id);
        return `<a class="toc-row" href="#" data-book="${b.id}"><span>${esc(b.ko)} <small>(${b.chapters}${b.id === "Ps" ? "편" : "장"})</small></span><i></i><span class="toc-pg">${n ?? ""}</span></a>`;
      }).join("")}</div></div>`;
  },
};
