export type DirectoryMove = "open" | "back" | "forward";

export interface DirectoryHistory<T> {
  back: T[];
  forward: T[];
}

const limit = 64;

export function recordDirectoryMove<T>(history: DirectoryHistory<T>, previous: T, direction: DirectoryMove): DirectoryHistory<T> {
  switch (direction) {
    case "back":
      return { back: history.back.slice(0, -1), forward: [...history.forward, previous].slice(-limit) };
    case "forward":
      return { back: [...history.back, previous].slice(-limit), forward: history.forward.slice(0, -1) };
    case "open":
      return { back: [...history.back, previous].slice(-limit), forward: [] };
  }
}
