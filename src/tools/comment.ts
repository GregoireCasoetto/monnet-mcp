import { z } from "zod";
import { apiPostWithSSE, resolveWorkspaceId } from "../client.js";

const CommentArgs = z.object({
  workspace_slug: z.string().min(1),
  motion_short_id: z.string().min(1),
  content: z.string().min(1).max(10000),
  parent_id: z.string().min(1).optional(),
});

export async function handleComment(args: unknown): Promise<string> {
  const { workspace_slug, motion_short_id, content, parent_id } = CommentArgs.parse(args);
  const wsId = await resolveWorkspaceId(workspace_slug);

  const result = await apiPostWithSSE(
    `/workspaces/${wsId}/motions/${encodeURIComponent(motion_short_id)}/messages`,
    { content, channel: "public", ...(parent_id ? { parent_id } : {}) },
  );

  const parts = [parent_id ? "Reply posted." : "Comment posted."];
  if (result.monnetResponse) {
    parts.push(`\nMonnet replied:\n${result.monnetResponse}`);
  }
  return parts.join("");
}

export const COMMENT_TOOL_DEFINITION = {
  name: "comment",
  description:
    "Post a public comment on a motion, either top-level or as a reply within " +
    "an existing comment thread (pass parent_id). The user is asked to approve " +
    "the message before it is sent — nothing is posted without their explicit " +
    "confirmation. Monnet may respond — if it does, the response is included " +
    "in the return value.",
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
      content: {
        type: "string",
        description: "The comment text (1-10,000 chars).",
      },
      parent_id: {
        type: "string",
        description:
          "Optional id of the top-level comment to reply under — full UUID or " +
          "8-char short id, as shown by get_motion. Omit to post a top-level " +
          "comment. Replies to replies are not allowed (thread depth is 1).",
      },
    },
    required: ["workspace_slug", "motion_short_id", "content"],
  },
};
