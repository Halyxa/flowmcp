# Integration Tests for Entity Extraction

**Category**: testing
**Created**: 2026-02-12 (cycle 7)
**Times reused**: 0
**Skills reused**: structured-entity-extraction, mcp-schema-mismatch

## Trigger

When adding integration tests for entity extraction (emails, URLs, hashtags, mentions, orgs) via MCP protocol.

## Solution

Use separate test cases per entity type. Each test provides text rich in ONE entity type plus proper nouns for co-mention edges. Check `extraction_summary.entity_types` counts AND `top_entities` array for presence. Validate confidence is number 0-1 and types is array.

Use structured-entity-extraction skill insight: emails/URLs survive because extraction runs on full text, not sentence fragments.

## Files affected

- `src/integration.test.ts`
