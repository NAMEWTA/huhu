import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { host, type WindowChromeState } from "../settings/host.js";
import { AppMenuButton } from "./AppMenuButton.js";
import { BrandMark } from "./BrandMark.js";

export function WindowTitleBar({ onHome, center, actions }: { onHome?: () => void; center?: ReactNode; actions?: ReactNode }) {
  const chrome = host()?.windowChrome;
  const [state, setState] = useState<WindowChromeState>();
  useEffect(() => {
    if (!chrome) return;
    let current = true;
    let receivedChange = false;
    const off = chrome.onChange((next) => {
      receivedChange = true;
      if (current) setState(next);
    });
    void chrome.state().then(
      (first) => {
        if (current && !receivedChange) setState(first);
      },
      () => undefined,
    );
    return () => {
      current = false;
      off();
    };
  }, [chrome]);

  const brand = (
    <>
      <BrandMark className="shell-brand-mark" />
      <span>
        huhu<span className="shell-brand-suffix">workbench</span>
      </span>
    </>
  );
  return (
    <header
      className="shell-window-titlebar"
      data-testid="window-titlebar"
      data-platform={chrome?.platform}
      data-window-focused={state?.focused}
      data-window-maximized={state?.maximized}
      data-window-fullscreen={state?.fullScreen}
      style={
        chrome
          ? ({
              "--shell-window-height": `${chrome.height}px`,
              "--shell-title-fallback-left": `${chrome.fallback.left}px`,
              "--shell-title-fallback-right": `${chrome.fallback.right}px`,
            } as CSSProperties)
          : undefined
      }
    >
      <div className="shell-window-titlebar-content">
        <div className="shell-window-titlebar-controls">
          <AppMenuButton />
          {onHome ? (
            <button className="brand" type="button" onClick={onHome} aria-label="huhu workbench 首页">
              {brand}
            </button>
          ) : (
            <div className="brand">{brand}</div>
          )}
        </div>
        <div className="shell-window-titlebar-drag" aria-hidden="true" />
        {center}
        <div className="shell-window-titlebar-drag" aria-hidden="true" />
        {actions && <div className="shell-window-titlebar-controls">{actions}</div>}
      </div>
    </header>
  );
}
