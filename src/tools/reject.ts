import { z } from "zod";
import { apiFetch, resolveWorkspaceId } from "../client.js";

const RejectArgs = z.object({
  workspace_slug: z.string().min(1),
  motion_short_id: z.string().min(1),
  step_index: z.number().int().min(0),
  reason: z.string().max(2000).optional(),
});

export async function handleReject(args: unknown): Promise<string> {
  const { workspace_slug, motion_short_id, step_index, reason } = RejectArgs.parse(args);
  const wsId = await resolveWorkspaceId(workspace_slug);

  const result = await apiFetch<{ ok: boolean; plan: unknown[] }>(
    `/workspaces/${wsId}/motions/${encodeURIComponent(motion_short_id)}/plan/steps/${step_index}/reject`,
    {
      method: "POST",
      body: JSON.stringify({ reason: reason || "" }),
    },
  );

  return result.ok
    ? `Step ${step_index} rejected${reason ? ` (reason: ${reason})` : ""}. Plan now has ${result.plan.length} step(s).`
    : "Rejection failed.";
}

export const REJECT_TOOL_DEFINITION = {
  name: "reject",
  description:
    "Reject a plan step on a motion, with an optional reason. Requires editor role on the motion. " +
    "Use get_motion first to see the plan and identify the step_index (0-based).",
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
      step_index: {
        type: "integer",
        description: "0-based index of the plan step to reject.",
        minimum: 0,
      },
      reason: {
        type: "string",
        description: "Optional reason for rejection (max 2,000 chars).",
      },
    },
    required: ["workspace_slug", "motion_short_id", "step_index"],
  },
};
