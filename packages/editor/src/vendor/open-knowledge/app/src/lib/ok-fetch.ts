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
