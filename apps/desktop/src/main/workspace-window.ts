import { ipcMain, type BrowserWindow, type IpcMainInvokeEvent, type WebContents, type WebFrameMain } from "electron";
import type { SshWorkspacePaneAddress, WorkspaceWindowView } from "@huhu/workbench";
import { isWorkspacePaneAddress, isWorkspaceWindowTicket, workspaceWindowChannel as channel } from "../workspace-window-ipc.js";

interface WindowHostOptions {
  senderWindow(event: IpcMainInvokeEvent): BrowserWindow;
  createHidden(beforeLoad: (win: BrowserWindow) => void): BrowserWindow;
  current(vaultId: string): object | null;
  validTarget(target: SshWorkspacePaneAddress): Promise<boolean>;
}

interface PendingMove {
  ticket: string;
  target: SshWorkspacePaneAddress;
  engine: object;
  source: BrowserWindow;
  sourceFrame: WebFrameMain;
  destination: BrowserWindow;
  destinationFrame?: WebFrameMain;
  attached: boolean;
  deadline: ReturnType<typeof setTimeout>;
  reply(attached: boolean): void;
  cleanup(): void;
}

type CommittedMove = Pick<PendingMove, "ticket" | "target" | "source" | "sourceFrame" | "destination" | "destinationFrame" | "engine"> & { mode: "control" | "observe" };
const pendingTimeout = 20_000;
const commitTimeout = 8_000;

function watchDocument(contents: WebContents, loaded: () => boolean, invalid: () => void) {
  const navigate = ({ isMainFrame, isSameDocument }: Electron.WebContentsDidStartNavigationEventParams) => {
    if (loaded() && isMainFrame && !isSameDocument) invalid();
  };
  contents.on("did-start-navigation", navigate);
  contents.once("render-process-gone", invalid);
  contents.once("destroyed", invalid);
  return () => {
    contents.off("did-start-navigation", navigate);
    contents.off("render-process-gone", invalid);
    contents.off("destroyed", invalid);
  };
}

export function installWorkspaceWindowHost({ senderWindow, createHidden, current, validTarget }: WindowHostOptions) {
  const pending = new Map<string, PendingMove>();
  const committed = new Map<string, CommittedMove>();
  const sameEngine = ({ target, engine }: PendingMove | CommittedMove) => current(target.vaultId) === engine;

  function changed(win: BrowserWindow) {
    if (!win.isDestroyed() && !win.webContents.isDestroyed() && !win.webContents.isCrashed()) win.webContents.send(channel.changed);
  }

  function cancel(move: PendingMove) {
    if (!pending.delete(move.ticket)) return;
    move.cleanup();
    move.reply(false);
    if (!move.destination.isDestroyed()) move.destination.destroy();
  }

  function participant(move: PendingMove | CommittedMove, win: BrowserWindow, frame: WebFrameMain | null) {
    return (move.source === win && frame === move.sourceFrame) || (move.destination === win && frame === move.destinationFrame);
  }

  ipcMain.handle(channel.open, async (event, target: unknown, ticket: unknown) => {
    const source = senderWindow(event);
    const sourceFrame = event.senderFrame;
    if (!sourceFrame || !isWorkspacePaneAddress(target) || !isWorkspaceWindowTicket(ticket)) return false;
    const engine = current(target.vaultId);
    if (!engine || !(await validTarget(target))) return false;
    if (source.isDestroyed() || source.webContents.mainFrame !== sourceFrame || current(target.vaultId) !== engine) return false;
    if (pending.has(ticket) || committed.has(ticket) || [...pending.values()].some((move) => move.source === source)) return false;
    if ([...committed.values()].some((move) => move.destination === source && sameEngine(move))) return false;

    return new Promise<boolean>((reply) => {
      createHidden((destination) => {
        const destinationContents = destination.webContents;
        const invalid = () => cancel(move);
        const move: PendingMove = {
          ticket,
          target,
          engine,
          source,
          sourceFrame,
          destination,
          attached: false,
          deadline: setTimeout(invalid, pendingTimeout).unref(),
          reply,
          cleanup: () => {
            clearTimeout(move.deadline);
            stopSource();
            stopDestination();
            destination.off("closed", invalid);
            destinationContents.off("did-fail-load", failed);
          },
        };
        const failed = (_event: unknown, code: number, _detail: string, _url: string, mainFrame: boolean) => {
          if (mainFrame && code !== -3) invalid();
        };
        const stopSource = watchDocument(
          source.webContents,
          () => true,
          () => {
            // An attached destination can reconcile a commit even if the original socket closes.
            if (!move.attached) invalid();
          },
        );
        const stopDestination = watchDocument(destinationContents, () => move.destinationFrame !== undefined, invalid);
        destinationContents.on("did-fail-load", failed);
        destination.once("closed", invalid);
        pending.set(ticket, move);
      });
    });
  });

  ipcMain.handle(channel.view, (event): WorkspaceWindowView | null => {
    const win = senderWindow(event);
    const existing = [...committed.values()].find((move) => move.destination === win && sameEngine(move));
    if (existing) return { target: existing.target, ticket: null, observe: existing.mode === "observe" };
    const move = [...pending.values()].find((entry) => entry.destination === win && sameEngine(entry));
    if (!move || !event.senderFrame) return null;
    if (move.destinationFrame && move.destinationFrame !== event.senderFrame) return null;
    move.destinationFrame = event.senderFrame;
    return { target: move.target, ticket: move.ticket, observe: true };
  });

  ipcMain.handle(channel.attached, (event, ticket: unknown) => {
    const win = senderWindow(event);
    const move = typeof ticket === "string" && pending.get(ticket);
    if (!move || move.destination !== win || move.destinationFrame !== event.senderFrame || !sameEngine(move)) return false;
    if (!move.attached) {
      move.attached = true;
      clearTimeout(move.deadline);
      move.deadline = setTimeout(() => cancel(move), commitTimeout).unref();
      move.reply(true);
    }
    return true;
  });

  ipcMain.handle(channel.complete, (event, ticket: unknown, mode: unknown) => {
    const win = senderWindow(event);
    if (typeof ticket !== "string" || (mode !== "control" && mode !== "observe")) return false;
    const existing = committed.get(ticket);
    if (existing) return existing.mode === mode && sameEngine(existing) && participant(existing, win, event.senderFrame);
    const move = pending.get(ticket);
    if (!move?.attached || !sameEngine(move) || !participant(move, win, event.senderFrame)) return false;
    pending.delete(ticket);
    move.cleanup();
    const { target, source, sourceFrame, destination, destinationFrame, engine } = move;
    committed.set(ticket, { ticket, target, source, sourceFrame, destination, ...(destinationFrame && { destinationFrame }), engine, mode });
    destination.once("closed", () => {
      if (committed.delete(ticket)) changed(source);
    });
    destination.show();
    destination.focus();
    changed(source);
    changed(destination);
    return true;
  });

  ipcMain.handle(channel.cancel, (event, ticket: unknown) => {
    const win = senderWindow(event);
    const move = typeof ticket === "string" && pending.get(ticket);
    if (move && participant(move, win, event.senderFrame)) cancel(move);
  });

  ipcMain.handle(channel.moved, (event) => {
    const win = senderWindow(event);
    return [...committed.values()].filter((move) => move.source === win && sameEngine(move)).map(({ target }) => target);
  });

  return {
    cancelPending() {
      for (const move of pending.values()) cancel(move);
    },
    reset() {
      for (const move of pending.values()) cancel(move);
      const affected = new Set([...committed.values()].flatMap(({ source, destination }) => [source, destination]));
      committed.clear();
      for (const window of affected) changed(window);
    },
  };
}
