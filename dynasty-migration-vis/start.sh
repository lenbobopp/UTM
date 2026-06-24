#!/bin/bash
# 本地启动离线版（需要一个静态服务器，不能直接 file:// 打开，否则 fetch 会被浏览器拦截）。
cd "$(dirname "$0")"
PORT="${1:-8848}"
echo "CBDB 仕途流场（离线版）启动中..."
echo "请在浏览器打开： http://localhost:${PORT}/"
echo "（Ctrl+C 停止）"
if command -v python3 >/dev/null 2>&1; then
  python3 -m http.server "$PORT"
elif command -v python >/dev/null 2>&1; then
  python -m SimpleHTTPServer "$PORT"
elif command -v npx >/dev/null 2>&1; then
  npx --yes serve -l "$PORT" .
else
  echo "未找到 python 或 npx，请自行用任意静态服务器把本目录作为根目录。" >&2
  exit 1
fi
