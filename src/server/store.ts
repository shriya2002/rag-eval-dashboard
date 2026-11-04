import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { EvalRun, RunListItem } from "../core";

/** Where evaluation runs are kept. Swap in a database by implementing this interface. */
export interface RunStore {
  list(): Promise<RunListItem[]>;
  get(id: string): Promise<EvalRun | undefined>;
  save(run: EvalRun): Promise<void>;
  delete(id: string): Promise<boolean>;
}

function toListItem({ id, name, createdAt, scorer, summary }: EvalRun): RunListItem {
  return { id, name, createdAt, scorer, summary };
}

export class MemoryStore implements RunStore {
  protected runs = new Map<string, EvalRun>();

  async list() {
    return [...this.runs.values()]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(toListItem);
  }
  async get(id: string) {
    return this.runs.get(id);
  }
  async save(run: EvalRun) {
    this.runs.set(run.id, run);
  }
  async delete(id: string) {
    return this.runs.delete(id);
  }
}

/**
 * Persists runs to a single JSON file. Writes go to a temp file first and are then
 * renamed over the original, so a crash mid-write can't leave a corrupted file.
 * Writes are serialized through a promise chain so concurrent requests don't race.
 */
export class JsonFileStore extends MemoryStore {
  private loaded: Promise<void>;
  private writing: Promise<void> = Promise.resolve();

  constructor(private readonly path: string) {
    super();
    this.loaded = this.load();
  }

  private async load() {
    try {
      const data = JSON.parse(await readFile(this.path, "utf8")) as EvalRun[];
      for (const run of data) this.runs.set(run.id, run);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
  }

  private persist() {
    this.writing = this.writing.then(async () => {
      await mkdir(dirname(this.path), { recursive: true });
      const tmp = `${this.path}.tmp`;
      await writeFile(tmp, JSON.stringify([...this.runs.values()], null, 2));
      await rename(tmp, this.path);
    });
    return this.writing;
  }

  override async list() {
    await this.loaded;
    return super.list();
  }
  override async get(id: string) {
    await this.loaded;
    return super.get(id);
  }
  override async save(run: EvalRun) {
    await this.loaded;
    await super.save(run);
    await this.persist();
  }
  override async delete(id: string) {
    await this.loaded;
    const removed = await super.delete(id);
    if (removed) await this.persist();
    return removed;
  }
}
