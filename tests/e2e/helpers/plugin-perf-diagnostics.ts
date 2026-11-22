import type { Page, Request, Response, TestInfo } from "@playwright/test";
import { performance } from "node:perf_hooks";
import { setTimeout as delay } from "node:timers/promises";

const watchedCapabilities = new Set(["plugins.setEnabled", "plugins.list", "home.summary", "home.notes.recent", "health.run"]);
const requestIdPattern = /^(?:[a-f\d]{32}|[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12})$/iu;
const now = () => performance.timeOrigin + performance.now();

type RequestSample = {
  capability: string;
  namesOnly: boolean;
  requestId: string | null;
  method: "GET" | "POST";
  queuedAt: number;
  headersAt: number | null;
  endedAt: number | null;
  state: "pending" | "finished" | "cancelled" | "failed";
  status: number | null;
  timing: ReturnType<Request["timing"]>;
  responseBodyBytes: number | null;
  responseHeaderBytes: number | null;
};

/** Observe the existing plugin toggle journey without routing or issuing requests. */
export function observePluginPerformance(page: Page, info: TestInfo) {
  const startedAt = now();
  let stoppedAt: number | null = null;
  const marks: { name: string; at: number }[] = [];
  const requests: RequestSample[] = [];
  const active = new Map<Request, RequestSample>();
  const completed = new Map<Request, RequestSample>();

  function onRequest(request: Request) {
    const method = request.method();
    if (method !== "GET" && method !== "POST") return;
    const url = URL.parse(request.url());
    if (!url || (url.protocol !== "http:" && url.protocol !== "https:")) return;

    let capability: string;
    let requestId: string | null = null;
    if (method === "GET" && url.pathname === "/api/v1/capabilities") {
      capability = "capabilities.discovered";
    } else if (method === "POST" && url.pathname === "/api/v1/call") {
      try {
        const envelope = request.postDataJSON() as { capability?: unknown; requestId?: unknown } | null;
        if (typeof envelope?.capability !== "string" || !watchedCapabilities.has(envelope.capability)) return;
        capability = envelope.capability;
        if (typeof envelope.requestId === "string" && requestIdPattern.test(envelope.requestId)) requestId = envelope.requestId;
      } catch {
        return;
      }
    } else {
      return;
    }

    const sample: RequestSample = {
      capability,
      namesOnly: method === "GET" && url.searchParams.get("view") === "names",
      requestId,
      method,
      queuedAt: now(),
      headersAt: null,
      endedAt: null,
      state: "pending",
      status: null,
      timing: request.timing(),
      responseBodyBytes: null,
      responseHeaderBytes: null,
    };
    active.set(request, sample);
    requests.push(sample);
  }

  function onResponse(response: Response) {
    const request = response.request();
    const sample = active.get(request);
    if (!sample) return;
    sample.headersAt = now();
    sample.status = response.status();
    sample.timing = request.timing();
  }

  function finish(request: Request, state: "finished" | "failed") {
    const sample = active.get(request);
    if (!sample) return;
    active.delete(request);
    sample.endedAt = now();
    sample.state = state === "failed" && request.failure()?.errorText === "net::ERR_ABORTED" ? "cancelled" : state;
    sample.timing = request.timing();
    if (state === "finished") completed.set(request, sample);
  }

  const onFinished = (request: Request) => finish(request, "finished");
  const onFailed = (request: Request) => finish(request, "failed");
  page.on("request", onRequest);
  page.on("response", onResponse);
  page.on("requestfinished", onFinished);
  page.on("requestfailed", onFailed);

  function stop() {
    if (stoppedAt !== null) return;
    stoppedAt = now();
    page.off("request", onRequest);
    page.off("response", onResponse);
    page.off("requestfinished", onFinished);
    page.off("requestfailed", onFailed);
    active.clear();
  }

  return {
    mark(name: string, at = now()) {
      if (stoppedAt === null) marks.push({ name, at });
    },
    stop,
    async attach() {
      stop();
      // Size lookups use Playwright's network metadata and run after the timed requests.
      const deadline = new AbortController();
      try {
        const sizes = [...completed].map(async ([request, sample]) => {
          const { responseBodySize, responseHeadersSize } = await request.sizes();
          sample.responseBodyBytes = responseBodySize;
          sample.responseHeaderBytes = responseHeadersSize;
        });
        await Promise.race([Promise.allSettled(sizes), delay(1_000, undefined, { signal: deadline.signal })]);
      } finally {
        deadline.abort();
        completed.clear();
      }
      try {
        await info.attach("plugin-perf-network.json", {
          body: JSON.stringify({ startedAt, stoppedAt, marks, requests }, null, 2),
          contentType: "application/json",
        });
      } catch {
        console.error("[perf-diagnostics] plugin network attachment unavailable");
      }
    },
  };
}
