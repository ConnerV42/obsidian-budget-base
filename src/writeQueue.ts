export type StateUpdate<T> = T | ((prev: T) => T);

export class LatestWriteQueue<T> {
  private latestData: T;
  private writeInFlight = false;
  private dirty = false;

  constructor(initialData: T) {
    this.latestData = initialData;
  }

  get current(): T {
    return this.latestData;
  }

  get hasPendingWork(): boolean {
    return this.writeInFlight || this.dirty;
  }

  syncFromSource(data: T) {
    if (!this.writeInFlight && !this.dirty) {
      this.latestData = data;
    }
  }

  apply(update: StateUpdate<T>): T {
    this.latestData = typeof update === 'function'
      ? (update as (prev: T) => T)(this.latestData)
      : update;
    this.dirty = true;
    return this.latestData;
  }

  async flush(
    write: (snapshot: T) => Promise<void>,
    onAfterWrite?: (snapshot: T) => void
  ): Promise<boolean> {
    if (this.writeInFlight) return true;

    this.writeInFlight = true;
    let failed = false;

    try {
      while (this.dirty) {
        this.dirty = false;
        const snapshot = this.latestData;
        await write(snapshot);
        if (onAfterWrite) {
          onAfterWrite(snapshot);
        }
      }
    } catch {
      failed = true;
      this.dirty = true;
    } finally {
      this.writeInFlight = false;
    }

    if (!failed && this.dirty) {
      return this.flush(write, onAfterWrite);
    }

    return !failed;
  }
}
