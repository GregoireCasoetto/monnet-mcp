import { apiFetch } from "../client.js";

interface ApiKey {
  id: string;
  key_prefix: string;
  name: string;
  created_at: string;
  last_used_at: string | null;
}

/**
 * Validation tool — calls GET /users/me/api-keys with the user's API key and
 * reports back. Useful for confirming the MCP is correctly authenticated and
 * can reach the backend.
 */
export async function handleWhoami(): Promise<string> {
  const keys = await apiFetch<ApiKey[]>("/users/me/api-keys");
  if (keys.length === 0) {
    return (
      "Connected to Monnet. No active API keys on this account " +
      "(unexpected — the one you're using should be listed)."
    );
  }
  const lines = keys.map((k) => `  - ${k.name} (${k.key_prefix}…)`);
  return `Connected to Monnet with ${keys.length} active API key(s):\n${lines.join("\n")}`;
}

export const WHOAMI_TOOL_DEFINITION = {
  name: "monnet_whoami",
  description:
    "Verify your Monnet MCP connection and list the API keys on your account. " +
    "Useful for debugging setup issues.",
  inputSchema: {
    type: "object" as const,
    properties: {},
    required: [],
  },
};
