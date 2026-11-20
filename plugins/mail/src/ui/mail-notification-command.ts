export type MailNotificationRequest = { vaultId: string; endpoint: string; id: string };
type MailScope = Pick<MailNotificationRequest, "vaultId" | "endpoint">;
let mounted: { scope: MailScope; open: (id: string) => void } | undefined;
let pending: MailNotificationRequest | undefined;

const matches = (left: MailScope, right: MailScope) => left.vaultId === right.vaultId && left.endpoint === right.endpoint;

export async function requestMailNotification(target: MailNotificationRequest, openMail: () => boolean | void | Promise<boolean | void>) {
  if (!/^ntf-mail-[0-9a-f]{64}$/.test(target.id)) return false;
  pending = target;
  try {
    if ((await openMail()) !== false) {
      if (pending === target && mounted && matches(mounted.scope, target)) {
        pending = undefined;
        mounted.open(target.id);
      }
      return true;
    }
  } catch {
    // A failed module open must not replay this notice in a later workspace.
  } finally {
    if (mounted && !matches(mounted.scope, target) && pending === target) pending = undefined;
  }
  if (pending === target) pending = undefined;
  return false;
}

export function onMailNotificationRequest(scope: MailScope, open: (id: string) => void) {
  const listener = { scope, open };
  mounted = listener;
  const target = pending;
  pending = undefined;
  if (target && matches(scope, target)) open(target.id);
  return () => {
    if (mounted === listener) mounted = undefined;
  };
}
