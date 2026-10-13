#!/bin/bash
# Rebuild the private local CREW database from the repo's migrations (Supabase-only lines skipped).
D=/var/tmp/crewpg; P="psql -h $D -p 55432 -U postgres"
$P -q -c "drop database if exists crew" -c "create database crew" 2>/dev/null
$P -d crew -q -v ON_ERROR_STOP=1 -f $D/stubs.sql 2>/dev/null >/dev/null || { echo "stubs failed"; exit 1; }
cd /home/claude/gym-streak-repo/supabase
for f in schema.sql $(ls 0*.sql | sort) "$@"; do
  case "$f" in 026_*|027_*|028_*|029_*) [[ " $* " == *" $f "* ]] || continue;; esac
  out=$(sed -E '/create extension/I d' "$f" | $P -d crew -q -v ON_ERROR_STOP=1 2>&1 | grep -iE "^psql.*error|ERROR" | head -2)
  [ -n "$out" ] && echo "$f: $out"
done
echo "rebuilt"
