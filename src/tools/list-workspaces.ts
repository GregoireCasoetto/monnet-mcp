import { apiFetch } from "../client.js";

interface SidebarWorkspace {
  id: string;
  name: string;
  slug: string;
}

interface SidebarResponse {
  workspaces: SidebarWorkspace[];
}

export async function handleListWorkspaces(): Promise<string> {
  const data = await apiFetch<SidebarResponse>("/workspaces/sidebar");

  if (data.workspaces.length === 0) {
    return "You are not a member of any Monnet workspace.";
  }

  const lines = ["## Your workspaces", ""];
  for (const ws of data.workspaces) {
    lines.push(`- **${ws.name}** (slug: \`${ws.slug}\`)`);
  }
  return lines.join("\n");
}

export const LIST_WORKSPACES_TOOL_DEFINITION = {
  name: "list_workspaces",
  description:
    "List all Monnet workspaces you are a member of. Returns the workspace name and slug " +
    "needed by other tools (get_motion, list_motions, create_motion, etc.). " +
    "Call this first if you don't know the workspace slug.",
  inputSchema: {
    type: "object" as const,
    properties: {},
    required: [],
  },
};
