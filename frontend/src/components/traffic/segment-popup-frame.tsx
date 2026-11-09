"use client";

import { type ReactNode } from "react";
import { Popup } from "react-map-gl/mapbox";

/** The popup chrome both traffic maps share; each supplies its own rows. */
export const SegmentPopupFrame = ({
  longitude,
  latitude,
  title,
  subtitle,
  onClose,
  children,
}: {
  longitude: number;
  latitude: number;
  title: string;
  subtitle?: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) => (
  <Popup
    anchor="bottom"
    longitude={longitude}
    latitude={latitude}
    onClose={onClose}
    closeOnClick={false}
    maxWidth="280px"
  >
    <div className="flex flex-col gap-1">
      <p className="font-medium">{title}</p>
      {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}

      <dl className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs">{children}</dl>
    </div>
  </Popup>
);

export const PopupRow = ({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) => (
  <>
    <dt className="text-muted-foreground">{label}</dt>
    <dd>{children}</dd>
  </>
);
