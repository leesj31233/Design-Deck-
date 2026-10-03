# PAPERFLOW 계정·클라우드 설정 (Supabase + Google 로그인)

코드는 준비되어 있다. 아래 값이 들어오기 전까지 사이트는 지금처럼 로컬 서재로 동작한다. 사이드바에는 "로컬 저장 · 이 브라우저"가 표시된다.

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
  - PDF는 **기기 저장소**에 두고, **용량 제한이 없다**.
  - 브라우저에 영구 저장을 요청해 자동 삭제를 막는다.
  - 목록, 메모, 마킹, 번역은 계정에 동기화된다. 그래서 다른 기기에서도 서재와 메모가 보인다.
  - 다른 기기에서는 같은 PDF를 한 번 가져오면 파일 지문으로 자동 연결된다.
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
