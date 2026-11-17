"use client";
import { useRef, useState } from "react";
import { agencyToday } from "@digimarket/contracts";
import { useAuth } from "@/components/auth-provider";
import { FormField, Notice } from "@/components/ui";

export function ReversalButton({
  source,
  id,
  label,
  onSaved,
}: {
  source: "FINANCE" | "SALARY" | "FUNDS" | "TRANSFER";
  id: string;
  label: string;
  onSaved: () => void | Promise<void>;
}) {
  const { request } = useAuth(),
    dialog = useRef<HTMLDialogElement>(null);
  const [date, setDate] = useState(agencyToday),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [key, setKey] = useState(() => crypto.randomUUID());
  return (
    <>
      <button
        type="button"
        className="btn-secondary text-xs"
        onClick={() => {
          setError("");
          dialog.current?.showModal();
        }}
      >
        Reverse
      </button>
      <dialog
        ref={dialog}
        className="w-[min(95vw,32rem)] rounded-xl border border-slate-600 bg-slate-950 p-6 text-slate-100 backdrop:bg-black/70"
        onCancel={(e) => {
          if (busy) e.preventDefault();
        }}
      >
        <h2 className="text-lg font-semibold">Reverse {label}</h2>
        <p className="mt-2 text-sm text-slate-400">
          This records a full opposite entry in an open cycle. The original record and closed-cycle
          totals remain intact. Record any replacement separately.
        </p>
        {error && <Notice kind="error">{error}</Notice>}
        <form
          className="mt-4 space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              await request("/finance/reversals", {
                method: "POST",
                body: { source, id, occurredOn: date, reason, idempotencyKey: key },
              });
              setKey(crypto.randomUUID());
              setReason("");
              dialog.current?.close();
              await onSaved();
            } catch (e) {
              setError(e instanceof Error ? e.message : "Reversal failed");
            } finally {
              setBusy(false);
            }
          }}
        >
          <FormField id={"reversal-date-" + id} label="Reversal date">
            <input
              id={"reversal-date-" + id}
              type="date"
              className="field"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </FormField>
          <FormField id={"reversal-reason-" + id} label="Correction reason">
            <textarea
              id={"reversal-reason-" + id}
              className="field"
              required
              minLength={4}
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </FormField>
          <div className="flex gap-3">
            <button
              type="button"
              disabled={busy}
              className="btn-secondary"
              onClick={() => dialog.current?.close()}
            >
              Cancel
            </button>
            <button className="btn-primary" disabled={busy}>
              {busy ? "Recording…" : "Confirm reversal"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
