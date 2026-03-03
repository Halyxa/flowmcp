# Lean Heartbeat Prompts

**Category**: meta
**Created**: 2026-02-11 (cycle 2)
**Times reused**: 0

## Trigger

When heartbeat agent burns all turns reading context files without completing the task.

## Solution

Inline state directly in the prompt (pre-read `state.json` in bash, inject as text). Add skip logic for impossible tasks (SSH, credentials). Cut philosophical identity text -- rules + state + scope only.

## Key insight

Lean prompts beat philosophical prompts for autonomous agents. Every turn spent reading files is a turn not spent building.

## Files affected

- `.autodev/heartbeat.sh`
