# Decisions

## D-001 — TypeScript core

Use TypeScript/Node so collector, SDK, MCP tooling, and future VS Code extension share contracts and code. Target Node 22.13+ on Windows, macOS, and Linux.

## D-002 — Local-first architecture

The local collector is the default trust boundary. Organization forwarding is optional and later.

## D-003 — Metadata by default

Do not persist prompt text, tool arguments, tool definitions, or tool result bodies. Persist hashes, sizes, counts, timings, classifications, and explicit usage metrics.

## D-004 — Chat/session is the root correlation unit

Use `traceId` for a chat/agent run and `sessionId` for the logical session. MCP and skill spans inherit these IDs.

## D-005 — Measured vs estimated

Provider token counters and billed cost are measured inputs. Byte-to-token conversion and avoidable usage are labeled estimates with confidence.

## D-006 — Transparent MCP wrapping

The stdio proxy forwards bytes unchanged and observes newline-delimited JSON-RPC messages out-of-band.

## D-007 — Small storage interface

Persist through `SpanStore`; SQLite is the first implementation. This keeps cloud/OTLP backends replaceable.

## D-008 — No embedded provider prices

Pricing changes independently of telemetry. Persist usage and optional provider-reported cost; add pricing adapters separately.

## D-009 — Rules are deterministic first

Start with explainable lint rules. Semantic/LLM classifiers may enrich signals later but cannot be required for baseline analysis.

## D-010 — Local server binds to loopback

Default collector host is `127.0.0.1`. Remote/team deployment requires an explicit later auth/security design.

## D-011 — Built-in SQLite, isolated behind `SpanStore`

Use `node:sqlite` to avoid a runtime native dependency. Node 24+ is recommended; Node 22.13+ works but may emit an experimental SQLite warning. The store interface keeps migration low-risk if this changes.

## D-012 — AgentTidy project name

Use **AgentTidy** for the project and `agenttidy` for the CLI/package. The name stays broad enough for chats, MCP, skills, tools, and model/resource analysis rather than implying token-only metering.
