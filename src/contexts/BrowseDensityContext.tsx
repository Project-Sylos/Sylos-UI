import { ReactNode } from "react";

import {
  ListDensityProvider,
  useListDensity,
} from "./ListDensityContext";
import { BROWSE_DENSITY_STORAGE_KEY } from "../utils/listDensity";

export function BrowseDensityProvider({ children }: { children: ReactNode }) {
  return (
    <ListDensityProvider storageKey={BROWSE_DENSITY_STORAGE_KEY}>
      {children}
    </ListDensityProvider>
  );
}

export function useBrowseDensity() {
  return useListDensity();
}
