import { z } from "zod";
import { apiFetch, resolveWorkspaceId } from "../client.js";

const ApproveArgs = z.object({
  workspace_slug: z.string().min(1),
  motion_short_id: z.string().min(1),
  step_index: z.number().int().min(0),
});

export async function handleApprove(args: unknown): Promise<string> {
  const { workspace_slug, motion_short_id, step_index } = ApproveArgs.parse(args);
  const wsId = await resolveWorkspaceId(workspace_slug);

  const result = await apiFetch<{ ok: boolean; plan: unknown[] }>(
    `/workspaces/${wsId}/motions/${encodeURIComponent(motion_short_id)}/plan/steps/${step_index}/approve`,
    { method: "POST" },
  );

  return result.ok
    ? `Step ${step_index} approved. Plan now has ${result.plan.length} step(s).`
    : "Approval failed.";
}

export const APPROVE_TOOL_DEFINITION = {
  name: "approve",
  description:
    "Approve a plan step on a motion. Requires editor role on the motion. " +
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
        description: "0-based index of the plan step to approve.",
        minimum: 0,
      },
    },
    required: ["workspace_slug", "motion_short_id", "step_index"],
  },
};
