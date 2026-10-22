import Image from "next/image";
import type { HTMLAttributes } from "react";
export type BrandLogoProps = Omit<HTMLAttributes<HTMLSpanElement>, "children"> & {
 compact?: boolean;
 tagline?: boolean;
 workspace?: boolean;
};
export function BrandLogo({compact=false,tagline=false,workspace=false,className="",...props}:BrandLogoProps){
 return <span className={["aw-brand",compact?"aw-brand-compact":"",className].filter(Boolean).join(" ")}
   aria-label={workspace?"AmplifyWorld Workspace":"AmplifyWorld"} {...props}>
   <Image src="/brand/amplifyworld-wordmark.svg" width={650} height={140} alt="AmplifyWorld"
     className="aw-brand-wordmark"/>
   <Image src="/brand/amplifyworld-mark.svg" width={220} height={140} alt="" aria-hidden="true"
     className="aw-brand-symbol"/>
   {tagline&&<span className="aw-brand-tagline">STRATEGY · TECHNOLOGY · MARKETING</span>}
 </span>;
}
