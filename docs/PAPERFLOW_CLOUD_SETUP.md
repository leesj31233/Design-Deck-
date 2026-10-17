# PAPERFLOW 계정·클라우드 설정 (Supabase, 이메일·비밀번호 로그인)

**현재 상태(2026-10-03):** 운영 사이트에 연결되어 동작 중이다. 프로젝트 `uwyixapgprhrppwkvayb`(Seoul), 마이그레이션 적용, 인증 주소·최소 비밀번호 8자는 `supabase/config.toml`로 관리한다(`supabase config push`).

## 로그인 흐름

- 로그인하지 않은 방문자는 `/`, `/library`, `/reader/*`에서 `/login`으로 이동한다(`proxy.ts`). 번역·가이드·개념 설명 API도 로그인한 사용자만 쓴다.
- **회원가입:** 이메일 + 비밀번호(8자 이상) → 확인 메일의 링크를 누르면 가입 완료와 함께 서재가 열린다.
- **로그인:** 첫 화면에서 이메일 + 비밀번호. 어느 기기에서든 같은 서재(목록, PDF, 마킹, 메모, 번역)가 열린다.
- **비밀번호 찾기·설정:** 메일 링크로 새 비밀번호를 정한다. 메일 링크로 만든 계정(비밀번호 없음)도 이 방법으로 처음 비밀번호를 정한다.
- 메일 링크는 implicit 방식이라 요청한 기기와 다른 기기(휴대폰 등)에서 열어도 된다(`/auth/confirm`, `/auth/reset`).
- **메일 한도:** Supabase 기본 메일은 **시간당 2통**이고 메일 문구도 바꿀 수 없다(무료 플랜). 외부 사용자를 받기 전에 Authentication → SMTP에 회사 메일이나 Resend 같은 발송 서비스를 연결한다. 연결하면 한도가 풀리고 한국어 메일 템플릿을 쓸 수 있다.

아래 값이 없는 배포(로컬 개발 등)는 로그인 없이 로컬 서재로 동작한다.

비밀값(API 키)은 코드, 문서, git에 넣지 않는다. Vercel 환경변수와 Supabase 대시보드에만 입력한다.

## 1. Supabase 프로젝트

1. https://supabase.com/dashboard 에서 **New project**를 만든다.
   - 이름: `paperflow`
   - Region: **Northeast Asia (Seoul)**
   - DB 비밀번호는 비밀번호 관리자에 보관한다.
2. **SQL Editor**에 `supabase/migrations/20261003000001_paperflow_cloud.sql` 전체를 붙여 넣고 **Run**을 누른다.
   - 만들어지는 것:
     - 테이블 profiles, documents, annotations, translations, shared_translations(모두 RLS 적용)
     - 비공개 버킷 `papers`
     - 가입 시 프로필을 만드는 트리거
   - CLI를 쓸 때: `supabase login` 후 `supabase link --project-ref <ref>`, `supabase db push`.
3. **Project Settings → API**에서 다음 세 값을 확인한다(4단계에서 쓴다).
   - Project URL
   - `anon` public key
   - `service_role` key(서버 전용, 절대 공개 금지)

## 2. Google 로그인

1. https://console.cloud.google.com/apis/credentials 에서 **OAuth 클라이언트 ID**를 만든다.
   - 유형: 웹 애플리케이션
   - 승인된 JavaScript 원본: `https://temporary-speedy-thunder-fmo0cqz.vercel.app`
   - 승인된 리디렉션 URI: `https://<project-ref>.supabase.co/auth/v1/callback`
   - OAuth 동의 화면: 외부, 앱 이름 PAPERFLOW. 범위는 기본값(email, profile, openid)만 쓴다.
2. Supabase **Authentication → Providers → Google**을 켜고, 1에서 받은 Client ID와 Client Secret을 입력한다.
   - 같은 화면의 **Email** 공급자는 기본으로 켜져 있다(이메일 로그인 링크용). 꺼져 있으면 켠다.
3. Supabase **Authentication → URL Configuration**을 설정한다.
   - Site URL: `https://temporary-speedy-thunder-fmo0cqz.vercel.app`
   - Redirect URLs:
     - `https://temporary-speedy-thunder-fmo0cqz.vercel.app/auth/callback`
     - `http://localhost:3100/auth/callback`

## 3. Vercel 환경변수 (Production)

| 이름 | 값 | 공개 여부 |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL | 공개 가능(브라우저에 포함) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon key | 공개 가능(RLS가 보호) |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role key | **비밀** |
| `PAPERFLOW_OWNER_EMAILS` | `seungjun.lee@naysor.com` | 서버 전용 |
| `NEXT_PUBLIC_PAPERFLOW_GOOGLE` | `1` (Google 공급자를 켠 뒤에만) | 공개 가능 |

입력을 마친 뒤 재배포하면 사이드바에 이메일 로그인이 나타나고, `NEXT_PUBLIC_PAPERFLOW_GOOGLE=1`을 넣으면 "Google로 로그인"도 함께 나타난다. 이메일 로그인은 Supabase 기본 메일로 로그인 링크를 보내므로 Google 설정 없이도 바로 쓸 수 있다(기본 메일은 시간당 발송 수가 적으니, 사용자가 늘면 Auth → SMTP에 회사 메일을 연결한다). 재배포는 요청하면 바로 한다.

## 저장 방식과 용량

- **기본 계정(베타):**
  - PDF를 클라우드 비공개 버킷에 저장하고, **1인 200MB**(논문 약 60편)까지 쓴다.
  - 한도는 서버가 업로드 주소를 발급하기 전에 검사한다.
- **소유자 계정**(`PAPERFLOW_OWNER_EMAILS`):
  - PDF도 클라우드에 올리고 **용량 제한이 없다**. 그래서 어느 기기에서 로그인해도 서재 전체가 열린다.
  - 새 기기에서는 목록·메모·번역을 먼저 받고, PDF와 표지는 보는 순서대로 내려받아 그 기기에 저장해 둔다.
  - 프로젝트 전체 저장 한도(Free 1GB, Pro 100GB)는 소유자 파일도 함께 쓴다.
- **한 기기 = 한 계정:** 같은 브라우저에서 다른 계정으로 로그인하면 이전 계정의 로컬 서재를 먼저 비운다(계정끼리 섞이지 않는다).
- **다른 사용자를 로컬 방식으로 바꾸려면** SQL에서 다음을 실행한다.
  ```sql
  update profiles set storage_mode = 'local', storage_quota_bytes = null where id = '<user id>';
  ```
- **번역 공유 캐시:** 같은 원문 문단은 한 번만 번역한다. 문단 해시와 번역문만 저장하고, PDF는 공유하지 않는다.

## 수용 인원과 비용 (Supabase 2026-10 공개 요금 기준, 변동 가능)

| 플랜 | 파일 저장 | DB | 200MB를 꽉 채운 사용자 | 평균 50MB 사용자 |
|---|---|---|---|---|
| Free | 1 GB | 500 MB | 5명 | 약 20명 |
| Pro (월 $25) | 100 GB 포함, 초과 GB당 월 약 $0.021 | 8 GB | 약 500명 | 약 2,000명 |

- **DB 사용량:** 번역문과 메모는 논문 한 편에 약 0.1~0.3MB다. 따라서 사용자 수천 명까지는 DB가 먼저 차지 않는다.
- **로컬 방식 계정:** 클라우드 파일 저장량이 0이다.
