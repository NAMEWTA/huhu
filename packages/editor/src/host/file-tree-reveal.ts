export const FILE_TREE_REVEAL_EVENT = "huhu:file-tree-reveal";

export function requestFileTreeReveal(path: string): void {
  window.dispatchEvent(new CustomEvent<string>(FILE_TREE_REVEAL_EVENT, { detail: path }));
}
