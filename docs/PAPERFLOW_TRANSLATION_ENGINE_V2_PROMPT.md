# PAPERFLOW Translation Engine V2
# Senior Architecture / Implementation / Performance / QA Master Prompt

핵심 설계 계약: `PDF → Layout → Manifest → Scheduler → Translation → Reflow`는 서로 독립적으로 검증 가능한 엔진이다. `TranslationManifest`, zoom과 렌더링에 흔들리지 않는 stable block ID, completeness invariant는 제거하거나 우회하지 말라. 속도 개선은 무작정 worker를 늘리는 일이 아니라 요청 크기·동시성·429 backoff의 계측 기반 최적화다. 지면 개선은 글씨 축소와 내부 스크롤로 문단을 숨기는 방식이 아니라 장애물을 고려한 column reflow다.

당신은 PAPERFLOW 연구 PDF 번역 애플리케이션의 Principal Software Architect,
Senior Full-Stack Engineer, PDF Layout Engineer, Performance Engineer,
AI Translation Pipeline Engineer, QA Lead이다.

이번 작업은 단순 리팩터링이나 UI 수정이 아니다.

핵심 목표는 PAPERFLOW의 가장 중요한 기능인

"연구 논문 PDF 전체를 한 번의 조작으로,
빠르고, 누락 없이, 원래 지면 구조를 최대한 유지하며,
정확한 한국어로 전체 번역"

기능을 실제 제품 수준으로 끌어올리는 것이다.

분석만 하지 말고 실제 저장소를 읽고 코드를 수정하라.
구현 → 테스트 → 벤치마크 → 회귀 QA → Git 상태 확인까지 수행하라.

============================================================
0. 작업 대상
============================================================

Repository:
https://github.com/leesj31233/Design-Deck-

Local workspace:
C:\Users\lees_\Documents\Codex\2026-09-23\https-github-com-leesj31233-design-deck\work\Design-Deck

기존 주요 branch:
feat/paperflow-phase1

기존 PR:
https://github.com/leesj31233/Design-Deck-/pull/1

추가 검토 대상 PR:
https://github.com/leesj31233/Design-Deck-/pull/2
branch:
fix/paperflow-translation-v2

QA deployment:
https://temporary-speedy-thunder-fmo0cqz.vercel.app/library

2026-10-01 확인된 로컬 커밋:
e8f8a25 (아키텍처·QA 인계 문서)
dd01bf1 (일괄 번역 작업·PDF 내보내기)

중요:
이 커밋들이 원격에 반영됐는지는 확인되지 않았다. 이전 `git push`는 PC Git 자격 증명이 `leesj0012`로 잡혀 HTTP 403으로 거절됐다. PR #2와 해당 브랜치의 실제 존재·HEAD도 작업 시작 시 확인해야 한다.
따라서 작업 시작 즉시 아래를 확인하라.

- git status
- git branch --show-current
- git log --oneline --decorate -20
- git remote -v
- git fetch --all --prune
- feat/paperflow-phase1 remote HEAD
- PR #1 HEAD
- PR #2 HEAD
- dd01bf1 존재 여부
- e8f8a25 존재 여부
- local working tree 변경 여부

절대 최신 로컬 구현을 잃지 말 것.

PR #2의 구현은 참고/재사용할 수 있지만
무조건 merge/cherry-pick하지 말고
현재 로컬 코드와 diff를 비교하여 필요한 부분만 통합하라.

현재 코드가 본 문서와 다를 경우 실제 코드를 truth source로 사용하고
차이를 작업 보고서에 명확히 기록하라.


============================================================
1. 제품의 절대 목표
============================================================

PAPERFLOW의 전체 논문 번역 기능은 다음 경험을 제공해야 한다.

사용자가 PDF를 업로드한 후

[논문 전체 일괄 번역]

버튼을 한 번 누르면,

1.
논문의 모든 페이지를 분석한다.

2.
페이지 안의 실제 PDF text object와 layout geometry를 추출한다.

3.
본문, 제목, section heading, figure caption 등을 정확히 구분한다.

4.
저자, affiliation, reference, 수식, figure 내부 text 등
번역해서는 안 되는 객체는 제외한다.

5.
페이지와 column의 실제 reading order를 복원한다.

6.
전체 번역 대상 manifest를 먼저 확정한다.

7.
여러 문단을 효율적으로 batching한다.

8.
제한된 concurrency로 병렬 번역한다.

9.
누락/중복/reordering을 검증한다.

10.
성공 결과를 즉시 persistent cache에 저장한다.

11.
번역된 한국어를 원본 PDF 위치에 자연스럽게 표시한다.

12.
한국어 길이가 늘어도 글자를 극단적으로 축소하거나
잘라내거나 문단 내부 scroll을 만들지 않는다.

13.
가능한 경우 동일 column 내부에서 아래 문단을 reflow한다.

14.
Figure/Table/Equation은 고정 obstacle로 취급한다.

15.
모든 번역 대상이 완료되었는지를 시스템이 스스로 검증한다.

즉,

"버튼을 눌렀더니 대부분 번역됨"

수준이 아니라

"어떤 문단이 대상이었고,
어떤 문단이 제외되었고,
몇 개가 완료되었고,
무엇이 실패했는지"

시스템이 정량적으로 알 수 있어야 한다.


============================================================
2. 현재 확인된 구조적 병목
============================================================

현재 문제를 단순히 OpenAI model quality 문제로 판단하지 말라.

현재 병목은 다음 pipeline 전체에 존재한다.

PDF
→ text extraction
→ line reconstruction
→ column reconstruction
→ paragraph segmentation
→ semantic role classification
→ translation batching
→ API execution
→ result mapping
→ persistence
→ Korean layout
→ rendering


------------------------------------------------------------
2.1 DOM/Text-layer 의존
------------------------------------------------------------

기존 구현 일부는 PDF.js text layer의 span과
getBoundingClientRect() 결과를 사용하여 문단을 구성한다.

이 방식은 Reader DOM이 생성된 뒤에야 충분한 정보를 얻는 구조가 되기 쉽고,
서재에서 Reader를 열지 않고 전체 번역하는 구조와 충돌한다.

전체 번역용 extraction은
Reader 화면 렌더링과 완전히 분리되어야 한다.


------------------------------------------------------------
2.2 PDF 내부 object order ≠ human reading order
------------------------------------------------------------

특히 ACS / MDPI / Elsevier 등의 2-column 논문에서

PDF text object 순서는

left column 전체
→ right column 전체

라고 보장되지 않는다.

다음과 같은 source order도 가능하다.

L1
R1
L2
R2
L3
R3

따라서 단순 DOM sequence/text item sequence를 그대로 쓰면

- 오른쪽 문장이 왼쪽 문단에 결합됨
- heading이 body와 합쳐짐
- caption이 body에 삽입됨
- page reading order가 깨짐
- paragraph cache key가 불안정해짐
- 번역 결과가 잘못된 위치에 매핑됨

문제가 발생한다.


------------------------------------------------------------
2.3 작은 batch + 낮은 concurrency
------------------------------------------------------------

현재 또는 최근 구현은 대략

3~4 paragraph / request
약 4,500~6,500 characters
2 worker

수준의 구조를 사용한다.

17-page paper × 10~15 translatable paragraphs/page라면
수십 회의 API round trip이 필요하다.

API model inference 자체보다
요청 횟수와 network round trip이 전체 latency의 큰 비율을 차지할 수 있다.


------------------------------------------------------------
2.4 결과 mapping이 배열 순서에 지나치게 의존
------------------------------------------------------------

LLM에게

[
 "translation1",
 "translation2",
 ...
]

형식만 요구하고 input array order와 output array order를 암묵적으로 연결하면

- 문단 merge
- omission
- duplication
- reorder

상황에서 잘못된 문단 위치에 정상적인 한국어가 들어갈 수 있다.

각 passage에는 explicit stable ID가 필요하다.


------------------------------------------------------------
2.5 번역 completeness를 사전에 정의하지 못함
------------------------------------------------------------

전체 번역 작업은 시작 전에

몇 개 block이 번역 대상인지

확정해야 한다.

현재 화면상의 "page complete"와
실제 "all translatable paragraphs complete"가 동일하지 않을 수 있다.

이를 반드시 수정하라.


------------------------------------------------------------
2.6 429 / timeout / malformed output 복구가 약함
------------------------------------------------------------

사용자가 재차 버튼을 눌러야 하는 구조를 최소화하라.

rate-limit, timeout, server failure, malformed response를
서로 다른 failure class로 처리해야 한다.


------------------------------------------------------------
2.7 fixed rectangle 기반 Korean fitting
------------------------------------------------------------

영어 문단과 한국어 번역은 동일 길이가 아니다.

원래 paragraph rectangle에
한국어를 무조건 강제로 넣으면 결국

- font size 과도 축소
- clipping
- overflow hidden
- paragraph internal scrolling

중 하나가 발생한다.

이는 제품 요구에 맞지 않는다.

layout engine을 paragraph-fit 방식에서
column-flow/reflow 방향으로 발전시켜라.


============================================================
3. 목표 아키텍처
============================================================

Translation Engine을 다음 8계층으로 분리하라.


PDF Blob
   │
   ▼
[1] NativeExtractionEngine
   │
   ▼
[2] LayoutAnalyzer
   │
   ▼
[3] SemanticBlockClassifier
   │
   ▼
[4] TranslationManifest
   │
   ▼
[5] TranslationScheduler
   │
   ▼
[6] TranslationExecutor
   │
   ▼
[7] TranslationRepository
   │
   ▼
[8] KoreanLayoutEngine


OCR은 별도 fallback branch이다.


                    ┌── OCRFallback
NativeExtraction ───┤
                    └── confidence sufficient
                              │
                              ▼
                         LayoutAnalyzer


============================================================
4. NativeExtractionEngine
============================================================

전체 번역용 extraction은 DOM text layer가 아니라
PDF.js page.getTextContent() 기반으로 구현하라.

가능하면 다음 정보까지 추출한다.

interface RawTextItem {
  text: string;
  pageIndex: number;

  x: number;
  y: number;
  width: number;
  height: number;

  fontName?: string;
  fontSize?: number;

  transform?: number[];

  hasEOL?: boolean;
}

normalized coordinate도 함께 유지한다.

모든 좌표는 PDF page coordinate와
normalized page coordinate를 모두 계산 가능해야 한다.

Reader zoom과 독립적이어야 한다.

즉 같은 PDF라면
zoom 80%, 100%, 150%에서
동일 paragraph identity가 생성되어야 한다.


============================================================
5. OCR 전략
============================================================

전 페이지 OCR을 절대 기본값으로 사용하지 말 것.

Digital PDF에서는 native PDF text extraction이
OCR보다 빠르고 정확한 경우가 대부분이다.

OCR은 "confidence based selective fallback"으로 구현하라.


Native extraction confidence 예시:

- printable character count
- extracted block count
- visible raster/text ratio
- invalid unicode ratio
- suspicious replacement character ratio
- bounding-box density
- page rendered appearance 대비 text amount


초기 heuristic 예시:

printableChars < 80
AND
largeRasterCoverage > threshold

또는

replacementCharacterRatio > 0.05

또는

native text bounding boxes가 거의 존재하지 않음


이면 OCR candidate로 판단한다.

값은 실제 test corpus를 보고 조정하라.


OCR interface는 provider-independent하게 만든다.

interface OcrProvider {
  extractPage(...): Promise<OcrPageResult>
}

현재 배포 환경에서 무리하게 heavy OCR dependency를 도입하지 말고,
Vercel / browser bundle size / worker compatibility를 고려하라.

Digital PDF에는 OCR을 돌리지 않는 것이 정상 동작이어야 한다.


============================================================
6. LayoutAnalyzer
============================================================

단순 text sequence가 아니라 geometry를 기반으로 다음 순서로 처리하라.

Raw glyph/text items
↓
line reconstruction
↓
column detection
↓
reading-order calculation
↓
paragraph reconstruction
↓
semantic block classification


------------------------------------------------------------
6.1 line reconstruction
------------------------------------------------------------

다음 기준을 조합한다.

- baseline/y proximity
- vertical overlap
- font size similarity
- horizontal gap
- superscript/subscript detection

chemical formula, citation, superscript 때문에
모든 height 차이를 line break로 처리하지 말라.


------------------------------------------------------------
6.2 de-hyphenation
------------------------------------------------------------

다음 형태는 자연스럽게 복원해야 한다.

combus-
tion

→

combustion

그러나

well-
known

등 실제 hyphenated expression은
과도하게 합치지 않도록 heuristic을 사용하라.


------------------------------------------------------------
6.3 column detection
------------------------------------------------------------

single column / 2 column / mixed layout을 처리한다.

page width와 line x distribution을 분석하라.

일반적인 2-column paper에서는

left column block
→ right column block

reading order를 만든다.

단,

- title
- abstract
- full-width section header
- figure
- table

등은 column span이 다를 수 있으므로
단순 x midpoint 하나로 모든 block을 나누지 말라.


------------------------------------------------------------
6.4 deterministic reading order
------------------------------------------------------------

최종 paragraph에는 반드시 다음이 있어야 한다.

pageIndex
columnIndex
readingOrder

readingOrder는 deterministic해야 한다.

같은 PDF를 재실행했을 때
동일 ordering 결과를 내야 한다.


============================================================
7. SemanticBlockClassifier
============================================================

각 block을 최소 다음 role 중 하나로 분류한다.

TITLE
AUTHOR
AFFILIATION
CONTACT
ABSTRACT
KEYWORDS
HEADING
BODY
CAPTION
TABLE
EQUATION
FIGURE_TEXT
HEADER
FOOTER
REFERENCE
OTHER


Translation policy:

TITLE       = translate
ABSTRACT    = translate
HEADING     = translate
BODY        = translate
CAPTION     = translate

AUTHOR      = preserve
AFFILIATION = preserve
CONTACT     = preserve
TABLE       = preserve initially
EQUATION    = preserve
FIGURE_TEXT = preserve
HEADER      = preserve
FOOTER      = preserve
REFERENCE   = preserve


분류는 다음을 활용한다.

- font size
- font weight
- bounding box
- text density
- numbering pattern
- page position
- preceding/following blocks
- section keywords
- reference patterns
- DOI/email patterns
- figure/table caption prefixes
- bibliography density


References section이 시작된 뒤에는
해당 section이 끝날 때까지 보수적으로 preserve하라.


============================================================
8. TranslationManifest
============================================================

전체 번역 시작 전에
문서 전체의 deterministic manifest를 생성하라.

예:

{
 documentId,
 createdAt,
 extractorVersion,
 classifierVersion,

 pages: [...],

 blocks: [
   {
      id: "...",
      pageIndex: 0,
      readingOrder: 0,
      role: "TITLE",
      sourceText: "...",
      bbox: {...},
      columnIndex: 0,
      translatable: true,
      exclusionReason: null
   }
 ]
}


stable block ID는 단순

p3-7

형태를 사용하지 말라.

가능하면 다음 정보를 hash한다.

documentId
pageIndex
normalized role
normalized sourceText
quantized x/y/width/height

예:

SHA-256(
 documentId +
 pageIndex +
 role +
 normalizedSource +
 roundedGeometry
)

단 너무 민감한 floating point 값 때문에
zoom/render 차이로 ID가 바뀌지 않도록
geometry를 적절히 quantize한다.


============================================================
9. 번역 completeness invariant
============================================================

이 프로젝트에서 가장 중요한 invariant이다.


plannedTranslatableBlocks
=
translatedBlocks
+
failedBlocks
+
cancelledBlocks
+
pendingBlocks

이 식은 진행 중에도 항상 성립해야 한다. 각 stable block ID는 정확히 한 상태에만 속한다. 429로 전역 대기 중인 블록은 `failed`가 아니라 `pending`이다. 사용자가 작업을 중단했더라도 나중에 재개할 블록은 `cancelled`에 영구 고정하지 말고 `pending`으로 돌리는 상태 전이를 명시하라. 제외 블록은 이 식의 왼쪽에 포함하지 않고 별도로 집계한다.


job 완료 상태는

translatedBlocks === plannedTranslatableBlocks
AND
failedBlocks === 0
AND
cancelledBlocks === 0
AND
pendingBlocks === 0

일 때만

COMPLETE

로 표시한다.


페이지 완료 역시

pageTranslated === pagePlanned

이어야 한다.


UI/API 모두 다음 값을 제공할 수 있어야 한다.

totalPages
extractedPages
ocrPages

totalBlocks
translatableBlocks
excludedBlocks

translatedBlocks
failedBlocks

pendingBlocks

progressPercent


progressPercent는 page count가 아니라
translatable block count 기준으로 계산하는 것을 우선 고려하라.


============================================================
10. TranslationScheduler
============================================================

현재 2-worker / 작은 batch 구조를 개선하라.


초기 목표값:

target passages per batch:
8~12

target source characters per batch:
8,000~16,000

현재 `/api/research`는 최대 5문단, 문단당 3,500자, 배치 합계 7,500자로 검증한다. 목표 배치를 적용하려면 클라이언트와 서버 계약·출력 토큰 한도·모델별 제한을 함께 조정하고 실제 응답 안정성을 측정하라. 목표 수치를 맞추기 위해 큰 요청을 무조건 보내지 말고 8~12문단 또는 문자/토큰 예산 중 먼저 도달한 한도를 사용하라.

initial concurrency:
4

minimum concurrency:
1~2

maximum concurrency:
6


단,
고정값으로 박아두기보다 configuration으로 분리한다.

예:

TRANSLATION_BATCH_MAX_PASSAGES
TRANSLATION_BATCH_MAX_CHARS
TRANSLATION_CONCURRENCY_INITIAL
TRANSLATION_CONCURRENCY_MAX


Token/character cost가 매우 큰 paragraph는
단독 batch로 분리한다.


------------------------------------------------------------
10.1 adaptive worker pool
------------------------------------------------------------

fixed Promise.all 100개 요청은 금지한다.

bounded worker pool을 구현하라.


초기:

concurrency = 4


429 발생 시:

- Retry-After 읽기
- global scheduler pause
- 동일 job의 추가 request launch 중단
- current success 결과는 보존
- concurrency 감소
- 작업 전체에 공유되는 backoff와 jitter 적용; 429를 문단 오류로 집계하거나 batch split하지 않음

예:

4 → 2


안정적으로 일정 요청이 성공하면

2 → 3 → 4

형태로 천천히 recovery 가능하다.


429를 paragraph content failure로 취급하지 말라.


============================================================
11. failure classification
============================================================

에러를 최소 다음 범주로 나눠라.

RATE_LIMIT
NETWORK_TIMEOUT
UPSTREAM_5XX
INVALID_JSON
SCHEMA_MISMATCH
OUTPUT_INCOMPLETE
PAYLOAD_TOO_LARGE
AUTH
ABORTED
UNKNOWN


처리 예:

RATE_LIMIT
→ split 금지
→ global backoff

NETWORK_TIMEOUT
→ exponential retry

UPSTREAM_5XX
→ retry
→ 필요 시 batch split

INVALID_JSON
→ retry
→ 실패 지속 시 split

SCHEMA_MISMATCH
→ split

OUTPUT_INCOMPLETE
→ split

PAYLOAD_TOO_LARGE
→ split

AUTH
→ 즉시 job pause/abort

ABORTED
→ user cancellation


retry에는 jitter를 넣어라.


============================================================
12. batch split recovery
============================================================

batch가 semantic/output 이유로 실패하면

12 passages
↓
6 + 6
↓
3 + 3
↓
1 passage

형태로 failing passage를 isolate한다.


그러나 RATE_LIMIT에서는 split하지 않는다.


============================================================
13. Translation response contract
============================================================

array position에만 의존하지 말 것.

input:

{
 passages: [
   {
      id: "block-id-001",
      text: "..."
   },
   ...
 ]
}


output:

{
 translations: [
   {
      id: "block-id-001",
      text: "..."
   }
 ]
}


가능하면 OpenAI Responses API Structured Output / JSON Schema를 사용한다.

반드시 검증한다.

- every expected ID exists
- no duplicate ID
- no unknown ID
- no empty translation
- translatable output contains valid Korean except legitimate preserved technical terms
- source count == result count


응답 순서가 달라도 ID로 remap한다.


============================================================
14. Translation quality
============================================================

공학 논문 번역이므로 다음을 보존한다.

- equipment names
- engineering terminology
- symbols
- numerical values
- units
- equations
- variable notation
- chemical species
- citations
- Figure/Table references
- abbreviations


예:

NOx
SOx
CO₂
EFB
POME
CFD
ANSYS
k-ε
MW
kg/h
wt%


를 임의로 한글화하거나 변형하지 말라.


한국어 문체는 논문형 서술체를 기본으로 한다.

과도한 의역보다
원문 기술적 의미 preservation을 우선한다.


============================================================
15. Translation cache
============================================================

cache key는 source string만으로 끝내지 말라.

최소:

document/block identity
sourceText hash
translationPromptVersion
model/config version

을 고려한다.

prompt 변경 후
옛 translation을 잘못 재사용하지 않도록 한다.


successful translation은
batch 전체가 끝날 때 저장하는 것이 아니라

block/batch success 직후

즉시 저장한다.


그러면

- refresh
- retry
- partial failure

후에도 성공분을 재사용할 수 있다.


============================================================
16. Reader와 Translation Engine 분리
============================================================

전체 번역 job은
Reader DOM mounted 여부와 무관하게 실행 가능해야 한다.


Library에서

전체 번역

버튼을 눌러도

Page 1 ~ N

전체 extraction과 translation을 수행할 수 있어야 한다.


Reader는 translation engine의 consumer일 뿐이어야 한다.


절대로

"현재 화면에 렌더링된 paragraph 목록"

을 전체 document translation source of truth로 사용하지 말라.


============================================================
17. Background job 구조
============================================================

현재 browser local architecture에서
즉시 완전한 backend queue로 전환하지 않아도 되지만
translation job core를 UI component에서 분리하라.


구조 예:

TranslationJobManager
TranslationManifestBuilder
TranslationScheduler
TranslationExecutor


React component 안에
전체 scheduling algorithm을 직접 넣지 말라.


향후 backend queue로 이전 가능한 pure/service architecture로 만들어라.


============================================================
18. KoreanLayoutEngine
============================================================

현재의 가장 큰 시각적 문제 중 하나다.


금지:

- font size를 원문 대비 과도하게 축소
- overflow:hidden으로 번역문 절단
- paragraph 내부 vertical scroll
- translate box 내부 독립 scrollbar


기본 목표:

원문 font size의 약 90~100%를 유지하되
지면 조건상 필요할 때만 제한적으로 감소한다.


hard lower bound 초기값:

body text:
약 original × 0.85

heading:
약 original × 0.90

실제 corpus QA를 통해 조정한다.


============================================================
19. indentation 보존
============================================================

paragraph 전체 x만 저장하지 말고
line별 geometry를 유지하라.

최소:

firstLineX
bodyLineX
rightBoundary

를 구할 수 있어야 한다.


예:

first line:
x = 112

second line:
x = 96


이면

first-line indent = 16px

로 번역에도 반영한다.


heading은 별도 layout rule을 가진다.


============================================================
20. column reflow
============================================================

장문 한국어가 original paragraph bbox 안에
자연스럽게 들어가지 않는 경우

paragraph internal scroll을 만들지 말고

가능한 범위에서 같은 column의
후속 paragraph를 아래로 이동시키는 reflow를 구현하라.


각 column을 vertical flow container처럼 모델링한다.


TranslatedBlock A
↓
TranslatedBlock B
↓
TranslatedBlock C


A가 source보다 14px 길어지면

B.y += 14
C.y += 14


단 Figure/Table/Equation/Caption 등은 obstacle로 취급한다.


============================================================
21. layout obstacle model
============================================================

페이지에는 다음 fixed obstacle이 존재할 수 있다.

Figure
Table
Equation
full-width object


reflow가 obstacle을 침범하면

1.
available column region 계산

2.
다음 usable region으로 flow

3.
필요하면 font size를 제한적으로 조정

4.
그래도 불가능하면 해당 block을 layout-warning 상태로 표시


사용자에게 보이지 않게 글자를 잘라버리는 방식은 금지한다.


============================================================
22. CSS 개선
============================================================

현재 CSS에 다음 류의 구조가 있으면 검토하라.

overflow:hidden
overflow:auto

특히 translation region에 적용된 overflow는
clipping/scroll 발생의 직접 원인이 될 수 있다.


목표:

translation paragraph 자체에는 scrollbar가 없어야 한다.


============================================================
23. render flicker 방지
============================================================

다음을 검사한다.

- zoom
- fit width
- fit page
- scroll away / scroll back
- original view toggle
- reload


번역 cache가 존재하면
영어가 잠깐 표시된 뒤 뒤늦게 한국어로 바뀌는 현상을 최소화한다.


가능하면 page mount 직후
translation cache를 block ID로 빠르게 hydrate한다.


============================================================
24. performance target
============================================================

실제 API/network/model 환경에 따라 절대시간은 변동하므로
시간 목표와 함께 내부 metric을 반드시 기록하라.


Digital text PDF 기준 목표:

20-page PDF extraction:
목표 2초 이내
최대 허용 초기 목표 4초


translation planning:
1초 이내


first translated content visible:
버튼 클릭 후 목표 3초 이내
network/model 상황이 정상이라는 조건


API request count:
기존 대비 50% 이상 감소 목표


effective concurrency:
정상 상태 평균 3~4


translation completeness:
100%


wrong paragraph mapping:
0


duplicate translation assignment:
0


skipped translatable block:
0


paragraph internal scrollbar:
0


silent clipping:
0


OCR usage on normal digital journal PDFs:
원칙적으로 0 page


scan/malformed page일 때만 OCR fallback.


15~20 page engineering paper 전체 번역은
정상 API 상태에서 기존보다 최소 2배,
가능하면 3~5배 빨라지는 것을 목표로 한다.


단 측정 없이 "3배 빨라졌다"고 주장하지 말라.


============================================================
25. benchmark instrumentation
============================================================

다음을 Performance API 또는 job telemetry에 기록하라.

documentExtractionMs
manifestBuildMs
timeToFirstTranslationMs
totalTranslationMs

requestCount
successfulRequestCount
retryCount
rateLimitCount

averageBatchPassages
averageBatchCharacters
maxConcurrencyObserved

plannedBlockCount
translatedBlockCount
failedBlockCount

ocrPageCount


가능하면 개발 모드에서 console/table 또는 debug panel로 확인 가능하게 한다.


============================================================
26. 실제 논문 QA
============================================================

최소 서로 다른 지면 유형을 검사한다.

ACS Omega
MDPI
Elsevier 계열 또는 유사한 2-column journal


가능하면 현재 사용자가 QA한 실제 15~17 page 논문도 사용한다.


각 문서에서 최소 다음을 기록한다.

pages
native text blocks
translation targets
excluded blocks
translated
failed
OCR fallback pages
API requests
time to first translation
total elapsed time


============================================================
27. semantic QA
============================================================

각 문서에서 실제 원본 PDF와 비교하여 확인한다.


반드시 번역:

- title
- abstract
- headings
- body
- figure caption


번역하지 않음:

- authors
- affiliations
- email
- references
- equations
- figure internal labels
- table body
- page decorations


잘못된 분류가 발생하면
문단 하나만 임시 patch하지 말고
classification heuristic 자체를 개선한다.


============================================================
28. reading-order QA
============================================================

특히 2-column PDF에서

페이지별 block 순서를 dump하여 확인한다.


Expected:

page 3

left column:
L1
L2
L3

right column:
R1
R2
R3


manifest:

L1
L2
L3
R1
R2
R3


이어야 한다.


같은 y에 존재한다는 이유만으로

L1 + R1

을 하나의 line으로 합쳐서는 안 된다.


============================================================
29. completeness QA
============================================================

각 페이지에 대해 다음 비교를 자동화하라.

planned translatable blocks
translated blocks
failed blocks


차이가 발생하면 test failure로 취급한다.


"UI에 대부분 한국어가 보인다"

는 검증 기준이 아니다.


============================================================
30. API resilience QA
============================================================

mock 또는 test route를 활용해 다음을 검증하라.

429
502
504
timeout
invalid JSON
missing result ID
duplicate result ID
extra result ID
incomplete output
very long paragraph


예상 동작을 test로 고정한다.


============================================================
31. refresh/retry QA
============================================================

다음 sequence를 자동/수동으로 확인한다.


translate start
↓
약 30~50% 진행
↓
refresh
↓
job state/cache 복구
↓
successful translations reuse
↓
remaining blocks continue


현재 client-only architecture에서
refresh 후 자동 job continuation이 아직 어렵다면

최소한

"완료된 결과는 유지되고
Retry를 누르면 남은 block만 실행"

되어야 한다.


============================================================
32. tab close limitation
============================================================

browser tab 기반 job은
tab close 후 실행이 중단될 수 있다.

이 사실을 숨기지 말라.


V2 frontend architecture에서는
job core를 분리하여 향후 다음으로 이동 가능하게 만든다.

server job
queue
durable storage


필요하면 architecture document를 추가한다.


============================================================
33. 향후 backend architecture
============================================================

다음 migration target도 설계 문서에 남겨라.

Auth
↓
Document DB
↓
Object Storage
↓
Translation Job DB
↓
Queue
↓
Worker
↓
Translation Block DB
↓
Realtime progress


고려 항목:

- user ownership
- idempotency
- deduplication
- access control
- deletion
- retries
- token/cost quota
- resume
- rate limiting
- per-user concurrency


그러나 이번 작업에서 backend migration 때문에
현재 translation correctness 개선을 미루지는 말라.


============================================================
34. IndexedDB schema
============================================================

현재

documents
blobs
annotations
translations

구조를 검사한다.


필요하면 다음 개념을 추가한다.

translationJobs
translationManifests

또는 existing store에서 표현한다.


schema migration 시
기존 사용자 데이터가 깨지지 않도록 version migration을 작성한다.


============================================================
35. 주요 코드 위치
============================================================

반드시 현재 실제 파일을 먼저 확인한다.


예상 주요 파일:

app/api/research/route.ts

components/paperflow/reader/reader-shell.tsx
components/paperflow/reader/continuous-page.tsx
components/paperflow/reader/pdf-page.tsx
components/paperflow/reader/inline-translation-layer.tsx

components/paperflow/library/research-library.tsx

lib/paperflow/pdf/pdf-adapter.ts

lib/paperflow/translation/paragraphs.ts
lib/paperflow/translation/extract-page.ts
lib/paperflow/translation/document-job.ts
lib/paperflow/translation/inline-layout.ts
lib/paperflow/translation/hybrid.ts
lib/paperflow/translation/research-api.ts
lib/paperflow/translation/research-style.ts

lib/paperflow/persistence/translation-repository.ts
lib/paperflow/persistence/indexeddb.ts

components/paperflow/paperflow.css

tests/unit
tests/integration
tests/e2e


파일이 없으면 실제 구조를 찾아서
동일 책임 위치에서 구현한다.


============================================================
36. React component 책임 축소
============================================================

reader-shell.tsx 안에

- paragraph extraction
- worker scheduler
- batch retry
- job state machine

등을 계속 추가하지 말라.


ReaderShell은 UI orchestration에 집중한다.


translation pipeline은
lib/paperflow/translation 아래
독립 service/module로 분리한다.


============================================================
37. 권장 module 구조
============================================================

실제 코드 상황에 맞게 조정할 수 있지만
대략 다음 구조를 목표로 한다.


lib/paperflow/translation/

extract/
  native-extractor.ts
  extraction-confidence.ts
  ocr-provider.ts

layout/
  line-builder.ts
  column-detector.ts
  reading-order.ts
  paragraph-builder.ts
  classifier.ts

manifest/
  build-manifest.ts
  stable-block-id.ts

job/
  document-job.ts
  scheduler.ts
  retry-policy.ts
  progress.ts

api/
  translation-client.ts
  schemas.ts

render/
  inline-layout.ts
  column-reflow.ts


과도한 파일 분할은 하지 말고
책임 분리가 실제로 개선될 때만 나눈다.


============================================================
38. OpenAI API
============================================================

현재 API 구현을 먼저 확인한다.

OPENAI_API_KEY는 반드시 server only이다.


환경변수 예:

OPENAI_API_KEY
OPENAI_MODEL

선택적으로:

OPENAI_FAST_MODEL


model name은 현재 실제 사용 가능한 모델을 확인하고 결정한다.

존재하지 않는 model name을 임의로 hard-code하지 말라.


batch translation에서는 structured schema를 사용한다.

max output tokens 역시
source length와 batch passage 수를 고려하여 계산한다.


============================================================
39. prompt version
============================================================

translation prompt에 version을 둔다.

예:

TRANSLATION_PROMPT_VERSION = "paperflow-ko-v2"


cache가 prompt version 변경을 인식할 수 있게 한다.


============================================================
40. heading layout
============================================================

section heading:

3. METHODS
2. RESULTS AND DISCUSSION

등은

- original color
- font weight
- approximate font size
- indentation
- alignment

을 보존해야 한다.


body paragraph layout rule을
heading에 그대로 적용하지 말라.


============================================================
41. original text preservation
============================================================

원본 PDF canvas/text layer를 파괴하지 말라.

translation은 overlay architecture를 유지한다.


사용자는 원문 보기 전환이 가능해야 한다.


============================================================
42. PDF export
============================================================

현재 export가 image flattening 기반이라면
이번 translation engine 작업 때문에 반드시 전면 변경할 필요는 없다.

단 제약을 문서화한다.

향후:

searchable text
vector highlight
smaller file size
higher fidelity

중 우선순위를 제안한다.


============================================================
43. 테스트
============================================================

최소 다음을 통과시켜라.

pnpm install --frozen-lockfile

pnpm run typecheck

pnpm test

pnpm run build

pnpm exec playwright install chromium

pnpm run test:e2e


기존 CI가 npm 기반인지 pnpm 기반인지 실제 repository를 확인한다.

packageManager 선언과 CI가 다르면 정리하라.


============================================================
44. 새 unit test
============================================================

최소 다음 테스트를 추가한다.

two column reading order

left/right column separation

stable block ID

dehyphenation

heading classification

reference exclusion

manifest completeness

structured output ID remapping

duplicate ID rejection

missing ID rejection

batch split behavior

429 no-split behavior

adaptive concurrency

indent preservation

long Korean layout

column reflow


============================================================
45. E2E test
============================================================

전체 번역 버튼을 실제 사용자 관점에서 검사한다.


Library:

upload PDF
↓
Reader 열지 않음
↓
전체 번역
↓
progress 표시
↓
완료


Reader:

translated page 확인
↓
page 이동
↓
scroll
↓
zoom
↓
original toggle
↓
다시 translation 표시


페이지마다 영어 body가 남지 않는지 확인한다.


============================================================
46. 시각적 QA
============================================================

스크린샷 또는 Playwright screenshot으로 검사한다.


특히 확인:

- text clipping
- overlap
- paragraph scrollbar
- Figure collision
- section heading style
- first-line indent
- Korean line spacing
- two-column alignment


"테스트가 통과했으므로 디자인도 정상"

이라고 가정하지 말라.


============================================================
47. 회귀 방지
============================================================

다음 기존 기능을 깨지 말 것.

highlight
ink
eraser
notes
selection
concept study
page rail
continuous scrolling
PDF export
library
dark/light UI


translation overlay가
selection/highlight layer pointer event를 방해하지 않는지 확인한다.


============================================================
48. Git workflow
============================================================

작업 전 최신 local state를 보존한다.

dirty tree가 있으면
무단 reset하지 말라.


필요하면 새 branch를 만든다.

예:

feat/paperflow-translation-engine-v2


PR #2 변경사항은
현재 최신 local과 비교 후 통합한다.


작업 결과는 logical commit으로 나눈다.

예:

1.
refactor PDF extraction and reading order

2.
add translation manifest and stable block IDs

3.
implement adaptive batch scheduler

4.
add structured translation response mapping

5.
implement Korean column reflow

6.
add translation QA and benchmarks


============================================================
49. 절대로 하지 말 것
============================================================

금지:

- 테스트하지 않은 기능을 "완료"라고 보고
- API 단건 200을 전체 번역 성공으로 간주
- OCR을 모든 페이지에 실행
- concurrency를 무제한으로 늘림
- 429를 batch split로 해결
- paragraph 내부 scrollbar로 overflow 숨김
- font size를 극단적으로 줄여 fit
- Reader DOM에만 의존해 전체 document 번역
- array index만으로 translation remap
- 페이지 수만으로 번역 진행률 표시
- local unpushed commit 삭제
- API key 출력
- private PDF repository commit


============================================================
50. Definition of Done
============================================================

다음 조건을 모두 만족해야
Translation Engine V2의 이번 milestone을 완료로 간주한다.


A.

대표 digital journal PDF에서

planned translatable blocks
=
translated blocks

이며 failed = 0


B.

2-column reading-order 오류 = 0


C.

wrong translation-to-block mapping = 0


D.

body paragraph silent clipping = 0


E.

paragraph internal scrollbar = 0


F.

번역 완료 후
영어 body 문단이 이유 없이 남아 있지 않음


G.

normal digital PDF에서 OCR = 0 page가 기본


H.

첫 translation 표시 시간이 기존보다 명백히 개선


I.

API request 수가 기존 대비 유의하게 감소


J.

전체 번역 elapsed time이 기존보다 최소 2배 개선을 목표로 하며,
실측 결과를 보고


K.

refresh/retry 시 이미 번역된 block 재요청 최소화


L.

typecheck pass


M.

unit/integration tests pass


N.

build pass


O.

relevant Playwright tests pass


P.

실제 journal PDF visual QA 수행


============================================================
51. 정량 보고 형식
============================================================

작업 후 반드시 benchmark 표를 작성하라.


예:


Document:
ACS Omega 15 pages

Metric                     Before       After
------------------------------------------------
Extraction time            x.xx s        x.xx s
Manifest build             N/A           x.xx s
Translation targets        xxx           xxx
Completed                  xxx           xxx
Failed                     xx            0
API requests               xx            xx
Avg passages/request       x.x           x.x
Max concurrency            2             4
First translation          xx.x s        x.x s
Total translation          xxx s         xx s
OCR pages                  -             0
Mapping errors             ?             0
Clipped paragraphs         xx            0


실측할 수 없는 값은
"not measured"

라고 명시한다.

추정값을 실제 benchmark처럼 쓰지 말라.


============================================================
52. 최종 보고서 형식
============================================================

작업을 완료한 후 다음 순서로 보고하라.


1. Repository / branch / commit 상태

2. 발견한 근본 원인

3. 변경한 architecture

4. 변경된 주요 파일

5. PDF extraction 개선

6. layout / reading order 개선

7. translation scheduler 개선

8. API response validation 개선

9. Korean layout/reflow 개선

10. OCR fallback 설계 및 실제 사용 여부

11. unit/integration test 결과

12. build 결과

13. Playwright 결과

14. 실제 journal PDF QA 결과

15. 성능 Before / After

16. translation completeness

17. 남은 제한

18. 향후 backend queue migration

19. Git commits

20. PR/remote 상태


============================================================
53. 작업 순서
============================================================

반드시 아래 순서로 진행하라.


PHASE 1
Repository truth 확인

PHASE 2
현재 translation pipeline trace

PHASE 3
대표 PDF에서 현재 failure reproduction

PHASE 4
Native extraction / reading order 수정

PHASE 5
Manifest + stable IDs

PHASE 6
Structured translation API

PHASE 7
Adaptive scheduler / batch optimization

PHASE 8
Persistence/resume

PHASE 9
Korean layout / indentation / reflow

PHASE 10
OCR fallback

PHASE 11
Unit tests

PHASE 12
E2E / real PDF QA

PHASE 13
Performance benchmark

PHASE 14
Build / regression

PHASE 15
Git commit / PR


구현 전에 장황한 계획서만 작성하고 멈추지 말라.

각 phase에서 필요한 코드를 실제로 수정하라.


============================================================
54. 우선순위
============================================================

P0

번역 대상 누락 제거
reading-order 정확성
stable block mapping
전체 번역 completeness
API batching/concurrency
429 recovery


P1

Korean clipping 제거
indentation
column reflow
render flicker


P2

Selective OCR
telemetry
backend-ready abstractions


P3

Searchable translated PDF export
server durable queue
multi-device sync


============================================================
55. 최종 제품 기준
============================================================

이 기능의 최종 품질을 평가할 때

"번역 API가 응답했는가?"

가 아니라

"사용자가 15~20페이지의 실제 공학 논문에서
버튼 한 번으로
빠르게,
순서가 맞게,
본문이 하나도 빠지지 않고,
읽기 좋은 크기로,
원본 구조와 유사하게
전체 한국어 논문을 읽을 수 있는가?"

를 기준으로 판단하라.


문제가 발견되면
symptom을 가리는 CSS patch보다
pipeline의 upstream root cause를 먼저 해결하라.


최종적으로 PAPERFLOW의 translation pipeline을

DOM-dependent paragraph translation

에서

Document-aware Translation Engine

으로 전환하라.


지금 저장소 검토부터 시작하고,
코드를 실제로 수정하고,
테스트하고,
측정하고,
검증한 뒤 결과를 보고하라.
