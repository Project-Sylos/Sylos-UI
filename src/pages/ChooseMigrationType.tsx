import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { PlayCircle, RotateCcw } from "lucide-react";

import SelectionPage from "../components/SelectionPage";
import { useSelection } from "../context/SelectionContext";

export default function ChooseMigrationType() {
  const navigate = useNavigate();
  const { clearSelections } = useSelection();

  const options = useMemo(
    () => [
      {
        id: "new",
        name: "Start New Migration",
        description:
          "Configure a source and destination, then run discovery to build a migration plan.",
        icon: <PlayCircle size={40} />,
        iconAccent: "a",
      },
      {
        id: "resume",
        name: "Resume Existing Migration",
        description:
          "Pick a saved migration from the list, or upload a database file to continue one.",
        icon: <RotateCcw size={40} />,
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
      title={
        <>
          Choose your <span className="selection-page__highlight--magenta">migration</span>{" "}
          type
        </>
      }
      options={options}
      onSelect={handleSelect}
      onBack={() => navigate("/")}
      backTitle="Back to home"
    />
  );
}
