#!/usr/bin/env bash
# 모닝브리프 백엔드 재기동 스크립트
# 기존 start.py(통합 실행기: 스케줄러 + 텔레그램/디스코드 봇)를 종료하고 새로 시작합니다.
# 사용: ./start.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# 1) 기존 실행 중인 start.py 종료 (SIGTERM → start.py가 자식 프로세스도 정리)
if pkill -f "python.*start\.py" 2>/dev/null; then
  echo "기존 start.py 프로세스를 종료했습니다."
  sleep 2
else
  echo "실행 중인 start.py 프로세스가 없습니다. (최초 시작)"
fi

# 2) 로그 디렉터리/파일 준비
LOG_DIR="${SCRIPT_DIR}/logs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/backend.log"

# 3) 백그라운드로 실행 (로그는 파일에 기록, 터미널 종료와 무관하게 유지)
nohup uv run python start.py >>"$LOG_FILE" 2>&1 &
PID=$!

echo "백엔드 재기동 완료 (pid=$PID)"
echo "로그: $LOG_FILE"
echo "종료: kill $PID (또는 start.py에 SIGTERM 전송)"
