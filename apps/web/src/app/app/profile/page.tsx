"use client";

import { LockKeyhole, LogOut, Shield, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { Card, Notice, PageHeader, StatusBadge } from "@/components/ui";

export default function ProfilePage() {
  const router = useRouter();
  const { session, logout, request } = useAuth();
  const [avatar,setAvatar] = useState<string|null>(null);
  const [uploading,setUploading] = useState(false);
  useEffect(()=>{if(session)void request<{avatarData:string|null}>("/profile/avatar").then(x=>setAvatar(x.avatarData)).catch(()=>{});},[session,request]);
  const uploadAvatar=async(file?:File)=>{if(!file)return;setError("");setUploading(true);
   try{if(!["image/png","image/jpeg","image/webp"].includes(file.type))throw new Error("Use PNG, JPEG or WebP");
    const data=await new Promise<string>((resolve,reject)=>{const image=new Image();image.onload=()=>{const canvas=document.createElement("canvas");const size=256;canvas.width=size;canvas.height=size;const ctx=canvas.getContext("2d");if(!ctx)return reject(new Error("Image canvas unavailable"));ctx.drawImage(image,0,0,size,size);resolve(canvas.toDataURL("image/jpeg",0.7));};image.onerror=()=>reject(new Error("Invalid image"));image.src=URL.createObjectURL(file);});
    if(data.length>135000)throw new Error("Image too large");await request("/profile/avatar",{method:"PUT",body:{avatarData:data}});setAvatar(data);
   }catch(e){setError(e instanceof Error?e.message:"Upload failed");}finally{setUploading(false);}
  };
  const [error, setError] = useState("");
  if (!session) return null;
  const { user, identity } = session;
  return <div className="space-y-7">
    <PageHeader eyebrow="Account settings" title="My profile" description="Identity and granted permissions are obtained from the authenticated API." />
    <div className="grid gap-5 xl:grid-cols-[1fr_1fr]">
      <Card title="Account details">
        <div className="aw-profile-photo-section mb-7 flex flex-wrap items-center gap-5"><div className="aw-profile-photo-frame">{avatar?<img src={avatar} alt="Profile photo" className="aw-profile-photo-large"/>:<UserRound aria-label="Profile photo placeholder" className="aw-profile-photo-placeholder"/>}</div>
         <label className="btn-secondary cursor-pointer">{uploading?"Uploading...":"Upload profile photo"}<input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={e=>void uploadAvatar(e.target.files?.[0])}/></label>
         {avatar&&<button className="btn-secondary" onClick={async()=>{await request("/profile/avatar",{method:"DELETE"});setAvatar(null);}}>Remove</button>}</div>
        <dl className="space-y-5 text-sm">
          <div><dt className="text-slate-500">Display name</dt><dd className="mt-1 font-semibold text-slate-900">{user.displayName}</dd></div>
          <div><dt className="text-slate-500">Login ID</dt><dd className="mt-1 font-semibold text-slate-900">{user.loginId}</dd></div>
          <div><dt className="text-slate-500">Account status</dt><dd className="mt-1"><StatusBadge status={user.status} /></dd></div>
          <div><dt className="text-slate-500">Organization identifier</dt><dd className="mt-1 break-all font-mono text-xs text-slate-700">{user.organizationId}</dd></div>
        </dl>
      </Card>
      <Card title="Permissions & security">
        <div className="flex items-center gap-3 rounded-xl bg-indigo-50 p-4">
          <Shield className="h-6 w-6 text-indigo-700" aria-hidden="true" />
          <div><p className="text-sm font-semibold text-slate-900">Current role</p><p className="text-xs text-slate-600">{identity.roles.join(", ")}</p></div>
        </div>
        <p className="mb-3 mt-5 text-sm font-semibold text-slate-900">{identity.permissions.length} active permission grants</p>
        <div className="max-h-52 overflow-y-auto rounded-xl border border-slate-200 p-3">
          {identity.permissions.length ? <ul className="flex flex-wrap gap-2">{identity.permissions.map((p) => <li key={p} className="rounded-md bg-slate-100 px-2 py-1 font-mono text-xs text-slate-700">{p}</li>)}</ul>
            : <p className="text-sm text-slate-500">No extra permissions assigned.</p>}
        </div>
      </Card>
    </div>
    <Card title="Session controls" description="You can sign out at any time; access tokens are not stored in browser localStorage.">
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2 text-sm text-slate-600"><LockKeyhole className="h-4 w-4 text-indigo-600" aria-hidden="true" />JWT access with revocable refresh session</div>
        <button type="button" className="btn-secondary ml-auto" onClick={async () => {
          setError("");
          try {
            await logout();
            router.replace("/login");
          } catch {
            setError("Server did not confirm logout. The session may still be active.");
          }
        }}><LogOut className="h-4 w-4" aria-hidden="true" />Sign out</button>
      </div>
      {error && <div className="mt-4"><Notice kind="error">{error}</Notice></div>}
      <p className="mt-4 flex items-center gap-2 text-xs text-slate-500"><UserRound className="h-4 w-4" aria-hidden="true" />Contact your administrator for password resets. Sessions remain secured with individual passwords and server-side role checks.</p>
    </Card>
  </div>;
}
