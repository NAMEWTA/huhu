#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

const loopback = new Set(["localhost", "127.0.0.1", "[::1]"]);
const id = /^\d{1,40}$/u;
const repositoryName = /^[\w-]+\/(?!\.{1,2}$)[\w.-]+$/u;

function endpoint(value, github = false) {
  const url = new URL(value);
  const local = url.protocol === "http:" && loopback.has(url.hostname);
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/" || !(local || (github ? url.origin === "https://api.github.com" : url.protocol === "https:"))) {
    throw new Error("Invalid connector endpoint");
  }
  return url;
}

async function json(url, init) {
  const response = await fetch(url, { ...init, redirect: "error", signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`${url.pathname}: HTTP ${response.status}`);
  return { value: await response.json(), link: response.headers.get("link") };
}

export function githubClient(base, token, repository) {
  const prefix = `/repos/${repository}`;
  const headers = { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "x-github-api-version": "2026-03-10" };
  const request = (path, init = {}) => json(new URL(path, base), { ...init, headers: { ...headers, ...init.headers } });

  async function* pages(path) {
    const first = new URL(`${prefix}${path}?per_page=100`, base);
    let url = first;
    const seen = new Set();
    while (url && seen.size < 30) {
      if (seen.has(url.href) || url.origin !== first.origin || url.pathname.toLowerCase() !== first.pathname.toLowerCase()) {
        throw new Error("Unexpected GitHub pagination target");
      }
      seen.add(url.href);
      const { value, link } = await request(url);
      if (!Array.isArray(value)) throw new Error("Expected a paginated GitHub collection");
      yield value;
      const next = link?.match(/<([^>]+)>;\s*rel="next"/u)?.[1];
      url = next ? new URL(next, url) : null;
    }
    if (url) throw new Error("GitHub pagination limit reached");
  }

  return {
    request,
    pages,
    async verify(repositoryId) {
      const { value } = await request(prefix);
      if (value.id !== repositoryId || value.full_name?.toLowerCase() !== repository.toLowerCase()) {
        throw new Error("GitHub repository does not match the configured identity");
      }
    },
  };
}

export function huhuClient(base, token) {
  return async (capability, input) => {
    const { value } = await json(new URL("/api/v1/call", base), {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ capability, input, requestId: randomUUID(), idempotencyKey: randomUUID() }),
    });
    if (!value.ok) {
      const error = new Error(`${capability}: ${value.error?.code ?? "INVALID_RESULT"}`);
      error.code = value.error?.code;
      throw error;
    }
    return value.data;
  };
}

async function readCursor(file, binding) {
  try {
    const previous = JSON.parse(await readFile(file, "utf8"));
    if (previous.schema !== 1 || previous.sourceId !== binding.sourceId || previous.repositoryId !== binding.repositoryId || previous.repository !== binding.repository || !id.test(previous.eventId)) {
      throw new Error("Cursor belongs to a different configured source");
    }
    return previous.eventId;
  } catch (error) {
    if (error.code === "ENOENT") return undefined;
    throw error;
  }
}

async function saveCursor(file, binding, eventId) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify({ schema: 1, ...binding, eventId }) + "\n", { flag: "wx", mode: 0o600, flush: true });
    await rename(temporary, file);
  } finally {
    await rm(temporary, { force: true });
  }
}

export async function scan(github, huhu, binding, file) {
  const cursor = await readCursor(file, binding);
  const unseen = [];
  let found = cursor === undefined;
  let newest;
  events: for await (const page of github.pages("/events")) {
    for (const raw of page) {
      if (typeof raw.id !== "string" || !id.test(raw.id)) throw new Error("GitHub returned an invalid event ID");
      newest ??= raw.id;
      if (raw.id === cursor) {
        found = true;
        break events;
      }
      if (raw.type !== "IssuesEvent" && raw.type !== "IssueCommentEvent") continue;
      if (!raw.payload?.issue) throw new Error("GitHub returned an event without its Issue");
      if ("pull_request" in raw.payload.issue) continue;
      if (raw.repo?.id !== binding.repositoryId || raw.repo.name?.toLowerCase() !== binding.repository) {
        throw new Error("Received a GitHub event from an unbound repository");
      }
      unseen.push(raw);
    }
  }
  if (!found) {
    throw new Error(`GitHub event cursor ${cursor} is outside the visible history. Use --inspect-issue NUMBER to verify known affected objects before choosing a new cursor.`);
  }

  const receipts = [];
  for (const raw of unseen.reverse()) {
    let result;
    try {
      result = await huhu("tasks.github.events.accept", { sourceId: binding.sourceId, raw });
    } catch (error) {
      if (error.code && error.code !== "INTERNAL") throw error;
      try {
        result = await huhu("tasks.github.events.read", { sourceId: binding.sourceId, eventId: raw.id });
      } catch {
        throw error;
      }
      if (result.state === "pending") throw error;
    }
    receipts.push({ eventId: raw.id, taskId: result.taskId, state: result.state });
  }
  if (newest && newest !== cursor) await saveCursor(file, binding, newest);
  return receipts;
}

async function main() {
  const { values } = parseArgs({
    options: {
      source: { type: "string" },
      repository: { type: "string" },
      "repository-id": { type: "string" },
      engine: { type: "string" },
      cursor: { type: "string" },
      api: { type: "string", default: "https://api.github.com" },
      "inspect-issue": { type: "string" },
    },
  });
  const repository = values.repository?.toLowerCase();
  const repositoryId = Number(values["repository-id"]);
  const githubToken = process.env.HUHU_CONNECTOR_GITHUB_TOKEN;
  if (!repository || !repositoryName.test(repository) || !Number.isSafeInteger(repositoryId) || repositoryId <= 0 || !githubToken) {
    throw new Error("Specify --repository OWNER/REPO --repository-id ID and HUHU_CONNECTOR_GITHUB_TOKEN");
  }
  const github = githubClient(endpoint(values.api, true), githubToken, repository);
  await github.verify(repositoryId);
  if (values["inspect-issue"]) {
    const number = values["inspect-issue"];
    if (!/^[1-9]\d*$/u.test(number)) throw new Error("Invalid Issue number");
    const { value: issue } = await github.request(`/repos/${repository}/issues/${number}`);
    if (issue.number !== Number(number) || "pull_request" in issue) throw new Error("Expected the configured repository's Issue");
    const commentIds = [];
    for await (const page of github.pages(`/issues/${number}/comments`)) commentIds.push(...page.map(({ id }) => id));
    console.log(JSON.stringify({ issueId: issue.id, number: issue.number, url: issue.html_url, commentIds }));
    return;
  }
  const huhuToken = process.env.HUHU_CONNECTOR_ENGINE_TOKEN;
  if (!values.source || !values.engine || !values.cursor || !huhuToken) {
    throw new Error("Specify --source UUID --engine URL --cursor FILE and HUHU_CONNECTOR_ENGINE_TOKEN");
  }
  const huhu = huhuClient(endpoint(values.engine), huhuToken);
  console.log(JSON.stringify(await scan(github, huhu, { sourceId: values.source, repository, repositoryId }, values.cursor)));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
