# 마태복음 스터디 성경 (개인용 프로토타입)

개역한글을 본문으로 한 전자책 성경입니다. 실제 성경책처럼 쪽을 넘기며 읽고, 단어에 마우스를
올리면 원어 해설이 뜨며, 형광펜·메모·필기를 남기고 PDF로 내보낼 수 있습니다.

## 실행

```
python -m http.server 8731 -d app
```

브라우저에서 http://localhost:8731 을 엽니다.

## 화면

- 가로 화면(PC): 두 쪽 펼침, 클릭·←→·스페이스로 넘김, 오른쪽 장 색인 탭
- 세로 태블릿: 한 쪽, 2단
- 스마트폰: 화면 가득 한 쪽 1단, 좌우 스와이프로 넘김, 가운데를 누르면 도구 막대

## 본문

| 본문 | 위치 | 라이선스 |
|---|---|---|
| 개역한글 (1961) | `app/data/matthew.json`에 포함 | 퍼블릭 도메인 (scrollmapper/bible_databases KorRV) |
| KJV | 포함 | 퍼블릭 도메인 |
| 헬라어 원문·문법 | 포함 | STEPBible TAGNT, CC BY 4.0 |
| Strong 사전 | 포함 | OpenScriptures, CC BY-SA |
| 관주 | 포함 | OpenBible.info, CC BY |
| NIV | 포함하지 않음 | 저작권 번역. 앱의 **본문** 단추로 붙여 넣거나 `app/data/user/niv.txt`에 둡니다 |

**보기** 설정에서 본문(개역한글/KJV/NIV)과 각 절 아래의 대조 본문을 고릅니다.

## 구조

```
app/
  index.html, book.css      화면과 책 디자인
  js/book.js                블록 생성, 쪽 나누기(측정 기반), 쪽 HTML
  js/main.js                펼침/한 쪽 배치, 책장 넘김, 선택·형광펜, 입력
  js/study.js               단어 해설, 절 연구, 원어 연구, 목차, 검색, 노트, 설정
  js/ink.js                 필기 (글자에 붙여 저장하므로 글자 크기를 바꿔도 따라감)
  js/print.js               A5 PDF 내보내기
  js/store.js               사용자 데이터 (localStorage), 백업
  data/matthew.json         절마다 개역한글·KJV·헬라어 단어(Strong, 문법, 사본)
  data/terms.json           단어 해설: 원어, 음역, Strong, 짧은 뜻, 분류된 해설, 본문 맥락, 출처,
                            번역본별 위치(anchors), 해설 박스, 그림
  data/headings.json        소제목과 평행 본문
  data/intro.json           서론
  data/crossrefs.json       관주
tools/                      데이터 빌드 스크립트
```

## 데이터 다시 만들기

`data/raw/`에 원본을 받은 뒤 실행합니다.

```
python -I tools/build_matthew.py
python -I tools/build_crossrefs.py
```

## 해설

`terms.json`, `notes.json`의 해설과 소제목, 서론은 Claude가 쓴 초안이며 검수 전입니다.
