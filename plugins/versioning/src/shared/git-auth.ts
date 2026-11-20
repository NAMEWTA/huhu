export function canSendAuthentication(target: string): boolean {
  const url = new URL(target);
  return url.protocol === "https:" || (url.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname));
}
