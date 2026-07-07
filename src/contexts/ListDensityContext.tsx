import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  LIST_DENSITY_MAX,
  LIST_DENSITY_MIN,
  listDensityToStyle,
  loadListDensity,
  saveListDensity,
} from "../utils/listDensity";

interface ListDensityContextType {
  density: number;
  setDensity: (value: number) => void;
  densityStyle: React.CSSProperties;
  setListViewportElement: (element: HTMLElement | null) => void;
}

const ListDensityContext = createContext<ListDensityContextType | undefined>(
  undefined
);

export function ListDensityProvider({
  storageKey,
  children,
}: {
  storageKey: string;
  children: ReactNode;
}) {
  const [density, setDensityState] = useState(() => loadListDensity(storageKey));
  const [viewportHeight, setViewportHeight] = useState(0);
  const [listViewportElement, setListViewportElementState] =
    useState<HTMLElement | null>(null);

  const setDensity = (value: number) => {
    const clamped = Math.max(LIST_DENSITY_MIN, Math.min(LIST_DENSITY_MAX, value));
    setDensityState(clamped);
    saveListDensity(storageKey, clamped);
  };

  const setListViewportElement = useCallback((element: HTMLElement | null) => {
    setListViewportElementState(element);
    if (element) {
      setViewportHeight(element.clientHeight);
    } else {
      setViewportHeight(0);
    }
  }, []);

  useEffect(() => {
    if (!listViewportElement) {
      return;
    }

    const updateViewportHeight = () => {
      setViewportHeight(listViewportElement.clientHeight);
    };

    updateViewportHeight();

    const resizeObserver = new ResizeObserver(updateViewportHeight);
    resizeObserver.observe(listViewportElement);

    return () => {
      resizeObserver.disconnect();
    };
  }, [listViewportElement, density]);

  const densityStyle = useMemo(
    () => listDensityToStyle(density, viewportHeight),
    [density, viewportHeight]
  );

  return (
    <ListDensityContext.Provider
      value={{
        density,
        setDensity,
        densityStyle,
        setListViewportElement,
      }}
    >
      {children}
    </ListDensityContext.Provider>
  );
}

export function useListDensity() {
  const context = useContext(ListDensityContext);
  if (context === undefined) {
    throw new Error("useListDensity must be used within a ListDensityProvider");
  }
  return context;
}
