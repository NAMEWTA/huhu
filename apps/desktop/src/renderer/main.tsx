import { createRoot } from "react-dom/client";

function Boot() {
  return <main data-testid="boot">HUHU Workbench</main>;
}

createRoot(document.getElementById("root")!).render(<Boot />);
