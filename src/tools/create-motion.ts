import { z } from "zod";
import { apiFetch, resolveWorkspaceId } from "../client.js";

const CreateMotionArgs = z.object({
  workspace_slug: z.string().min(1),
  prompt: z.string().min(1).max(10000),
});

export async function handleCreateMotion(args: unknown): Promise<string> {
  const { workspace_slug, prompt } = CreateMotionArgs.parse(args);
  const wsId = await resolveWorkspaceId(workspace_slug);

  const motion = await apiFetch<{
    id: string;
    summary: string | null;
    status: string;
  }>(`/workspaces/${wsId}/motions/generate`, {
    method: "POST",
    body: JSON.stringify({ prompt }),
  });

  return JSON.stringify(
    {
      id: motion.id,
      short_id: motion.id.slice(0, 8),
      summary: motion.summary,
      status: motion.status,
      url: `https://app.monnet.ai/${workspace_slug}/motions/${motion.id.slice(0, 8)}`,
      note: "Motion is being drafted in the background — call get_motion after a few seconds to read the summary, body, and plan.",
    },
    null,
    2,
  );
}

export const CREATE_MOTION_TOOL_DEFINITION = {
  name: "create_motion",
  description:
    "Create a new draft motion in a Monnet workspace from a free-form prompt. Returns the new motion's id and URL immediately — a background Monnet run drafts the summary, body, and plan over the next few seconds. Call `get_motion` with the returned short_id to inspect the draft.",
  inputSchema: {
    type: "object" as const,
    properties: {
      workspace_slug: {
        type: "string",
        description: "The workspace slug (e.g. 'monnet-team-410b').",
      },
      prompt: {
        type: "string",
        description: "What the motion should accomplish, in the user's own words plus any relevant context. Substance matters — the background Monnet run drafts the full motion from this.",
      },
    },
    required: ["workspace_slug", "prompt"],
  },
};
