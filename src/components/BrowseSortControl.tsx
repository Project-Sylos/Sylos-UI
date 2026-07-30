import { ArrowUpDown } from "lucide-react";
import {
  BrowseSortDir,
  BrowseSortField,
  BrowseSortState,
  DEFAULT_BROWSE_SORT,
} from "../utils/browseSort";

type BrowseSortControlProps = {
  sort: BrowseSortState;
  onChange: (next: BrowseSortState) => void;
};

const FIELDS: { id: BrowseSortField; label: string }[] = [
  { id: "name", label: "Name" },
  { id: "mtime", label: "Date modified" },
  { id: "size", label: "Size" },
];

const DIRS: { id: BrowseSortDir; label: string }[] = [
  { id: "asc", label: "Ascending" },
  { id: "desc", label: "Descending" },
];

export default function BrowseSortControl({
  sort,
  onChange,
}: BrowseSortControlProps) {
  const active =
    sort.field !== DEFAULT_BROWSE_SORT.field ||
    sort.dir !== DEFAULT_BROWSE_SORT.dir;

  return (
    <div className="browse-folder__sort">
      <label className="browse-folder__sort-label" title="Sort items">
        <ArrowUpDown size={16} aria-hidden="true" />
        <select
          className={`browse-folder__sort-select${
            active ? " browse-folder__sort-select--active" : ""
          }`}
          value={`${sort.field}:${sort.dir}`}
          onChange={(event) => {
            const [field, dir] = event.target.value.split(":") as [
              BrowseSortField,
              BrowseSortDir
            ];
            onChange({ field, dir });
          }}
          aria-label="Sort browse items"
        >
          {FIELDS.flatMap((field) =>
            DIRS.map((dir) => (
              <option key={`${field.id}:${dir.id}`} value={`${field.id}:${dir.id}`}>
                {field.label} ({dir.label})
              </option>
            ))
          )}
        </select>
      </label>
    </div>
  );
}
