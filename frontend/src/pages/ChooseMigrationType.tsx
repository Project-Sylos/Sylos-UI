import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { PlayCircle, RotateCcw } from "lucide-react";

import SelectionPage from "../components/SelectionPage";

export default function ChooseMigrationType() {
  const navigate = useNavigate();

  const options = useMemo(
    () => [
      {
        id: "new",
        name: "Start New Migration",
        description: "Create a new migration by selecting source and destination services.",
        icon: <PlayCircle size={40} color="#00ffff" />,
      },
      {
        id: "resume",
        name: "Resume Existing Migration",
        description: "Continue a migration from an uploaded database file.",
        icon: <RotateCcw size={40} color="#ff00ff" />,
      },
    ],
    []
  );

  const handleSelect = (id: string) => {
    if (id === "new") {
      navigate("/connect");
    } else if (id === "resume") {
      navigate("/resume");
    }
  };

  return (
    <SelectionPage
      eyebrow="Migration Type"
      title={
        <>
          Choose your <span className="selection-page__highlight--magenta">migration</span>{" "}
          type
        </>
      }
      summary="Start a new migration or resume an existing one from a database file."
      options={options}
      onSelect={handleSelect}
      onBack={() => navigate("/")}
      backLabel="← Back to Home"
    />
  );
}

