import { z } from "zod";
import { apiFetch, resolveWorkspaceId } from "../client.js";
import { renderMotionDetail } from "../rendering/motion.js";

const GetMotionArgs = z.object({
  workspace_slug: z.string().min(1),
  motion_short_id: z.string().min(1),
});

interface MotionDetailResponse {
  motion: {
    id: string;
    summary: string;
    body: string | null;
    status: string;
    priority: string | null;
    plan: unknown[] | null;
    author_name: string;
    created_at: string;
    updated_at: string;
  };
  workspace_name: string;
  members: Array<{ user_id?: string; name?: string; role?: string; function?: string | null }>;
  motion_members: Array<{ user_id: string; role: string }>;
  messages: Array<{
    id: string;
    parent_id: string | null;
    author_name: string | null;
    message_type: string;
    content: string;
    channel: string;
    created_at: string;
  }>;
}

export async function handleGetMotion(args: unknown): Promise<string> {
  const { workspace_slug, motion_short_id } = GetMotionArgs.parse(args);

  const wsId = await resolveWorkspaceId(workspace_slug);
  const detail = await apiFetch<MotionDetailResponse>(
    `/workspaces/${wsId}/motions/${encodeURIComponent(motion_short_id)}/detail`,
  );

  const { motion, workspace_name, members, motion_members, messages } = detail;

  return renderMotionDetail({
    id: motion.id,
    summary: motion.summary,
    status: motion.status,
    priority: motion.priority,
    body: motion.body,
    plan: motion.plan as any,
    author: motion.author_name,
    created_at: motion.created_at,
    updated_at: motion.updated_at,
    workspace: workspace_name,
    members: members.map((m: any) => ({ user_id: m.user_id, name: m.name, role: m.role, function: m.function })),
    motion_members: motion_members.map((mm) => ({ user_id: mm.user_id, role: mm.role })),
    messages: messages || [],
  });
}

export const GET_MOTION_TOOL_DEFINITION = {
  name: "get_motion",
  description:
    "Read a Monnet motion's full details — summary, body, status, priority, plan steps with assignees, member roles, " +
    "and threaded comments (each comment shows a short id usable as parent_id in the comment tool to reply in its thread). " +
    "Call this when the user references a specific motion by its short id or URL.",
  inputSchema: {
    type: "object" as const,
    properties: {
      workspace_slug: {
        type: "string",
        description:
          "The workspace slug from the motion URL (e.g. 'monnet-team-410b'). Found in the path /<slug>/motions/<short_id>.",
      },
      motion_short_id: {
        type: "string",
        description: "The first 8 characters of the motion UUID, visible in the motion URL.",
      },
    },
    required: ["workspace_slug", "motion_short_id"],
  },
};
