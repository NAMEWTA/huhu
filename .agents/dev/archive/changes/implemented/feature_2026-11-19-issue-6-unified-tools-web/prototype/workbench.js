"use strict";
const region = document.querySelector("#view");
const nav = document.querySelector("#sections");
const dialog = document.querySelector("#modal");
const notice = document.querySelector("#status");
const text = (value) => String(value ?? "").replace(/[&<>"']/g, (character) =>
  ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"})[character]);
const badge = (label, tone = "") => `<span class="badge ${tone}">${text(label)}</span>`;
const button = (label, action, id = "", options = "") =>
  `<button type="button" data-action="${action}" data-id="${text(id)}" ${options}>${text(label)}</button>`;
const checked = (value) => value ? "checked" : "";
const disabled = (value) => value ? "disabled" : "";
const option = (value, label, current) =>
  `<option value="${text(value)}" ${current === value ? "selected" : ""}>${text(label)}</option>`;
const heading = (title, description, actions = "") =>
  `<header class="page-head"><div><h1>${text(title)}</h1><p>${text(description)}</p></div><div class="row">${actions}</div></header>`;
function table(label, headers, rows) {
  return `<div class="scroll-table" role="region" aria-label="${text(label)}" tabindex="0"><table aria-label="${text(label)}"><thead><tr>${headers.map((value) => `<th scope="col">${text(value)}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table></div>`;
}
function show(title, body, commit, label = "确认") {
  dialog.innerHTML = `<form class="stack"><h2 id="modal-title">${text(title)}</h2>${body}<footer><button type="button" data-close>取消</button>${commit ? `<button type="submit" class="primary">${text(label)}</button>` : ""}</footer></form>`;
  dialog.querySelector("[data-close]").addEventListener("click", () => dialog.close());
  dialog.querySelector("form").addEventListener("submit", (event) => {
    event.preventDefault();
    if (commit?.(new FormData(event.currentTarget)) !== false) dialog.close();
  });
  const initial = dialog.querySelector("input:not([type=hidden]):not(:disabled),select:not(:disabled),textarea:not(:disabled)") || dialog.querySelector("[data-close]");
  initial.setAttribute("autofocus","");
  dialog.showModal();
}
function say(message) { notice.textContent = message; }
document.querySelector("#theme").addEventListener("click", (event) => {
  const dark = document.documentElement.dataset.mode !== "dark";
  document.documentElement.dataset.mode = dark ? "dark" : "light";
  event.currentTarget.setAttribute("aria-pressed", String(dark));
});
function renderNav(items, selected) {
  nav.innerHTML = items.map(([key, label, icon]) => key ?
    `<button type="button" data-action="nav" data-id="${key}" ${key === selected ? 'aria-current="page"' : ""}><span class="section-icon" aria-hidden="true">${icon}</span>${text(label)}</button>` :
    '<div class="section-break" aria-hidden="true"></div>').join("");
}
function appClicks(dispatch) {
  document.addEventListener("click", (event) => {
    const control = event.target.closest("button[data-action]");
    if (!control || control.disabled) return;
    dispatch(control.dataset.action, control.dataset.id, control);
  });
}
function keepFocus(control, fallback) {
  if (!control?.dataset.action || control.isConnected) return;
  const replacement = [...document.querySelectorAll("button[data-action]")]
    .find((candidate) => candidate.dataset.action === control.dataset.action && candidate.dataset.id === control.dataset.id && !candidate.disabled);
  (replacement || fallback)?.focus();
}

