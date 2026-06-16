import { z } from "zod";
import { apiFetch, resolveWorkspaceId } from "../client.js";
import { renderMotionList } from "../rendering/motion.js";

const VALID_STATUSES = ["draft", "open", "closed"] as const;

const ListMotionsArgs = z.object({
  workspace_slug: z.string().min(1),
  status: z.enum(VALID_STATUSES).optional(),
  page: z.number().int().min(1).optional(),
  limit: z.number().int().min(1).max(50).optional(),
});

interface MotionListItem {
  id: string;
  summary: string;
  status: string;
  priority: string | null;
  author_name: string;
  created_at: string;
  updated_at: string;
}

interface MotionListResponse {
  motions: MotionListItem[];
  total: number;
}

export async function handleListMotions(args: unknown): Promise<string> {
  const parsed = ListMotionsArgs.parse(args);
  const status = parsed.status ?? "open";
  const page = parsed.page ?? 1;
  const limit = parsed.limit ?? 10;

  const wsId = await resolveWorkspaceId(parsed.workspace_slug);

  const params = new URLSearchParams({
    status,
    page: String(page),
    limit: String(limit),
  });
  const data = await apiFetch<MotionListResponse>(
    `/workspaces/${wsId}/motions?${params.toString()}`,
  );

  return renderMotionList({
    workspace_slug: parsed.workspace_slug,
    status,
    page,
    total: data.total,
    motions: data.motions.map((m) => ({
      short_id: m.id.slice(0, 8),
      summary: m.summary,
      status: m.status,
      priority: m.priority,
      author: m.author_name,
      updated_at: m.updated_at,
    })),
  });
}

export const LIST_MOTIONS_TOOL_DEFINITION = {
  name: "list_motions",
  description:
    "List motions in a workspace, filterable by status. Returns short ids so you can follow up with get_motion on a specific one. " +
    "Default status is 'open'.",
  inputSchema: {
    type: "object" as const,
    properties: {
      workspace_slug: {
        type: "string",
        description: "The workspace slug (e.g. 'monnet-team-410b').",
      },
      status: {
        type: "string",
        description: "Filter by status. Default: open.",
        enum: VALID_STATUSES,
      },
      page: {
        type: "integer",
        description: "Page number (1-based). Default: 1.",
        minimum: 1,
      },
      limit: {
        type: "integer",
        description: "Number of motions per page (1-50). Default: 10.",
        minimum: 1,
        maximum: 50,
      },
    },
    required: ["workspace_slug"],
  },
};
