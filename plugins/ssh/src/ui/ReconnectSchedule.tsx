import type { ReconnectProgress } from "../shared/preferences.js";

export function ReconnectSchedule({ progress }: { progress: ReconnectProgress }) {
  return (
    <span role="status">
      {progress.nextAt ? (
        <>
          第 {progress.attempt} / {progress.total} 次重试安排在 <time dateTime={progress.nextAt}>{new Date(progress.nextAt).toLocaleTimeString()}</time>
        </>
      ) : (
        <>
          正在进行第 {progress.attempt} / {progress.total} 次重连
        </>
      )}
    </span>
  );
}
