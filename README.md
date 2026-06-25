# 장비관리 프로젝트

사내 장비 작업/예약 현황을 웹에서 확인하는 운영 대시보드입니다.
3D 프린팅 장비와 멸균 장비를 탭으로 전환하고, 각 장비의 작업 상태,
진행률, 남은 시간, 예약 목록, 모바일 QR 입력을 관리합니다.

## Features

- 3D 프린팅 장비와 멸균 장비 탭 분리
- 장비별 상태, 현재 작업, 담당팀, 시작/종료 시간, 남은 시간, 진행률 표시
- 장비 작업 시작, 완료, 예약 추가
- 장비 추가/삭제
- 장비별 모바일 빠른 입력 QR 코드
- QR 스티커 출력 화면
- 서버 API와 D1 기반 공유 저장소 사용

## Prerequisites

- Node.js `>=22.13.0`

## Quick Start

```bash
npm install
npm run dev
npm run build
```

상태 데이터는 Sites D1 바인딩 `DB`와 `/api/equipment` 서버 API를
사용합니다. 브라우저 저장소는 장비/작업 데이터의 원본으로 쓰지 않습니다.

## Deployment

OpenAI Sites 또는 호환되는 Vinext 배포 환경에서 D1 바인딩 이름을 `DB`로
설정해 배포합니다. `.openai/hosting.json`에는 특정 프로젝트 ID를 넣지
않았으므로, 배포 환경에서 새 Sites 프로젝트에 맞게 연결하면 됩니다.

## Useful Commands

- `npm run dev`: start local development
- `npm run build`: verify the vinext build output
- `npm run db:generate`: generate Drizzle migration files after schema changes
