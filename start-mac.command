#!/bin/bash
# Metal Calendar - 더블클릭으로 실행 (Mac)
cd "$(dirname "$0")"
exec python3 mac/server.py
