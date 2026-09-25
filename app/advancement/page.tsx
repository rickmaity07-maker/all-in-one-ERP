"use client";

import { useEffect, useState } from "react";
import { HandHeart, Plus, Target, Receipt, Trophy, XCircle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useSession, isAdmin } from "@/lib/session";
import { useTable } from "@/lib/useTable";
import { ModuleShell, Modal, Field, SubmitButton, ActionButton, Card, Table, Loading, Badge, StatCard, AccessDenied, inputClass, confirmAction, toast } from "@/components/ui";
import { errorMessage, fmtDate, matches, money, type Row } from "@/lib/utils";
import CampaignCards from "@/components/CampaignCards";

type TabId = "campaigns" | "gifts" | "donors";
const PLEDGE_COLOR: Record<string, string> = { pledged: "orange", partially_paid: "blue", paid: "green", cancelled: "slate" };
const label = (s: string) => s.replace(/_/g, " ");

export default function Advancement() {
  const { role, profile } = useSession();
  const admin = isAdmin(role);
  const alumni = role === "alumni";
  const allowed = admin || alumni;
  const [tab, setTab] = useState<TabId>("campaigns");
  const [search, setSearch] = useState("");
  const campaigns = useTable("campaigns", { enabled: allowed });
  const gifts = useTable("alumni_donations", { enabled: allowed });
  const payments = useTable("pledge_payments", { enabled: allowed });
  const [scores, setScores] = useState<Row[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [modal, setModal] = useState<"" | "campaign" | "pledge" | "pay">("");
  const [target, setTarget] = useState<Row | null>(null);
  const [busy, setBusy] = useState(false);
  const [cForm, setCForm] = useState({ name: "", goal: "", fund: "General Fund", ends_on: "" });
  const [pForm, setPForm] = useState({ amount: "", due_on: "" });
  const [payForm, setPayForm] = useState({ amount: "", method: "card" });
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    if (!admin) return;
    supabase.rpc("donor_scores").then(({ data }) => setScores((data as Row[]) ?? []));
    supabase.from("profiles").select("id, full_name").then(({ data }) => setNames(Object.fromEntries((data ?? []).map((p) => [p.id, p.full_name]))));
  }, [admin, gifts.rows]);

  if (!allowed) return <AccessDenied message="Advancement is for administrators and alumni." />;

  const campaignName = (id?: string) => campaigns.rows.find((c) => c.id === id)?.name ?? "General";
  const saveCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const row = await campaigns.insert({ name: cForm.name, goal: Number(cForm.goal), fund: cForm.fund, ends_on: cForm.ends_on || null }, "Campaign launched.");
    setBusy(false);
    if (row) { setModal(""); setRefresh((n) => n + 1); }
  };
  const savePledge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!target || !profile) return;
    setBusy(true);
    const row = await gifts.insert({ alumni_id: profile.id, campaign_id: target.id, amount: Number(pForm.amount), due_on: pForm.due_on || null }, "Thank you — your pledge is recorded.");
    setBusy(false);
    if (row) { setModal(""); setPForm({ amount: "", due_on: "" }); setRefresh((n) => n + 1); }
  };
  const savePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!target) return;
    setBusy(true);
    const { data, error } = await supabase.from("pledge_payments").insert([{ donation_id: target.id, amount: Number(payForm.amount), method: payForm.method }]).select().single();
    setBusy(false);
    if (error) return toast(errorMessage(error), "error");
    toast(`Payment received. Receipt ${data.receipt_no}.`);
    setModal("");
    setPayForm({ amount: "", method: "card" });
    await Promise.all([gifts.reload(), payments.reload()]);
    setRefresh((n) => n + 1);
  };
  const cancel = async (g: Row) => {
    if (!confirmAction("Cancel this pledge?")) return;
    await gifts.update(g.id, { pledge_status: "cancelled" }, "Pledge cancelled.");
    setRefresh((n) => n + 1);
  };

  const visibleGifts = gifts.rows.filter((g) => matches(search, names[g.alumni_id], campaignName(g.campaign_id), g.pledge_status));
  const raised = gifts.rows.reduce((t, g) => t + Number(g.paid_amount), 0);
  const outstanding = gifts.rows.filter((g) => ["pledged", "partially_paid"].includes(g.pledge_status)).reduce((t, g) => t + Number(g.amount) - Number(g.paid_amount), 0);

  return (
    <ModuleShell
      title="Advancement"
      icon={HandHeart}
      tabs={[
        { id: "campaigns" as TabId, label: "Campaigns", group: "Giving" },
        { id: "gifts" as TabId, label: alumni ? "My Giving" : "Pledges & Gifts", group: "Giving" },
        ...(admin ? [{ id: "donors" as TabId, label: "Donor Engagement", group: "Giving" }] : []),
      ]}
      activeTab={tab}
      onTab={setTab}
      search={tab === "gifts" ? search : undefined}
      onSearch={tab === "gifts" ? setSearch : undefined}
      searchPlaceholder="Search donors, campaigns..."
      action={admin && tab === "campaigns" ? <ActionButton icon={Plus} onClick={() => setModal("campaign")}>New Campaign</ActionButton> : null}
    >
      {modal === "campaign" && (
        <Modal title="New Campaign" icon={Target} onClose={() => setModal("")}>
          <form onSubmit={saveCampaign} className="space-y-4">
            <Field label="Campaign Name"><input required className={inputClass} value={cForm.name} onChange={(e) => setCForm({ ...cForm, name: e.target.value })} placeholder="New Robotics Lab" /></Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Goal ($)"><input type="number" min="1" required className={inputClass} value={cForm.goal} onChange={(e) => setCForm({ ...cForm, goal: e.target.value })} /></Field>
              <Field label="Ends"><input type="date" className={inputClass} value={cForm.ends_on} onChange={(e) => setCForm({ ...cForm, ends_on: e.target.value })} /></Field>
            </div>
            <Field label="Fund"><input required className={inputClass} value={cForm.fund} onChange={(e) => setCForm({ ...cForm, fund: e.target.value })} /></Field>
            <SubmitButton busy={busy}>Launch</SubmitButton>
          </form>
        </Modal>
      )}
      {modal === "pledge" && target && (
        <Modal title={`Give to ${target.name}`} icon={HandHeart} onClose={() => setModal("")}>
          <form onSubmit={savePledge} className="space-y-4">
            <Field label="Pledge Amount ($)"><input type="number" min="1" step="0.01" required className={inputClass} value={pForm.amount} onChange={(e) => setPForm({ ...pForm, amount: e.target.value })} /></Field>
            <Field label="Pay By (optional)"><input type="date" className={inputClass} value={pForm.due_on} onChange={(e) => setPForm({ ...pForm, due_on: e.target.value })} /></Field>
            <p className="text-xs text-slate-500">You can pay the pledge in one go or in instalments from My Giving.</p>
            <SubmitButton busy={busy}>Pledge</SubmitButton>
          </form>
        </Modal>
      )}
      {modal === "pay" && target && (
        <Modal title="Pay Pledge" icon={Receipt} onClose={() => setModal("")}>
          <form onSubmit={savePayment} className="space-y-4">
            <p className="text-sm text-slate-600">Outstanding: <b>{money(Number(target.amount) - Number(target.paid_amount))}</b></p>
            <Field label="Amount ($)"><input type="number" min="0.01" step="0.01" required className={inputClass} value={payForm.amount} onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })} /></Field>
            <Field label="Method">
              <select className={inputClass} value={payForm.method} onChange={(e) => setPayForm({ ...payForm, method: e.target.value })}>
                {["card", "bank_transfer", "cheque", "cash"].map((m) => <option key={m} value={m}>{label(m)}</option>)}
              </select>
            </Field>
            <SubmitButton busy={busy}>Pay</SubmitButton>
          </form>
        </Modal>
      )}

      {tab === "campaigns" ? (
        <div className="space-y-6">
          {admin && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <StatCard label="Raised" value={money(raised)} icon={HandHeart} color="pink" />
              <StatCard label="Outstanding Pledges" value={money(outstanding)} icon={Receipt} color="orange" />
              <StatCard label="Donors" value={new Set(gifts.rows.map((g) => g.alumni_id)).size} icon={Trophy} color="purple" />
            </div>
          )}
          <CampaignCards key={refresh} onGive={alumni ? (c) => { setTarget(c); setModal("pledge"); } : undefined} />
        </div>
      ) : tab === "gifts" ? (
        <Card title={alumni ? "My pledges and gifts" : "Pledges & gifts"}>
          {gifts.loading ? <Loading /> : (
            <Table headers={[...(admin ? ["Donor"] : []), "Campaign", "Pledged", "Paid", "Fund", "Status", ""]} empty={visibleGifts.length === 0 && "No gifts yet."}>
              {visibleGifts.map((g) => (
                <tr key={g.id}>
                  {admin && <td className="px-6 py-4 font-bold">{names[g.alumni_id] ?? "—"}</td>}
                  <td className="px-6 py-4">{campaignName(g.campaign_id)}</td>
                  <td className="px-6 py-4">{money(g.amount)}</td>
                  <td className="px-6 py-4 font-bold">{money(g.paid_amount)}</td>
                  <td className="px-6 py-4 text-sm">{g.allocated_fund}</td>
                  <td className="px-6 py-4"><Badge color={PLEDGE_COLOR[g.pledge_status]}>{label(g.pledge_status)}</Badge></td>
                  <td className="px-6 py-4 text-right whitespace-nowrap">
                    {["pledged", "partially_paid"].includes(g.pledge_status) && (
                      <button onClick={() => { setTarget(g); setPayForm({ amount: String(Number(g.amount) - Number(g.paid_amount)), method: "card" }); setModal("pay"); }} className="text-xs font-bold text-white bg-emerald-600 px-3 py-1.5 rounded-lg mr-2">{admin ? "Record payment" : "Pay"}</button>
                    )}
                    {g.pledge_status === "pledged" && (alumni || admin) && (
                      <button onClick={() => cancel(g)} className="text-xs font-bold text-red-600" title="Cancel pledge"><XCircle size={16} className="inline" /></button>
                    )}
                  </td>
                </tr>
              ))}
            </Table>
          )}
          {payments.rows.length > 0 && (
            <div className="mt-6">
              <h4 className="text-xs font-bold uppercase text-slate-400 mb-2">Receipts</h4>
              <div className="flex flex-wrap gap-2">
                {payments.rows.map((p) => <span key={p.id} className="text-xs bg-slate-50 border rounded-lg px-2 py-1">{p.receipt_no} • {money(p.amount)} • {fmtDate(p.paid_on)}</span>)}
              </div>
            </div>
          )}
        </Card>
      ) : (
        <Card title="Donor engagement">
          <p className="text-sm text-slate-500 mb-4">Score 0–100 = lifetime giving (40) + recency (30) + number of gifts (20) + pledges fulfilled (10).</p>
          <Table headers={["Donor", "Score", "Lifetime Given", "Gifts", "Last Gift"]} empty={scores.length === 0 && "No donors yet."}>
            {scores.map((s) => (
              <tr key={s.alumni_id}>
                <td className="px-6 py-4 font-bold">{s.full_name}</td>
                <td className="px-6 py-4"><Badge color={s.score >= 60 ? "green" : s.score >= 30 ? "orange" : "slate"}>{s.score}</Badge></td>
                <td className="px-6 py-4">{money(s.lifetime_given)}</td>
                <td className="px-6 py-4">{s.gifts}</td>
                <td className="px-6 py-4 text-sm">{fmtDate(s.last_gift)}</td>
              </tr>
            ))}
          </Table>
        </Card>
      )}
    </ModuleShell>
  );
}
