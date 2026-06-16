import { z } from "zod";
import { apiPostWithSSE, resolveWorkspaceId, getCurrentUserId } from "../client.js";

const AskMonnetArgs = z.object({
  workspace_slug: z.string().min(1),
  motion_short_id: z.string().min(1),
  question: z.string().min(1).max(10000),
});

export async function handleAskMonnet(args: unknown): Promise<string> {
  const { workspace_slug, motion_short_id, question } = AskMonnetArgs.parse(args);
  const wsId = await resolveWorkspaceId(workspace_slug);
  const userId = await getCurrentUserId();

  const result = await apiPostWithSSE(
    `/workspaces/${wsId}/motions/${encodeURIComponent(motion_short_id)}/messages`,
    { content: question, channel: `private:${userId}` },
  );

  if (result.monnetResponse) {
    return result.monnetResponse;
  }
  return "(Monnet did not respond — this is unexpected for a private message. The question was posted successfully.)";
}

export const ASK_MONNET_TOOL_DEFINITION = {
  name: "ask_monnet",
  description:
    "Ask Monnet a question in the context of a specific motion. " +
    "The question is sent as a private message (only you and Monnet see it). " +
    "Monnet's response is returned directly.",
  inputSchema: {
    type: "object" as const,
    properties: {
      workspace_slug: {
        type: "string",
        description: "The workspace slug.",
      },
      motion_short_id: {
        type: "string",
        description: "The first 8 characters of the motion UUID.",
      },
      question: {
        type: "string",
        description: "Your question for Monnet (1-10,000 chars).",
      },
    },
    required: ["workspace_slug", "motion_short_id", "question"],
  },
};
