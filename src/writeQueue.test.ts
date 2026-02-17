import { describe, expect, it } from 'vitest';
import { LatestWriteQueue } from './writeQueue';

describe('LatestWriteQueue', () => {
  it('applies updates against latest state and flushes newest snapshot', async () => {
    const queue = new LatestWriteQueue({ value: 0 });
    const writes: number[] = [];
    let releaseFirstWrite: (() => void) | null = null;
    let writeCount = 0;

    const writer = async (snapshot: { value: number }) => {
      writeCount += 1;
      writes.push(snapshot.value);
      if (writeCount === 1) {
        await new Promise<void>((resolve) => {
          releaseFirstWrite = resolve;
        });
      }
    };

    queue.apply(prev => ({ value: prev.value + 1 })); // 1
    const flushPromise = queue.flush(writer);
    queue.apply(prev => ({ value: prev.value + 1 })); // 2
    queue.apply(prev => ({ value: prev.value + 1 })); // 3

    if (!releaseFirstWrite) {
      throw new Error('Expected first write gate to be initialized.');
    }
    releaseFirstWrite();
    const success = await flushPromise;

    expect(success).toBe(true);
    expect(queue.current.value).toBe(3);
    expect(writes).toEqual([1, 3]);
  });

  it('keeps pending work after failure and succeeds on retry', async () => {
    const queue = new LatestWriteQueue({ value: 10 });
    let attempts = 0;
    const writes: number[] = [];

    const writer = async (snapshot: { value: number }) => {
      attempts += 1;
      if (attempts === 1) {
        throw new Error('first write fails');
      }
      writes.push(snapshot.value);
    };

    queue.apply({ value: 10 });
    const firstFlush = await queue.flush(writer);
    expect(firstFlush).toBe(false);
    expect(queue.hasPendingWork).toBe(true);

    const secondFlush = await queue.flush(writer);
    expect(secondFlush).toBe(true);
    expect(queue.hasPendingWork).toBe(false);
    expect(writes).toEqual([10]);
  });
});
