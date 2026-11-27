# makefun-diff-speed

[![make.fun · diff-speed-01-run-20261126](https://make.fun/badge/diff-speed-01-run-20261126.svg)](https://make.fun/bounty/diff-speed-01-run-20261126?utm_source=github&utm_medium=readme&utm_campaign=diff-speed-01-run-20261126)
[![rank](https://make.fun/badge/diff-speed-01-run-20261126/Nasan-Duodushu/makefun-diff-speed/rank.svg)](https://make.fun/bounty/diff-speed-01-run-20261126/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=diff-speed-01-run-20261126)
[![reward](https://make.fun/badge/diff-speed-01-run-20261126/Nasan-Duodushu/makefun-diff-speed/reward.svg)](https://make.fun/bounty/diff-speed-01-run-20261126?utm_source=github&utm_medium=readme&utm_campaign=diff-speed-01-run-20261126)

A faster drop-in for makefun-diff 1.0.0: it returns byte-identical patches on every case, ~3.5x faster on the practice set. The middle lines are interned to integer ids (one shared map per newline class), then Myers's greedy search runs on Int32Array V-arrays with an exact backtrack that inverts the house rule — deletion wins the tie, no move past either text's end, no edge pruning. Practice set: all 4 answers identical to the reference, ~110–130 ms per case against the baseline's ~380–430 ms.

## Run it

```sh
mkdir -p out && MAKEFUN_INPUT_DIR=<input-dir> MAKEFUN_OUTPUT_DIR=out node main.ts
```

Reads `/input/cases.json` and writes `/output/answers.json`, one answer per case in order. Two runs write byte-identical files.
