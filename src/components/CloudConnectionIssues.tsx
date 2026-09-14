import { RefreshCw } from "lucide-react";
import { useNavigate } from "react-router";

import {
  buildCloudConnectPath,
  CloudConnectionCheckResult,
} from "../utils/cloudConnections";
import "./CloudConnectionIssues.css";

interface CloudConnectionIssuesProps {
  issues: CloudConnectionCheckResult[];
  className?: string;
}

export default function CloudConnectionIssues({
  issues,
  className = "",
}: CloudConnectionIssuesProps) {
  const navigate = useNavigate();
  const invalid = issues.filter((issue) => !issue.valid);
  if (invalid.length === 0) return null;

  return (
    <div className={`cloud-connection-issues ${className}`.trim()} role="alert">
      <p className="cloud-connection-issues__message">
        One or more cloud accounts need to be reconnected before you can continue.
      </p>
      <ul className="cloud-connection-issues__list">
        {invalid.map((issue) => (
          <li key={`${issue.role}-${issue.connectionId}`} className="cloud-connection-issues__item">
            <span className="cloud-connection-issues__label">
              {issue.label}
              {issue.error ? ` - ${issue.error}` : ""}
            </span>
            <button
              type="button"
              className="glass-button cloud-connection-issues__reconnect"
              onClick={() =>
                navigate(
                  buildCloudConnectPath({
                    role: issue.role,
                    serviceId: issue.serviceId,
                    providerId: issue.providerId,
                    connectionId: issue.connectionId,
                    reconnect: true,
                  })
                )
              }
            >
              <RefreshCw size={16} aria-hidden="true" />
              Reconnect
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
