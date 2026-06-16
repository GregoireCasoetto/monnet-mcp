import { z } from "zod";
import { apiFetch, resolveWorkspaceId } from "../client.js";

const PlanStepSchema = z.object({
  content: z.string(),
  status: z.enum(["pending", "in_progress", "done"]),
  assignees: z.array(z.string()).optional().default([]),
  approval: z.boolean().optional().default(false),
  approved_by: z.array(z.string()).optional().default([]),
});

const UpdateMotionArgs = z.object({
  workspace_slug: z.string().min(1),
  motion_short_id: z.string().min(1),
  summary: z.string().min(1).max(500).optional(),
  body: z.string().min(1).max(50000).optional(),
  priority: z.enum(["critical", "normal", "low"]).optional(),
  plan: z.array(PlanStepSchema).optional(),
});

export async function handleUpdateMotion(args: unknown): Promise<string> {
  const parsed = UpdateMotionArgs.parse(args);
  const wsId = await resolveWorkspaceId(parsed.workspace_slug);
  const motionPath = `/workspaces/${wsId}/motions/${encodeURIComponent(parsed.motion_short_id)}`;
  const results: string[] = [];

  // Update metadata (summary/body/priority) if any provided
  const metaFields: Record<string, unknown> = {};
  if (parsed.summary !== undefined) metaFields.summary = parsed.summary;
  if (parsed.body !== undefined) metaFields.body = parsed.body;
  if (parsed.priority !== undefined) metaFields.priority = parsed.priority;

  if (Object.keys(metaFields).length > 0) {
    await apiFetch(motionPath, {
      method: "PATCH",
      body: JSON.stringify(metaFields),
    });
    results.push(`Updated ${Object.keys(metaFields).join(", ")}.`);
  }

  // Update plan if provided
  if (parsed.plan) {
    await apiFetch(`${motionPath}/plan`, {
      method: "PATCH",
      body: JSON.stringify({ steps: parsed.plan }),
    });
    results.push(`Updated plan (${parsed.plan.length} step(s)).`);
  }

  if (results.length === 0) {
    return "Nothing to update — provide at least one of: summary, body, priority, or plan.";
  }

  return results.join(" ");
}

export const UPDATE_MOTION_TOOL_DEFINITION = {
  name: "update_motion",
  description:
    "Update a motion's summary, body, priority, or plan. All fields are optional — " +
    "only include the ones you want to change. For plan updates, provide the full list " +
    "of steps (use get_motion first to see the current plan, then modify and send it back).",
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
      summary: {
        type: "string",
        description: "New summary (1-500 chars). Optional.",
      },
      body: {
        type: "string",
        description: "New body in markdown (1-50,000 chars). Optional.",
      },
      priority: {
        type: "string",
        description: "New priority. Optional.",
        enum: ["critical", "normal", "low"],
      },
      plan: {
        type: "array",
        description:
          "Full replacement plan — array of step objects. Each step: {content, status, assignees?, approval?, approved_by?}. Optional.",
        items: {
          type: "object",
          properties: {
            content: { type: "string" },
            status: { type: "string", enum: ["pending", "in_progress", "done"] },
            assignees: { type: "array", items: { type: "string" } },
            approval: { type: "boolean" },
            approved_by: { type: "array", items: { type: "string" } },
          },
          required: ["content", "status"],
        },
      },
    },
    required: ["workspace_slug", "motion_short_id"],
  },
};
