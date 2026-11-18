import type { ModuleContribution } from "@huhu/workbench";
import { NotebookPen } from "lucide-react";
import { lazy, Suspense } from "react";
import { t } from "./i18n.js";

const NotesModule = lazy(() => import("./NotesModule.js").then(({ NotesModule }) => ({ default: NotesModule })));

export const contributions: { modules: ModuleContribution[] } = {
  modules: [
    {
      id: "notes",
      plugin: "notes",
      title: t.title,
      group: "primary",
      order: 20,
      icon: <NotebookPen size={18} aria-hidden />,
      component: (props) => (
        <Suspense fallback={<p role="status">{t.loading}</p>}>
          <NotesModule {...props} />
        </Suspense>
      ),
    },
  ],
};
