# 사용자별 발송 일정 (요일·시각·횟수) 구현 계획

## 배경

- 현재 `main.py`는 수동 실행 배치: 하루 1회, `(토픽, 날짜)` 단위 브리핑 1개 생성 후 전 구독자에게 발송
- 저장소에 스케줄러 없음, 브리핑/발송 중복 방지는 `briefings(topic_id, brief_date)` unique와 `deliveries(briefing_id, user_id, channel)` unique로 처리
- 목표: 사용자별로 요일·발송 시각(복수 시각 = 횟수)을 지정하면, 각 시각마다 그 시점의 최신 기사로 새 브리핑을 생성해 해당 사용자에게만 발송

## 확정된 결정 (사용자 확인 완료)

| 항목 | 결정 |
| --- | --- |
| 발송 횟수 의미 | 시각 여러 개 = 횟수 (예: 08:00, 18:00 → 하루 2회), **매회 그 시점 최신 기사로 새 요약** |
| 날짜 단위 | 요일 단위 (월~일 선택, 주간 반복) |
| 일정 없는 사용자 | 발송 안 함 (스케줄러는 일정 등록 사용자만 발송) |
| `main.py` / `!refresh` | 기존 그대로 수동 전체 방송 도구로 유지 (slot 미사용) |
| 스케줄러 실행 | 상시 프로세스 `scheduler.py` (매분 체크) + `--once` 단발 모드 |
| 실패 재시도 | 지정 시각부터 **30분 유예**: 유예창 내 매분 재시도, 초과 시 다음 발송 주기로 넘어감 |
| 시간대 | KST(Asia/Seoul) 고정 |
| 일정 범위 | 사용자당 1개, 구독 중인 **모든 토픽 공통** 적용 (토픽별 일정은 범위 제외) |
| 일정 편집 UI | 웹 `/settings` 페이지에 "발송 일정" 카드 추가 |

## 설계 개요

```
[웹 /settings] --(anon+RLS)--> send_schedules (본인 행)
[scheduler.py 상시 루프] -- 매분 -->
    due 계산: today.weekday() ∈ days AND ∃ time t (t <= now < t+30분)
    slot(=t, "HH:MM")별 그룹핑 → 각 토픽 브리핑 생성/재사용 → due 사용자에게만 발송
```

- **슬롯별 브리핑**: `briefings`에 `time_slot` 컬럼 추가, unique를 `(topic_id, brief_date, time_slot)`으로 변경
- **중복 방지**: 발송 dedup은 기존 `deliveries`가 그대로 담당 (슬롯 브리핑 ID가 다르므로 자연 해결). 유예창 내 재시도도 `sent` 기록이 있으면 건너뜀
- **기사 소비**: 기존 로직 유지 — 한 기사는 브리핑 하나에만 사용(`briefing_id IS NULL`만 후보). 다음 슬롯에는 그 사이 새로 수집된 기사만 사용, **신규 기사 없으면 그 발송은 스킵**(정상 동작, 로그 남김)
- **동시 실행 경합**: 스케줄러 틱과 수동 실행이 겹쳐 같은 슬롯 브리핑을 만들려 하면 unique 위반 발생 가능 → 예외를 잡아 "이미 존재"로 간주하고 재조회 (또는 unique 에러 로그 후 다음 틱에 재시도)

## 작업 목록

### 1. DB 마이그레이션 (SQL — 사용자가 Supabase SQL Editor에서 직접 실행)

```sql
-- briefings에 슬롯 컬럼 추가
ALTER TABLE briefings ADD COLUMN IF NOT EXISTS time_slot text NOT NULL DEFAULT '';

-- 기존 (topic_id, brief_date) unique 제약 제거 (이름 자동 탐색)
DO $$
DECLARE cname text;
BEGIN
  SELECT conname INTO cname FROM pg_constraint
    WHERE conrelid = 'briefings'::regclass AND contype = 'u'
      AND conkey = (SELECT array_agg(attnum) FROM pg_attribute
                    WHERE attrelid = 'briefings'::regclass
                      AND attname IN ('topic_id','brief_date'));
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE briefings DROP CONSTRAINT %I', cname);
  END IF;
END $$;

-- (topic_id, brief_date, time_slot) unique
ALTER TABLE briefings ADD CONSTRAINT briefings_topic_id_brief_date_time_slot_key
  UNIQUE (topic_id, brief_date, time_slot);

-- 사용자별 발송 일정 테이블
CREATE TABLE IF NOT EXISTS send_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  days integer[] NOT NULL DEFAULT ARRAY[0,1,2,3,4],  -- 0=월 ~ 6=일 (Python weekday 기준)
  times text[] NOT NULL DEFAULT ARRAY['08:00'],       -- "HH:MM" 24h
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE send_schedules ENABLE ROW LEVEL SECURITY;

-- RLS: 본인 행만 (기존 subscriptions/link_codes 정책과 동일 패턴)
CREATE POLICY "본인 일정 조회" ON send_schedules FOR SELECT
  USING (user_id IN (SELECT id FROM users WHERE auth_user_id = auth.uid()));
CREATE POLICY "본인 일정 생성" ON send_schedules FOR INSERT
  WITH CHECK (user_id IN (SELECT id FROM users WHERE auth_user_id = auth.uid()));
CREATE POLICY "본인 일정 수정" ON send_schedules FOR UPDATE
  USING (user_id IN (SELECT id FROM users WHERE auth_user_id = auth.uid()));
CREATE POLICY "본인 일정 삭제" ON send_schedules FOR DELETE
  USING (user_id IN (SELECT id FROM users WHERE auth_user_id = auth.uid()));
```

### 2. 백엔드 — `backend/config.py`

- `schedule_grace_minutes: int = 30` 추가

### 3. 백엔드 — `backend/db/supabase.py`

- `get_briefing(topic_id, brief_date, time_slot="")`, `create_briefing(topic_id, brief_date, summary, time_slot="")` — 시그니처 확장
- 일정 CRUD: `list_enabled_schedules()`, `upsert_schedule(user_id, days, times, enabled)`, `get_schedule(user_id)`
- 헬퍼: `get_topic(topic_id)`, `get_subscribed_topic_ids(user_ids)` (특정 사용자들의 구독 토픽 합집합)

### 4. 백엔드 — `backend/main.py`

- `process_topic(..., time_slot: str = "", target_user_ids: set[str] | None = None)`:
  - `get_briefing`/`create_briefing`에 `time_slot` 전달
  - `target_user_ids`가 주어지면 구독자 목록을 해당 사용자로 필터링 (수동 방송은 `None` = 전체, 기존 동작)
- `run_scheduled(db, ai, notifier, discord_notifier, now, dry_run=False)` 신규:
  1. `list_enabled_schedules()` → 요일 일치 + 유예창(`t <= now < t+grace`) 내 시각이 있는 사용자 추출
  2. 슬롯(`"HH:MM"`)별로 사용자 그룹핑 → 슬롯별 구독 토픽 합집합
  3. 토픽마다 `process_topic(..., time_slot=slot, target_user_ids=그룹)` 호출
  4. 결과 요약(sent/failed/failures) 반환
- `main()`은 기존 legacy 방송 유지 (변경 없음)

### 5. 백엔드 — `backend/scheduler.py` (신규)

- 상시 루프: 매분 정각에 `run_scheduled(datetime.now(KST))` 실행 (동기 루프 + `time.sleep`으로 다음 분까지 대기)
- CLI: `--once` (1회 실행 후 종료), `--dry-run` (발송 없이 로그만)
- 시작/종료/발송 요약 로깅, Ctrl-C 종료 처리
- `uv run python scheduler.py` 실행 문서화

### 6. 프론트엔드 — `/settings` 일정 편집 UI

- `src/lib/types.ts`에 `SendScheduleRow` 타입 추가
- `src/components/schedule-editor.tsx` (신규, client 컴포넌트):
  - `send_schedules`에서 본인 일정 조회 → 없으면 빈 상태
  - 요일 체크박스 7개 (**매핑 주의**: UI 월~일 ↔ 저장 0=월~6=일; JS `getDay()`는 0=일이므로 수동 매핑)
  - 발송 시각 목록: `input type="time"` 추가/삭제 버튼 (값은 `"HH:MM"` 문자열로 변환)
  - 활성화 토글 + 저장(`upsert`, `on_conflict="user_id"` 개념의 `upsert` 호출)
  - 저장 완료/오류 표시
- `src/app/(app)/settings/page.tsx`에 `<ScheduleEditor userId={row.id} />` 추가
- `README.md`(프론트) 문서 갱신: `/settings` 설명에 발송 일정 추가

### 7. 문서 — 루트/백엔드 README

- 스케줄러 실행법(`uv run python scheduler.py`, `--once`, `--dry-run`)
- 발송 일정 동작 설명: 일정 있는 사용자만 발송, 매회 새 요약, 30분 유예 재시도, 신규 기사 없으면 스킵
- 범위 제외에 "토픽별 일정, 사용자별 타임존" 명시

## 검증 계획

1. SQL 마이그레이션 실행 후 `briefings` unique/컬럼, `send_schedules` RLS 정상 확인
2. `uv run python -m compileall` + `import main, scheduler` 통과
3. 테스트: 자신의 일정을 현재+2분으로 설정 → `uv run python scheduler.py --once --dry-run`에서 due 로그 확인 → 실제 실행으로 텔레그램/디스코드 발송 확인
4. 유예창 검증: 일정 시각이 지난 뒤 30분 내 `--once` 재실행 → `sent` dedup으로 미발송 확인, 30분 초과 후 미매칭 확인
5. 신규 기사 없음 슬롯 → "신규 기사 없음(중복)" 스킵 로그 확인
6. `npm run lint` / `npm run build` 통과, `/settings`에서 일정 저장·조회·수정 E2E 확인

## 엣지 케이스 / 리스크

- **JS/Python 요일 인덱스 불일치** (JS `getDay()` 0=일 vs Python `weekday()` 0=월): 저장 포맷은 Python 기준(0=월)으로 통일하고 프론트에서 변환
- **동시 실행 unique 경합**: 스케줄러 틱과 수동 실행 겹침 → unique 위반 예외 로그 후 다음 틱 재시도 (처리 방식: `process_topic`에서 unique 에러 시 기존 브리핑 재조회하도록 방어)
- **발송 누락 방지**: 유예창 판정에 `sent` delivery 존재 여부를 함께 사용해, 실패한 채널만 재시도됨 (기존 채널 단위 dedup 재사용)
- **기존 데이터 호환**: 기존 briefings는 `time_slot=''` — 웹 홈 화면은 그대로 노출되며, 슬롯 브리핑은 같은 날짜에 추가 행으로 표시됨 (날짜 desc 정렬에 time_slot 포함 여부는 선택 사항)
- **프로세스 관리**: 봇들과 동일하게 사용자 머신에서 실행 (nohup/pm2 등은 범위 제외)

## 범위 제외

- 토픽별 일정, 사용자별 타임존, Teams 연동, 웹에서 파이프라인 수동 실행, 브리핑 홈 화면에 슬롯 시각 표시(선택 사항)
