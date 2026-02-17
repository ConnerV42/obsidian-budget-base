export class EditCommitGuard {
  private committing = false;

  startEditing() {
    this.committing = false;
  }

  beginCommit(): boolean {
    if (this.committing) return false;
    this.committing = true;
    return true;
  }

  reset() {
    this.committing = false;
  }
}
