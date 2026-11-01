import { committedLayerFields } from "./commit-info";
import { applyCommand, currentPage } from "./commands";
import { EngineError, ensure } from "../errors";
import { createProject } from "../document/factories";
import { collectProjectIds, reserveProjectIds } from "../document/identity";
import type { Command, EnginePort, Project, SessionSnapshot } from "../document/model";
import { validateProject } from "../document/validation";
import { cloneValue as clone, freezeValue as freeze } from "../document/immutable";
import { markPublishedProject } from "../document/published";
import type { CommandCommit, CommandCommitInfo } from "../animation/model";
import { createLayerGeometryIndex } from "../layers/geometry-index";
import { createCommandDraft } from "./drafts";
import { commandMutationScope } from "./scopes";
import { validateLocalProject } from "../document/local-validation";
import type { PreparedEngineTransaction } from "./reservation";
import { HistoryCollector, historyContexts } from "../history/collector";
import { captureHistoryCommand } from "../history/registry";
import type { HistoryDescription } from "../history/model";
import { ENGINE_HISTORY_LIMIT, type RestoredHistory } from "./restored-history";

function collectExplicitIds(value: unknown, occupied: Set<string>): void {
  if (Array.isArray(value)) {
    for (const item of value) collectExplicitIds(item, occupied);
  } else if (value !== null && typeof value === "object") {
    for (const key in value) {
      if (!Object.hasOwn(value, key)) continue;
      const child = (value as Record<string, unknown>)[key];
      if (key === "id" && typeof child === "string") occupied.add(child);
      else if (child !== null && typeof child === "object") collectExplicitIds(child, occupied);
    }
  }
}
function sameIds(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}
export interface EngineOptions {
  now?: () => string;
  historyLimit?: number;
}
interface CommitEnvelope {
  info: CommandCommitInfo;
  detailed?: CommandCommit;
}
interface HistoryEntry {
  snapshot: SessionSnapshot;
  description: HistoryDescription;
}

/** A renderer-free document session. All edits are validated on an isolated draft. */
export class EditorEngine implements EnginePort {
  private snapshot: SessionSnapshot;
  private listeners = new Set<() => void>();
  private commandListeners = new Set<(event: CommandCommit) => void>();
  private commitInfoListeners = new Set<(event: CommandCommitInfo) => void>();
  private readonly commits: CommitEnvelope[] = [];
  private publications = 0;
  private drainingCommits = false;
  private past: HistoryEntry[] = [];
  private future: HistoryEntry[] = [];
  private sequence = 0;
  private historyLimit: number;
  private now: (() => string) | undefined;
  private reservation: symbol | null = null;
  private readonly identityIndexes = new WeakMap<Project, ReadonlySet<string>>();

  private assertUnlocked(): void {
    ensure(this.reservation === null, "BUSY", "Document is busy committing a prepared change.");
  }

  private prepared(
    before: SessionSnapshot,
    project: Project,
    publish: () => void,
    deferLock: boolean,
  ): PreparedEngineTransaction {
    const token = Symbol("prepared-transaction");
    let active = true;
    const lock = () => {
      ensure(active, "INVALID_COMMAND", "Prepared transaction is no longer active.");
      if (this.reservation === token) return;
      this.assertUnlocked();
      ensure(
        this.snapshot.project === before.project &&
          this.snapshot.pageId === before.pageId &&
          this.snapshot.revision === before.revision,
        "INVALID_COMMAND",
        "Prepared transaction is stale.",
      );
      this.reservation = token;
    };
    if (!deferLock) lock();
    return Object.freeze({
      project: freeze(project),
      lock,
      commit: () => {
        lock();
        active = false;
        this.reservation = null;
        publish();
      },
      cancel: () => {
        if (!active) return;
        active = false;
        if (this.reservation === token) this.reservation = null;
      },
    });
  }

  constructor(project: Project = createProject(), options: EngineOptions = {}) {
    const copy = clone(project);
    validateProject(copy);
    this.historyLimit = options.historyLimit ?? ENGINE_HISTORY_LIMIT;
    ensure(
      Number.isInteger(this.historyLimit) && this.historyLimit >= 1 && this.historyLimit <= 100,
      "INVALID_COMMAND",
      "Historique limité entre 1 et 100",
    );
    this.now = options.now;
    const ids = collectProjectIds(copy);
    this.identityIndexes.set(copy, ids);
    reserveProjectIds(copy, ids);
    this.snapshot = freeze({
      project: copy,
      pageId: copy.pages[0]!.id,
      selection: [],
      revision: 0,
      canUndo: false,
      canRedo: false,
    });
    markPublishedProject(this.snapshot.project);
  }
  getSnapshot = (): SessionSnapshot => this.snapshot;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  subscribeCommands = (listener: (event: CommandCommit) => void): (() => void) => {
    this.commandListeners.add(listener);
    return () => {
      this.commandListeners.delete(listener);
    };
  };
  subscribeCommitInfo = (listener: (event: CommandCommitInfo) => void): (() => void) => {
    this.commitInfoListeners.add(listener);
    return () => {
      this.commitInfoListeners.delete(listener);
    };
  };
  private drainCommits(): void {
    if (!this.commits.length || this.publications || this.drainingCommits) return;
    this.drainingCommits = true;
    let cursor = 0,
      failed = false,
      failure: unknown;
    const deliver = <T>(listeners: Set<(event: T) => void>, event: T) => {
      for (const listener of listeners) {
        try {
          listener(event);
        } catch (error) {
          if (!failed) {
            failed = true;
            failure = error;
          }
        }
      }
    };
    try {
      while (cursor < this.commits.length) {
        const envelope = this.commits[cursor++]!;
        deliver(this.commitInfoListeners, envelope.info);
        if (envelope.detailed) deliver(this.commandListeners, envelope.detailed);
      }
    } finally {
      this.commits.splice(0, cursor);
      this.drainingCommits = false;
    }
    if (failed) throw failure;
  }
  private publish(
    next: SessionSnapshot,
    kind?: CommandCommit["kind"],
    commands: readonly Command[] = [],
    detailedCommands?: readonly Command[],
    history?: HistoryDescription,
  ): void {
    const snapshot = freeze(next);
    markPublishedProject(snapshot.project);
    if (kind) {
      const layerFields = committedLayerFields(commands);
      // Capture before state listeners can synchronously publish another transaction.
      const detailed =
        detailedCommands ?? (this.commandListeners.size && !commands.length ? [] : undefined);
      this.commits.push({
        info: freeze({
          kind,
          types: commands.map((command) => command.type),
          ...(layerFields.length ? { layerFields } : {}),
          ...(history ? { history } : {}),
          snapshot,
        }),
        ...(detailed ? { detailed: freeze({ kind, commands: detailed, snapshot }) } : {}),
      });
    }
    this.snapshot = snapshot;
    this.publications++;
    let failed = false,
      failure: unknown;
    try {
      for (const listener of this.listeners) listener();
    } catch (error) {
      failed = true;
      failure = error;
    } finally {
      this.publications--;
      try {
        this.drainCommits();
      } catch (error) {
        if (!failed) {
          failed = true;
          failure = error;
        }
      }
    }
    if (failed) throw failure;
  }
  select = (ids: string[]): void => {
    const page = currentPage(this.snapshot.project, this.snapshot.pageId);
    const selection = [...new Set(ids)];
    const geometry = createLayerGeometryIndex(page);
    ensure(
      selection.every((id) => geometry.byId.has(id)),
      "NOT_FOUND",
      "Sélection contenant un calque introuvable",
    );
    if (sameIds(selection, this.snapshot.selection)) return;
    this.publish({ ...this.snapshot, selection });
  };
  setPage = (id: string): void => {
    this.assertUnlocked();
    currentPage(this.snapshot.project, id);
    if (id === this.snapshot.pageId) return;
    this.publish({ ...this.snapshot, pageId: id, selection: [] });
  };
  execute = (command: Command): void => {
    this.transaction([command]);
  };
  transaction = (commands: Command[]): void => {
    this.prepareTransaction(commands, {}, this.commandListeners.size > 0).commit();
  };
  reserveTransaction = (
    commands: Command[],
    options: { deferLock?: boolean } = {},
  ): PreparedEngineTransaction => this.prepareTransaction(commands, options, true);
  private prepareTransaction(
    commands: Command[],
    options: { deferLock?: boolean },
    captureCommands: boolean,
  ): PreparedEngineTransaction {
    this.assertUnlocked();
    ensure(
      Array.isArray(commands) && commands.length <= 1000,
      "INVALID_COMMAND",
      "Transaction invalide ou trop longue",
    );
    const before = this.snapshot;
    if (commands.length === 0)
      return this.prepared(before, before.project, () => {}, options.deferLock ?? false);
    let project: Project;
    let pageId = before.pageId;
    let selection = before.selection;
    let selectionChanged = false;
    let sequence = this.sequence;
    let detailedCommands: readonly Command[] | undefined;
    let committedCommands: readonly Command[] = commands;
    let occupied: Set<string> | undefined;
    let identities: ReadonlySet<string> | undefined;
    let local = false;
    const history = new HistoryCollector();
    const nextId = (prefix: string): string => {
      ensure(occupied, "INVALID_COMMAND", "Local commands cannot allocate identities");
      let id: string;
      do {
        sequence += 1;
        id = `${prefix}-${sequence.toString(36)}`;
      } while (occupied.has(id));
      occupied.add(id);
      return id;
    };
    try {
      // Own the command data before deriving a validation scope. Caller getters/mutations
      // cannot change a certified scalar plan into an unvalidated structural mutation.
      if (captureCommands) detailedCommands = freeze(clone(commands));
      const ownedCommands = clone(commands);
      committedCommands = ownedCommands;
      const scope = commandMutationScope(before.project, before.pageId, ownedCommands);
      local = scope.kind === "local";
      project = createCommandDraft(before.project, before.pageId, ownedCommands, scope);
      if (!local) {
        occupied = new Set(this.identityIndexes.get(before.project)!);
        // Reserve explicit IDs from the entire batch before generating any IDs.
        collectExplicitIds(ownedCommands, occupied);
      }
      const historyContext = historyContexts(project, history);
      for (const command of ownedCommands) {
        history.begin();
        const finishHistory = captureHistoryCommand(historyContext(pageId), command);
        const result = applyCommand(project, pageId, command, nextId, before.revision, scope.kind);
        finishHistory?.();
        history.finish();
        pageId = result.pageId;
        if (result.selection) {
          selection = result.selection;
          selectionChanged = true;
        }
      }
      if (this.now) project.updatedAt = this.now();
      if (scope.kind === "local") {
        validateLocalProject(before.project, project, scope);
        identities = this.identityIndexes.get(before.project)!;
      } else {
        validateProject(project);
        identities = collectProjectIds(project);
      }
    } catch (error) {
      if (error instanceof EngineError) throw error;
      throw new EngineError(
        "INVALID_COMMAND",
        error instanceof Error ? error.message : "Commande invalide",
      );
    }
    const page = currentPage(project, pageId);
    const description = history.snapshot();
    const remainingIds = local ? undefined : new Set(page.layers.map((layer) => layer.id));
    // Preserve presentation identity unless a command actually removed a selected layer.
    if (remainingIds && selection.some((id) => !remainingIds.has(id)))
      selection = selection.filter((id) => remainingIds.has(id));
    return this.prepared(
      before,
      project,
      () => {
        this.past.push({ snapshot: this.snapshot, description });
        if (this.past.length > this.historyLimit) this.past.shift();
        this.future = [];
        this.sequence = sequence;
        this.identityIndexes.set(project, identities!);
        // Scalar transactions preserve the complete durable identity index.
        if (!local) reserveProjectIds(project, identities!);
        // Reservations permit selection changes; an explicit handler result still takes priority.
        let committedSelection = selectionChanged ? selection : this.snapshot.selection;
        if (remainingIds && committedSelection.some((id) => !remainingIds.has(id)))
          committedSelection = committedSelection.filter((id) => remainingIds.has(id));
        this.publish(
          {
            project,
            pageId,
            selection: committedSelection,
            revision: before.revision + 1,
            canUndo: true,
            canRedo: false,
          },
          "commit",
          detailedCommands ?? committedCommands,
          this.commandListeners.size ? detailedCommands : undefined,
          description,
        );
      },
      options.deferLock ?? false,
    );
  }
  undo = (): void => {
    this.assertUnlocked();
    const previous = this.past.pop();
    if (!previous) return;
    this.future.push({ snapshot: this.snapshot, description: previous.description });
    this.publish(
      {
        ...previous.snapshot,
        revision: this.snapshot.revision + 1,
        canUndo: this.past.length > 0,
        canRedo: true,
      },
      "undo",
      [],
      undefined,
      previous.description,
    );
  };
  redo = (): void => {
    this.assertUnlocked();
    const next = this.future.pop();
    if (!next) return;
    this.past.push({ snapshot: this.snapshot, description: next.description });
    this.publish(
      {
        ...next.snapshot,
        revision: this.snapshot.revision + 1,
        canUndo: true,
        canRedo: this.future.length > 0,
      },
      "redo",
      [],
      undefined,
      next.description,
    );
  };
  load = (project: Project, history?: RestoredHistory): void => {
    this.assertUnlocked();
    const copy = clone(project);
    validateProject(copy);
    const restore = (frames: RestoredHistory["past"]): HistoryEntry[] =>
      frames.slice(-this.historyLimit).map((frame) => {
        const restored = clone(frame.project);
        validateProject(restored);
        ensure(
          restored.id === copy.id && restored.pages.some((page) => page.id === frame.pageId),
          "INVALID_DOCUMENT",
          "Invalid restored history frame.",
        );
        const restoredIds = collectProjectIds(restored);
        this.identityIndexes.set(restored, restoredIds);
        reserveProjectIds(restored, restoredIds);
        return {
          snapshot: freeze({
            project: restored,
            pageId: frame.pageId,
            selection: [],
            revision: 0,
            canUndo: false,
            canRedo: false,
          }),
          // Legacy durable journals retain action summaries, not scalar descriptions.
          description: freeze({ changes: [], additionalChanges: true }),
        };
      });
    const past = history ? restore(history.past) : [],
      future = history ? restore(history.future) : [],
      pageId = history?.pageId ?? copy.pages[0]!.id;
    ensure(
      copy.pages.some((page) => page.id === pageId),
      "INVALID_DOCUMENT",
      "History page is missing.",
    );
    const ids = collectProjectIds(copy);
    this.identityIndexes.set(copy, ids);
    reserveProjectIds(copy, ids);
    this.past = past;
    this.future = future;
    this.sequence = 0;
    this.publish(
      {
        project: copy,
        pageId,
        selection: [],
        revision: this.snapshot.revision + 1,
        canUndo: past.length > 0,
        canRedo: future.length > 0,
      },
      "load",
    );
  };
}
