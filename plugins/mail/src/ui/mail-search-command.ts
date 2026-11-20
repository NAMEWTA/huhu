let openSearch: (() => void) | undefined;
let pending = false;

export function requestMailSearch(openMail?: () => void) {
  if (openSearch) {
    openSearch();
  } else if (openMail) {
    pending = true;
    openMail();
  }
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
