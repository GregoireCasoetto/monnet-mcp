#!/usr/bin/env node
/**
 * Monnet MCP server — stdio transport.
 *
 * Launched as a subprocess by MCP clients (Claude Desktop, Cursor, etc.).
 * Reads MONNET_API_KEY and MONNET_API_URL from the client's env and proxies
 * each tool call to the Monnet backend.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { handleWhoami, WHOAMI_TOOL_DEFINITION } from "./tools/whoami.js";
import { handleGetMotion, GET_MOTION_TOOL_DEFINITION } from "./tools/get-motion.js";
import { handleListMotions, LIST_MOTIONS_TOOL_DEFINITION } from "./tools/list-motions.js";
import { handleGetInbox, GET_INBOX_TOOL_DEFINITION } from "./tools/get-inbox.js";
import { handleCreateMotion, CREATE_MOTION_TOOL_DEFINITION } from "./tools/create-motion.js";
import { handleUpdateMotion, UPDATE_MOTION_TOOL_DEFINITION } from "./tools/update-motion.js";
import { handleComment, COMMENT_TOOL_DEFINITION } from "./tools/comment.js";
import { handleApprove, APPROVE_TOOL_DEFINITION } from "./tools/approve.js";
import { handleReject, REJECT_TOOL_DEFINITION } from "./tools/reject.js";
import { handleAskMonnet, ASK_MONNET_TOOL_DEFINITION } from "./tools/ask-monnet.js";
import { handleListWorkspaces, LIST_WORKSPACES_TOOL_DEFINITION } from "./tools/list-workspaces.js";
import { requiresSendApproval, requestSendApproval } from "./approval.js";

const TOOLS = [
  WHOAMI_TOOL_DEFINITION,
  LIST_WORKSPACES_TOOL_DEFINITION,
  GET_MOTION_TOOL_DEFINITION,
  LIST_MOTIONS_TOOL_DEFINITION,
  GET_INBOX_TOOL_DEFINITION,
  CREATE_MOTION_TOOL_DEFINITION,
  UPDATE_MOTION_TOOL_DEFINITION,
  COMMENT_TOOL_DEFINITION,
  APPROVE_TOOL_DEFINITION,
  REJECT_TOOL_DEFINITION,
  ASK_MONNET_TOOL_DEFINITION,
];

const HANDLERS: Record<string, (args: unknown) => Promise<string>> = {
  monnet_whoami: handleWhoami,
  list_workspaces: handleListWorkspaces,
  get_motion: handleGetMotion,
  list_motions: handleListMotions,
  get_inbox: handleGetInbox,
  create_motion: handleCreateMotion,
  update_motion: handleUpdateMotion,
  comment: handleComment,
  approve: handleApprove,
  reject: handleReject,
  ask_monnet: handleAskMonnet,
};

const server = new Server(
  { name: "monnet", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const toolName = request.params.name;
  const args = request.params.arguments ?? {};
  const handler = HANDLERS[toolName];

  if (!handler) {
    return {
      content: [{ type: "text", text: `Unknown tool: ${toolName}` }],
      isError: true,
    };
  }

  try {
    if (requiresSendApproval(toolName)) {
      const verdict = await requestSendApproval(server, toolName, args);
      if (!verdict.approved) {
        return { content: [{ type: "text", text: verdict.deniedReason }] };
      }
    }
    const text = await handler(args);
    return { content: [{ type: "text", text }] };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: "text", text: `Error: ${message}` }],
      isError: true,
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
