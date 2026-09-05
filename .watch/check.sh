#!/bin/bash
# Un seul instantané sert à la fois au diff ET à la baseline : rien ne peut être
# absorbé silencieusement entre les deux.
cd "$(dirname "$0")/.."
./.watch/snapshot.sh > /tmp/watch-now.txt 2>&1
if diff -q .watch/baseline.txt /tmp/watch-now.txt >/dev/null; then
  echo "aucun changement"
else
  echo "=== DIFF ==="
  diff .watch/baseline.txt /tmp/watch-now.txt
  cp /tmp/watch-now.txt .watch/baseline.txt   # exactement le fichier qui a servi au diff
fi
