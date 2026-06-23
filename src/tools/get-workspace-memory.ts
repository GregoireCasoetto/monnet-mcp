import { z } from "zod";
import { apiFetch } from "../client.js";

const GetWorkspaceMemoryArgs = z.object({
  workspace_slug: z.string().min(1),
});

interface WorkspaceResponse {
  name: string;
  slug: string;
  memory_content: string | null;
}

export async function handleGetWorkspaceMemory(args: unknown): Promise<string> {
  const { workspace_slug } = GetWorkspaceMemoryArgs.parse(args);

  const ws = await apiFetch<WorkspaceResponse>(
    `/workspaces/by-slug/${encodeURIComponent(workspace_slug)}`,
  );

  if (!ws.memory_content || !ws.memory_content.trim()) {
    return `No MEMORY.md has been synthesized yet for **${ws.name}** (slug: \`${ws.slug}\`). It is generated automatically as motions close.`;
  }

  return [
    `## MEMORY.md — ${ws.name} (slug: \`${ws.slug}\`)`,
    "",
    ws.memory_content.trim(),
  ].join("\n");
}

export const GET_WORKSPACE_MEMORY_TOOL_DEFINITION = {
  name: "get_workspace_memory",
  description:
    "Read a Monnet workspace's MEMORY.md — a concise, auto-synthesized digest of the workspace's " +
    "priorities, product decisions, recurring patterns, open threads, and team context, distilled from " +
    "closed motions. Use it to ground yourself in what the team already cares about and has decided, " +
    "without re-reading every motion.",
  inputSchema: {
    type: "object" as const,
    properties: {
      workspace_slug: {
        type: "string",
        description:
          "The workspace slug (e.g. 'monnet-team-410b'). Call list_workspaces first if you don't know it.",
      },
    },
    required: ["workspace_slug"],
  },
};
