const STATUS_ICONS: Record<string, string> = {
  pending: "⏳",
  in_progress: "🔄",
  done: "✅",
};

const PRIORITY_DOTS: Record<string, string> = {
  critical: "🔴",
  normal: "●",
  low: "○",
};

// V2 plan tree (see backend domain/entities/plan.py). The API always returns
// the normalized V2 shape — every item is discriminated on `kind`.
interface PlanStep {
  kind?: "step";
  content: string;
  status: string;
  assignee?: string | null;
  step_type?: "task" | "approval" | "decision" | "interview";
  approved_by?: string | null;
}

interface PlanGroup {
  kind: "group";
  title: string;
  execution?: "parallel" | "sequential";
  children: PlanItem[];
}

type PlanItem = PlanStep | PlanGroup;

function isGroup(item: PlanItem): item is PlanGroup {
  return (item as PlanGroup).kind === "group";
}

interface MotionDetail {
  id: string;
  summary: string;
  status: string;
  priority: string | null;
  body: string | null;
  plan: PlanItem[] | null;
  author: string;
  created_at: string;
  updated_at: string;
  workspace: string;
  members: Array<{ user_id?: string; name?: string; role?: string; function?: string | null }>;
  motion_members: Array<{ user_id: string; role: string }>;
  messages: Array<{
    id?: string;
    parent_id?: string | null;
    author_name: string | null;
    message_type: string;
    content: string;
    channel: string;
    created_at: string;
  }>;
}

const DIVIDER = "━━━━━━━━━━━━━━━━━━━━━━━━━━━━";

function padRight(str: string, len: number): string {
  return str.length >= len ? str : str + " ".repeat(len - str.length);
}

// Render the plan tree recursively. Groups print their title + execution mode
// and recurse into their children; steps print status icon, content, assignee
// and an approval lock. Numbering is hierarchical (1, 2, 2.1, 2.2, …).
function renderPlanItems(
  items: PlanItem[],
  nameMap: Map<string, string>,
  lines: string[],
  depth: number,
  prefix: string,
): void {
  const indent = "  ".repeat(depth + 1);
  items.forEach((item, i) => {
    const number = `${prefix}${i + 1}`;
    if (isGroup(item)) {
      const exec = item.execution ? `  (${item.execution})` : "";
      lines.push(`${indent}${number}. 📂  ${item.title}${exec}`);
      renderPlanItems(item.children || [], nameMap, lines, depth + 1, `${number}.`);
    } else {
      const icon = STATUS_ICONS[item.status] || "⏳";
      const assigneeStr = item.assignee
        ? `  → ${nameMap.get(item.assignee) || item.assignee}`
        : "";
      const lock = item.step_type === "approval" ? " 🔒" : "";
      lines.push(`${indent}${number}. ${icon}  ${item.content}${assigneeStr}${lock}`);
    }
  });
}

export function renderMotionDetail(data: MotionDetail): string {
  const priority = data.priority || "normal";
  const dot = PRIORITY_DOTS[priority] || "●";
  const status = data.status.toUpperCase();

  // Build user_id → name map from workspace members
  const nameMap = new Map<string, string>();
  for (const m of data.members) {
    if (m.user_id && m.name) {
      nameMap.set(m.user_id, m.name);
    }
  }

  // Build user_id → motion role map (editor / commenter)
  const motionRoleMap = new Map<string, string>();
  for (const mm of data.motion_members) {
    motionRoleMap.set(mm.user_id, mm.role);
  }

  const lines: string[] = [];

  // Header
  lines.push(DIVIDER);
  lines.push(`📋  ${data.summary}   [${status}]  ${dot}  ${priority}`);
  lines.push(`Space: ${data.workspace}`);
  lines.push(DIVIDER);

  // Body
  if (data.body) {
    lines.push("");
    lines.push("BODY");
    for (const bodyLine of data.body.split("\n")) {
      lines.push(`  ${bodyLine}`);
    }
  }

  // Plan
  if (data.plan && data.plan.length > 0) {
    lines.push("");
    lines.push("PLAN");
    renderPlanItems(data.plan, nameMap, lines, 0, "");
  }

  // Members — show motion-level roles (editor/commenter) when available,
  // fall back to workspace role (owner/member) otherwise.
  if (data.members.length > 0) {
    lines.push("");
    lines.push("MEMBERS");
    const maxNameLen = Math.max(...data.members.map((m) => (m.name || "").length));
    for (const m of data.members) {
      const name = padRight(m.name || "Unknown", maxNameLen + 2);
      const role = (m.user_id && motionRoleMap.get(m.user_id)) || m.role || "member";
      lines.push(`  ${name}${role}`);
    }
  }

  // Public comments (human + ai messages on the public channel)
  const publicMessages = data.messages.filter(
    (m) => m.channel === "public" && (m.message_type === "human" || m.message_type === "ai"),
  );
  if (publicMessages.length > 0) {
    lines.push("");
    lines.push("COMMENTS");

    const formatComment = (msg: (typeof publicMessages)[number], indent: string): string => {
      const author = msg.author_name || "Unknown";
      const date = new Date(msg.created_at);
      const timestamp = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      const shortId = msg.id ? `(${msg.id.slice(0, 8)}) ` : "";
      return `${indent}${shortId}[${timestamp}] ${author}: ${msg.content}`;
    };

    // Group replies under their parent; a reply whose parent is not in the
    // public list (e.g. truncated history) falls back to top level so it is
    // never silently dropped.
    const topLevelIds = new Set(publicMessages.filter((m) => !m.parent_id).map((m) => m.id));
    const repliesByParent = new Map<string, typeof publicMessages>();
    for (const msg of publicMessages) {
      if (msg.parent_id && topLevelIds.has(msg.parent_id)) {
        const siblings = repliesByParent.get(msg.parent_id) || [];
        siblings.push(msg);
        repliesByParent.set(msg.parent_id, siblings);
      }
    }
    for (const msg of publicMessages) {
      if (msg.parent_id && topLevelIds.has(msg.parent_id)) continue;
      lines.push(formatComment(msg, "  "));
      for (const reply of (msg.id && repliesByParent.get(msg.id)) || []) {
        lines.push(formatComment(reply, "    ↳ "));
      }
    }
  }

  lines.push(DIVIDER);

  return lines.join("\n");
}

interface MotionListItem {
  short_id: string;
  summary: string;
  status: string;
  priority: string | null;
  author: string;
  updated_at: string;
}

interface MotionListData {
  workspace_slug: string;
  status: string;
  page: number;
  total: number;
  motions: MotionListItem[];
}

export function renderMotionList(data: MotionListData): string {
  const lines: string[] = [];

  lines.push(`## ${data.workspace_slug} — ${data.total} ${data.status} motion(s)`);
  lines.push("");

  if (data.motions.length === 0) {
    lines.push("No motions found.");
    return lines.join("\n");
  }

  for (const m of data.motions) {
    const dot = PRIORITY_DOTS[m.priority || "normal"] || "●";
    lines.push(`- \`${m.short_id}\` ${dot} **${m.summary}** — ${m.author}`);
  }

  if (data.total > data.motions.length) {
    lines.push("");
    lines.push(`_Page ${data.page} of ${Math.ceil(data.total / data.motions.length)}. Pass \`page\` to see more._`);
  }

  return lines.join("\n");
}
