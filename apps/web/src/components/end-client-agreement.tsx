"use client";
import { useRef, useState } from "react";
import { agencyToday } from "@digimarket/contracts";
import { useAuth } from "@/components/auth-provider";
import { Notice } from "@/components/ui";

export function EndClientAgreement({
  client,
  onEnded,
}: {
  client: {
    id: string;
    businessName: string;
    version: number;
    contractStartOn: string | null;
    contractEndOn: string | null;
  };
  onEnded: () => Promise<void>;
}) {
  const { request } = useAuth(),
    dialog = useRef<HTMLDialogElement>(null);
  const [date, setDate] = useState(agencyToday),
    [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const max =
    client.contractEndOn && client.contractEndOn.slice(0, 10) < agencyToday()
      ? client.contractEndOn.slice(0, 10)
      : agencyToday();
  return (
    <>
      <button
        className="btn-danger"
        type="button"
        onClick={() => {
          setDate(max);
          setError("");
          dialog.current?.showModal();
        }}
      >
        End agreement early
      </button>
      <dialog
        ref={dialog}
        aria-labelledby="end-agreement-title"
        className="w-[min(95vw,32rem)] rounded-xl border border-slate-600 bg-slate-950 p-6 text-slate-100 backdrop:bg-black/70"
        onCancel={(e) => {
          if (busy) e.preventDefault();
        }}
      >
        <h2 id="end-agreement-title" className="text-lg font-semibold">
          End agreement early
        </h2>
        <p className="mt-2 text-sm text-slate-400">
          {client.businessName} will move to Expired and stop contributing to projected income.
          Original agreement dates, posted income and client history remain recorded.
        </p>
        {error && <Notice kind="error">{error}</Notice>}
        <form
          className="mt-4 space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              await request("/clients/" + client.id + "/end-agreement", {
                method: "POST",
                body: { version: client.version, endedOn: date, reason },
              });
              dialog.current?.close();
              await onEnded();
            } catch (e) {
              setError(e instanceof Error ? e.message : "Unable to end agreement");
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="block">
            Actual end date
            <input
              className="field mt-1"
              type="date"
              required
              min={client.contractStartOn?.slice(0, 10)}
              max={max}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <label className="block">
            Reason for ending
            <textarea
              className="field mt-1"
              required
              minLength={4}
              maxLength={500}
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <div className="flex flex-wrap gap-3">
            <button
              className="btn-secondary"
              type="button"
              disabled={busy}
              onClick={() => dialog.current?.close()}
            >
              Cancel
            </button>
            <button className="btn-danger" disabled={busy}>
              {busy ? "Ending…" : "Confirm end agreement"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
