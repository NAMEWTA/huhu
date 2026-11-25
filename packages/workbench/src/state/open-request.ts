/**
 * 跨模块“打开某个路径”的请求：任务里点击 `[[路径]]` 时，请求笔记模块打开文件或定位文件夹。
 * 请求先存起来（笔记模块可能还没挂载），笔记模块挂载或收到通知后取走。
 */
export interface OpenRequest {
  path: string;
  /** 文件夹（以 / 结尾的双链）。 */
  folder: boolean;
}

let pending: OpenRequest | null = null;
const listeners = new Set<() => void>();

export function requestOpenPath(target: string, literal = false): void {
  const folder = target.endsWith("/");
  pending = { path: folder ? target.slice(0, -1) : literal ? target : target.replace(/#.*$/, ""), folder };
  for (const l of listeners) l();
}

export function takeOpenRequest(): OpenRequest | null {
  const p = pending;
  pending = null;
  return p;
}

export function onOpenRequest(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export interface TaskDestination {
  runId: string;
  questionId?: string | undefined;
}

type OpenTask = (id: string, destination?: TaskDestination) => void;
let pendingTask: { id: string; destination: TaskDestination | undefined } | null = null;
const taskListeners = new Set<OpenTask>();

export function requestOpenTask(id: string, destination?: TaskDestination): void {
  if (taskListeners.size === 0) pendingTask = { id, destination };
  else for (const open of taskListeners) open(id, destination);
}

export function onOpenTaskRequest(open: OpenTask): () => void {
  taskListeners.add(open);
  if (pendingTask !== null) {
    const { id, destination } = pendingTask;
    pendingTask = null;
    open(id, destination);
  }
  return () => taskListeners.delete(open);
}

type OpenMailDelivery = { vaultId: string; operationId: string };
let pendingMailDelivery: OpenMailDelivery | null = null;
const mailDeliveryListeners = new Set<(request: OpenMailDelivery) => void>();

export function requestOpenMailDelivery(request: OpenMailDelivery): void {
  if (mailDeliveryListeners.size === 0) pendingMailDelivery = request;
  else for (const open of mailDeliveryListeners) open(request);
}

export function onOpenMailDeliveryRequest(open: (request: OpenMailDelivery) => void): () => void {
  mailDeliveryListeners.add(open);
  if (pendingMailDelivery) {
    const request = pendingMailDelivery;
    pendingMailDelivery = null;
    open(request);
  }
  return () => mailDeliveryListeners.delete(open);
}

type AgentSessionRequest = { vaultId: string; spaceId: string; sessionId: string };
let pendingAgentSession: AgentSessionRequest | null = null;
const agentSessionListeners = new Set<(request: AgentSessionRequest) => void>();

export function requestOpenAgentSession(request: AgentSessionRequest): void {
  if (agentSessionListeners.size === 0) pendingAgentSession = request;
  else for (const open of agentSessionListeners) open(request);
}

export function onOpenAgentSessionRequest(open: (request: AgentSessionRequest) => void): () => void {
  agentSessionListeners.add(open);
  if (pendingAgentSession) {
    const request = pendingAgentSession;
    pendingAgentSession = null;
    open(request);
  }
  return () => agentSessionListeners.delete(open);
}
