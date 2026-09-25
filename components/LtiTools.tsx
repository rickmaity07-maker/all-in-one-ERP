"use client";

import { useEffect, useState } from "react";
import { AppWindow, ExternalLink } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { launchTool } from "@/lib/lti";
import { Card, Empty, Loading, toast } from "@/components/ui";
import { errorMessage, type Row } from "@/lib/utils";

// External learning tools (LTI 1.3) the school has connected; launching signs the user in to the tool.
export default function LtiTools() {
  const [tools, setTools] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState("");
  useEffect(() => {
    supabase.from("lti_tools").select("id, name, launch_url").eq("enabled", true).order("name").then(({ data }) => setTools(data ?? []));
  }, []);
  const launch = async (id: string) => {
    setBusy(id);
    try {
      await launchTool(id);
    } catch (e) {
      toast(errorMessage(e), "error");
    }
    setBusy("");
  };
  if (!tools) return <Loading />;
  return (
    <Card title="External learning tools">
      {tools.length === 0 ? <Empty>No external tools are connected yet. Administrators add them under Integrations → LTI 1.3 Tools.</Empty> : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {tools.map((t) => (
            <div key={t.id} className="p-5 rounded-2xl border border-slate-100 flex flex-col gap-3">
              <p className="font-bold text-slate-800 flex items-center gap-2"><AppWindow size={18} className="text-indigo-500" /> {t.name}</p>
              <p className="text-xs text-slate-400 break-all">{new URL(t.launch_url).host}</p>
              <button disabled={busy === t.id} onClick={() => launch(t.id)} className="mt-auto text-sm font-bold text-white bg-indigo-600 px-4 py-2 rounded-xl flex items-center justify-center gap-2 disabled:opacity-50">
                <ExternalLink size={14} /> {busy === t.id ? "Opening…" : "Launch"}
              </button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
