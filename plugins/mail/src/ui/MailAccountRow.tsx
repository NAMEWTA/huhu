import { Button, IconButton, Popover } from "@huhu/ui";
import { Mail, MoreHorizontal, RefreshCw } from "lucide-react";
import { useId, useRef, useState } from "react";

export type MailAccountAction = "repair" | "rename" | "remove";
export type MailAccountStatus = { text: string; warning?: boolean };
const accountActions: { kind: MailAccountAction; label: string }[] = [
  { kind: "repair", label: "修复认证" },
  { kind: "rename", label: "更改名称" },
  { kind: "remove", label: "删除邮箱" },
];

export function MailAccountRow({
  accountId,
  title,
  selected,
  unread,
  status,
  busy,
  oauth,
  onSelect,
  onRefresh,
  onManage,
}: {
  accountId?: string;
  title: string;
  selected: boolean;
  unread: number | undefined;
  status?: MailAccountStatus;
  busy: boolean;
  oauth?: boolean;
  onSelect(): void;
  onRefresh?: () => void;
  onManage?(kind: MailAccountAction, trigger: HTMLButtonElement): void;
}) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const unreadId = useId();
  const descriptionId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const origin = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const openingDialog = useRef(false);
  const canOpen = !!(onRefresh || onManage);
  function showMenu(target: EventTarget) {
    openingDialog.current = false;
    origin.current = (target instanceof Element && target.closest("button")) || trigger.current;
    setOpen(true);
  }

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Anchor asChild>
        <div
          className="hu-mail-account-row"
          data-selected={selected}
          data-refreshing={busy}
          data-has-refresh={onRefresh || busy ? true : undefined}
          data-testid="mail-account-row"
          onContextMenu={(event) => {
            if (!canOpen) return;
            event.preventDefault();
            showMenu(event.target);
          }}
          onKeyDown={(event) => {
            if (!canOpen || (event.key !== "ContextMenu" && (event.key !== "F10" || !event.shiftKey))) return;
            event.preventDefault();
            showMenu(event.target);
          }}
        >
          <Button
            className="hu-mail-account-select"
            variant="ghost"
            aria-pressed={selected}
            aria-label={title}
            aria-describedby={status ? `${unreadId} ${descriptionId}` : unreadId}
            {...(accountId ? { "data-mail-account": accountId } : { "data-mail-all-accounts": "" })}
            onClick={onSelect}
          >
            {accountId && <Mail size={15} aria-hidden />}
            <span>{title}</span>
          </Button>
          <span id={unreadId} hidden>
            {unread === undefined ? "未读数未知" : `${unread} 封未读`}
          </span>
          {status && (
            <span id={descriptionId} className="hu-mail-account-description" data-warning={status.warning || undefined}>
              {status.text}
            </span>
          )}
          <div className="hu-mail-account-controls">
            <span className="hu-mail-account-unread" aria-hidden="true">
              {unread ?? "—"}
            </span>
            {(onRefresh || busy) && (
              <IconButton
                icon={RefreshCw}
                label={`刷新 ${title}`}
                size={14}
                className="hu-mail-account-refresh"
                aria-disabled={busy || !onRefresh}
                tabIndex={onRefresh ? undefined : -1}
                onClick={() => {
                  if (!busy) onRefresh?.();
                }}
              />
            )}
          </div>
          {canOpen && (
            <button
              type="button"
              ref={trigger}
              className="hu-icon-btn hu-mail-account-menu-trigger"
              aria-label={`${title}的操作`}
              aria-haspopup="menu"
              aria-expanded={open}
              aria-controls={open ? menuId : undefined}
              onClick={(event) => (open ? setOpen(false) : showMenu(event.currentTarget))}
              onKeyDown={(event) => {
                if (event.key !== "ArrowDown") return;
                event.preventDefault();
                showMenu(event.currentTarget);
              }}
            >
              <MoreHorizontal size={16} aria-hidden />
            </button>
          )}
        </div>
      </Popover.Anchor>
      {canOpen && (
        <Popover.Portal>
          <Popover.Content
            ref={menu}
            id={menuId}
            className="hu-mail-account-menu"
            role="menu"
            aria-label={`${title}的操作`}
            side="bottom"
            align="end"
            sideOffset={4}
            collisionPadding={8}
            onInteractOutside={(event) => {
              if (event.target instanceof Node && trigger.current?.contains(event.target)) event.preventDefault();
            }}
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              menu.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
            }}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              if (!openingDialog.current && (document.activeElement === document.body || menu.current?.contains(document.activeElement))) origin.current?.focus();
            }}
            onEscapeKeyDown={(event) => {
              event.preventDefault();
              origin.current?.focus();
              setOpen(false);
            }}
            onKeyDown={(event) => {
              if (event.key === "Tab") {
                origin.current?.focus();
                setOpen(false);
                return;
              }
              if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
              const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"));
              if (!items.length) return;
              event.preventDefault();
              const current = items.indexOf(document.activeElement as HTMLButtonElement);
              const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (current + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
              items[next]?.focus();
            }}
          >
            <Button
              variant="ghost"
              role="menuitem"
              tabIndex={-1}
              disabled={!onRefresh || busy}
              onClick={() => {
                origin.current?.focus();
                setOpen(false);
                onRefresh?.();
              }}
            >
              刷新
            </Button>
            {onManage &&
              accountActions.map(({ kind, label }) => (
                <Button
                  key={kind}
                  variant={kind === "remove" ? "danger" : "ghost"}
                  role="menuitem"
                  tabIndex={-1}
                  onClick={() => {
                    const button = origin.current;
                    if (!button) return;
                    openingDialog.current = true;
                    setOpen(false);
                    onManage(kind, button);
                  }}
                >
                  {kind === "repair" && oauth ? "重新授权" : label}
                </Button>
              ))}
          </Popover.Content>
        </Popover.Portal>
      )}
    </Popover.Root>
  );
}
