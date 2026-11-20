import type { Page } from "@playwright/test";

export async function desktopCall<T>(page: Page, capability: string, input: unknown = {}): Promise<T> {
  const response = await page.evaluate(
    async ({ capability, input }) => {
      const { baseUrl, token } = await (window as unknown as { huhuHost: { engine(): Promise<{ baseUrl: string; token: string }> } }).huhuHost.engine();
      const res = await fetch(`${baseUrl}/api/v1/call`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ capability, input, requestId: crypto.randomUUID(), idempotencyKey: crypto.randomUUID() }),
      });
      return res.json() as Promise<{ ok: true; data: unknown } | { ok: false; error: { code: string } }>;
    },
    { capability, input },
  );
  if (!response.ok) throw new Error(`${capability}: ${response.error.code}`);
  return response.data as T;
}
