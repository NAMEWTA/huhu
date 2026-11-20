// @vitest-environment jsdom
import { FILE_TREE_TAG_NAME } from "@pierre/trees";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createRef } from "react";
import { Toaster } from "sonner";
import { expect, test, vi } from "vitest";
import { HostConfigProvider } from "../src/host/config-provider";
import { DocumentProvider } from "../src/host/document-context";
import { hostFetch, registerHostRoutes } from "../src/host/host-fetch";
import { filesRoutes, type HostFsEntry } from "../src/host/routes/files";
import { FileTree, type FileTreeHandle } from "../src/vendor/open-knowledge/app/src/components/FileTree";
import { PageListProvider } from "../src/vendor/open-knowledge/app/src/components/PageListContext";
import { ExternalHandoffGateProvider } from "../src/vendor/open-knowledge/app/src/components/handoff/ExternalHandoffGate";
import { SidebarProvider } from "../src/vendor/open-knowledge/app/src/components/ui/sidebar";
import { TooltipProvider } from "../src/vendor/open-knowledge/app/src/components/ui/tooltip";
import { emitFileTreeMenuActionDelete, emitFileTreeMenuActionDuplicate, emitFileTreeMenuActionImportTemplate, emitFileTreeMenuActionRename } from "../src/vendor/open-knowledge/app/src/lib/file-tree-menu-action-events";
import { attachOkFetch } from "../src/vendor/open-knowledge/app/src/lib/ok-fetch";
import "./vendor-jsdom-setup";

vi.mock("@lingui/core/macro", () => import("../src/vendor/open-knowledge/app/tests/lingui-macro-shim"));
vi.mock("@lingui/react/macro", () => import("../src/vendor/open-knowledge/app/tests/lingui-macro-shim"));

const target = { kind: "doc", docName: "source", target: "source" } as const;
const path = "source.md";
const destination = "renamed.md";
const newEntry = (path: string): HostFsEntry => ({ name: path, path, kind: "file", size: 5, mtimeMs: 1_700_000_000_000 });

test.each([
  { endpoint: "/api/duplicate-path", invoke: () => emitFileTreeMenuActionDuplicate(target), result: "copy.md", toast: "File duplicated" },
  { endpoint: "/api/rename-path", invoke: () => emitFileTreeMenuActionRename(target), rename: true, result: destination },
  { endpoint: "/api/delete-path", invoke: () => emitFileTreeMenuActionDelete(target), confirm: true, result: null },
  { endpoint: "/api/template/import", invoke: () => emitFileTreeMenuActionImportTemplate(target, false), result: "模板/source.md", toast: "Template imported" },
  { endpoint: "/api/create-folder", createFolder: true },
  { endpoint: "/api/documents", listing: true },
  { endpoint: "/api/workspace", workspace: true },
  { endpoint: "/api/upload", upload: true, result: "upload.txt" },
])("H04 resource tree $endpoint reflects accepted operations and rejected writes", async ({ endpoint, invoke, confirm, result, toast, createFolder, rename, listing, upload, workspace }) => {
  for (const failed of [true, false]) {
    const folders: string[] = [];
    const tree = createRef<FileTreeHandle>();
    const row = (path: string) => document.querySelector(FILE_TREE_TAG_NAME)?.shadowRoot?.querySelector(`[data-item-path="${path}"]`) ?? null;
    const failure = "Vault 写入暂时不可用";
    let entries = upload ? [] : [newEntry(path)];
    const change = (next: HostFsEntry[]): void => {
      if (failed) throw new Error(failure);
      entries = next;
    };
    const dispose = registerHostRoutes(
      filesRoutes({
        list: async () => {
          if (listing && failed) throw new Error(failure);
          return { entries };
        },
        listDocumentPaths: async () => entries,
        hiddenPaths: () => [],
        showHidden: () => true,
        rename: async () => {
          change([newEntry(destination)]);
          return { moved: { [path]: destination } };
        },
        duplicate: async () => {
          change([...entries, newEntry("copy.md")]);
          return { path: "copy.md", paths: ["copy.md"] };
        },
        trash: async () => {
          change([]);
          return { paths: [path] };
        },
        importTemplate: async () => {
          change([...entries, newEntry("模板/source.md")]);
          return { path: "模板/source.md" };
        },
        createPage: async ({ path }) => ({ path }),
        createFolder: async ({ path }) => {
          if (failed) throw new Error(failure);
          folders.push(path);
          entries.push({ ...newEntry(path), kind: "dir" });
          return { path };
        },
        upload: async ({ file }) => {
          change([newEntry(file.name)]);
          return { path: file.name };
        },
        workspace: () => {
          if (workspace && failed) throw new Error(failure);
          return { root: "/vault", separator: "/" };
        },
      }),
    );
    const responses: Response[] = [];
    let listed = false;
    const stop = attachOkFetch(async (input, init) => {
      const response = await hostFetch(input, init);
      if (String(input).startsWith("/api/documents?showAll=true")) {
        listed = true;
        if (listing) responses.push(response.clone());
      } else if (String(input) === endpoint && !listing) responses.push(response.clone());
      return response;
    });
    const query = new QueryClient();
    try {
      render(
        <QueryClientProvider client={query}>
          <TooltipProvider>
            <HostConfigProvider>
              <DocumentProvider>
                <PageListProvider>
                  <ExternalHandoffGateProvider>
                    <SidebarProvider>
                      <FileTree ref={tree} />
                      <Toaster />
                    </SidebarProvider>
                  </ExternalHandoffGateProvider>
                </PageListProvider>
              </DocumentProvider>
            </HostConfigProvider>
          </TooltipProvider>
        </QueryClientProvider>,
      );
      await waitFor(() => expect(listed).toBe(true));
      if (workspace) {
        await waitFor(() => expect(responses.map(({ status }) => status)).toEqual([failed ? 500 : 200]));
        const file = await waitFor(() => {
          const file = row(path);
          expect(file).not.toBeNull();
          return file!;
        });
        fireEvent.contextMenu(file, { composed: true });
        const copy = await screen.findByRole("menuitem", { name: "Copy path" });
        fireEvent.keyDown(copy, { key: "ArrowRight" });
        const full = await screen.findByRole("menuitem", { name: "Full path" });
        expect(full.getAttribute("aria-disabled")).toBe(failed ? "true" : null);
        if (failed) expect(await responses[0]!.json()).toMatchObject({ code: "HOST_ERROR" });
        return;
      }
      if (upload) {
        const dropZone = await screen.findByRole("region", { name: "File drop zone" });
        const file = new File(["Test content"], "upload.txt", { type: "text/plain" });
        fireEvent.drop(dropZone, { dataTransfer: { files: [file], types: ["Files"] } });
      } else if (!listing) {
        await waitFor(() => expect(row(path)).not.toBeNull());
        await act(async () => {
          if (createFolder) tree.current!.startCreating("folder", "");
          else invoke!();
        });
      }
      if (rename) {
        const input = await waitFor(() => {
          const field = document.querySelector(FILE_TREE_TAG_NAME)?.shadowRoot?.querySelector("input");
          expect(field).toBeInstanceOf(HTMLInputElement);
          return field!;
        });
        fireEvent.input(input, { target: { value: "renamed" } });
        fireEvent.keyDown(input, { key: "Enter" });
      }
      if (confirm) {
        const dialog = await screen.findByRole("alertdialog");
        fireEvent.click(within(dialog).getByRole("button", { name: /delete|move to/i }));
      }
      await waitFor(() => expect(responses.map(({ status }) => status)).toContain(failed ? 500 : 200));
      if (failed) {
        const error = await screen.findByText(failure);
        expect(error.closest("[data-sonner-toast], [role=alertdialog], [role=alert]")).not.toBeNull();
        expect(entries.map((entry) => entry.path)).toEqual(upload ? [] : [path]);
        expect(await responses[0]!.json()).toMatchObject({ code: "HOST_ERROR" });
      } else {
        if (toast) {
          await screen.findByText(toast);
          expect(entries.map((entry) => entry.path)).toContain(result);
        } else if (listing) {
          await waitFor(() => expect(row(path)).not.toBeNull());
        } else if (createFolder) {
          expect(folders).toHaveLength(1);
          await waitFor(() => expect(row(`${folders[0]}/`)).not.toBeNull());
        } else if (result) {
          await waitFor(() => expect(row(result)).not.toBeNull());
          expect(row(path)).toBeNull();
        } else {
          await waitFor(() => expect(row(path)).toBeNull());
          expect(entries).toEqual([]);
        }
        expect(screen.queryByText(failure)).toBeNull();
      }
    } finally {
      cleanup();
      query.clear();
      stop();
      dispose();
      window.location.hash = "";
    }
  }
});
