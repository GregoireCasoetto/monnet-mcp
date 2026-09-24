# Contributing to @monnet/mcp

This covers two things: running the server locally, and publishing a release.

## Running the server locally

Requirements: Node.js 18 or later, and a Monnet API key (`mnk_*`) from
**https://app.monnet.ai/settings** (API Keys tab).

```bash
npm install
npm run build        # compiles src/ to dist/
```

`npm run dev` runs `tsc --watch` instead, rebuilding `dist/` on every save.

The server speaks MCP over stdio, so running `npm start` by itself just sits
waiting for a client on stdin. You can test it in one of two ways.

**With the MCP Inspector** (quickest way to call tools by hand):

```bash
MONNET_API_KEY=mnk_... npx @modelcontextprotocol/inspector node dist/index.js
```

**From a real MCP client**: point it at your build, as described in the
[Local development](./README.md#local-development) section of the README.
Restart the client after each rebuild so it launches the new `dist/index.js`.

Set `MONNET_API_URL` (default `https://api.monnet.ai`) to target a local or
self-hosted backend, e.g. `http://localhost:8000`.

### Adding a tool

Each tool lives in its own file under `src/tools/` and exports a
`*_TOOL_DEFINITION` and a `handle*` function. To wire up a new tool:

1. Register both in `src/index.ts`, in `TOOLS` and in `HANDLERS`.
2. If the tool sends something under the user's identity, add it to the
   approval gate in `src/approval.ts` by adding a preview to
   `SEND_TOOL_PREVIEWS`.
3. Add it to the **Tools** table in the README.

## Publishing a release

A release goes out in two places, and **each one has to be updated on its
own**:

- **npm** (`@monnet/mcp`): this is where `npx -y @monnet/mcp` installs from.
- **The MCP registry** (`ai.monnet/mcp`): the listing is driven by
  `server.json`. Publishing to npm does **not** update it. If you skip this
  step the listing falls behind npm, which has already happened several times
  (see the `git log` for `server.json`).

### 1. Publish to npm

```bash
npm version <patch|minor|major>   # bumps package.json and creates a git tag
npm publish                       # prepublishOnly runs `npm run build` first
git push --follow-tags
```

`publishConfig.access` is already `public`. Only `dist/` and `README.md` go
into the tarball (the `files` field in `package.json`).

### 2. Update the MCP registry listing

In `server.json`, set **both** `version` fields (the top-level one and
`packages[0].version`) to the version you just published to npm. Then commit:

```bash
git commit -am "List <version> on the MCP registry"
```

Then publish with the
[`mcp-publisher`](https://github.com/modelcontextprotocol/registry) CLI. The
`ai.monnet/*` namespace is verified through DNS on `monnet.ai`, so you need
the matching private key:

```bash
mcp-publisher login dns --domain monnet.ai --private-key <key>
mcp-publisher publish
```

The registry only accepts a version that already exists on npm with a
matching `mcpName` (`ai.monnet/mcp` in `package.json`), so publish to npm
first.

**Never commit the signing key, the `mcp-publisher` binary, or
`registry-login.sh`.** `.gitignore` already excludes `key.pem`, `*.pem`,
`mcp-publisher`, and `registry-login.sh`. Keep it that way.

### Known gap: this repository is behind npm

As of September 2026, npm has versions up to `0.9.9`, but `main` still has
`package.json` at `0.2.5` and the matching source: 12 tools, no `bin.js`, no
`test` script, all of which the published `0.9.x` packages have. Releases
since `0.2.5` were built from source that was never pushed here. Before the
next release, push that source to `main` so the steps above build from this
repository.
