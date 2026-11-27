import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { VaultFiles } from "@huhu/vault";
import { expect, test, vi } from "vitest";
import { GitHubDeliveries, resultDeliveryDescriptors } from "../src/engine/result-delivery.js";
import { githubCommentEvent, githubIssue, githubRepository } from "./github-fixture.js";

test("核实沿用原 GitHub 投递，无证据保持 unknown，只接受原作者与内容证据", async () => {
  const { verifyPendingDeliveries } = await import(/* @vite-ignore */ new URL("../../../scripts/github-task-delivery-proof.mjs", import.meta.url).href);
  const { deliver } = await import(/* @vite-ignore */ new URL("../../../scripts/github-task-delivery.mjs", import.meta.url).href);
  const root = mkdtempSync(path.join(tmpdir(), "huhu-github-verify-"));
  try {
    const savedResult = { receiptId: "receipt-fixture", messageId: "message-fixture", body: "待核实的结果" };
    const result = vi.fn(() => savedResult);
    const files = new VaultFiles(root);
    const deliveries = new GitHubDeliveries(files, result);
    const sourceId = randomUUID();
    const binding = { sourceId, repository: githubRepository.name, repositoryId: githubRepository.id };
    const scope = { ...binding, issueId: githubIssue.id, issueNumber: githubIssue.number };
    const key = { sourceId, issueId: scope.issueId, taskId: "task-fixture", receiptId: savedResult.receiptId };
    const actor = { id: 81, login: "outbound-fixture" };
    const authorize = () => {};
    await deliveries.allow(scope, actor.id);

    let originalComment: ReturnType<typeof githubCommentEvent>["payload"]["comment"] | undefined;
    let comments: NonNullable<typeof originalComment>[] = [];
    const github = {
      verify: vi.fn(async () => {}),
      request: vi.fn(async (url: string, init?: { method: string; body: string }) => {
        if (url === "/user") return { value: actor };
        if (url === `/repos/${scope.repository}/issues/${scope.issueNumber}`) return { value: githubIssue };
        expect(init?.method).toBe("POST");
        originalComment = githubCommentEvent("20150", JSON.parse(init!.body).body, actor).payload.comment;
        throw new Error("lost POST response");
      }),
      pages: vi.fn(async function* () {
        yield comments;
      }),
    };
    // Re-open the delivery store to exercise durable verification and the established confirmation contract.
    const reopened = new GitHubDeliveries(files, result);
    const huhu = vi.fn(async (capability: string, input: unknown) => {
      if (capability === "tasks.github.deliveries.claim") return deliveries.claim(key, scope, resultDeliveryDescriptors.githubClaimDelivery.input.parse(input).actorId, authorize);
      if (capability === "tasks.github.deliveries.read") return deliveries.read(resultDeliveryDescriptors.githubReadDelivery.input.parse(input));
      if (capability === "tasks.github.deliveries.pendingVerification") {
        const source = resultDeliveryDescriptors.githubPendingVerification.input.parse(input);
        return reopened.pendingVerification(source.sourceId);
      }
      expect(capability).toBe("tasks.github.deliveries.confirm");
      const confirmation = resultDeliveryDescriptors.githubConfirmDelivery.input.parse(input);
      return confirmation.proof === null ? reopened.finishUnconfirmed(scope, confirmation.deliveryId, confirmation.verificationId!, authorize) : reopened.confirm(scope, confirmation.deliveryId, confirmation.proof, authorize);
    });
    const original = await deliver(github, huhu, { ...scope, ...key });
    expect(original).toMatchObject({ ...key, state: "unknown" });
    expect(originalComment).toBeDefined();
    comments = [{ ...originalComment!, user: { id: 82, login: "other" } }];
    expect(reopened.pendingVerification(sourceId)).toEqual([]);
    const first = resultDeliveryDescriptors.githubRequestVerification.input.parse({ ...key, verificationId: "0123456789abcdef0123456789abcdef" });
    expect(await deliveries.requestVerification(key, scope, first.verificationId, authorize)).toMatchObject({ verification: { state: "pending" } });
    expect(await deliveries.requestVerification(key, scope, randomUUID(), authorize)).toMatchObject({ verification: { id: first.verificationId } });
    expect(reopened.pendingVerification(randomUUID())).toEqual([]);
    await verifyPendingDeliveries(github, huhu, binding);
    expect(reopened.read(key)).toMatchObject({ ...key, deliveryId: original.deliveryId, state: "unknown", verification: { id: first.verificationId, state: "unconfirmed" } });
    expect(await deliveries.requestVerification(key, scope, first.verificationId, authorize)).toMatchObject({ verification: { state: "unconfirmed" } });
    const second = randomUUID();
    await deliveries.requestVerification(key, scope, second, authorize);
    await reopened.finishUnconfirmed(scope, original.deliveryId, first.verificationId, authorize);
    expect(reopened.pendingVerification(sourceId)).toMatchObject([{ verification: { id: second, state: "pending" } }]);
    comments = [originalComment!];
    await verifyPendingDeliveries(github, huhu, binding);
    expect(reopened.read(key)).toMatchObject({ ...key, deliveryId: original.deliveryId, messageId: savedResult.messageId, state: "accepted", comment: { id: originalComment!.id, url: originalComment!.html_url, actorId: actor.id } });
    expect(reopened.pendingVerification(sourceId)).toEqual([]);
    expect(await deliver(github, huhu, { ...scope, ...key })).toMatchObject({ send: false, state: "accepted", deliveryId: original.deliveryId });
    expect(github.request.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
    expect(result).toHaveBeenCalledOnce();
    expect(github.pages).toHaveBeenCalledTimes(3);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
