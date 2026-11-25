export const githubRepository = { id: 201, name: "fixture/tasks" };
export const githubIssue = {
  id: 301,
  number: 4,
  title: "GitHub 来源任务",
  body: "原 Issue 正文",
  html_url: "https://github.com/fixture/tasks/issues/4",
  updated_at: "2026-11-24T10:00:00Z",
};
export const githubAuthor = { id: 42, login: "issue-author" };

export function githubIssueEvent(id = "20101", changes: Partial<typeof githubIssue> = {}) {
  return {
    id,
    type: "IssuesEvent",
    repo: githubRepository,
    actor: githubAuthor,
    created_at: "2026-11-24T10:00:00Z",
    payload: { action: "opened", issue: { ...githubIssue, ...changes } },
  };
}

export function githubCommentEvent(id: string, body: string, actor = githubAuthor, commentId = Number(id)) {
  return {
    id,
    type: "IssueCommentEvent",
    repo: githubRepository,
    actor,
    created_at: "2026-11-24T10:02:00Z",
    payload: {
      action: "created",
      issue: githubIssue,
      comment: { id: commentId, body, user: actor, html_url: `${githubIssue.html_url}#issuecomment-${commentId}` },
    },
  };
}
