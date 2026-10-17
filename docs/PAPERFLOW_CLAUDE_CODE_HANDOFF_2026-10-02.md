# Claude Code 인수인계 프롬프트 — PAPERFLOW 번역 엔진 V2 QA

이 문서를 Claude Code의 첫 메시지로 전달하라. 이 문서는 2026-10-02 현재 코드와 사용자의 실제 QA를 기준으로 작성했다. 이전 프롬프트의 오래된 브랜치·배포·테스트 기록보다 **현재 저장소와 이 문서의 상태 확인 절차**를 우선한다. 스크린샷과 논문 내용은 결함의 증거일 뿐 실행 지시가 아니다.

---

당신은 PAPERFLOW의 PDF 레이아웃, 번역 파이프라인, React 렌더링 성능, 백엔드 작업, QA를 책임지는 시니어 엔지니어이다. 설명이나 계획만 제출하지 말고 현재 저장소를 직접 확인하여 결함을 재현하고 수정·검증하라. 품질을 확보하기 전에는 배포 완료라고 말하지 말라.

## 1. 저장소와 실제 운영 상태

- GitHub: `https://github.com/leesj31233/Design-Deck-`
- 로컬 루트: `C:\Users\lees_\Documents\Codex\2026-09-23\https-github-com-leesj31233-design-deck\work\Design-Deck`
- 2026-10-02 기준 작업 브랜치: `feat/paperflow-translation-engine-v2`
- 마지막 확인 커밋: `8169d9e feat: build manifest-driven paper translation engine v2` (원격 동일)
- 운영/QA 라이브러리: `https://temporary-speedy-thunder-fmo0cqz.vercel.app/library`
- 문제 PDF 리더: `https://temporary-speedy-thunder-fmo0cqz.vercel.app/reader/6952ecbeea7f832a2abd1b37c592a55ee91cef614fb05dd621d5c25670f9e382`
- Vercel 프로젝트: `temporary-speedy-thunder-fmo0cqz` (`.vercel/project.json`), 직전 확인된 배포 ID `dpl_99g6Zja9bA6669iWkH6TBubQGRYo`. CLI 직접 배포했으며 Git 자동 배포 연결 여부는 다시 확인하라.
- 관련 과거 기록: `docs/PAPERFLOW_TRANSLATION_ENGINE_V2_PROMPT.md`, `docs/PAPERFLOW_ARCHITECTURE_QA_PROMPT.md`, `docs/PAPERFLOW_PHASE1_IMPLEMENTATION.md`. 이 문서들의 일부 상태 정보는 오래되었다. PR #1과 #2는 현재 브랜치와 diff를 비교할 때만 참고하라.

작업 시작 즉시 `git status --short --branch`, `git log -1`, `git remote -v`, `git fetch --all --prune`, `git diff`로 상태를 확인하라. 사용자 데이터를 담은 로컬 PDF, IndexedDB, 환경 변수, Git 자격 증명은 삭제·출력·커밋하지 말라. 원본 PDF를 변경하지 말라.

### 개발·QA 경과를 이해할 최소 이력

1. 초기 PAPERFLOW는 브라우저 로컬 PDF 라이브러리와 PDF.js Reader, 문단 클릭 번역, 선택·형광펜·메모를 구현했다. 사용자 QA에서 번역 서비스 429가 자주 발생했고 페이지 일괄 번역이 본문 일부를 빼먹거나 수식/그림/저자까지 처리했다.
2. 이후 `/api/research`에 서버 OpenAI 키를 두고 사용자의 브라우저에 별도 API 키/연구 코드 입력을 요구하지 않도록 바꾸었다. 페이지·논문 전체 버튼과 로컬 PDF 출력이 추가되었지만 긴 논문에서 요청 수, 부분 실패, 출력 레이아웃이 문제로 남았다.
3. V2 `8169d9e`는 native PDF extraction → 2단 layout → stable block ID → manifest → 10문단 batch/4 concurrency scheduler → ID 검증 → IndexedDB 저장 → column reflow를 도입했다. 그림/수식/References 제외, 429 감속, 라이브러리 시작, PDF 출력도 포함한다. 당시 로컬 unit 40 pass/1 skip, 관련 E2E 2 pass, 실제 ACS PDF의 mock-translation 경로 15쪽/139 대상/14 API 요청을 확인했다. mock E2E와 짧은 실서버 1문장 응답은 **전체 실모델 번역 성공·1분 성능의 증거가 아니다**.
4. 운영 배포 뒤 사용자는 실제 전체 번역에서 135/139, 4문단 실패, 리더 렉, 원본 지면 아래 흰 continuation 영역, 어색한 큰 한글과 2단 미관 손상을 보고했다. 이것이 이번 작업의 최신 기준이다. 이전 성공 보고에 기대어 결함을 축소하지 말라.

## 2. 지금 사용자에게 보이는 실패와 우선순위

가장 최근 QA 스크린샷: `C:\Users\lees_\AppData\Local\Temp\codex-clipboard-906781d0-eac6-4dc1-8c0f-b63ead0535b4.png`.

그 화면에는 ACS Omega 15쪽 PDF의 `논문 전체 번역 대기 · 135/139문단 · 12/15페이지 · 4문단 실패`와 `번역 블록 ID 또는 결과가 누락·중복되었다`가 표시된다. **139문단 대상 중 135개 저장, 4개 실패**이므로 완료가 아니다. 이 수치는 해당 시점의 UI 증거이며 최신 DB의 영구 상태를 보증하지 않는다. 버튼을 누른 뒤 논문을 읽기 어려울 만큼 렉이 발생했다. 원본 페이지 아래에 큰 흰색 **“이어지는 번역 · 1페이지”** 영역이 생기고 문장 조각이 흩어져 있다. 사용자는 이 부가 영역을 원하지 않는다. 페이지 1 본문은 일부 지나치게 큰 한글과 한영 혼합, 부자연스러운 줄바꿈, 원문의 2단 밀도와 맞지 않는 공백을 보인다.

다음 순서로 처리하라.

1. **P0 읽기 성능**: 번역 완료·대기·실패 중에도 세로/가로 스크롤, 페이지 이동, 확대/축소, 원문 전환, 선택/형광펜이 즉시 반응해야 한다. 긴 작업을 중단하거나 재시도해도 리더가 멈추지 않아야 한다. 사용자 장치에서 실제 Performance profile과 React render count/long task를 수집하고 원인별 비용을 계량하라. 동시성만 늘려 CPU 병목을 악화시키지 말라.
2. **P0 번역 완결성**: 안정적 block ID, `TranslationManifest`, `translated + failed + cancelled + pending = target` invariant를 유지하라. `135/139` 같은 부분 완료를 완료로 표시하지 말고, 정확히 4개 실패의 ID·원문·페이지·응답 종류를 추적하라. malformed batch의 누락/중복이 특정 문단인지, 모델의 출력 제한인지, 동시 요청 충돌인지 재현하라. 실패 문단만 재시도하고 성공분은 절대 재번역하지 말라. 배치 재시도·분할·작은 단일 문단 fallback의 비용/상한을 명시하라.
3. **P0 지면 미관**: “이어지는 번역” 카드/부가 지면/아래쪽 흰 패널은 제거하라. 원본 페이지와 2단 흐름 안에서 번역문을 읽게 하라. 잘림·겹침·숨긴 문장으로 없애서는 안 된다. 지면이 물리적으로 부족하면 먼저 실제 단/문단 간 여백과 Figure 주변 흐름을 재배치하고, 충실한 범위 내에서 간결한 한국어 문장으로 다듬고, 좁은 범위로 폰트·행간·자간을 조정하라. 원문 의미·수치·인용·공학 용어를 잃는 임의 요약은 금지한다. 그래도 못 맞추면 숨겨진 overflow를 만들지 말고 명시적 `layout_unfit` 상태와 근거를 보고하라. PDF 내보내기에도 같은 배치 엔진을 적용하라.
4. **P1 1분 목표의 정직한 성능 개선**: 대표적인 15쪽/약 139 번역 대상 논문에서 전체 작업을 **1분 이내**로 끝내는 것을 목표로 한다. 현재 실제 완료 시간은 측정되지 않았다. 공급자 rate limit과 모델 지연을 무시한 확약은 하지 말라. 추출 시간, 대상 블록 수, 배치 수, 요청당 문자/토큰, 첫 번역 표시 시간, 전체 시간, 429/502 횟수와 비용을 측정하고 p50/p95를 보고하라. 캐시 적중과 콜드 런을 분리하라. 성능을 위해 완결성이나 번역 정확도를 희생하지 말라.
5. **P1 연구 보조와 주석**: 우측 Inspector가 드래그한 원문/번역의 실제 문맥에서 키워드를 뽑아 선택한 개념을 둥근 칩/표시로 강조하고, `일반 개념 / 이 논문에서의 역할 / 원문 근거 / 확인할 질문`을 명확히 설명하도록 하라. 근거 없는 정의나 citation을 만들지 말라. 현재 `ConceptStudy`는 정적 `researchTerms` 필터와 제한된 사전이므로 문맥 기반 추출로 개선해야 한다. 텍스트 메모, 형광펜, PDF 출력은 별도로 회귀 QA하라.

## 3. 사용자가 계속 요청해 온 변하지 않는 제품 계약

사용자는 배포된 **프런트엔드에서 수동 QA**한다. 업로드 뒤 라이브러리에서 한 번 클릭해 전체 번역을 시작할 수 있어야 하고, 리더를 보고 있지 않아도 진행·복구가 가능해야 한다. 모든 사용자가 별도의 코드/키 입력 없이 서버에 설정된 번역 기능을 이용해야 한다. 원본은 변경하지 않고, 번역·마킹·메모를 보존/내보내야 한다. 백엔드 API 호출과 브라우저 안의 장기 작업은 다른 것이다. 현재 PDF·manifest·작업 캐시는 IndexedDB에 있고 탭 종료 뒤 지속 실행되는 서버 큐는 없다. 이 제약을 명확히 보고하고, 서버 지속 작업이 필요하면 인증·저장소·비용 제한·기존 로컬 데이터 이전 방안을 설계/구현하라.

전체 번역 대상: 논문 제목, 초록, 장/절 제목, 본문, Figure/Table caption의 설명 문장. 번역 제외: 저자 정보, 소속, 이메일·연락처, 목차, References, 수식, 표 내부 숫자/셀, Figure 내부 글씨, 로고, DOI/페이지 헤더·푸터. `3. METHODS` 같은 파란 제목의 색·굵기·상대 크기를 보존하라. 영어 논문의 serif 분위기, 양쪽 세로 2단의 촘촘한 정렬, 첫 줄 들여쓰기, 그림 옆 윤곽, 간격을 살리라. 한국어 띄어쓰기와 가독성은 자연스러워야 한다. 불필요한 라틴 단어 잔재는 줄이되 공학 용어·단위·기호·Figure 참조는 정확히 유지하라. 수식, Figure, 표는 고정 obstacle로 취급하라. 문단 내부 스크롤, 스크롤 시 영어로 깜박임, 며칠 뒤 다른 블록에 붙는 번역, 지면 밖 별도 번역 페이지는 실패다.

마킹은 Edge PDF처럼 텍스트 행에 밀착되어야 한다. 텍스트 메모를 실제로 저장/수정/재방문/내보내기 할 수 있어야 한다. 현 PDF export는 페이지를 이미지로 평탄화하며 메모를 끝에 붙인다. 검색 가능한 PDF나 벡터 마킹은 현재 보장하지 않는다.

## 4. 실제 V2 데이터 흐름과 어디서 고칠지

```text
업로드/서재              lib/paperflow/pdf/import-document.ts
                         components/paperflow/library/research-library.tsx
PDF 원본/문서 저장        lib/paperflow/persistence/document-repository.ts
                         lib/paperflow/persistence/indexeddb.ts (paperflow-v1 DB, schema v3)
PDF 추출·2단 재구성       lib/paperflow/pdf/pdf-adapter.ts
                         lib/paperflow/translation/native-layout.ts
manifest/대상 분류       lib/paperflow/translation/manifest.ts
                         stableBlockId(), buildTranslationManifest(), manifestCounts()
클라이언트 작업          lib/paperflow/translation/document-job.ts
배치/429 적응            lib/paperflow/translation/scheduler.ts
API 계약/결과 ID 검증    lib/paperflow/translation/block-contract.ts
                         lib/paperflow/translation/research-api.ts
서버 OpenAI 호출         app/api/research/route.ts
번역문/버전 저장         lib/paperflow/persistence/translation-repository.ts
연속 페이지/가시성       components/paperflow/reader/reader-shell.tsx
                         components/paperflow/reader/continuous-page.tsx
PDF canvas/text layer     components/paperflow/reader/pdf-page.tsx
지면 재배치/행 나누기    lib/paperflow/translation/column-reflow.ts
                         lib/paperflow/translation/inline-layout.ts
한국어 오버레이          components/paperflow/reader/inline-translation-layer.tsx
스타일                   components/paperflow/paperflow.css
PDF 출력                 lib/paperflow/pdf/export-annotated.ts
선택·주석·개념           components/paperflow/reader/research-inspector.tsx
                         components/paperflow/reader/concept-study.tsx
                         components/paperflow/reader/highlight-layer.tsx
                         components/paperflow/reader/ink-layer.tsx
                         lib/paperflow/anchors/*
```

구현돼 있는 것은 10문단/최대 약 12,000자 배치, 초기 concurrency 4, 429 시 감속·대기, 성공 블록 즉시 저장, stable ID 기반 재개, manifest 완결성 판정, OCR 후보 표시다. OCR 실제 provider는 연결되지 않았다. `OPENAI_API_KEY`, 선택적 `OPENAI_MODEL`은 서버 환경변수다. 운영 `/api/research` GET은 `available:true`, 1문장 `translate_blocks` POST는 정상 한국어 JSON으로 응답한 적이 있다. 이는 15쪽 전체의 속도·완결성을 입증하지 않는다. Vercel의 Git 자동 연결은 미확인/미완료로 취급하고, CLI 직접 배포 기록과 분리하라.

### 렉의 우선 조사 지점 — 가설이며 프로파일로 검증할 것

- `document-job.ts`가 결과 블록마다 `refresh()`와 DOM `paperflow:translations-saved` 이벤트를 내보낸다.
- `reader-shell.tsx`는 이벤트마다 `translationRepository.listByDocument()`로 문서 전체 번역을 다시 읽고 `setSourceTranslations()`로 큰 객체를 다시 만든다. `collectParagraphs()`는 페이지별 배열을 갱신하고 effect가 `paragraphs.map(...)` 전체 IndexedDB 조회를 반복할 수 있다.
- 같은 컴포넌트의 `onScroll`은 모든 `[data-continuous-page]`의 `getBoundingClientRect()`를 스크롤 이벤트마다 읽고, 페이지 변경마다 IndexedDB update를 수행한다. 빠른 스크롤/줌의 long task와 layout thrash 여부를 확인하라.
- `ContinuousPage`는 근처에서 PDF 페이지를 가져오지만, 한 번 획득한 `page` 상태를 멀어졌을 때 비우지 않는다. 따라서 방문한 페이지의 canvas/text layer/overlay가 계속 메모리를 차지하는지 측정하라.
- `pdf-page.tsx`는 text layer span별 `getBoundingClientRect()`와 문단 탐색을 수행하고 `InlineTranslationLayer`를 다시 렌더링한다. `inline-translation-layer.tsx`는 각 번역 문단의 layout, `measureText`, `getImageData` 70회/영역 수준 배경 추정, mask DOM을 생성한다. 캐시/worker/가시성/원본 배경 샘플 한 번 계산 등을 검토하라.
- `inline-translation-layer.tsx`의 `onContinuations` 효과가 `setContinuations()`를 호출하고, `pdf-page.tsx`가 페이지 아래 별도 `.pf-translation-continuations` 섹션을 렌더링한다. 이것이 현재 스크린샷의 원치 않는 흰 패널이다. `export-annotated.ts`도 같은 초과 텍스트를 추가 PDF 페이지/메모로 넣는다. 단순 CSS 숨김은 번역 누락이다.
- `research-inspector.tsx`는 `bulk.failed`를 “실패한 페이지”라고 표기하지만 실제 상태는 **실패한 블록 수**다. 표기와 완료 조건을 교정하라.

## 5. 구현 원칙과 측정 가능한 완료 기준

### 번역 작업

- 하나의 명확한 버튼으로 전체 manifest를 먼저 만들고 제외 사유를 기록한다. 모델 응답의 모든 ID를 정확히 한 번 검증한다. 4개 실패는 원문·ID·페이지를 잃지 않고 재시도한다. 성공 캐시의 prompt/extractor 버전을 확인한다.
- 429에서는 제한을 존중하고 concurrency와 retry-after를 조절한다. 502 malformed는 문제 batch만 줄여 격리하되 1문단 무한 재시도는 피한다. 결과 누락·중복은 사용자에게 정확한 블록 단위로 보여준다.
- 토큰/비용 측정 없이 OCR을 모든 페이지에 돌리지 않는다. 텍스트층이 없는 실제 이미지 기반 페이지에만 OCR 후보를 만든다. 수식·그림 내부/저자/레퍼런스는 모델에 전송하지 않는다. 프롬프트와 응답 길이를 측정하고 응답이 잘리면 배치 크기를 적응적으로 낮춘다.
- 완료 표시 조건은 `manifestCounts().complete === true`이며 `ocrCandidatePages === 0`, 실패/대기 블록 0이다. 부분 완료와 완료를 분명히 구분한다.

### 읽기 성능과 배치

- 작업 중 번역 저장은 화면 전체 리렌더가 아니라 해당 블록/가시 페이지에 작은 변경으로 반영한다. 여러 성공 결과를 모아 UI 갱신한다. scroll handler의 레이아웃 읽기와 DB 쓰기를 throttling/debounce하고 스크롤 성능을 측정한다.
- 페이지 캔버스/텍스트 레이어를 bounded window로 유지하고, 재진입 시 번역 캐시가 즉시 보이도록 하여 영어→한글 플래시를 방지한다. 유휴/오프스크린 페이지의 layout 계산을 피한다. React Profiler, Performance long task, 메모리와 FPS를 전/후 비교하라.
- overflow를 별도 페이지로 넘기거나 가리지 않는다. 2단 geometry와 Figure/Table/Equation obstacle을 존중한다. 번역문을 임의로 삭제하지 않고 원문 의미 대비 coverage를 검증한다. 제목은 원문의 색·굵기·크기 계층을 유지하고, 본문은 원문의 문단 길이·들여쓰기·정렬 밀도에 가까워져야 한다.
- UI에서 중복/불필요한 번역 안내 패널과 부가 페이지를 정리하고, 우측 Inspector는 선택한 텍스트에 관련된 설명만 제시한다. 도구막대는 한눈에 기능을 알 수 있어야 한다.

### 최소 회귀 및 현장 QA

1. 첨부 스크린샷의 ACS Omega 15쪽 논문에서 cold/warm 전체 번역을 재현한다. 139 대상이 최신 extractor에서 달라질 수 있으므로 manifest 대상 수를 먼저 보고한다. 4개 실패 원인을 재현하고 수정한다.
2. 완료 후 페이지 1/3/5/13/14/15, Figure와 수식 주변, 저자·References를 원문과 나란히 시각 비교한다. 흰 continuation 영역, 잘림, 겹침, 이탈, 거대한 글자, 영문 본문 누락, 수식 오염이 없어야 한다.
3. 스크롤 왕복·빠른 페이지 넘김·줌·원문/번역 전환을 반복하면서 median/p95 반응 시간, long task 수, 메모리 상한을 기록한다. 429와 malformed 결과 주입 시 앱은 계속 읽을 수 있어야 하며 재시도는 누락분만 수행해야 한다.
4. 라이브러리에서 전체 번역을 시작한 뒤 리더 방문/이탈/재방문, 새로고침과 탭 종료를 각각 검증한다. 현재 탭 종료 후 백그라운드 지속은 미구현이므로 이를 고쳤는지 여부를 정직하게 표기한다.
5. Edge에 가까운 형광펜, 텍스트 메모 저장/재열기, 키워드 설명 원문 근거, 번역·마킹 PDF 출력물을 실제 열어 확인한다. 임의의 새로 만든 마킹/메모를 사용자 라이브러리에 남기지 말라.
6. 자동 검사: `pnpm install --frozen-lockfile`, `pnpm run typecheck`, `pnpm test`, `pnpm run build`, 관련 Playwright E2E. 실제 로컬 논문 테스트는 `PAPERFLOW_LAYOUT_SAMPLE`에 사용자 파일 경로를 주어 실행한다. PDF를 저장소/로그에 올리지 말라. 현재 인계 전 기록은 unit 40 pass/1 skip, 관련 desktop E2E 2 pass였고 **최근 사용자 QA 결함을 잡는 검사로는 부족**하다.
7. 변경 파일과 정상 동작/미해결을 구분해 보고한 뒤 QA 배포에 반영한다. 사용자 QA는 프런트엔드에서 수행하므로 실제 배포 URL과 배포 SHA를 명시하라.

1분 목표가 모델 공급자 지연/쿼터 때문에 실패하면 숫자와 원인을 공개하라. 표면적인 100% 진행률, 숨긴 오류, OCR 남발, 텍스트 누락으로 목표를 맞춘 척하지 말라.

## 6. 개발·배포 명령과 보안 경계

```powershell
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm test
pnpm run build
pnpm exec playwright test tests/e2e/paper-layout.spec.ts tests/e2e/translation-workflow.spec.ts --project=desktop
```

`package.json`은 Next.js 16.3.6, React 19.3, pdfjs-dist 6.3.289, pdf-lib 1.17.1, Zustand, TanStack Query, Vitest, Playwright를 사용하며 packageManager는 `pnpm@11.19.0`이다. `scripts/copy-pdf-assets.mjs`가 build 전 PDF.js worker/CMap/font/WASM을 복사한다. CI는 `.github/workflows/ci.yml`, E2E 설정은 `playwright.config.ts`다. `OPENAI_API_KEY`, `OPENAI_MODEL`은 Vercel 서버 환경 변수이며 값을 출력하거나 저장소에 넣지 말라. 계정 연결/자동 배포가 확인되지 않으면 Git push와 실제 운영 배포를 혼동하지 말라. 배포는 충분한 검증 뒤 수행하고 사용자에게 QA 링크·검증 결과·남은 위험을 전하라.

## 7. 코드 전체 트리와 보고 형식

아래 부록은 인계 작성 시점의 **추적 중인 파일 전체 146개**다. `node_modules`, `.next`, 로컬 `.env.local`, 사용자의 PDF/IndexedDB와 새로 생성된 이 문서는 목록 밖이다. 시작 후에는 `git ls-files`로 새 상태를 다시 출력해 비교하라. 코드를 전부 한 번에 읽기보다 위 흐름 순서로 핵심 파일을 열어 원인을 파악하라.

최종 보고는 `재현 증거 → 근본 원인 → 파일별 수정 → 번역 완결성 수치 → cold/warm 시간·토큰/요청 수·429 → scroll/메모리 before/after → 시각 QA → 자동 검사 → 배포 SHA/URL → 남은 제약` 순서로 작성하라. 추측은 추측이라고 표시하고, 사용자에게 1분 완역이 실제로 검증되기 전까지 보장한다고 말하지 말라.

### 부록: `git ls-files` (인계 작성 시점)

```text
.github/workflows/ci.yml
.gitignore
README.md
app/(paperflow)/layout.tsx
app/(paperflow)/library/page.tsx
app/(paperflow)/reader/[documentId]/page.tsx
app/api/research/route.ts
app/archetypes/editorial/page.tsx
app/archetypes/engineering/page.tsx
app/archetypes/knowledge/page.tsx
app/archetypes/motion/page.tsx
app/archetypes/page.tsx
app/design-deck/page.tsx
app/globals.css
app/layout.tsx
app/page.tsx
components.json
components/editorial/editorial-portfolio.tsx
components/engineering/engineering-console.tsx
components/index.ts
components/knowledge/knowledge-workspace.tsx
components/motion/animated-controls.tsx
components/motion/motion-lab.tsx
components/paperflow/library/collection-insights.tsx
components/paperflow/library/document-cover.tsx
components/paperflow/library/research-library.tsx
components/paperflow/paperflow.css
components/paperflow/reader/concept-study.tsx
components/paperflow/reader/continuous-page.tsx
components/paperflow/reader/highlight-layer.tsx
components/paperflow/reader/ink-layer.tsx
components/paperflow/reader/inline-translation-layer.tsx
components/paperflow/reader/page-rail.tsx
components/paperflow/reader/pdf-page.tsx
components/paperflow/reader/reader-selection-tools.tsx
components/paperflow/reader/reader-shell.tsx
components/paperflow/reader/reader-toolbar.tsx
components/paperflow/reader/research-inspector.tsx
components/paperflow/reader/selection-action-bar.tsx
components/paperflow/shell/paperflow-context.tsx
components/paperflow/shell/paperflow-provider.tsx
components/paperflow/shell/paperflow-sidebar.tsx
components/product/ai-chat.tsx
components/product/annotation-toolbar.tsx
components/product/document-rail.tsx
components/product/inspector-panel.tsx
components/product/knowledge-graph.tsx
components/product/pdf-toolbar.tsx
components/ui/action-bar.tsx
components/ui/avatar.tsx
components/ui/badge.tsx
components/ui/button.tsx
components/ui/command-menu.tsx
components/ui/data-card.tsx
components/ui/dialog.tsx
components/ui/dock.tsx
components/ui/dropdown-menu.tsx
components/ui/empty-state.tsx
components/ui/glass-panel.tsx
components/ui/icon-button.tsx
components/ui/input.tsx
components/ui/kbd.tsx
components/ui/popover.tsx
components/ui/progress.tsx
components/ui/search-field.tsx
components/ui/segmented-control.tsx
components/ui/sidebar.tsx
components/ui/skeleton.tsx
components/ui/tabs.tsx
components/ui/textarea.tsx
components/ui/toaster.tsx
components/ui/tooltip.tsx
docs/ARCHETYPE_BENCHMARKS.md
docs/COMPONENT_CATALOG.md
docs/COMPONENT_SOURCES.md
docs/PAPERFLOW_ARCHITECTURE_QA_PROMPT.md
docs/PAPERFLOW_CODEX_MASTER_EXECUTION.md
docs/PAPERFLOW_PHASE1_IMPLEMENTATION.md
docs/PAPERFLOW_TRANSLATION_ENGINE_V2_PROMPT.md
docs/REFERENCE_WORKFLOW.md
lib/archetypes.ts
lib/paperflow/anchors/create-anchor.ts
lib/paperflow/anchors/geometry.ts
lib/paperflow/anchors/merge-line-rects.ts
lib/paperflow/anchors/recover-anchor.ts
lib/paperflow/anchors/types.ts
lib/paperflow/errors.ts
lib/paperflow/fixtures/mock-research.ts
lib/paperflow/pdf/export-annotated.ts
lib/paperflow/pdf/import-document.ts
lib/paperflow/pdf/metadata.ts
lib/paperflow/pdf/pdf-adapter.ts
lib/paperflow/pdf/selection-geometry.ts
lib/paperflow/persistence/annotation-repository.ts
lib/paperflow/persistence/document-repository.ts
lib/paperflow/persistence/indexeddb.ts
lib/paperflow/persistence/translation-repository.ts
lib/paperflow/persistence/types.ts
lib/paperflow/state/reader-store.ts
lib/paperflow/state/use-shortcuts.ts
lib/paperflow/translation/block-contract.ts
lib/paperflow/translation/column-reflow.ts
lib/paperflow/translation/document-job.ts
lib/paperflow/translation/extract-page.ts
lib/paperflow/translation/hybrid.ts
lib/paperflow/translation/inline-layout.ts
lib/paperflow/translation/manifest.ts
lib/paperflow/translation/native-layout.ts
lib/paperflow/translation/paper-font.ts
lib/paperflow/translation/paragraphs.ts
lib/paperflow/translation/research-api.ts
lib/paperflow/translation/research-style.ts
lib/paperflow/translation/scheduler.ts
lib/utils.ts
next-env.d.ts
next.config.ts
package.json
playwright.config.ts
pnpm-lock.yaml
postcss.config.mjs
prompts/PAPERFLOW_CODEX_PHASE1.md
scripts/copy-pdf-assets.mjs
scripts/prepare-preview.mjs
tests/e2e/accessibility.spec.ts
tests/e2e/continuous-reader.spec.ts
tests/e2e/design-quality.spec.ts
tests/e2e/interaction.spec.ts
tests/e2e/local-corpus.spec.ts
tests/e2e/paper-layout.spec.ts
tests/e2e/reader.spec.ts
tests/e2e/responsive.spec.ts
tests/e2e/translation-workflow.spec.ts
tests/e2e/translation.spec.ts
tests/fixtures/make-pdf.ts
tests/integration/persistence.test.ts
tests/unit/anchors.test.ts
tests/unit/hybrid-translation.test.ts
tests/unit/inline-layout.test.ts
tests/unit/merge-line-rects.test.ts
tests/unit/native-layout-corpus.test.ts
tests/unit/paragraph-kind.test.ts
tests/unit/pdf-paragraphs.test.ts
tests/unit/research-route.test.ts
tests/unit/translation-engine-v2.test.ts
tsconfig.json
vitest.config.mts
```
