"""백엔드 프로세스 통합 실행기.

스케줄러(scheduler.py), 텔레그램 봇(bots.telegram_bot), 디스코드 봇(bots.discord_bot)을
한 번에 실행한다. 자식 프로세스가 비정상 종료되면 재시작하며, Ctrl-C로 모두 종료한다.

    uv run python start.py
"""

import logging
import signal
import subprocess
import sys
import threading
import time
from pathlib import Path
from typing import Any

from config import settings

logger = logging.getLogger("morning-brief-run-all")

BASE_DIR = Path(__file__).resolve().parent


def _build_commands() -> list[tuple[str, list[str]]]:
    cmds = [
        ("스케줄러", [sys.executable, "scheduler.py"]),
        ("텔레그램 봇", [sys.executable, "-m", "bots.telegram_bot"]),
    ]
    if settings.discord_bot_token:
        cmds.append(("디스코드 봇", [sys.executable, "-m", "bots.discord_bot"]))
    else:
        logger.warning("DISCORD_BOT_TOKEN 미설정 - 디스코드 봇은 실행하지 않습니다")
    return cmds


def _pump(proc: subprocess.Popen, name: str) -> None:
    assert proc.stdout is not None
    for line in proc.stdout:
        print(f"[{name}] {line}", end="")


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

    running = True

    def _stop(_signum, _frame) -> None:
        nonlocal running
        running = False

    signal.signal(signal.SIGINT, _stop)
    signal.signal(signal.SIGTERM, _stop)

    children: dict[subprocess.Popen, list[Any]] = {}

    def _spawn(name: str, cmd: list[str], retries: int = 0) -> None:
        proc = subprocess.Popen(
            cmd,
            cwd=BASE_DIR,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
        )
        children[proc] = [name, cmd, retries]
        threading.Thread(target=_pump, args=(proc, name), daemon=True).start()
        logger.info("프로세스 시작: %s (pid=%d)", name, proc.pid)

    for name, cmd in _build_commands():
        _spawn(name, cmd)

    try:
        while running:
            if not running:
                break
            time.sleep(1)
            for proc, (name, cmd, retries) in list(children.items()):
                ret = proc.poll()
                if ret is None:
                    continue
                del children[proc]
                logger.warning("프로세스 종료: %s (코드=%s)", name, ret)
                if not running:
                    continue
                if retries < 5:
                    logger.info("5초 후 재시작: %s (%d번째)", name, retries + 1)
                    time.sleep(5)
                    _spawn(name, cmd, retries + 1)
                else:
                    logger.error("재시작 횟수 초과, 실행 중지: %s", name)
    finally:
        running = False
        for proc in children:
            proc.terminate()
        for proc in children:
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()
    logger.info("모든 프로세스 종료")
    return 0


if __name__ == "__main__":
    sys.exit(main())