# AgentTidy

Find waste and bad practices in AI agents.

Local-first telemetry and linting for chats, MCP servers, skills, tools, and model/resource usage.

It records structural metadata by default—not prompts, tool arguments, or tool results—and turns traces into actionable waste findings.

## Runtime

Node 24+ is recommended. Node 22.13+ is supported but may emit a SQLite experimental warning.

## Start

```bash
npm install
npm run build
npm link
agenttidy serve
```

Open `http://127.0.0.1:4318`.

Wrap an MCP stdio server:

```bash
node dist/src/cli.js mcp --server filesystem --collector http://127.0.0.1:4318 -- npx -y @modelcontextprotocol/server-filesystem .
```

Get a terminal report:

```bash
node dist/src/cli.js report
```

See `GETTING_STARTED.md` for chat/skill instrumentation.

## Rules

- `MCP001` mostly unused tool exposure
- `MCP002` oversized tool schema
- `MCP003` duplicate invocation
- `MCP004` large tool result
- `MCP005` repeated failed call
- `CHAT001` history dominates current turn
- `CHAT002` likely correction tax
- `SKILL001` loaded but unused skill
- `SKILL003` large skill context

Token sizes derived from byte size are explicitly estimates. Provider-reported token counts remain the source of truth when available.
