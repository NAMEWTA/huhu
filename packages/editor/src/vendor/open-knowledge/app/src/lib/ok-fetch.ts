import { createContext, useContext } from "react";

// The Huhu host attaches its API adapter while an OK surface is mounted.
type Fetch = typeof globalThis.fetch;
const adapters = new Set<Fetch>();

export function attachOkFetch(adapter: Fetch): () => void {
  const request: Fetch = (input, init) => adapter(input, init);
  adapters.add(request);
  return () => {
    adapters.delete(request);
  };
}

export const okFetch: Fetch = (input, init) => {
  for (const adapter of adapters) return adapter(input, init);
  return globalThis.fetch(input, init);
};

// A React surface binds its own transport, including through React portals.
export const OkFetchContext = createContext<Fetch>(okFetch);

export function useOkFetch(): Fetch {
  return useContext(OkFetchContext);
}

// Commands in a ProseMirror extension have the editor instance, without React context.
const editorRequests = new WeakMap<object, Fetch>();

export function bindEditorFetch(editor: object, request: Fetch): () => void {
  editorRequests.set(editor, request);
  return () => {
    if (editorRequests.get(editor) === request) editorRequests.delete(editor);
  };
}

export function editorFetch(editor: object): Fetch {
  return editorRequests.get(editor) ?? okFetch;
}
