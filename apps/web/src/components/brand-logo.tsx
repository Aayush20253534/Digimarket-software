import Image from "next/image";
import type { HTMLAttributes } from "react";

export type BrandLogoProps = Omit<HTMLAttributes<HTMLSpanElement>, "children"> & {
  compact?: boolean;
  tagline?: boolean;
  workspace?: boolean;
};

export function BrandLogo({ compact = false, tagline = false, workspace = false, className = "", ...props }: BrandLogoProps) {
  return <span className={["aw-brand", compact ? "aw-brand-compact" : "", className].filter(Boolean).join(" ")} {...props}>
    <Image src="/brand/amplifyworld-mark.svg" width={44} height={44} alt="" aria-hidden="true" className="aw-brand-icon" />
    <span>
      <span className="aw-brand-name">Amplify<span className="aw-brand-world">World</span>{workspace ? " Workspace" : ""}</span>
      {tagline && <span className="aw-brand-tagline">STRATEGY · TECHNOLOGY · MARKETING</span>}
    </span>
  </span>;
}
