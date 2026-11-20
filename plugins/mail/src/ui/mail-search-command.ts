let openSearch: (() => void) | undefined;
let pending = false;

export async function requestMailSearch(openMail?: () => boolean | void | Promise<boolean | void>) {
  if (showSearch()) return;
  if (!openMail || (await openMail()) === false) return;
  if (!showSearch()) pending = true;
}

function showSearch(): boolean {
  if (!openSearch) return false;
  openSearch();
  return true;
}

export function onMailSearchRequest(open: () => void) {
  openSearch = open;
  if (pending) {
    pending = false;
    open();
  }
  return () => {
    if (openSearch === open) openSearch = undefined;
  };
}
