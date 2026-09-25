"use client";

import { useCallback, useEffect, useState } from "react";
import { Shuffle, Printer, Send, EyeOff, Ticket } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Modal, Table, Badge, Empty, Loading, Card, toast, confirmAction } from "@/components/ui";
import { errorMessage, escapeHtml, printDocument, type Row } from "@/lib/utils";

const when = (v: string) => {
  const d = new Date(v);
  return v && /^\d{4}-\d{2}-\d{2}/.test(v) && !isNaN(d.getTime()) ? d.toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : v;
};

function ticketHtml(t: { course_name: string; exam_date: string; location: string | null; candidate_number: string; seat_label: string | null; name?: string }) {
  return `<div class="page"><div class="brand"><div><h1>Hall Ticket</h1><div class="muted">Examinations Office</div></div><div class="right muted">${escapeHtml(t.candidate_number)}</div></div>
    <table><tbody>
      ${t.name ? `<tr><th>Candidate</th><td>${escapeHtml(t.name)}</td></tr>` : ""}
      <tr><th>Candidate No.</th><td><b>${escapeHtml(t.candidate_number)}</b></td></tr>
      <tr><th>Exam</th><td>${escapeHtml(t.course_name)}</td></tr>
      <tr><th>Date & Time</th><td>${escapeHtml(when(t.exam_date))}</td></tr>
      <tr><th>Room</th><td>${escapeHtml(t.location ?? "TBA")}</td></tr>
      <tr><th>Seat</th><td><b>${escapeHtml(t.seat_label ?? "—")}</b></td></tr>
    </tbody></table>
    <p class="muted">Bring this ticket and photo ID. Write only your candidate number on the answer script.</p></div>`;
}

export function printHallTickets(tickets: Parameters<typeof ticketHtml>[0][]) {
  printDocument("Hall tickets", tickets.map(ticketHtml).join(""));
}

// Staff: candidates, randomised seating, hall tickets, blind grading and result release for one exam.
export function ExamManager({ exam, onClose, onChanged }: { exam: Row; onClose: () => void; onChanged: () => void }) {
  const [candidates, setCandidates] = useState<Row[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [room, setRoom] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [scores, setScores] = useState<Record<string, string>>({});
  const blind = exam.blind_grading && !exam.results_released;

  const fetchAll = useCallback(async () => {
    const [c, f] = await Promise.all([
      supabase.from("exam_candidates").select("*").eq("exam_id", exam.id).order("seat_label"),
      exam.facility_id ? supabase.from("facilities").select("name").eq("id", exam.facility_id).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    const rows = c.data ?? [];
    const ids = rows.map((r) => r.student_id);
    const p = ids.length ? await supabase.from("profiles").select("id, full_name").in("id", ids) : { data: [] };
    return { rows, names: Object.fromEntries((p.data ?? []).map((x) => [x.id, x.full_name])), room: (f.data as Row | null)?.name ?? null };
  }, [exam.id, exam.facility_id]);

  const apply = (d: Awaited<ReturnType<typeof fetchAll>>) => {
    setCandidates(d.rows);
    setNames(d.names);
    setRoom(d.room);
    setScores(Object.fromEntries(d.rows.map((r) => [r.id, r.score?.toString() ?? ""])));
    setLoading(false);
  };
  useEffect(() => {
    let c = false;
    fetchAll().then((d) => !c && apply(d));
    return () => { c = true; };
  }, [fetchAll]); // eslint-disable-line react-hooks/exhaustive-deps

  const seat = async () => {
    setBusy(true);
    const { data, error } = await supabase.rpc("generate_exam_seating", { p_exam: exam.id });
    setBusy(false);
    if (error) return toast(errorMessage(error), "error");
    toast(`Seated ${data} candidate(s) at random.`);
    apply(await fetchAll());
  };

  const saveScores = async () => {
    setBusy(true);
    for (const c of candidates) {
      const v = scores[c.id];
      const next = v === "" ? null : Number(v);
      if (next !== null && (isNaN(next) || next < 0 || next > Number(exam.max_score))) {
        setBusy(false);
        return toast(`Scores must be between 0 and ${exam.max_score}.`, "error");
      }
      if (next === (c.score === null ? null : Number(c.score))) continue;
      const { error } = await supabase.from("exam_candidates").update({ score: next }).eq("id", c.id);
      if (error) { setBusy(false); return toast(errorMessage(error), "error"); }
    }
    setBusy(false);
    toast("Scores saved.");
    apply(await fetchAll());
  };

  const release = async () => {
    if (candidates.some((c) => c.score === null) && !confirmAction("Some candidates have no score. Release anyway?")) return;
    const { error } = await supabase.from("exams").update({ results_released: true, status: "Completed" }).eq("id", exam.id);
    if (error) return toast(errorMessage(error), "error");
    toast("Results released — students have been notified.");
    onChanged();
    onClose();
  };

  const location = room ?? exam.location;
  const printTickets = () => printHallTickets(candidates.map((c) => ({ course_name: exam.course_name, exam_date: exam.exam_date, location, candidate_number: c.candidate_number, seat_label: c.seat_label, name: names[c.student_id] })));
  const printSheet = () =>
    printDocument(
        `Grading sheet - ${exam.course_name}`,
        `<h1>${escapeHtml(exam.course_name)} — grading sheet</h1><p class="muted">${blind ? "Blind grading: candidate numbers only." : ""} Max score ${exam.max_score}</p>
         <table><thead><tr><th>Candidate No.</th>${blind ? "" : "<th>Name</th>"}<th>Seat</th><th class="right">Score</th></tr></thead><tbody>
         ${[...candidates].sort((a, b) => a.candidate_number.localeCompare(b.candidate_number)).map((c) => `<tr><td>${c.candidate_number}</td>${blind ? "" : `<td>${escapeHtml(names[c.student_id] ?? "")}</td>`}<td>${escapeHtml(c.seat_label ?? "")}</td><td class="right">${c.score ?? ""}</td></tr>`).join("")}
         </tbody></table>`
      );

  return (
    <Modal title={`Exam — ${exam.course_name}`} icon={Ticket} onClose={onClose} wide>
      <div className="flex flex-wrap gap-2 mb-4">
        <Badge color="blue">{when(exam.exam_date)}</Badge>
        <Badge color="slate">{location ?? "No room"}</Badge>
        {blind && <Badge color="purple"><EyeOff size={10} /> Blind grading</Badge>}
        {exam.results_released && <Badge color="green">Results released</Badge>}
      </div>
      {!exam.class_id ? (
        <Empty>Link this exam to a class (Edit exam) to build the candidate list.</Empty>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 mb-4">
            <button disabled={busy || exam.results_released} onClick={seat} className="text-xs font-bold text-white bg-indigo-600 px-3 py-2 rounded-lg flex items-center gap-1 disabled:opacity-40"><Shuffle size={14} /> {candidates.length ? "Re-shuffle seating" : "Generate seating"}</button>
            <button disabled={!candidates.length} onClick={printTickets} className="text-xs font-bold text-slate-700 bg-slate-100 px-3 py-2 rounded-lg flex items-center gap-1 disabled:opacity-40"><Printer size={14} /> Hall tickets</button>
            <button disabled={!candidates.length} onClick={printSheet} className="text-xs font-bold text-slate-700 bg-slate-100 px-3 py-2 rounded-lg flex items-center gap-1 disabled:opacity-40"><Printer size={14} /> Grading sheet</button>
            {!exam.results_released && <button disabled={!candidates.length} onClick={release} className="text-xs font-bold text-white bg-emerald-600 px-3 py-2 rounded-lg flex items-center gap-1 disabled:opacity-40"><Send size={14} /> Release results</button>}
          </div>
          {loading ? <Loading /> : (
            <>
              <Table headers={["Candidate No.", blind ? "Identity" : "Student", "Seat", `Score / ${exam.max_score}`]} empty={candidates.length === 0 && "No candidates yet — generate seating."}>
                {candidates.map((c) => (
                  <tr key={c.id}>
                    <td className="px-4 py-2 font-mono text-sm">{c.candidate_number}</td>
                    <td className="px-4 py-2 text-sm">{blind ? <span className="text-slate-400 italic">hidden</span> : names[c.student_id]}</td>
                    <td className="px-4 py-2 font-bold">{c.seat_label ?? "—"}</td>
                    <td className="px-4 py-2">
                      <input aria-label={`Score for ${c.candidate_number}`} type="number" min="0" max={exam.max_score} step="0.5" disabled={exam.results_released}
                        value={scores[c.id] ?? ""} onChange={(e) => setScores({ ...scores, [c.id]: e.target.value })}
                        className="w-24 px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm" />
                    </td>
                  </tr>
                ))}
              </Table>
              {candidates.length > 0 && !exam.results_released && (
                <button disabled={busy} onClick={saveScores} className="mt-4 text-sm font-bold text-white bg-indigo-600 px-5 py-2.5 rounded-xl disabled:opacity-40">Save scores</button>
              )}
            </>
          )}
        </>
      )}
    </Modal>
  );
}

// Students: their hall tickets and (once released) results.
export function MyHallTickets() {
  const [rows, setRows] = useState<Row[] | null>(null);
  useEffect(() => {
    supabase.rpc("my_hall_tickets").then(({ data, error }) => {
      if (error) toast(errorMessage(error), "error");
      setRows(data ?? []);
    });
  }, []);
  if (!rows) return <Loading />;
  return (
    <Card title="My hall tickets & results">
      {rows.length === 0 ? <Empty>No hall tickets issued yet.</Empty> : (
        <Table headers={["Exam", "When", "Room", "Candidate No.", "Seat", "Result", ""]}>
          {rows.map((t) => (
            <tr key={t.exam_id}>
              <td className="px-4 py-3 font-bold">{t.course_name}</td>
              <td className="px-4 py-3 text-sm whitespace-nowrap">{when(t.exam_date)}</td>
              <td className="px-4 py-3 text-sm">{t.location ?? "TBA"}</td>
              <td className="px-4 py-3 font-mono text-sm">{t.candidate_number}</td>
              <td className="px-4 py-3 font-bold">{t.seat_label ?? "—"}</td>
              <td className="px-4 py-3">{t.results_released ? <Badge color="green">{t.score ?? "—"} / {t.max_score}</Badge> : <Badge color="slate">Pending</Badge>}</td>
              <td className="px-4 py-3 text-right">
                <button onClick={() => printHallTickets([t as Parameters<typeof ticketHtml>[0]])} className="text-xs font-bold text-indigo-600 flex items-center gap-1"><Printer size={14} /> Print</button>
              </td>
            </tr>
          ))}
        </Table>
      )}
    </Card>
  );
}
