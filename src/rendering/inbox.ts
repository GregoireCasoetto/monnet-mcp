const PRIORITY_ORDER: Record<string, number> = {
  critical: 0,
  normal: 1,
  low: 2,
};

const PRIORITY_LABELS: Record<string, string> = {
  critical: "🔴 critical",
  normal: "🟢 normal",
  low: "⚪ low",
};

interface InboxMotion {
  short_id: string;
  summary: string;
  status: string;
  priority: string | null;
  workspace: string;
  workspace_slug: string;
  last_activity: string | null;
  last_activity_at: string | null;
  is_unread: boolean;
}

interface InboxData {
  total: number;
  page: number;
  motions: InboxMotion[];
}

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function renderInbox(data: InboxData): string {
  const lines: string[] = [];

  lines.push(`## 📥 Inbox — ${data.total} motion(s)`);
  lines.push("");

  if (data.motions.length === 0) {
    lines.push("Nothing needs your attention right now. ✅");
    return lines.join("\n");
  }

  // Sort: critical first, then by last activity (most recent first)
  const sorted = [...data.motions].sort((a, b) => {
    const pa = PRIORITY_ORDER[a.priority || "normal"] ?? 1;
    const pb = PRIORITY_ORDER[b.priority || "normal"] ?? 1;
    if (pa !== pb) return pa - pb;
    const ta = a.last_activity_at || "";
    const tb = b.last_activity_at || "";
    return tb.localeCompare(ta);
  });

  // Markdown table
  lines.push("| # | Summary | Workspace | Priority | Last activity | When | Link |");
  lines.push("|---|---------|-----------|----------|---------------|------|------|");

  sorted.forEach((m, i) => {
    const priority = PRIORITY_LABELS[m.priority || "normal"] || "";
    const activity = m.last_activity || "";
    const ago = timeAgo(m.last_activity_at);
    const url = `https://app.monnet.ai/${m.workspace_slug}/motions/${m.short_id}`;

    lines.push(
      `| ${i + 1} | ${m.summary} | ${m.workspace} | ${priority} | ${activity} | ${ago} | ${url} |`,
    );
  });

  if (data.total > data.motions.length) {
    lines.push("");
    lines.push(
      `_Page ${data.page} of ${Math.ceil(data.total / data.motions.length)}. Pass \`page\` to see more._`,
    );
  }

  return lines.join("\n");
}
