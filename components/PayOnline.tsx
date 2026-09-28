"use client";

import { useState } from "react";
import { CreditCard, Smartphone, Landmark, Loader2, CheckCircle2, XCircle, ShieldCheck, Printer, FlaskConical } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Modal, Field, inputClass, toast } from "@/components/ui";
import { errorMessage, escapeHtml, money, printDocument } from "@/lib/utils";
import { useT } from "@/lib/i18n";

type Method = "upi" | "card" | "netbanking";
type Step = { kind: "form" } | { kind: "approve"; intent: { id: string; gateway_ref: string; amount: number } } | { kind: "processing" } | { kind: "done"; ok: boolean; reference?: string; reason?: string; balance?: number; amount: number };

const BANKS = ["State Bank of India", "HDFC Bank", "ICICI Bank", "Axis Bank", "Kotak Mahindra Bank", "Punjab National Bank"];
// Test cards (like a real gateway's sandbox): this one is declined, any other valid number succeeds.
const DECLINE_CARD = "4000000000000002";
const luhn = (n: string) =>
  n.split("").reverse().reduce((sum, d, i) => {
    let v = Number(d);
    if (i % 2) v = v * 2 > 9 ? v * 2 - 9 : v * 2;
    return sum + v;
  }, 0) % 10 === 0;

// Online fee payment. While the school's payments mode is "mock" this is a simulated gateway:
// the steps look like a real checkout, the payment is posted to the ledger, but no money moves.
export default function PayOnline({ studentId, studentName, balance, onPaid, onClose }: {
  studentId: string; studentName: string; balance: number; onPaid: () => void; onClose: () => void;
}) {
  const t = useT();
  const [method, setMethod] = useState<Method>("upi");
  const [amount, setAmount] = useState(balance.toFixed(2));
  const [vpa, setVpa] = useState("");
  const [card, setCard] = useState({ number: "", expiry: "", cvv: "", name: "" });
  const [bank, setBank] = useState(BANKS[0]);
  const [step, setStep] = useState<Step>({ kind: "form" });

  const detail = method === "upi" ? vpa.trim() : method === "card" ? `•••• ${card.number.replace(/\D/g, "").slice(-4)}` : bank;

  const start = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Number(amount);
    if (!(amt > 0)) return toast(t("Enter an amount to pay."), "error");
    if (amt > balance + 0.001) return toast(t("You can pay at most {amount}.", { amount: money(balance) }), "error");
    if (method === "upi" && !/^[\w.-]{2,}@[a-zA-Z]{2,}$/.test(vpa.trim())) return toast(t("Enter a UPI ID like name@bank."), "error");
    if (method === "card") {
      const num = card.number.replace(/\D/g, "");
      if (num.length < 13 || !luhn(num)) return toast(t("That card number is not valid."), "error");
      const m = card.expiry.match(/^(\d{2})\s*\/\s*(\d{2})$/);
      if (!m || Number(m[1]) < 1 || Number(m[1]) > 12 || new Date(2000 + Number(m[2]), Number(m[1])) < new Date()) return toast(t("Check the expiry date (MM/YY)."), "error");
      if (!/^\d{3,4}$/.test(card.cvv)) return toast(t("Enter the 3-digit security code."), "error");
    }
    setStep({ kind: "processing" });
    const { data, error } = await supabase.rpc("create_payment_intent", { p_student: studentId, p_amount: amt, p_method: method });
    if (error) {
      setStep({ kind: "form" });
      return toast(errorMessage(error), "error");
    }
    const intent = data as { id: string; gateway_ref: string; amount: number };
    // Cards are charged straight away; UPI and net banking need approval "at the bank".
    if (method === "card") return complete(intent, card.number.replace(/\D/g, "") !== DECLINE_CARD, "Card declined by the issuing bank");
    setStep({ kind: "approve", intent });
  };

  const complete = async (intent: { id: string; amount: number }, success: boolean, reason?: string) => {
    setStep({ kind: "processing" });
    // A short pause, like a real gateway talking to the bank.
    await new Promise((r) => setTimeout(r, 900));
    const { data, error } = await supabase.rpc("mock_gateway_complete", { p_intent: intent.id, p_success: success, p_detail: success ? detail : reason ?? "Declined" });
    if (error) {
      setStep({ kind: "done", ok: false, reason: errorMessage(error), amount: intent.amount });
      return;
    }
    const res = data as { ok: boolean; reference?: string; reason?: string; balance?: number };
    setStep({ kind: "done", ok: res.ok, reference: res.reference, reason: res.reason, balance: res.balance, amount: Number(intent.amount) });
    if (res.ok) onPaid();
  };

  const receipt = (s: Extract<Step, { kind: "done" }>) =>
    printDocument(`Receipt ${s.reference}`, `<div class="brand"><div><h1>Payment Receipt</h1><div class="muted">All-In-One ERP — TEST MODE (no money moved)</div></div></div>
      <table><tbody>
        <tr><th>Student</th><td>${escapeHtml(studentName)}</td></tr>
        <tr><th>Amount</th><td>${money(s.amount)}</td></tr>
        <tr><th>Method</th><td>${escapeHtml(method === "upi" ? `UPI (${vpa})` : method === "card" ? `Card ${detail}` : `Net banking — ${bank}`)}</td></tr>
        <tr><th>Reference</th><td>${escapeHtml(s.reference ?? "")}</td></tr>
        <tr><th>Date</th><td>${new Date().toLocaleString()}</td></tr>
        <tr><th>Balance after payment</th><td>${money(s.balance)}</td></tr>
      </tbody></table>`);

  const tabs: { id: Method; label: string; icon: typeof CreditCard }[] = [
    { id: "upi", label: "UPI", icon: Smartphone },
    { id: "card", label: "Card", icon: CreditCard },
    { id: "netbanking", label: "Net Banking", icon: Landmark },
  ];

  return (
    <Modal title="Pay Fees Online" icon={ShieldCheck} onClose={onClose}>
      <div className="mb-4 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs font-semibold flex items-start gap-2">
        <FlaskConical size={16} className="shrink-0" />
        <span>{t("Test mode: this is a simulated payment gateway. No real money moves, but the payment is recorded on the account.")}</span>
      </div>

      {step.kind === "form" && (
        <form onSubmit={start} className="space-y-4">
          <p className="text-sm text-slate-600">{t("Paying for")} <b>{studentName}</b> — {t("balance due")} <b>{money(balance)}</b></p>
          <Field label="Amount">
            <input className={inputClass} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label={t("Payment method")}>
            {tabs.map((m) => (
              <button key={m.id} type="button" role="radio" aria-checked={method === m.id} onClick={() => setMethod(m.id)}
                className={`flex flex-col items-center gap-1 py-3 rounded-xl border text-xs font-bold ${method === m.id ? "border-indigo-600 bg-indigo-50 text-indigo-700" : "border-slate-200 text-slate-600"}`}>
                <m.icon size={18} /> {t(m.label)}
              </button>
            ))}
          </div>
          {method === "upi" && (
            <Field label="UPI ID">
              <input className={inputClass} placeholder="name@okbank" value={vpa} onChange={(e) => setVpa(e.target.value)} autoCapitalize="none" />
            </Field>
          )}
          {method === "card" && (
            <>
              <Field label="Card Number">
                <input className={inputClass} inputMode="numeric" autoComplete="off" placeholder="4111 1111 1111 1111" value={card.number}
                  onChange={(e) => setCard({ ...card, number: e.target.value.replace(/[^\d ]/g, "").slice(0, 23) })} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Expiry (MM/YY)">
                  <input className={inputClass} placeholder="12/29" value={card.expiry} onChange={(e) => setCard({ ...card, expiry: e.target.value.slice(0, 5) })} />
                </Field>
                <Field label="CVV">
                  <input className={inputClass} inputMode="numeric" type="password" autoComplete="off" value={card.cvv} onChange={(e) => setCard({ ...card, cvv: e.target.value.replace(/\D/g, "").slice(0, 4) })} />
                </Field>
              </div>
              <p className="text-[11px] text-slate-400">{t("Test cards: 4111 1111 1111 1111 succeeds, 4000 0000 0000 0002 is declined. Any future expiry and CVV.")}</p>
            </>
          )}
          {method === "netbanking" && (
            <Field label="Bank">
              <select className={inputClass} value={bank} onChange={(e) => setBank(e.target.value)}>
                {BANKS.map((b) => <option key={b}>{b}</option>)}
              </select>
            </Field>
          )}
          <button type="submit" className="w-full mt-2 flex items-center justify-center gap-2 bg-emerald-600 text-white py-3.5 rounded-xl text-sm font-bold shadow-md hover:bg-emerald-700">
            <ShieldCheck size={16} /> {t("Pay {amount}", { amount: money(Number(amount) || 0) })}
          </button>
        </form>
      )}

      {step.kind === "approve" && (
        <div className="text-center space-y-4">
          {method === "upi" ? <Smartphone size={40} className="mx-auto text-indigo-600" /> : <Landmark size={40} className="mx-auto text-indigo-600" />}
          <p className="font-bold text-slate-800">
            {method === "upi" ? t("Approve the request in your UPI app") : t("Sign in to {bank} and approve", { bank })}
          </p>
          <p className="text-sm text-slate-500">{money(step.intent.amount)} · {t("Reference")} {step.intent.gateway_ref}</p>
          <p className="text-[11px] text-slate-400">{t("Simulated bank screen — choose what the bank would answer.")}</p>
          <div className="flex gap-3">
            <button onClick={() => complete(step.intent, false, method === "upi" ? "Request declined in the UPI app" : "Declined at the bank")} className="flex-1 py-3 rounded-xl border border-slate-200 font-bold text-slate-700">{t("Decline")}</button>
            <button onClick={() => complete(step.intent, true)} className="flex-1 py-3 rounded-xl bg-emerald-600 text-white font-bold">{t("Approve")}</button>
          </div>
        </div>
      )}

      {step.kind === "processing" && (
        <p className="py-10 text-center text-slate-500 flex items-center justify-center gap-2"><Loader2 className="animate-spin" /> {t("Processing payment…")}</p>
      )}

      {step.kind === "done" && (
        <div className="text-center space-y-3 py-2">
          {step.ok ? <CheckCircle2 size={48} className="mx-auto text-emerald-500" /> : <XCircle size={48} className="mx-auto text-red-500" />}
          <p className="text-lg font-black text-slate-800">{step.ok ? t("Payment successful") : t("Payment failed")}</p>
          {step.ok ? (
            <>
              <p className="text-sm text-slate-600">{money(step.amount)} · {t("Reference")} <span className="font-mono">{step.reference}</span></p>
              <p className="text-sm text-slate-600">{t("New balance")}: <b>{money(step.balance)}</b></p>
              <button onClick={() => receipt(step)} className="inline-flex items-center gap-2 text-sm font-bold text-indigo-600 bg-indigo-50 px-4 py-2 rounded-xl"><Printer size={16} /> {t("Receipt")}</button>
            </>
          ) : (
            <>
              <p className="text-sm text-red-700">{t(step.reason ?? "The payment did not go through.")}</p>
              <p className="text-xs text-slate-500">{t("Nothing was charged.")}</p>
              <button onClick={() => setStep({ kind: "form" })} className="text-sm font-bold text-indigo-600">{t("Try again")}</button>
            </>
          )}
          <button onClick={onClose} className="block w-full mt-2 py-3 rounded-xl bg-slate-900 text-white font-bold">{t("Done")}</button>
        </div>
      )}
    </Modal>
  );
}
