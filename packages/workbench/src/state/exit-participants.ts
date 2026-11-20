export interface ExitRequest {
  signal: AbortSignal;
  /** 在等待用户处理已显示的提示时，通知宿主延长检查。 */
  waitForUser<T>(decision: Promise<T>): Promise<T>;
}

export type ExitParticipant = (request: ExitRequest) => boolean | Promise<boolean>;

const participants = new Set<ExitParticipant>();

/** 看板等持有页面草稿的模块登记在此，文档保存仍由 flusher 负责。 */
export function registerExitParticipant(participant: ExitParticipant): () => void {
  participants.add(participant);
  return () => participants.delete(participant);
}

/** 按登记顺序取得许可，同一窗口一次仅显示一项离场提示。 */
export async function checkExitParticipants(request: ExitRequest): Promise<boolean> {
  // 等待当前页面决定时，新登记的参与者留给下一轮。
  const current = [...participants];
  for (const participant of current) {
    request.signal.throwIfAborted();
    if (participants.has(participant) && !(await participant(request))) return false;
  }
  request.signal.throwIfAborted();
  return true;
}
