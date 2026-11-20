import type { LocalTransactionOrigin } from '@hocuspocus/server';

/**
 * Transaction origin for server observer cross-CRDT writes: an object reference per precedent #1,
 * because identity matching in `Set.has`, `trackedOrigins` and the bridge watcher's enforcing sets
 * needs the exact ref. `skipStoreHooks` breaks the observer-persistence-watcher feedback loop.
 */
export const OBSERVER_SYNC_ORIGIN = {
  source: 'local',
  skipStoreHooks: true,
  context: { origin: 'observer-sync' },
} as const satisfies LocalTransactionOrigin;
