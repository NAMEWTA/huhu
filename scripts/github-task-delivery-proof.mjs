export async function verifyDeliveryIssue(github, { repository, issueId, issueNumber }) {
  const path = `/issues/${issueNumber}`;
  const { value: issue } = await github.request(`/repos/${repository}${path}`);
  if (issue.id !== issueId || issue.number !== issueNumber || "pull_request" in issue || issue.html_url?.toLowerCase() !== `https://github.com/${repository}${path}`) {
    throw new Error("GitHub Issue does not match the configured delivery target");
  }
  return path;
}

export function confirmDelivery(huhu, { sourceId, issueId, deliveryId, verification }, comment) {
  const evidence = comment
    ? { proof: { id: comment.id, actorId: comment.user?.id, url: comment.html_url, body: comment.body } }
    : { proof: null, verificationId: verification.id };
  return huhu("tasks.github.deliveries.confirm", { sourceId, issueId, deliveryId, ...evidence });
}

export async function findDeliveryComment(github, path, { actorId, body, repository }) {
  let match = null;
  for await (const page of github.pages(`${path}/comments`)) {
    for (const comment of page) {
      if (comment.user?.id !== actorId || comment.body !== body || !Number.isSafeInteger(comment.id) || comment.id <= 0 ||
          comment.html_url?.toLowerCase() !== `https://github.com/${repository}${path}#issuecomment-${comment.id}`) continue;
      if (match && match.id !== comment.id) return null;
      match = comment;
    }
  }
  return match;
}

export async function verifyPendingDeliveries(github, huhu, binding) {
  let pending;
  try {
    pending = await huhu("tasks.github.deliveries.pendingVerification", { sourceId: binding.sourceId });
  } catch (error) {
    if (["CAPABILITY_NOT_EXPOSED", "PERMISSION_DENIED", "NOT_FOUND"].includes(error.code)) return;
    throw error;
  }
  for (const delivery of pending) {
    if (delivery.repositoryId !== binding.repositoryId || delivery.repository !== binding.repository || delivery.sourceId !== binding.sourceId) {
      throw new Error("Huhu delivery does not match the configured GitHub target");
    }
    try {
      const path = await verifyDeliveryIssue(github, delivery);
      const match = await findDeliveryComment(github, path, delivery);
      await confirmDelivery(huhu, delivery, match);
    } catch (error) {
      // Keep this request pending for the next scan if the source or Engine could not be reached.
      process.stderr.write(`GitHub delivery ${delivery.deliveryId}: ${error.message}\n`);
    }
  }
}
