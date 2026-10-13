#!/bin/bash
# Run every DB test file against the local copy; print PASS/FAIL counts per file.
D=/var/tmp/crewpg; cd /home/claude/gym-streak-repo/supabase/tests
for f in ${@:-*.sql}; do
  out=$(psql -h $D -p 55432 -U postgres -d crew -v ON_ERROR_STOP=1 -f "$f" 2>&1)
  p=$(echo "$out" | grep -o "PASS" | wc -l); x=$(echo "$out" | grep -o "FAIL[^\\]*" | head -3 | tr '\n' ' ')
  err=$(echo "$out" | grep -v "TESTS" | grep -m1 -E "ERROR" | cut -c1-160)
  echo "$f: pass=$p ${x:+FAIL: $x}${err:+ ERR: $err}"
done
