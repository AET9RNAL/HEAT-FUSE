import type { Sample } from "./session.js";

export interface SamplesEntry {
  /** missing: the battle has no samples. The server deletes them after 180 days. */
  state: "loading" | "ready" | "missing" | "error";
  samples?: Sample[];
}

// Memory bounds: the battles open at one time, and the closed ones kept for a fast reopen.
const KEEP = 20;
const MAX_OPEN = 20;

/** Samples for the battles open in the window. Each battle is fetched one time. */
export class SamplesCache {
  private entries = new Map<string, SamplesEntry>();
  private open: string[] = [];

  constructor(
    private readonly load: (id: string) => Promise<Sample[] | null>,
    private readonly onChange: (open: Record<string, SamplesEntry>) => void,
  ) {}

  /** Sets the battles open in the window. A battle not fetched yet starts to load. */
  setOpen(raw: unknown): void {
    const ids = Array.isArray(raw) ? raw.filter((id): id is string => typeof id === "string" && id.length > 0) : [];
    this.open = [...new Set(ids)].slice(0, MAX_OPEN);
    for (const id of this.open) if (!this.entries.has(id)) this.fetch(id);
    this.prune();
    this.push();
  }

  /** Fetches failed and missing battles again. */
  retry(): void {
    for (const [id, entry] of this.entries) {
      if (entry.state === "error" || entry.state === "missing") this.entries.delete(id);
    }
    this.setOpen(this.open);
  }

  private fetch(id: string): void {
    this.entries.set(id, { state: "loading" });
    this.load(id)
      .then(
        (samples) => this.entries.set(id, samples ? { state: "ready", samples } : { state: "missing" }),
        () => this.entries.set(id, { state: "error" }),
      )
      .finally(() => this.push());
  }

  // A Map iterates in insertion order, so this drops the oldest closed battles first.
  private prune(): void {
    for (const id of this.entries.keys()) {
      if (this.entries.size <= KEEP + this.open.length) break;
      if (!this.open.includes(id)) this.entries.delete(id);
    }
  }

  private push(): void {
    const open: Record<string, SamplesEntry> = {};
    for (const id of this.open) {
      const entry = this.entries.get(id);
      if (entry) open[id] = entry;
    }
    this.onChange(open);
  }
}
