/**
 * Approval gate for MCP tools that send messages under the user's identity.
 *
 * No send-type tool call may reach the Monnet backend without the user's
 * explicit go-ahead. The gate uses MCP elicitation: the client (Claude
 * Desktop, Cursor, …) renders a native confirmation dialog to the human user,
 * out of band of the model. If the client does not support elicitation, the
 * gate fails closed — the message is aborted, never sent.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";

/**
 * Send-type tools that require human approval, mapped to a preview builder.
 *
 * The preview is rendered defensively from the raw (not yet validated)
 * arguments so a malformed call still produces a readable prompt; full
 * validation happens in the tool handler after approval.
 *
 * Gating a new send-type tool = one entry here. Read/fetch tools and
 * `ask_monnet` (a private query visible only to the user and Monnet) are
 * intentionally not gated.
 */
const SEND_TOOL_PREVIEWS: Record<string, (args: Record<string, unknown>) => string> = {
  comment: (args) =>
    `Post a PUBLIC comment as you on motion ${str(args.motion_short_id)} ` +
    `in workspace "${str(args.workspace_slug)}":\n\n${str(args.content)}`,
};

function str(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value ?? "(missing)");
}

export function requiresSendApproval(toolName: string): boolean {
  return toolName in SEND_TOOL_PREVIEWS;
}

export interface ApprovalVerdict {
  approved: boolean;
  /** Tool result text explaining why nothing was sent. Empty when approved. */
  deniedReason: string;
}

const NOT_SENT_PREFIX = "Message NOT sent — ";
const DO_NOT_RETRY =
  " Do not retry this call unless the user explicitly asks you to send it again.";

// Humans read and decide; give them more than the SDK's 60s default.
const APPROVAL_TIMEOUT_MS = 5 * 60_000;

/**
 * Ask the human user (via client-side elicitation) to approve an outbound
 * message. Anything other than an explicit accept-with-confirm is a denial.
 */
export async function requestSendApproval(
  server: Server,
  toolName: string,
  args: Record<string, unknown>,
): Promise<ApprovalVerdict> {
  if (!server.getClientCapabilities()?.elicitation) {
    return {
      approved: false,
      deniedReason:
        NOT_SENT_PREFIX +
        "this MCP client does not support elicitation, so Monnet cannot ask " +
        "the user for approval. Sending messages on the user's behalf " +
        "requires their explicit confirmation. Ask the user to post the " +
        "message themselves in the Monnet web app." +
        DO_NOT_RETRY,
    };
  }

  let result;
  try {
    result = await server.elicitInput(
      {
        message:
          "Monnet MCP is about to send a message on your behalf.\n\n" +
          SEND_TOOL_PREVIEWS[toolName](args) +
          "\n\nApprove sending this message?",
        requestedSchema: {
          type: "object",
          properties: {
            confirm: {
              type: "boolean",
              title: "Send this message",
              description: "Check to approve sending the message under your identity.",
            },
          },
          required: ["confirm"],
        },
      },
      { timeout: APPROVAL_TIMEOUT_MS },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      approved: false,
      deniedReason:
        NOT_SENT_PREFIX + `the approval prompt failed (${message}).` + DO_NOT_RETRY,
    };
  }

  if (result.action === "accept" && result.content?.confirm === true) {
    return { approved: true, deniedReason: "" };
  }

  return {
    approved: false,
    deniedReason:
      NOT_SENT_PREFIX +
      (result.action === "decline"
        ? "the user declined the approval prompt."
        : result.action === "cancel"
          ? "the user dismissed the approval prompt without answering."
          : "the user did not confirm sending.") +
      DO_NOT_RETRY,
  };
}
