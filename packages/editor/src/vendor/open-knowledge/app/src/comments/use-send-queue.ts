import { useReusableSession } from '@/components/reusable-session-store';
import { requestSendToOpenChat } from './open-chat-send';
import { dispatchComments, useCommentSurface } from './store';
import { useCommentDispatch } from './use-comment-delivery';

export function useSendQueue(): (threadIds?: readonly string[]) => void {
  const surface = useCommentSurface();
  const composeFreshTurn = useCommentDispatch();
  const openSession = useReusableSession();
  const reusableThread = openSession?.kind === 'thread' ? openSession : null;
  return (threadIds) => {
    if (reusableThread === null) {
      void dispatchComments({ compose: composeFreshTurn, threadIds }, surface);
      return;
    }
    requestSendToOpenChat(threadIds);
  };
}
