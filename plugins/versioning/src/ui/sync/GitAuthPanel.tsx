import { Button } from "@huhu/ui";
import { useCapability } from "@huhu/workbench";
import { useState } from "react";
import type { ConfigureGitAuth, GitAuthSummary } from "../../engine/remote-auth.js";
import { t } from "../i18n.js";
import { useCall } from "../useCall.js";

export function GitAuthPanel({ remote, readOnly }: { remote: string; readOnly: boolean }) {
  const auth = useCapability<GitAuthSummary>("sync.auth.get", {});
  const call = useCall();
  const [username, setUsername] = useState("");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string }>();
  const current = auth.isFetching ? undefined : auth.data;

  async function save(credential: ConfigureGitAuth["credential"]) {
    if (!current || busy || readOnly) return;
    setBusy(true);
    setFeedback(undefined);
    const result = await call<GitAuthSummary>("sync.auth.configure", { remote, expectedRevision: current.revision, credential });
    setBusy(false);
    if (result.ok) {
      setUsername("");
      setToken("");
      setFeedback({ ok: true, text: credential.action === "clear" ? t.sync.credentialCleared : t.sync.credentialSaved });
    } else {
      setFeedback({ ok: false, text: result.code === "VERSION_CONFLICT" ? t.sync.credentialConflict : t.sync.credentialSaveError });
    }
  }

  return (
    <form
      aria-label={t.sync.credential}
      className="hu-form"
      data-testid="sync-auth-panel"
      onSubmit={(event) => {
        event.preventDefault();
        if (!username.trim() || !token) return;
        void save({ action: "replace", username: username.trim(), token, ...(current?.state === "needs-reconfiguration" && { reconfigure: true }) });
      }}
    >
      <fieldset disabled={!current || auth.isError || busy || readOnly}>
        <legend>{t.sync.credential}</legend>
        <code>{remote}</code>
        <p role="status" data-testid="sync-auth-state">
          {current && t.sync.credentialState[current.state]}
        </p>
        <label>
          {t.sync.credentialUser}
          <input className="hu-input" value={username} autoComplete="off" maxLength={128} onChange={(event) => setUsername(event.currentTarget.value)} />
        </label>
        <label>
          {t.sync.credentialToken}
          <input className="hu-input" type="password" value={token} autoComplete="off" maxLength={4096} onChange={(event) => setToken(event.currentTarget.value)} />
        </label>
        <div className="hu-row">
          <Button type="submit" variant="primary" disabled={!username.trim() || !token}>
            {t.sync.credentialSave}
          </Button>
          {current?.state === "configured" ? (
            <Button type="button" onClick={() => void save({ action: "clear" })}>
              {t.sync.credentialClear}
            </Button>
          ) : null}
        </div>
      </fieldset>
      {auth.isError ? (
        <div role="alert">
          {t.sync.credentialLoadError}{" "}
          <Button type="button" onClick={() => void auth.refetch()}>
            {t.sync.credentialRetry}
          </Button>
        </div>
      ) : null}
      {feedback ? <p role={feedback.ok ? "status" : "alert"}>{feedback.text}</p> : null}
    </form>
  );
}
