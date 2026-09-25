"use client";

import { useCallback, useEffect, useState } from "react";
import { HandHeart } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Loading, Empty } from "@/components/ui";
import { fmtDate, money, type Row } from "@/lib/utils";

// Campaign cards with live totals (visible to staff and alumni alike).
export default function CampaignCards({ onGive }: { onGive?: (c: Row) => void }) {
  const [campaigns, setCampaigns] = useState<Row[] | null>(null);
  const [totals, setTotals] = useState<Record<string, Row>>({});
  const load = useCallback(async () => {
    const [c, t] = await Promise.all([supabase.from("campaigns").select("*").order("created_at", { ascending: false }), supabase.rpc("campaign_totals")]);
    return { c: c.data ?? [], t: Object.fromEntries(((t.data as Row[]) ?? []).map((x) => [x.campaign_id, x])) };
  }, []);
  useEffect(() => {
    let off = false;
    load().then((d) => { if (!off) { setCampaigns(d.c); setTotals(d.t); } });
    return () => { off = true; };
  }, [load]);
  if (!campaigns) return <Loading />;
  if (!campaigns.length) return <Empty>No campaigns yet.</Empty>;
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
      {campaigns.map((c) => {
        const t = totals[c.id] ?? { raised: 0, pledged: 0, donors: 0 };
        const pct = Math.min(100, Math.round((Number(t.raised) / Number(c.goal)) * 100));
        return (
          <div key={c.id} className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm flex flex-col">
            <p className="text-xs font-bold uppercase text-slate-400">{c.fund}</p>
            <h3 className="font-black text-slate-800 text-lg [overflow-wrap:anywhere]">{c.name}</h3>
            <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden my-3"><div className="bg-linear-to-r from-pink-500 to-orange-400 h-3" style={{ width: `${pct}%` }} /></div>
            <p className="text-sm text-slate-600"><b>{money(t.raised)}</b> raised of {money(c.goal)} • {pct}%</p>
            <p className="text-xs text-slate-400 mb-4">{money(t.pledged)} pledged by {t.donors} donor{t.donors === 1 ? "" : "s"}{c.ends_on ? ` • ends ${fmtDate(c.ends_on)}` : ""}</p>
            {onGive && c.active && <button onClick={() => onGive(c)} className="mt-auto text-sm font-bold text-white bg-pink-600 px-4 py-2.5 rounded-xl flex items-center justify-center gap-2"><HandHeart size={16} /> Give to this campaign</button>}
          </div>
        );
      })}
    </div>
  );
}

