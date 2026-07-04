import { ReactNode } from "react";

import { getExternalServiceLogo } from "../utils/externalServiceLogos";
import "./ExternalServiceIcon.css";

export interface ExternalServiceIconProps {
  serviceId: string;
  size?: number;
  className?: string;
  fallback?: ReactNode;
  alt?: string;
}

export default function ExternalServiceIcon({
  serviceId,
  size = 40,
  className = "",
  fallback = null,
  alt = "",
}: ExternalServiceIconProps) {
  const src = getExternalServiceLogo(serviceId);
  if (!src) {
    return <>{fallback}</>;
  }

  return (
    <img
      src={src}
      alt={alt}
      className={`external-service-icon ${className}`.trim()}
      width={size}
      height={size}
      draggable={false}
    />
  );
}
