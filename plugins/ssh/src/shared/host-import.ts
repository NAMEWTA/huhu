export const importFormats = ["openssh", "putty", "xshell", "mobaxterm", "windterm", "electerm", "netcatty", "securecrt"] as const;
export type HostImportFormat = (typeof importFormats)[number];
export type ImportLocation = { kind: "line" | "record"; index: number };
export const MAX_BYTES = 4 * 1024 * 1024;
