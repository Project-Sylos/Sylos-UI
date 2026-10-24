import { useEffect, useMemo } from "react";
import { useNavigate } from "react-router";
import { PlayCircle, RotateCcw } from "lucide-react";

import SelectionPage from "../components/SelectionPage";
import { useSelection } from "../context/SelectionContext";

export default function ChooseMigrationType() {
  const navigate = useNavigate();
  const { clearSelections } = useSelection();

  useEffect(() => {
    clearSelections();
  }, [clearSelections]);

  const options = useMemo(
    () => [
      {
        id: "new",
        name: "Start a new migration",
        description:
          "Pick a source and destination, then discover what to move.",
        icon: <PlayCircle size={40} strokeWidth={1.6} />,
        iconAccent: "a",
      },
      {
        id: "resume",
        name: "Resume an existing one",
        description:
          "Continue a saved migration, or import from a folder / upload a zip to pick back up.",
        icon: <RotateCcw size={40} strokeWidth={1.6} />,
        iconAccent: "b",
      },
    ],
    []
  );

  const handleSelect = (id: string) => {
    if (id === "new") {
      clearSelections();
      navigate("/summary");
    } else if (id === "resume") {
      navigate("/resume");
    }
  };

  return (
    <SelectionPage
      variant="brand"
      title={
        <>
          Let's get <span className="selection-page__highlight">started</span>
        </>
      }
      options={options}
      onSelect={handleSelect}
    />
  );
}
