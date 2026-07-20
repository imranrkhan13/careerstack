import { ApiError, logRequest, StructuredError } from "./apiError";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000";

/**
 * fetch() deliberately does not tell JS *why* it failed to reach the server —
 * a CORS rejection and a DNS/offline failure both throw the exact same
 * generic TypeError. That's a real browser security constraint, not a gap
 * here. The one honest signal available: retry with `mode: "no-cors"`, which
 * still succeeds if the server responds at all (JS just can't read the
 * response). If that succeeds where the real request failed, the server is
 * reachable and CORS is the likely cause; if it also fails, it's a genuine
 * network/DNS/offline failure.
 */
async function diagnoseNetworkFailure(url: string, method: string) {
  const offline = typeof navigator !== "undefined" && "onLine" in navigator ? !navigator.onLine : false;
  let likelyCors = false;
  if (!offline) {
    try {
      await fetch(url, { mode: "no-cors", method }); // same method as the real request — a GET probe against a POST-only route returns 405 and produces a false "reachable" reading
      likelyCors = true;
    } catch {
      likelyCors = false;
    }
  }
  return {
    requestUrl: url,
    frontendOrigin: typeof window !== "undefined" ? window.location.origin : "",
    likelyCors,
    offline,
  };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${API_BASE}${path}`;
  const method = init?.method ?? "GET";
  const start = performance.now();

  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
  } catch {
    const network = await diagnoseNetworkFailure(url, method);
    logRequest({ endpoint: path, method, status: "network-error", durationMs: performance.now() - start });
    throw new ApiError({
      kind: "network",
      endpoint: path,
      method,
      message: network.likelyCors
        ? "The backend rejected this request (likely a CORS configuration issue)."
        : "The request never reached the backend.",
      network,
    });
  }

  const durationMs = performance.now() - start;
  const text = await res.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    /* not JSON — handled below */
  }

  logRequest({
    endpoint: path,
    method,
    status: res.status,
    durationMs,
    requestBody: init?.body ? String(init.body) : undefined,
    responseBody: text,
    provider: body?._provider ?? body?.provider ?? null,
  });

  if (!res.ok) {
    if (body && body.success === false && body.error) {
      throw new ApiError({
        kind: "api",
        endpoint: path,
        method,
        status: res.status,
        message: body.error.message,
        structured: body.error,
      });
    }
    throw new ApiError({
      kind: "api",
      endpoint: path,
      method,
      status: res.status,
      message: res.statusText || "Request failed",
      rawBody: text,
    });
  }

  return body as T;
}

export type TodayItem = {
  kind: string;
  title: string;
  detail: string;
  node_id?: string;
  confidence?: number;
  reasoning?: string;
  action: string;
  created_at: string | null;
};

export type ParsedEntities = {
  skills: string[];
  roles: { title: string; company: string; duration: string | null }[];
  projects: { name: string; description: string }[];
  years_experience: number | null;
  summary: string;
  _provider?: string;
};

export type GitHubRepo = {
  name: string;
  description: string;
  language: string | null;
  stars: number;
  url: string;
  pushed_at: string;
  score: number;
};

export type GitHubImportResult = {
  total_found: number;
  forks_excluded: number;
  shown_count: number;
  dominant_language: string | null;
  missing_description: string[];
  repos: GitHubRepo[];
};

export type GraphSummary = {
  skills: number;
  roles: number;
  projects: number;
  repositories: number;
  gaps: string[];
};

export type GraphNode = {
  id: string;
  type: string;
  title: string;
  data: Record<string, any>;
  created_at: string;
  updated_at: string;
};

export type AgentStatus = {
  name: string;
  status: "active" | "idle";
  last_action: string;
  last_action_at: string | null;
};

export type ApplicationRecord = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  company: string;
  role: string;
  stage: string;
  salary: string | null;
  notes: string;
  timeline: { stage: string; at: string; note: string | null }[];
  jd_text?: string | null;
  jd_required_skills?: string[] | null;
  match_score?: number | null;
  matched_skills?: string[] | null;
  match_history?: { score: number; at: string }[];
  stale?: boolean;
  boardy_draft?: string | null;
};

export type HeatmapDay = { date: string; count: number };
export type Milestone = { label: string; type: string; at: string };

export type JobStep = { label: string; done: boolean };
export type JobStatus = {
  id: string;
  status: "pending" | "running" | "done" | "error";
  steps: JobStep[];
  result: {
    application_id: string;
    company: string;
    role: string;
    match_score: number;
    matched_skills: string[];
    jd_required_skills: string[];
    boardy_draft: string | null;
    boardy_draft_error: string | null;
  } | null;
  error: StructuredError | null;
};

export type ResumeVersionResult = {
  id: string;
  label: string;
  change_reason: string;
  triggered_by: string;
  created_at: string;
  applications_rechecked: number;
};

export type GmailStatus = { connected: boolean; email?: string; connected_at?: string };

export type BoardyThread = {
  id: string;
  created_at: string;
  updated_at: string;
  application_id: string | null;
  to_address: string;
  subject: string;
  gmail_thread_id: string;
  status: "awaiting_reply" | "replied";
  last_outbound_at: string;
  last_inbound_at: string | null;
  followup_days: number;
  last_message_preview?: string | null;
};

export type BoardyMessage = {
  id: string;
  direction: "outbound" | "inbound";
  subject: string;
  body: string;
  at: string;
};

export type Recommendation = {
  id: string;
  created_at: string;
  thread_node_id: string;
  source_message_id?: string;
  kind?: "text_feedback" | "latex_resume";
  original_text: string;
  suggested_text: string | null;
  reasoning: string;
  matched_bullet_id: string | null;
  match_confidence: number;
  status: "pending" | "accepted" | "rejected" | "compiled";
  applied_text?: string;
  latex_source?: string;
};

export type TopAction = {
  kind: string;
  title: string;
  detail: string;
  ref_id: string | null;
  action: string;
};

export type CommandCenter = {
  gmail: GmailStatus;
  boardy: { threads_awaiting_reply: number; followups_due: any[]; pending_recommendations: number };
  applications: { total: number; stale_count: number };
  gaps: string[];
  top_actions: TopAction[];
};

export const api = {
  today: () => request<TodayItem[]>("/today"),
  commandCenter: () => request<CommandCenter>("/today/command-center"),
  rewriteBullet: (text: string, instruction: string, job_description?: string) =>
    request<{ original: string; suggestion: string; reasoning: string; confidence: number; sources: string[] }>(
      "/resume/rewrite",
      { method: "POST", body: JSON.stringify({ text, instruction, job_description }) }
    ),
  parseResume: (text: string) =>
    request<ParsedEntities>("/onboarding/parse-resume", { method: "POST", body: JSON.stringify({ text }) }),
  parseLinkedIn: (text: string) =>
    request<ParsedEntities>("/onboarding/parse-linkedin", { method: "POST", body: JSON.stringify({ text }) }),
  importGithub: (username: string) =>
    request<GitHubImportResult>("/onboarding/import-github", { method: "POST", body: JSON.stringify({ username }) }),
  buildGraph: (payload: { resume?: ParsedEntities | null; linkedin?: ParsedEntities | null; github_repos: GitHubRepo[] }) =>
    request<GraphSummary>("/onboarding/build-graph", { method: "POST", body: JSON.stringify(payload) }),
  getNode: (id: string) => request<GraphNode>(`/graph/nodes/${id}`),
  listNodes: (type?: string) => request<GraphNode[]>(`/graph/nodes${type ? `?type=${type}` : ""}`),
  agentStatus: () => request<AgentStatus[]>("/agents/status"),
  listApplications: () => request<ApplicationRecord[]>("/applications"),
  applicationStages: () => request<string[]>("/applications/stages"),
  createApplication: (company: string, role: string, salary?: string, notes?: string) =>
    request<ApplicationRecord>("/applications", {
      method: "POST",
      body: JSON.stringify({ company, role, salary: salary || null, notes: notes || "" }),
    }),
  updateApplicationStage: (id: string, stage: string, note?: string) =>
    request<ApplicationRecord>(`/applications/${id}/stage`, {
      method: "PATCH",
      body: JSON.stringify({ stage, note: note || null }),
    }),
  dismissStale: (id: string) => request<ApplicationRecord>(`/applications/${id}/dismiss-stale`, { method: "POST" }),
  applicationFromJD: (jd_text: string, company?: string, role?: string) =>
    request<{ job_id: string }>("/applications/from-jd", {
      method: "POST",
      body: JSON.stringify({ jd_text, company: company || null, role: role || null }),
    }),
  getJob: (id: string) => request<JobStatus>(`/jobs/${id}`),
  getCurrentResume: () =>
    request<{ id: string; content: { text?: string; bullets?: { id: string; text: string }[] }; created_at: string; change_reason: string } | null>("/resume/current"),
  createResumeVersion: (content: Record<string, unknown>, change_reason: string, triggered_by = "manual") =>
    request<ResumeVersionResult>("/resume/versions", {
      method: "POST",
      body: JSON.stringify({ content, change_reason, triggered_by }),
    }),
  timelineHeatmap: (days = 180) => request<HeatmapDay[]>(`/timeline/heatmap?days=${days}`),
  timelineMilestones: (limit = 50) => request<Milestone[]>(`/timeline/milestones?limit=${limit}`),
  gmailStatus: () => request<GmailStatus>("/auth/google/status"),
  gmailLoginUrl: () => request<{ auth_url: string }>("/auth/google/login"),
  boardyThreads: () => request<BoardyThread[]>("/boardy/threads"),
  boardyMessages: (threadId: string) => request<BoardyMessage[]>(`/boardy/threads/${threadId}/messages`),
  boardyRecommendations: (threadId: string) => request<Recommendation[]>(`/boardy/threads/${threadId}/recommendations`),
  replyToThread: (threadId: string, body: string) =>
    request<BoardyMessage>(`/boardy/threads/${threadId}/reply`, { method: "POST", body: JSON.stringify({ body }) }),
  createBoardyThread: (to_address: string, subject: string, body: string, application_id?: string) =>
    request<BoardyThread>("/boardy/threads", {
      method: "POST",
      body: JSON.stringify({ to_address, subject, body, application_id: application_id || null }),
    }),
  pollBoardy: () => request<{ new_recommendations: Recommendation[] }>("/boardy/poll", { method: "POST" }),
  acceptRecommendation: (id: string, edited_text?: string) =>
    request<{ recommendation: Recommendation; version: ResumeVersionResult }>(`/boardy/recommendations/${id}/accept`, {
      method: "POST",
      body: JSON.stringify({ edited_text: edited_text || null }),
    }),
  rejectRecommendation: (id: string) =>
    request<Recommendation>(`/boardy/recommendations/${id}/reject`, { method: "POST" }),
  compileLatexResume: (id: string) =>
    request<{ recommendation_id: string; status: string }>(`/boardy/recommendations/${id}/compile-resume`, {
      method: "POST",
    }),
  latexResumeDownloadUrl: (id: string) => `${API_BASE}/boardy/recommendations/${id}/resume.pdf`,
  boardyFollowupsDue: () => request<any[]>("/boardy/followups-due"),
  boardyNetwork: () =>
    request<
      { id: string; name: string; company: string | null; role: string | null; linkedin_url: string | null; note: string | null; created_at: string }[]
    >("/boardy/network"),
};
