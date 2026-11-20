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
  for (const participant of participants) {
    request.signal.throwIfAborted();
    if (!(await participant(request))) return false;
  }
  request.signal.throwIfAborted();
  return true;
}
