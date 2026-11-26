#!/usr/bin/env node
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { endpoint, githubClient, huhuClient, repositoryName } from "./github-task-connector.mjs";
import { confirmDelivery, findDeliveryComment, verifyDeliveryIssue } from "./github-task-delivery-proof.mjs";

export async function deliver(github, huhu, { repository, repositoryId, issueNumber, ...key }) {
  await github.verify(repositoryId);
  const issuePath = await verifyDeliveryIssue(github, { repository, issueNumber, issueId: key.issueId });
  const { value: actor } = await github.request("/user");
  if (!Number.isSafeInteger(actor.id) || actor.id <= 0) throw new Error("Could not identify the outgoing GitHub account");

  const reservation = await huhu("tasks.github.deliveries.claim", { ...key, actorId: actor.id });
  if (reservation.repositoryId !== repositoryId || reservation.repository !== repository || reservation.issueNumber !== issueNumber || reservation.actorId !== actor.id) {
    throw new Error("Huhu delivery does not match the configured GitHub target");
  }
  if (reservation.state === "accepted") return reservation;
  const confirm = (comment) => confirmDelivery(huhu, reservation, comment);

  if (reservation.send) {
    try {
      const { value: posted } = await github.request(`/repos/${repository}${issuePath}/comments`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body: reservation.body }),
      });
      return await confirm(posted);
    } catch {
      // The comment could already exist. Only read it back; a second POST is unsafe.
    }
  }

  try {
    const current = await huhu("tasks.github.deliveries.read", key);
    if (current.state === "accepted") return current;
    const match = await findDeliveryComment(github, issuePath, reservation);
    return match ? await confirm(match) : current;
  } catch {
    return { ...reservation, send: false };
  }
}

async function main() {
  const { values } = parseArgs({
    options: {
      source: { type: "string" },
      repository: { type: "string" },
      "repository-id": { type: "string" },
      engine: { type: "string" },
      api: { type: "string", default: "https://api.github.com" },
      task: { type: "string" },
      receipt: { type: "string" },
      "issue-id": { type: "string" },
      "issue-number": { type: "string" },
    },
  });
  const repository = values.repository?.toLowerCase();
  const repositoryId = Number(values["repository-id"]);
  const issueId = Number(values["issue-id"]);
  const issueNumber = Number(values["issue-number"]);
  const githubToken = process.env.HUHU_CONNECTOR_GITHUB_TOKEN;
  const huhuToken = process.env.HUHU_CONNECTOR_ENGINE_TOKEN;
  if (
    !repository ||
    !repositoryName.test(repository) ||
    ![repositoryId, issueId, issueNumber].every((id) => Number.isSafeInteger(id) && id > 0) ||
    !githubToken ||
    !huhuToken ||
    !values.source ||
    !values.engine ||
    !values.task ||
    !values.receipt
  ) {
    throw new Error("Specify --repository OWNER/REPO --repository-id ID --issue-id ID --issue-number NUMBER --source UUID --engine URL --task ID --receipt ID and the connector tokens");
  }
  const github = githubClient(endpoint(values.api, true), githubToken, repository);
  const huhu = huhuClient(endpoint(values.engine), huhuToken);
  const { deliveryId, state, comment } = await deliver(github, huhu, {
    sourceId: values.source,
    repository,
    repositoryId,
    issueId,
    issueNumber,
    taskId: values.task,
    receiptId: values.receipt,
  });
  console.log(JSON.stringify({ deliveryId, state, comment }));
  if (state === "unknown") process.exitCode = 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
