import { useEffect, useState } from "react";

export function useAltTextSelect() {
  const [altHeld, setAltHeld] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Alt") setAltHeld(true);
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === "Alt") setAltHeld(false);
    };
    const onBlur = () => setAltHeld(false);

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  return altHeld;
}
