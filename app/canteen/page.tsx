"use client";

import { useCallback, useEffect, useState } from "react";
import { UtensilsCrossed, Wallet, ShoppingCart, ListPlus, Plus, Minus, Nfc, AlertTriangle, Ban, Save, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useSession, isStaff, isAdmin } from "@/lib/session";
import { usePeople } from "@/lib/useChildren";
import PayOnline from "@/components/PayOnline";
import { ModuleShell, Modal, Field, SubmitButton, ActionButton, Card, Badge, Empty, Loading, AccessDenied, Table, inputClass, toast } from "@/components/ui";
import { androidBridge, errorMessage, fmtDateTime, money, type Row } from "@/lib/utils";
import { useT } from "@/lib/i18n";

type TabId = "till" | "menu" | "wallet";
type Line = { item: Row; qty: number };

// Cashless canteen: wallets topped up online, charged at the till by ID card, with parents' limits.
export default function Canteen() {
  const { role } = useSession();
  const t = useT();
  const staff = isStaff(role);
  const admin = isAdmin(role);
  const { people, ready } = usePeople();
  const [tab, setTab] = useState<TabId>(staff ? "till" : "wallet");
  const [items, setItems] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // Till
  const [card, setCard] = useState("");
  const [pick, setPick] = useState("");
  const [buyer, setBuyer] = useState<Row | null>(null);
  const [cart, setCart] = useState<Line[]>([]);
  const [nfc] = useState(() => androidBridge()?.nfcStatus?.() ?? "none");

  // Menu
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ name: "", price: "", category: "Snacks", allergens: "" });

  // Wallet
  const [who, setWho] = useState("");
  const [wallet, setWallet] = useState<Row | null>(null);
  const [history, setHistory] = useState<Row[]>([]);
  const [topping, setTopping] = useState(false);
  const [limit, setLimit] = useState("");
  const [blocked, setBlocked] = useState<string[]>([]);

  const loadMenu = useCallback(async () => (await supabase.from("canteen_items").select("*").order("category").order("name")).data ?? [], []);
  useEffect(() => {
    let off = false;
    loadMenu().then((m) => { if (!off) { setItems(m); setLoading(false); } });
    return () => { off = true; };
  }, [loadMenu]);

  const child = who || people[0]?.id || "";
  const loadWallet = useCallback(async (id: string) => {
    const [w, h] = await Promise.all([
      supabase.from("canteen_wallets").select("*").eq("student_id", id).maybeSingle(),
      supabase.from("canteen_transactions").select("*").eq("student_id", id).order("created_at", { ascending: false }).limit(100),
    ]);
    return { w: w.data ?? { student_id: id, balance: 0, daily_limit: null, blocked_items: [] }, h: h.data ?? [] };
  }, []);
  const applyWallet = (x: Awaited<ReturnType<typeof loadWallet>>) => {
    setWallet(x.w);
    setHistory(x.h);
    setLimit(x.w.daily_limit != null ? String(x.w.daily_limit) : "");
    setBlocked(x.w.blocked_items ?? []);
  };
  useEffect(() => {
    if (staff || !child) return;
    let off = false;
    loadWallet(child).then((x) => !off && applyWallet(x));
    return () => { off = true; };
  }, [staff, child, loadWallet]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Till ----
  const lookup = async (cardUid: string | null, studentId: string | null) => {
    const { data, error } = await supabase.rpc("canteen_lookup", { p_card: cardUid, p_student: studentId });
    if (error) {
      setBuyer(null);
      return toast(errorMessage(error), "error");
    }
    setBuyer({ ...(data as Row), card: cardUid });
  };
  // Hold a student's card to an Android phone, or use a USB reader (it types the number and Enter).
  useEffect(() => {
    if (tab !== "till" || !staff) return;
    const onNfc = (e: Event) => {
      const uid = (e as CustomEvent<string>).detail;
      setCard(uid);
      void lookup(uid, null);
    };
    window.addEventListener("erp:nfc", onNfc);
    androidBridge()?.startNfc?.();
    return () => {
      window.removeEventListener("erp:nfc", onNfc);
      androidBridge()?.stopNfc?.();
    };
  }, [tab, staff]);

  const addToCart = (item: Row) =>
    setCart((c) => (c.some((l) => l.item.id === item.id) ? c.map((l) => (l.item.id === item.id ? { ...l, qty: Math.min(20, l.qty + 1) } : l)) : [...c, { item, qty: 1 }]));
  const changeQty = (id: string, d: number) => setCart((c) => c.map((l) => (l.item.id === id ? { ...l, qty: l.qty + d } : l)).filter((l) => l.qty > 0));
  const total = cart.reduce((s, l) => s + Number(l.item.price) * l.qty, 0);
  const charge = async () => {
    if (!buyer || !cart.length) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("canteen_charge", {
      p_card: buyer.card || null, p_student: buyer.card ? null : buyer.id, p_items: cart.map((l) => ({ id: l.item.id, qty: l.qty })),
    });
    setBusy(false);
    if (error) return toast(errorMessage(error), "error");
    const r = data as Row;
    toast(t("Charged {total}. {name} has {balance} left.", { total: money(r.total), name: r.name, balance: money(r.balance) }));
    setCart([]);
    setBuyer(null);
    setCard("");
    setPick("");
  };

  // ---- Menu ----
  const addItem = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.from("canteen_items").insert({
      name: f.name.trim(), price: Number(f.price), category: f.category.trim() || "Snacks",
      allergens: f.allergens.split(",").map((x) => x.trim()).filter(Boolean),
    });
    setBusy(false);
    if (error) return toast(errorMessage(error), "error");
    toast(t("Added to the menu."));
    setAdding(false);
    setF({ name: "", price: "", category: "Snacks", allergens: "" });
    setItems(await loadMenu());
  };
  const toggleItem = async (item: Row) => {
    const { error } = await supabase.from("canteen_items").update({ active: !item.active }).eq("id", item.id);
    if (error) return toast(errorMessage(error), "error");
    setItems(await loadMenu());
  };

  // ---- Wallet controls (parents) ----
  const saveControls = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.rpc("set_wallet_controls", { p_student: child, p_daily_limit: limit.trim() ? Number(limit) : null, p_blocked: blocked });
    setBusy(false);
    if (error) return toast(errorMessage(error), "error");
    toast(t("Saved."));
    applyWallet(await loadWallet(child));
  };

  if (role === "alumni") return <AccessDenied message="The canteen is for current students, their parents and staff." />;

  const onMenu = items.filter((i) => i.active);
  const categories = Array.from(new Set(onMenu.map((i) => i.category)));
  const childName = people.find((p) => p.id === child)?.full_name ?? "";

  const tabs = [
    ...(staff ? [{ id: "till" as TabId, label: "Till", icon: ShoppingCart }] : [{ id: "wallet" as TabId, label: "Wallet", icon: Wallet }]),
    { id: "menu" as TabId, label: "Menu", icon: UtensilsCrossed },
  ];

  return (
    <ModuleShell
      title="Canteen"
      icon={UtensilsCrossed}
      tabs={tabs}
      activeTab={tab}
      onTab={setTab}
      action={tab === "menu" && admin && <ActionButton icon={ListPlus} onClick={() => setAdding(true)}>Add item</ActionButton>}
    >
      {adding && (
        <Modal title="Add item" icon={ListPlus} onClose={() => setAdding(false)}>
          <form onSubmit={addItem} className="space-y-4">
            <Field label="Name"><input required className={inputClass} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Price"><input required inputMode="decimal" className={inputClass} value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} /></Field>
              <Field label="Category"><input className={inputClass} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} /></Field>
            </div>
            <Field label="Contains (allergens, separate with commas)"><input className={inputClass} value={f.allergens} onChange={(e) => setF({ ...f, allergens: e.target.value })} placeholder={t("e.g. peanuts, milk, gluten")} /></Field>
            <SubmitButton busy={busy}>Add to menu</SubmitButton>
          </form>
        </Modal>
      )}
      {topping && wallet && (
        <PayOnline purpose="wallet" studentId={child} studentName={childName} balance={Number(wallet.balance)}
          onPaid={() => void loadWallet(child).then(applyWallet)} onClose={() => setTopping(false)} />
      )}

      {loading || !ready ? <Loading /> : tab === "till" ? (
        <div className="grid lg:grid-cols-[1fr_22rem] gap-6">
          <div className="space-y-4">
            <Card title="Who is buying?">
              {nfc === "ready" && <p className="mb-3 p-3 rounded-xl bg-emerald-50 text-emerald-800 text-sm font-semibold flex items-center gap-2"><Nfc size={16} /> {t("Hold the student's card to the back of this phone.")}</p>}
              <form onSubmit={(e) => { e.preventDefault(); if (card.trim()) void lookup(card.trim(), null); }} className="flex flex-wrap gap-2">
                <input value={card} onChange={(e) => setCard(e.target.value)} aria-label={t("Card number")} placeholder={t("Tap or type the card number")}
                  className="flex-1 min-w-40 px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 font-mono" />
                <button type="submit" className="px-5 py-3 rounded-xl bg-slate-900 text-white font-bold">{t("Find")}</button>
              </form>
              <div className="mt-3">
                <select aria-label={t("Or choose a student")} className={inputClass} value={pick} onChange={(e) => { setPick(e.target.value); setCard(""); if (e.target.value) void lookup(null, e.target.value); }}>
                  <option value="">{t("Or choose a student…")}</option>
                  {people.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
                </select>
              </div>
              {buyer && (
                <div className="mt-4 p-4 rounded-2xl border-2 border-indigo-100 space-y-2" role="status">
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-black text-slate-800">{buyer.name}</span>
                    <span className="ml-auto font-bold text-emerald-700">{money(buyer.balance)}</span>
                  </div>
                  {buyer.daily_limit != null && <p className="text-xs text-slate-500">{t("Daily limit {limit} · spent today {spent}", { limit: money(buyer.daily_limit), spent: money(buyer.spent_today) })}</p>}
                  {buyer.allergies?.length > 0 && <p className="text-sm font-bold text-red-700 flex items-center gap-1"><AlertTriangle size={14} /> {t("Allergic to: {list}", { list: buyer.allergies.join(", ") })}</p>}
                  {buyer.blocked?.length > 0 && <p className="text-sm font-semibold text-orange-700 flex items-center gap-1"><Ban size={14} /> {t("Blocked by a parent: {list}", { list: buyer.blocked.join(", ") })}</p>}
                </div>
              )}
            </Card>
            {onMenu.length === 0 ? <Empty>The menu is empty. An administrator adds items on the Menu tab.</Empty> : categories.map((c) => (
              <Card key={c} title={c}>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {onMenu.filter((i) => i.category === c).map((i) => (
                    <button key={i.id} onClick={() => addToCart(i)} className="p-3 rounded-xl border border-slate-200 hover:border-indigo-400 hover:bg-indigo-50 text-left">
                      <span className="block font-bold text-slate-800 text-sm">{i.name}</span>
                      <span className="block text-xs text-slate-500">{money(i.price)}</span>
                    </button>
                  ))}
                </div>
              </Card>
            ))}
          </div>
          <Card title="Order">
            {cart.length === 0 ? <p className="text-sm text-slate-400">{t("Tap items to add them.")}</p> : (
              <ul className="space-y-2" aria-label={t("Order")}>
                {cart.map((l) => (
                  <li key={l.item.id} className="flex items-center gap-2 text-sm">
                    <span className="flex-1 font-semibold">{l.item.name}</span>
                    <button onClick={() => changeQty(l.item.id, -1)} aria-label={t("One less")} className="p-1 rounded-lg bg-slate-100"><Minus size={14} /></button>
                    <span className="w-6 text-center font-bold">{l.qty}</span>
                    <button onClick={() => changeQty(l.item.id, 1)} aria-label={t("One more")} className="p-1 rounded-lg bg-slate-100"><Plus size={14} /></button>
                    <span className="w-16 text-right">{money(Number(l.item.price) * l.qty)}</span>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between font-black text-slate-800"><span>{t("Total")}</span><span>{money(total)}</span></div>
            <div className="mt-4 flex gap-2">
              {cart.length > 0 && <button onClick={() => setCart([])} className="px-4 py-3 rounded-xl bg-slate-100 font-bold text-slate-600" aria-label={t("Clear the order")}><X size={16} /></button>}
              <button disabled={!buyer || !cart.length || busy} onClick={charge} className="flex-1 py-3 rounded-xl bg-emerald-600 text-white font-bold disabled:opacity-40">
                {buyer ? t("Charge {name}", { name: buyer.name }) : t("Find the student first")}
              </button>
            </div>
          </Card>
        </div>
      ) : tab === "menu" ? (
        items.length === 0 ? <Empty>The menu is empty.</Empty> : (
          <Table headers={["Item", "Category", "Price", "Contains", ...(admin ? ["On sale"] : [])]}>
            {items.map((i) => (
              <tr key={i.id} className={i.active ? "" : "opacity-50"}>
                <td className="px-6 py-3 font-bold text-slate-800">{i.name}</td>
                <td className="px-6 py-3 text-sm">{i.category}</td>
                <td className="px-6 py-3 text-sm">{money(i.price)}</td>
                <td className="px-6 py-3"><div className="flex flex-wrap gap-1">{(i.allergens ?? []).map((a: string) => <Badge key={a} color="orange">{a}</Badge>)}</div></td>
                {admin && <td className="px-6 py-3"><button onClick={() => toggleItem(i)} className="text-sm font-bold text-indigo-600">{i.active ? t("Take off") : t("Put back")}</button></td>}
              </tr>
            ))}
          </Table>
        )
      ) : people.length === 0 ? <Empty>No children are linked to your account yet.</Empty> : (
        <div className="space-y-6">
          {people.length > 1 && (
            <Field label="Child">
              <select className={inputClass} value={child} onChange={(e) => setWho(e.target.value)}>
                {people.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
              </select>
            </Field>
          )}
          {!wallet ? <Loading /> : (
            <>
              <Card>
                <div className="flex flex-wrap items-center gap-4">
                  <Wallet size={32} className="text-indigo-600" />
                  <div className="flex-1">
                    <p className="text-xs font-bold text-slate-400 uppercase">{t("Canteen wallet")}</p>
                    <p className="text-3xl font-black text-slate-800" data-testid="wallet-balance">{money(wallet.balance)}</p>
                    {wallet.daily_limit != null && <p className="text-xs text-slate-500">{t("Daily limit {limit}", { limit: money(wallet.daily_limit) })}</p>}
                  </div>
                  <button onClick={() => setTopping(true)} className="px-5 py-3 rounded-xl bg-emerald-600 text-white font-bold">{t("Top up")}</button>
                </div>
              </Card>
              {role === "parent" && (
                <Card title="Limits">
                  <form onSubmit={saveControls} className="space-y-4">
                    <Field label="Daily spending limit (empty for none)"><input inputMode="decimal" className={inputClass} value={limit} onChange={(e) => setLimit(e.target.value)} /></Field>
                    <fieldset>
                      <legend className="text-xs font-bold text-slate-500 uppercase mb-2">{t("Don't let my child buy")}</legend>
                      <div className="grid sm:grid-cols-2 gap-2">
                        {onMenu.map((i) => (
                          <label key={i.id} className="flex items-center gap-2 text-sm">
                            <input type="checkbox" checked={blocked.includes(i.id)} onChange={(e) => setBlocked(e.target.checked ? [...blocked, i.id] : blocked.filter((x) => x !== i.id))} />
                            {i.name}
                          </label>
                        ))}
                      </div>
                    </fieldset>
                    <button type="submit" disabled={busy} className="px-5 py-3 rounded-xl bg-indigo-600 text-white font-bold flex items-center gap-2"><Save size={16} /> {t("Save limits")}</button>
                  </form>
                </Card>
              )}
              <Card title="History">
                {history.length === 0 ? <p className="text-sm text-slate-400">{t("Nothing yet.")}</p> : (
                  <ul className="divide-y divide-slate-100">
                    {history.map((h) => (
                      <li key={h.id} className="py-2 flex items-center gap-3 text-sm">
                        <Badge color={h.kind === "topup" ? "green" : "slate"}>{t(h.kind === "topup" ? "top-up" : "purchase")}</Badge>
                        <span className="flex-1 text-slate-600 truncate">{h.kind === "topup" ? h.reference : (h.items ?? []).map((i: Row) => `${i.qty}× ${i.name}`).join(", ")}</span>
                        <span className={`font-bold ${h.kind === "topup" ? "text-emerald-700" : "text-slate-800"}`}>{h.kind === "topup" ? "+" : "−"}{money(h.amount)}</span>
                        <span className="hidden sm:block text-xs text-slate-400 w-36 text-right">{fmtDateTime(h.created_at)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </>
          )}
        </div>
      )}
    </ModuleShell>
  );
}
