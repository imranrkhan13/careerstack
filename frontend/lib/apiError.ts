export type StructuredError = {
  code: string;
  message: string;
  details?: string | null;
  missing?: string[];
  suggestion?: string | null;
  stack?: string;
};

export type NetworkDiagnosis = {
  requestUrl: string;
  frontendOrigin: string;
  likelyCors: boolean;
  offline: boolean;
};

export class ApiError extends Error {
  kind: "api" | "network";
  endpoint: string;
  method: string;
  status?: number;
  structured?: StructuredError;
  rawBody?: string;
  network?: NetworkDiagnosis;

  constructor(init: {
    kind: "api" | "network";
    endpoint: string;
    method: string;
    message: string;
    status?: number;
    structured?: StructuredError;
    rawBody?: string;
    network?: NetworkDiagnosis;
  }) {
    super(init.message);
    this.name = "ApiError";
    this.kind = init.kind;
    this.endpoint = init.endpoint;
    this.method = init.method;
    this.status = init.status;
    this.structured = init.structured;
    this.rawBody = init.rawBody;
    this.network = init.network;
  }
}

export type LoggedRequest = {
  id: string;
  endpoint: string;
  method: string;
  status: number | "network-error";
  durationMs: number;
  requestBody?: string;
  responseBody?: string;
  provider?: string | null;
  at: string;
};

const MAX_LOG = 100;
let requestLog: LoggedRequest[] = [];
type Listener = (log: LoggedRequest[]) => void;
const listeners = new Set<Listener>();

export function logRequest(entry: Omit<LoggedRequest, "id" | "at">) {
  requestLog = [{ ...entry, id: crypto.randomUUID(), at: new Date().toISOString() }, ...requestLog].slice(0, MAX_LOG);
  listeners.forEach((l) => l(requestLog));
}

export function subscribeToRequestLog(listener: Listener): () => void {
  listeners.add(listener);
  listener(requestLog);
  return () => listeners.delete(listener);
}

export function getRequestLog(): LoggedRequest[] {
  return requestLog;
}
