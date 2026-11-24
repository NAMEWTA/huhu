const by = (selector, root = document) => root.querySelector(selector);
const all = (selector, root = document) => [...root.querySelectorAll(selector)];
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[character]);
const icon = (name) => prototypeIcons[name] ?? "";
const button = (label, options = {}) => {
  const { name = "", className = "", aria = "", attrs = "" } = options;
  return `<button type="button" class="${className}" ${aria ? `aria-label="${escapeHtml(aria)}"` : ""} ${attrs}>${icon(name)}${escapeHtml(label)}</button>`;
};
const badge = (text, tone = "") => `<span class="badge ${tone}">${escapeHtml(text)}</span>`;
const option = (value, label, selected) => `<option value="${escapeHtml(value)}" ${selected === value ? "selected" : ""}>${escapeHtml(label)}</option>`;
let fieldSequence = 0;
const field = (label, control) => {
  const id = `field-label-${++fieldSequence}`;
  const named = control.replace(/^<(input|select|textarea)\b/, (_, tag) => `<${tag} aria-labelledby="${id}"`);
  return `<label class="field"><span id="${id}">${escapeHtml(label)}</span>${named}</label>`;
};
const heading = (title, copy, actions = "") => `<header class="page-head"><div><h1>${title}</h1>${copy ? `<p>${copy}</p>` : ""}</div><div class="row">${actions}</div></header>`;
const tab = (label, selected, attrs) => button(label, { className: "quiet", attrs: `aria-pressed="${selected}" ${attrs}` });
const demo = (code, title, control) => `<label class="field"><span>${title}</span><select data-demo="${code}">${control}</select></label>`;

const workbench = by("#workbench");
const main = by("#surface");
const menu = by("#section-menu");
const rail = by("#rail");
const workspaceTabs = by("#workspace-tabs");
const statusLine = by("#status-message");
const app = { route: "", pages: {}, opened: [], title: "", onLeave: null, demo: () => "" };

function bind(id, handler, root = document) {
  by(`#${id}`, root)?.addEventListener("click", handler);
}

function setStatus(message) {
  statusLine.textContent = message;
}

function theme(mode = document.documentElement.dataset.mode, name = document.documentElement.dataset.theme) {
  document.documentElement.dataset.mode = mode;
  document.documentElement.dataset.theme = name;
  by("#theme-toggle").innerHTML = icon(mode === "dark" ? "Sun" : "Moon");
  by("#theme-toggle").setAttribute("aria-label", mode === "dark" ? "切换浅色" : "切换深色");
}

function startShell(configuration) {
  Object.assign(app, configuration);
  bind("theme-toggle", () => theme(document.documentElement.dataset.mode === "dark" ? "light" : "dark"));
  bind("reset-demo", () => location.reload());
  by("#demo-fields").innerHTML = app.demo();
  const route = location.hash.slice(1).split("/")[0];
  openPage(app.pages[route] ? route : configuration.defaultRoute, { initial: true });
  theme();
  addEventListener("hashchange", () => {
    const next = location.hash.slice(1).split("/")[0];
    if (app.pages[next] && next !== app.route) openPage(next, { initial: true });
  });
}

function openPage(route, { initial = false } = {}) {
  if (!app.pages[route]) return;
  const proceed = () => {
    if (app.route !== route) {
      app.route = route;
      if (!app.opened.includes(route)) app.opened.push(route);
      if (!initial) history.replaceState(null, "", `#${route}`);
      setStatus("");
      main.scrollTop = 0;
    }
    renderShell();
  };
  if (!initial && app.route !== route && app.onLeave?.(proceed)) return;
  proceed();
}

function renderShell() {
  const active = app.pages[app.route];
  const renderNav = (keys, extraClass) => keys.map((key) => {
    const entry = app.pages[key];
    return button(extraClass === "rail-button" ? "" : entry.label, {
      name: entry.icon, className: `quiet ${extraClass}`, aria: entry.label,
      attrs: `data-route="${key}" title="${entry.label}" ${key === app.route ? 'aria-current="page"' : ""}`,
    });
  }).join("");
  rail.innerHTML = renderNav(app.navigation ?? Object.keys(app.pages), "rail-button");
  workspaceTabs.innerHTML = renderNav(app.opened, "workspace-tab");
  by("#crumb").textContent = active.label;
  menu.innerHTML = active.sidebar?.() ?? "";
  active.show();
}

workbench.addEventListener("click", (event) => {
  const link = event.target.closest("[data-route]");
  if (link) openPage(link.dataset.route);
});

function modal(title, body, { wide = false, closing = () => true } = {}) {
  const dialog = document.createElement("dialog");
  dialog.className = `host-dialog ${wide ? "wide" : ""}`;
  dialog.setAttribute("aria-label", title);
  dialog.innerHTML = `<header class="bar dialog-head"><h2>${escapeHtml(title)}</h2>${button("", { name: "X", aria: "关闭", className: "quiet", attrs: "data-close" })}</header>${body}`;
  document.body.append(dialog);
  const close = () => { if (closing(dialog)) dialog.close(); };
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    close();
  });
  dialog.addEventListener("close", () => dialog.remove(), { once: true });
  dialog.addEventListener("click", (event) => {
    if (event.target.closest("[data-close]")) close();
  });
  dialog.showModal();
  return dialog;
}

function confirmation(title, description, label, action) {
  const dialog = modal(title, `<div class="dialog-body stack"><p>${escapeHtml(description)}</p></div>
    <footer class="dialog-footer">${button("返回", { attrs: "data-close autofocus" })}${button(label, { attrs: "id=confirm-action", className: "danger" })}</footer>`);
  bind("confirm-action", () => {
    dialog.close();
    action();
  }, dialog);
}

function markCurrent(container, attribute, value, handler) {
  all(`[data-${attribute}]`, container).forEach((entry) => {
    const key = entry.getAttribute(`data-${attribute}`);
    entry.setAttribute("aria-pressed", String(key === value));
    entry.onclick = () => handler(key);
  });
}

function isNarrow(element) {
  return element.getBoundingClientRect().width < 680;
}
