import { readdirSync, statSync, watch, type FSWatcher } from "node:fs";
import type { VaultFiles } from "@huhu/vault";

/** Rebuildable file membership. Readers still validate the selected durable records. */
export class TaskJournalIndex {
  private readonly rows = new Map<string, readonly string[]>();
  private readonly groups = new Map<string, Set<string>>();
  private readonly dirty = new Set<string>();
  private readonly faults = new Map<string, unknown>();
  private watcher: FSWatcher | undefined;
  private identity: string | undefined;
  private rebuild = true;
  private closed = false;
  onChange?: () => void;

  constructor(
    private readonly files: VaultFiles,
    private readonly directory: string,
    private readonly filename: RegExp,
    private readonly readGroups: (file: string) => readonly string[] | null,
    private readonly reindexed?: (previous: readonly string[], current: readonly string[]) => void,
  ) {}

  replace(file: string, current: readonly string[] | null): void {
    for (const group of this.rows.get(file) ?? []) {
      const members = this.groups.get(group);
      members?.delete(file);
      if (!members?.size) this.groups.delete(group);
    }
    if (!current) {
      this.rows.delete(file);
      return;
    }
    this.rows.set(file, current);
    for (const group of current) {
      const members = this.groups.get(group) ?? new Set<string>();
      members.add(file);
      this.groups.set(group, members);
    }
  }

  exclude(file: string, group: string): void {
    this.groups.get(group)?.delete(file);
  }

  paths(group: string, onError?: (error: unknown) => void): string[] {
    return this.pathsFor([group], onError);
  }

  pathsFor(groups: Iterable<string>, onError?: (error: unknown) => void): string[] {
    this.refresh(onError);
    const selected = new Set<string>();
    for (const group of groups) for (const file of this.groups.get(group) ?? []) selected.add(file);
    return [...selected].sort();
  }

  assertHealthy(): void {
    this.refresh(() => {});
    for (const error of this.faults.values()) throw error;
  }

  private refresh(onError?: (error: unknown) => void): void {
    if (this.closed) return;
    const directory = this.files.abs(this.directory);
    const stat = statSync(directory, { bigint: true, throwIfNoEntry: false });
    const identity = stat && `${stat.dev}:${stat.ino}:${stat.birthtimeNs}`;
    if (identity !== this.identity) {
      this.watcher?.close();
      this.watcher = undefined;
      this.identity = identity;
      this.rebuild = true;
    }
    if (stat && !this.watcher) {
      try {
        this.watcher = watch(directory, { persistent: false }, (_event, name) => {
          if (!name) this.rebuild = true;
          else if (this.filename.test(name)) this.dirty.add(`${this.directory}/${name}`);
          else return;
          this.onChange?.();
        });
        this.watcher.on("error", () => {
          this.watcher?.close();
          this.watcher = undefined;
          this.rebuild = true;
          this.onChange?.();
        });
      } catch {
        // Without reliable file events a later check must discover replacements.
        this.rebuild = true;
      }
    }
    const full = this.rebuild;
    const files = new Set(this.dirty);
    this.dirty.clear();
    this.rebuild = false;
    if (full) {
      for (const file of this.rows.keys()) files.add(file);
      for (const file of this.faults.keys()) files.add(file);
      for (const name of stat ? readdirSync(directory) : []) {
        if (this.filename.test(name)) files.add(`${this.directory}/${name}`);
      }
    }
    for (const file of files) {
      const previous = this.rows.get(file) ?? [];
      try {
        const current = this.readGroups(file);
        this.faults.delete(file);
        this.replace(file, current);
        if (!full || previous.length) this.reindexed?.(previous, current ?? []);
      } catch (error) {
        this.replace(file, null);
        this.faults.set(file, error);
        this.reindexed?.(previous, []);
        if (!onError) {
          this.rebuild = true;
          throw error;
        }
        onError(error);
      }
    }
  }

  close(): void {
    this.closed = true;
    this.watcher?.close();
    this.watcher = undefined;
  }
}
