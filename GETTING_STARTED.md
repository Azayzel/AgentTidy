# Getting started

## 1. Run the collector

```bash
npm install
npm run build
npm link
agenttidy serve
```

The collector binds to localhost and stores data at `~/.agenttidy/telemetry.db`.

## 2. Wrap MCP servers

Change the MCP server command from:

```text
npx -y @modelcontextprotocol/server-filesystem /repo
```

to:

```text
agenttidy mcp --server filesystem --collector http://127.0.0.1:4318 -- npx -y @modelcontextprotocol/server-filesystem /repo
```

For a remote Streamable HTTP MCP server, connect through its URL instead:

```text
agenttidy mcp --server remote --url https://mcp.example.com/mcp --collector http://127.0.0.1:4318
```

Pass authentication headers with repeated `--header 'NAME: VALUE'` options. HTTP mode supports JSON and SSE responses; older HTTP+SSE transport servers are not supported.

Set `AGENT_TRACE_ID` and `AGENT_SESSION_ID` in the parent chat/agent process to correlate MCP activity with a chat.

## 3. Emit chat metrics

Use `createChatTurn()` from `src/sdk.ts`, then POST the span to `/v1/spans`.

Useful fields are `newUserTokens`, `historyTokens`, `systemTokens`, `toolDefinitionTokens`, `skillTokens`, `toolResultTokens`, and optional correction classification.

Do not send raw chat content unless a future explicit diagnostic mode is enabled.

## 4. Inspect

Use the browser dashboard or:

```bash
agenttidy report
agenttidy report --json
agenttidy report --trace <trace-id>
```
