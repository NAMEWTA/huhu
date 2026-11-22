import { useEffect, useMemo, useState } from "react";
import { todayIn } from "../shared/categories.js";

export function useTaskToday(zone = Intl.DateTimeFormat().resolvedOptions().timeZone): string {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((current) => current + 1), 60_000);
    return () => clearInterval(id);
  }, []);
  return useMemo(() => todayIn(zone), [zone, tick]);
}
