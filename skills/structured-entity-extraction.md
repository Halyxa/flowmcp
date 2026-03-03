# Structured Entity Extraction

**Category**: hardening
**Created**: 2026-02-12
**Times reused**: 1

## Trigger

When using regex to extract patterns that contain sentence-splitting characters (periods in emails/URLs).

## Solution

Run structured pattern extraction on the FULL text, not on sentence-split fragments. Sentence splitting with `text.split(/[.!?]+/)` destroys emails (`alice@example.com`) and URLs (`https://foo.bar`) at period boundaries. Approximate sentence index from character position for co-mention tracking.

## Anti-pattern

Running email/URL regex on `sentence.split('.')` fragments -- the pattern is broken across fragments and never matches.

## Source

flow-mcp session 09 -- heartbeat-written email extraction tests failed because sentence splitting broke `alice@example.com` into `alice@example` and `com`.

## Files affected

- `src/index.ts`
