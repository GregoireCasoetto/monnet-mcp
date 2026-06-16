import { z } from "zod";
import { apiFetch } from "../client.js";
import { renderInbox } from "../rendering/inbox.js";

const GetInboxArgs = z.object({
  page: z.number().int().min(1).optional(),
  limit: z.number().int().min(1).max(50).optional(),
});

interface ForYouMotion {
  id: string;
  summary: string;
  status: string;
  priority: string | null;
  workspace_name: string;
  workspace_slug: string;
  last_activity_summary: string | null;
  last_activity_at: string | null;
  is_unread: boolean;
}

interface ForYouResponse {
  motions: ForYouMotion[];
  total: number;
}

export async function handleGetInbox(args: unknown): Promise<string> {
  const parsed = GetInboxArgs.parse(args);
  const page = parsed.page ?? 1;
  const limit = parsed.limit ?? 10;

  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  });
  const data = await apiFetch<ForYouResponse>(`/motions/for-you?${params.toString()}`);

  return renderInbox({
    total: data.total,
    page,
    motions: data.motions.map((m) => ({
      short_id: m.id.slice(0, 8),
      summary: m.summary,
      status: m.status,
      priority: m.priority,
      workspace: m.workspace_name,
      workspace_slug: m.workspace_slug,
      last_activity: m.last_activity_summary,
      last_activity_at: m.last_activity_at,
      is_unread: m.is_unread,
    })),
  });
}

export const GET_INBOX_TOOL_DEFINITION = {
  name: "get_inbox",
  description:
    "Fetch the user's 'For You' feed — motions across all their workspaces that need attention " +
    "(pending approvals, unread activity, assigned steps). Use this when the user asks " +
    "'what's on my plate', 'what needs my attention', or similar.",
  inputSchema: {
    type: "object" as const,
    properties: {
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
    required: [],
  },
};
