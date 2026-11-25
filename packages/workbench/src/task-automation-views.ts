import type { PlanSummary, TaskDispatchView, TaskDto, TaskRunSummary } from "@huhu/contracts";
import { createContext, useContext, type ComponentType } from "react";
import type { ModuleProps } from "./contributions.js";

interface TaskAutomationViews {
  TaskRunDetails: ComponentType<{
    task: TaskDto;
    taskRefreshing: boolean;
    row: TaskDispatchView;
    run: TaskRunSummary | null | undefined;
    showQueue?: boolean;
    onOpenAgent?: (() => void) | undefined;
    onNavigate?: ModuleProps["onNavigate"];
  }>;
  taskRunLabel(row: TaskDispatchView, run: TaskRunSummary | null | undefined): string;
  PlanScheduleControls: ComponentType<{
    plan: PlanSummary;
    changed(): Promise<unknown>;
    scheduleOnly?: boolean;
    registerLeaveGuard?: ModuleProps["registerLeaveGuard"];
  }>;
}

/** The workbench composes the public views exported by the modules that own them. */
export const TaskAutomationViewsContext = createContext<TaskAutomationViews | null>(null);
export const useTaskAutomationViews = () => useContext(TaskAutomationViewsContext);
