# @monnet/mcp

Model Context Protocol (MCP) server for [Monnet](https://monnet.ai).

Exposes motions, plans, and approvals to MCP-compatible clients (Claude Desktop, Cursor, etc.) so you can work with your Monnet workspace from your terminal without leaving your AI assistant.

## Install

Add this to your MCP client config (e.g. `~/Library/Application Support/Claude/claude_desktop_config.json` for Claude Desktop):

```json
{
  "mcpServers": {
    "monnet": {
      "command": "npx",
      "args": ["-y", "@monnet/mcp"],
      "env": {
        "MONNET_API_KEY": "mnk_..."
      }
    }
  }
}
```

Generate an API key at **https://app.monnet.ai/settings** (API Keys tab).

## Environment variables

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `MONNET_API_KEY` | yes | — | API key (`mnk_*`), sent as the `X-API-Key` header on every request |
| `MONNET_API_URL` | no | `https://api.monnet.ai` | Override for self-hosted or local dev backends |

## Tools

| Tool | Purpose |
|---|---|
| `monnet_whoami` | Verify the connection and list the API keys on your account |
| `list_workspaces` | List the workspaces you belong to |
| `get_inbox` | Fetch your inbox |
| `list_motions` | List motions in a workspace |
| `get_motion` | Read a motion — summary, body, plan, members, comments |
| `create_motion` | Create a new draft motion from a free-form prompt |
| `update_motion` | Update a motion's summary, body, priority, or plan |
| `comment` | Post a comment on a motion (approval-gated, see below) |
| `approve` | Approve a plan step |
| `reject` | Reject a plan step (with an optional reason) |
| `ask_monnet` | Ask Monnet a question on a motion |

## Approval gate on send actions

Tools that send a message under your identity (e.g. `comment`) never dispatch automatically. Before the message leaves the MCP server, your client shows a confirmation dialog (MCP elicitation) with a preview; nothing is sent unless you explicitly approve. If your MCP client does not support elicitation, the send is aborted — the gate fails closed.

## Local development

```bash
npm install
npm run build
```

Point your MCP client at the local build:

```json
{
  "mcpServers": {
    "monnet": {
      "command": "node",
      "args": ["/absolute/path/to/monnet-mcp/dist/index.js"],
      "env": {
        "MONNET_API_KEY": "mnk_...",
        "MONNET_API_URL": "http://localhost:8000"
      }
    }
  }
}
```

Restart your MCP client after editing the config.

## License

[MIT](./LICENSE)
