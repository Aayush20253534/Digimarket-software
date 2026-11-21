"use client";
import type { Dispatch, SetStateAction, FormEvent } from "react";

export type EditableExpense = {
  id: string; categoryId: string; enteredById: string; clientId: string | null;
  amount: string; occurredOn: string; method: string;
  merchantOrSource: string; description: string;
};
export type EditOptions = {
  categories: { id: string; name: string; kind: string; purpose?: string; active: boolean }[];
  people: { id: string; displayName: string; loginId: string }[];
  clients: { id: string; businessName: string }[];
};
const methods = ["CASH", "UPI", "BANK_TRANSFER", "CARD", "OTHER"] as const;

export function ExpenseEditDialog({editing,editOptions,setEditing,editSaving,error,saveEdit,onCancel}:{
  editing:EditableExpense;editOptions:EditOptions;
  setEditing:Dispatch<SetStateAction<EditableExpense|null>>;
  editSaving:boolean;error:string;saveEdit:(event:FormEvent<HTMLFormElement>)=>void|Promise<void>;onCancel:()=>void;
}){
  const selectedEditCategory=editOptions.categories.find(c=>c.id===editing.categoryId);
  const editMetaAds=selectedEditCategory?.purpose==="META_ADS" ||
    /^meta[\s_-]*(?:ads?|advertising|advertisements?)$/i.test(selectedEditCategory?.name??"");
  return (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/80 p-3 sm:p-6">
          <section role="dialog" aria-modal="true" aria-label="Edit expense"
            className="w-full max-w-xl max-h-[92dvh] overflow-y-auto rounded-xl border border-white/20 bg-slate-950 p-4 sm:p-6 shadow-xl">
            <h2 className="text-xl font-semibold">Edit expense</h2>
            <p className="mt-1 mb-4 text-sm text-slate-400">
              Reassigning changes the selected user's totals, without changing agency totals.
              The original submitter stays recorded in audit history.
            </p>
            {error && <p role="alert" className="mb-3 text-sm text-red-300">{error}</p>}
            <form onSubmit={e => void saveEdit(e)} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block text-sm">Assigned user
                <select className="field mt-1 w-full" required value={editing.enteredById}
                  onChange={e => setEditing(v => v && ({...v,enteredById:e.target.value}))}>
                  {!editOptions.people.some(p => p.id === editing.enteredById) &&
                    <option value={editing.enteredById}>Previously assigned user</option>}
                  {editOptions.people.map(p => <option value={p.id} key={p.id}>{p.displayName}</option>)}
                </select>
              </label>
              <label className="block text-sm">Category
                <select className="field mt-1 w-full" required value={editing.categoryId}
                  onChange={e => setEditing(v => v && ({...v,categoryId:e.target.value,clientId:null}))}>
                  {editOptions.categories.filter(x => x.kind === "EXPENSE" && (x.active || x.id === editing.categoryId) && x.purpose !== "SALARY")
                    .map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
                </select>
              </label>
              {editMetaAds && <label className="block text-sm sm:col-span-2">Meta Ads client
                <select className="field mt-1 w-full" value={editing.clientId ?? ""}
                  onChange={e => setEditing(v => v && ({...v,clientId:e.target.value || null}))}>
                  <option value="">Agency / Self</option>
                  {editing.clientId && !editOptions.clients.some(x => x.id === editing.clientId) &&
                    <option value={editing.clientId}>Previously linked client</option>}
                  {editOptions.clients.map(x => <option key={x.id} value={x.id}>{x.businessName}</option>)}
                </select>
              </label>}
              <label className="block text-sm">Amount (INR)
                <input className="field mt-1 w-full" required inputMode="decimal"
                  pattern="(0|[1-9][0-9]{0,14})([.][0-9]{1,4})?"
                  value={editing.amount}
                  onChange={e => setEditing(v => v && ({...v,amount:e.target.value}))}/>
              </label>
              <label className="block text-sm">Date
                <input className="field mt-1 w-full" type="date" required value={editing.occurredOn}
                  onChange={e => setEditing(v => v && ({...v,occurredOn:e.target.value}))}/>
              </label>
              <label className="block text-sm">Payment method
                <select className="field mt-1 w-full" value={editing.method}
                  onChange={e => setEditing(v => v && ({...v,method:e.target.value}))}>
                  {methods.map(m => <option key={m} value={m}>{m.replaceAll("_"," ")}</option>)}
                </select>
              </label>
              <label className="block text-sm">Merchant / payee
                <input className="field mt-1 w-full" maxLength={160} value={editing.merchantOrSource}
                  onChange={e => setEditing(v => v && ({...v,merchantOrSource:e.target.value}))}/>
              </label>
              <label className="block text-sm sm:col-span-2">Notes
                <textarea className="field mt-1 w-full min-h-20" maxLength={2000}
                  value={editing.description}
                  onChange={e => setEditing(v => v && ({...v,description:e.target.value}))}/>
              </label>
              <div className="sm:col-span-2 flex flex-wrap justify-end gap-2 pt-2">
                <button type="button" className="btn-secondary" disabled={editSaving}
                  onClick={onCancel}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={editSaving}>
                  {editSaving ? "Saving…" : "Save changes"}
                </button>
              </div>
            </form>
          </section>
        </div>
  );
}
