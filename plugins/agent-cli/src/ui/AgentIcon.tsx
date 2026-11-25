const icons = {
  claude: new URL("./agent-icons/claude.svg", import.meta.url).href,
  codex: new URL("./agent-icons/codex.svg", import.meta.url).href,
  pi: new URL("./agent-icons/pi.svg", import.meta.url).href,
  shell: new URL("./agent-icons/shell.svg", import.meta.url).href,
};

export function AgentIcon({ id, size = 16, name }: { id: string; size?: number; name?: string }) {
  const src = Object.hasOwn(icons, id) ? icons[id as keyof typeof icons] : undefined;
  if (src) return <img src={src} alt="" width={size} height={size} className="agent-icon" data-agent={id} />;
  return (
    <span className="agent-icon-fallback" style={{ width: size, height: size, fontSize: Math.round(size * 0.65) }} aria-hidden>
      {(name ?? id).slice(0, 1).toUpperCase()}
    </span>
  );
}
