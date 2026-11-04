/** Optional UI lease: headless callers proceed immediately; visible cards paint before GPU work. */
export class SelectionPresentation {
  private leases = 0;
  private pending: { layerId: string; resolve: () => void } | null = null;
  retain = () => {
    this.leases++;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      if (--this.leases === 0) this.cancel();
    };
  };
  wait(layerId: string): Promise<void> | undefined {
    this.cancel();
    if (!this.leases) return;
    return new Promise((resolve) => {
      this.pending = { layerId, resolve };
    });
  }
  painted = (layerId: string) => {
    if (this.pending?.layerId === layerId) this.cancel();
  };
  cancel() {
    const pending = this.pending;
    this.pending = null;
    pending?.resolve();
  }
}
