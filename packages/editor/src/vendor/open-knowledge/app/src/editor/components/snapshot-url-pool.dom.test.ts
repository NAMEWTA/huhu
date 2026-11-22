import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  __liveSnapshotUrlCount,
  __resetSnapshotUrlPoolForTests,
  MAX_LIVE_SNAPSHOT_URLS,
  observeParkedSnapshotImages,
  releaseSnapshotUrl,
  retainSnapshotUrl,
} from './snapshot-url-pool.ts';

const revokeObjectURL = vi.fn();

describe('snapshot-url-pool', () => {
  beforeEach(() => {
    revokeObjectURL.mockClear();
    URL.revokeObjectURL = revokeObjectURL;
    __resetSnapshotUrlPoolForTests();
    revokeObjectURL.mockClear();
    document.body.replaceChildren();
  });
  afterEach(() => {
    __resetSnapshotUrlPoolForTests();
    document.body.replaceChildren();
  });

  test('past the cap, the oldest orphan is revoked', () => {
    for (let i = 0; i <= MAX_LIVE_SNAPSHOT_URLS; i++) {
      retainSnapshotUrl(`blob:orphan-${i}`);
    }
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:orphan-0');
    expect(__liveSnapshotUrlCount()).toBe(MAX_LIVE_SNAPSHOT_URLS);
  });

  test('a DOM-bound URL at the head is requeued, not revoked', () => {
    const img = document.createElement('img');
    img.src = 'blob:still-shown';
    document.body.append(img);

    retainSnapshotUrl('blob:still-shown');
    for (let i = 0; i < MAX_LIVE_SNAPSHOT_URLS; i++) {
      retainSnapshotUrl(`blob:orphan-${i}`);
    }

    expect(revokeObjectURL).not.toHaveBeenCalledWith('blob:still-shown');
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:orphan-0');
  });

  test('a fully DOM-bound pool grows instead of revoking anything', () => {
    for (let i = 0; i <= MAX_LIVE_SNAPSHOT_URLS; i++) {
      const img = document.createElement('img');
      img.src = `blob:bound-${i}`;
      document.body.append(img);
      retainSnapshotUrl(`blob:bound-${i}`);
    }
    expect(revokeObjectURL).not.toHaveBeenCalled();
    expect(__liveSnapshotUrlCount()).toBe(MAX_LIVE_SNAPSHOT_URLS + 1);
  });

  test('hidden and moved images keep the URL until the final DOM consumer is removed', async () => {
    const parent = document.createElement('div');
    const image = document.createElement('img');
    image.src = 'blob:owned';
    parent.append(image);
    document.body.append(parent);
    retainSnapshotUrl(image.src);
    parent.style.display = 'none';
    await Promise.resolve();
    expect(revokeObjectURL).not.toHaveBeenCalledWith(image.src);
    document.body.append(image);
    parent.remove();
    await Promise.resolve();
    expect(revokeObjectURL).not.toHaveBeenCalledWith(image.src);
    const copy = image.cloneNode() as HTMLImageElement;
    document.body.append(copy);
    image.remove();
    await Promise.resolve();
    expect(revokeObjectURL).not.toHaveBeenCalledWith(image.src);
    copy.remove();
    await Promise.resolve();
    expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith(image.src);
    expect(__liveSnapshotUrlCount()).toBe(0);
  });

  test('a pending URL is released when its embed is removed before the image commits', async () => {
    const owner = document.createElement('div');
    document.body.append(owner);
    retainSnapshotUrl('blob:pending', owner);

    owner.remove();
    await Promise.resolve();
    expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:pending');
    expect(__liveSnapshotUrlCount()).toBe(0);
  });

  test('switching sources and removing nodes in a parked editor releases unused URLs', async () => {
    const root = document.createElement('div');
    const owner = document.createElement('div');
    const inline = document.createElement('img');
    const lightbox = document.createElement('img');
    inline.src = 'blob:shared';
    lightbox.src = inline.src;
    owner.append(inline);
    root.append(owner);
    document.body.append(root, lightbox);
    retainSnapshotUrl(inline.src, owner);

    const stopObserving = observeParkedSnapshotImages(root);
    try {
      root.remove();
      await Promise.resolve();
      expect(revokeObjectURL).not.toHaveBeenCalled();

      lightbox.remove();
      await Promise.resolve();
      expect(revokeObjectURL).not.toHaveBeenCalled();

      retainSnapshotUrl('blob:replacement', owner);
      inline.src = 'blob:replacement';
      await Promise.resolve();
      expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:shared');

      owner.remove();
      await Promise.resolve();
      expect(revokeObjectURL).toHaveBeenLastCalledWith('blob:replacement');
      expect(__liveSnapshotUrlCount()).toBe(0);
    } finally {
      stopObserving();
    }
  });

  test('a parked pending snapshot survives pool pressure until its owner is removed', async () => {
    const root = document.createElement('div');
    const owner = document.createElement('div');
    root.append(owner);
    document.body.append(root);
    retainSnapshotUrl('blob:pending', owner);

    const stopObserving = observeParkedSnapshotImages(root);
    try {
      root.remove();
      for (let index = 0; index < MAX_LIVE_SNAPSHOT_URLS; index += 1) {
        retainSnapshotUrl(`blob:orphan-${index}`);
      }
      await Promise.resolve();
      expect(__liveSnapshotUrlCount()).toBe(MAX_LIVE_SNAPSHOT_URLS);
      expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:orphan-0');

      owner.remove();
      await Promise.resolve();
      expect(revokeObjectURL).toHaveBeenLastCalledWith('blob:pending');
    } finally {
      stopObserving();
    }
  });

  test('ending parking checks the final placement of a retained editor tree', async () => {
    const root = document.createElement('div');
    const owner = document.createElement('div');
    const image = document.createElement('img');
    image.src = 'blob:parked';
    owner.append(image);
    root.append(owner);
    document.body.append(root);
    retainSnapshotUrl(image.src, owner);

    const resume = observeParkedSnapshotImages(root);
    root.remove();
    await Promise.resolve();
    resume();
    document.body.append(root);
    await Promise.resolve();
    expect(revokeObjectURL).not.toHaveBeenCalled();

    const dispose = observeParkedSnapshotImages(root);
    root.remove();
    await Promise.resolve();
    expect(revokeObjectURL).not.toHaveBeenCalled();
    dispose();
    await Promise.resolve();
    expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:parked');
  });

  test('replacing image sources releases the old URL only after every image has switched', async () => {
    const inline = document.createElement('img');
    const lightbox = document.createElement('img');
    inline.src = 'blob:shared';
    lightbox.src = 'blob:shared';
    document.body.append(inline, lightbox);
    retainSnapshotUrl('blob:shared');
    retainSnapshotUrl('blob:next');

    releaseSnapshotUrl('blob:shared');
    inline.src = 'blob:next';
    await Promise.resolve();
    expect(revokeObjectURL).not.toHaveBeenCalled();

    lightbox.src = 'blob:next';
    await Promise.resolve();
    expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:shared');
    expect(__liveSnapshotUrlCount()).toBe(1);
  });

  test('release removes the entry and revokes immediately', () => {
    retainSnapshotUrl('blob:replaced');
    releaseSnapshotUrl('blob:replaced');
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:replaced');
    expect(__liveSnapshotUrlCount()).toBe(0);
  });
});
