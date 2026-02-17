import { describe, expect, it } from 'vitest';
import { EditCommitGuard } from './editCommitGuard';

describe('EditCommitGuard', () => {
  it('allows only one commit per edit session until reset', () => {
    const guard = new EditCommitGuard();
    guard.startEditing();

    expect(guard.beginCommit()).toBe(true);
    expect(guard.beginCommit()).toBe(false);
  });

  it('allows commit again after reset', () => {
    const guard = new EditCommitGuard();
    guard.startEditing();
    guard.beginCommit();

    guard.reset();
    expect(guard.beginCommit()).toBe(true);
  });
});
