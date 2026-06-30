#!/usr/bin/env bash
# One self-contained task: start dev, loop /api/enrich until the backlog clears,
# then stop dev. Progress is appended to scratchpad/enrich-progress.log.
set -u
cd /home/paul/projects/poptop
SP=/tmp/claude-1000/-home-paul-projects-poptop/e859aef2-96a9-4ae6-8597-0a657b142073/scratchpad
PORT=4353
PROG="$SP/enrich-progress.log"
: > "$PROG"

npx astro dev --port "$PORT" > "$SP/enrich-dev.log" 2>&1 &
DEV=$!
trap 'kill $DEV 2>/dev/null' EXIT

# wait for ready (up to 60s)
for i in $(seq 1 60); do
  curl -s -o /dev/null "http://127.0.0.1:$PORT/" && break
  sleep 1
done
echo "$(date +%T) dev ready (pid $DEV)" >> "$PROG"

empty=0
for n in $(seq 1 600); do
  resp=$(curl -s -X POST "http://127.0.0.1:$PORT/api/enrich?limit=25")
  rem=$(printf '%s' "$resp" | node -e 'try{const d=JSON.parse(require("fs").readFileSync(0));console.log(d.remaining??"ERR")}catch{console.log("ERR")}' 2>/dev/null)
  echo "$(date +%T) iter=$n resp=$resp" >> "$PROG"
  if [ "$rem" = "ERR" ] || [ -z "$rem" ]; then
    empty=$((empty+1)); [ "$empty" -ge 5 ] && { echo "$(date +%T) too many errors, stopping" >> "$PROG"; break; }
    sleep 3; continue
  fi
  empty=0
  [ "$rem" -le 0 ] 2>/dev/null && { echo "$(date +%T) DONE remaining=0" >> "$PROG"; break; }
  sleep 1
done
echo "$(date +%T) loop finished" >> "$PROG"
