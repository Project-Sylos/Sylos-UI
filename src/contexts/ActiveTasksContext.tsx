import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { ActiveTask } from "../components/ActiveTasksPanel";

type ActiveTasksContextValue = {
  tasks: ActiveTask[];
  setTask: (task: ActiveTask) => void;
  removeTask: (id: string) => void;
  clearTasks: () => void;
};

const ActiveTasksContext = createContext<ActiveTasksContextValue | null>(null);

export function ActiveTasksProvider({ children }: { children: ReactNode }) {
  const [byId, setById] = useState<Record<string, ActiveTask>>({});

  const setTask = useCallback((task: ActiveTask) => {
    setById((prev) => ({ ...prev, [task.id]: task }));
  }, []);

  const removeTask = useCallback((id: string) => {
    setById((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const clearTasks = useCallback(() => setById({}), []);

  const value = useMemo<ActiveTasksContextValue>(
    () => ({
      tasks: Object.values(byId),
      setTask,
      removeTask,
      clearTasks,
    }),
    [byId, setTask, removeTask, clearTasks]
  );

  return (
    <ActiveTasksContext.Provider value={value}>
      {children}
    </ActiveTasksContext.Provider>
  );
}

export function useActiveTasks(): ActiveTasksContextValue {
  const ctx = useContext(ActiveTasksContext);
  if (!ctx) {
    throw new Error("useActiveTasks must be used within ActiveTasksProvider");
  }
  return ctx;
}
