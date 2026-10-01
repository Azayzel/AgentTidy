# Plan

## Goal

Attribute AI cost and resource waste to chats, models, skills, MCP servers, tools, and downstream operations without requiring raw conversation storage.

## Phase 0 — foundation

- [x] Shared trace/span contract
- [x] Local SQLite store
- [x] Local HTTP collector
- [x] Transparent stdio MCP wrapper
- [x] Metadata-only hashing/size capture
- [x] MCP/chat/skill lint rules
- [x] CLI report
- [x] Minimal local dashboard
- [x] Unit tests

## Phase 1 — reliable attribution

- [ ] TypeScript SDK package for chat/model/skill instrumentation
- [ ] OpenTelemetry exporter/importer
- [ ] Provider token/cost adapters; keep pricing outside persisted usage
- [ ] Tool-definition tokens measured at each LLM request
- [ ] Cache-hit, retry, latency, HTTP, DB, CPU, and memory resource spans
- [ ] Per-rule configurable thresholds and suppressions
- [ ] Trace/session drill-down API

## Phase 2 — developer workflow

- [ ] Thin VS Code extension using the local collector
- [ ] Live session status and inline findings
- [ ] MCP configuration helper
- [ ] CI command with budgets and rule gates
- [ ] Export SARIF/JSON for existing engineering systems

## Phase 3 — organization

- [ ] OTLP/HTTPS forwarding to an organization collector
- [ ] Teams/projects/developers with pseudonymous IDs
- [ ] Retention and redaction policies
- [ ] Fleet dashboards and trend baselines
- [ ] Rule packs and organization policy

## Quality bar

Cross-platform Node, no runtime framework dependency, metadata-first privacy, deterministic rules, explicit estimates, small public interfaces, and tests for every waste rule.
