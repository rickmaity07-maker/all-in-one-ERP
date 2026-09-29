"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ListChecks, Plus, Trash2, Send, Timer, CheckCircle2, XCircle, BarChart3, PlayCircle, Eye } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useSession, isStaff, isAdmin } from "@/lib/session";
import { ModuleShell, Modal, Field, SubmitButton, ActionButton, Card, Table, Badge, Empty, Loading, AccessDenied, inputClass, toast, confirmAction } from "@/components/ui";
import { errorMessage, fmtDateTime, type Row } from "@/lib/utils";
import { useT } from "@/lib/i18n";

type Kind = "single" | "multi" | "truefalse" | "short" | "number";
const KINDS: { id: Kind; label: string }[] = [
  { id: "single", label: "One correct choice" },
  { id: "multi", label: "Several correct choices" },
  { id: "truefalse", label: "True / false" },
  { id: "short", label: "Short answer" },
  { id: "number", label: "Number" },
];
const emptyQ = { kind: "single" as Kind, prompt: "", options: "", correct: [] as number[], tf: "true", accepted: "", value: "", tol: "0", points: "1" };
const toLocalInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

// A running quiz: keeps answers on the device so a reload doesn't lose them.
function TakeQuiz({ quiz, onDone }: { quiz: Row; onDone: () => void }) {
  const t = useT();
  const store = `erp_quiz_${quiz.id}`;
  const [paper, setPaper] = useState<{ questions: Row[]; deadline: string | null } | null>(null);
  const [answers, setAnswers] = useState<Record<string, unknown>>(() => {
    try { return JSON.parse(localStorage.getItem(store) ?? "{}"); } catch { return {}; }
  });
  const [left, setLeft] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ score: number; max_score: number } | null>(null);

  useEffect(() => {
    supabase.rpc("start_quiz", { p_quiz: quiz.id }).then(({ data, error }) => {
      if (error) { toast(errorMessage(error), "error"); onDone(); return; }
      setPaper(data as { questions: Row[]; deadline: string | null });
    });
  }, [quiz.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    try { localStorage.setItem(store, JSON.stringify(answers)); } catch {}
  }, [answers, store]);

  const submit = useCallback(async (auto = false) => {
    if (!auto && !confirmAction(t("Hand in the quiz? You can't change your answers afterwards."))) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("submit_quiz", { p_quiz: quiz.id, p_answers: answers });
    setBusy(false);
    if (error) return toast(errorMessage(error), "error");
    try { localStorage.removeItem(store); } catch {}
    setResult(data as { score: number; max_score: number });
  }, [answers, quiz.id, store, t]);

  useEffect(() => {
    if (!paper?.deadline || result) return;
    const end = new Date(paper.deadline).getTime();
    const tick = () => {
      const s = Math.max(0, Math.round((end - Date.now()) / 1000));
      setLeft(s);
      if (s === 0) void submit(true);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [paper?.deadline, result]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (id: string, v: unknown) => setAnswers((a) => ({ ...a, [id]: v }));

  return (
    <Modal title={quiz.title} icon={ListChecks} onClose={onDone} wide>
      {result ? (
        <div className="text-center space-y-3 py-4">
          <CheckCircle2 size={48} className="mx-auto text-emerald-500" />
          <p className="text-lg font-black text-slate-800">{t("Handed in")}</p>
          <p className="text-3xl font-black text-indigo-700" data-testid="quiz-score">{Number(result.score)} / {Number(result.max_score)}</p>
          <p className="text-sm text-slate-500">{t("Your score is in the gradebook.")}</p>
          <button onClick={onDone} className="px-6 py-3 rounded-xl bg-slate-900 text-white font-bold">{t("Done")}</button>
        </div>
      ) : !paper ? <Loading /> : (
        <div className="space-y-5">
          {quiz.instructions && <p className="text-sm text-slate-600">{quiz.instructions}</p>}
          {left !== null && (
            <p className={`sticky top-0 z-10 flex items-center gap-2 text-sm font-black px-3 py-2 rounded-xl ${left < 60 ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-700"}`} aria-live="polite">
              <Timer size={16} /> {t("Time left")}: {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}
            </p>
          )}
          {paper.questions.map((q, i) => (
            <fieldset key={q.id} className="p-4 rounded-2xl border border-slate-100">
              <legend className="px-1 text-xs font-bold text-slate-400">{t("Question {n}", { n: i + 1 })} · {t("{p} pt", { p: Number(q.points) })}</legend>
              <p className="font-bold text-slate-800 mb-3">{q.prompt}</p>
              {q.kind === "single" && (q.options as string[]).map((o, k) => (
                <label key={k} className="flex items-center gap-2 text-sm py-1"><input type="radio" name={q.id} checked={answers[q.id] === k} onChange={() => set(q.id, k)} /> {o}</label>
              ))}
              {q.kind === "multi" && (q.options as string[]).map((o, k) => {
                const cur = (answers[q.id] as number[] | undefined) ?? [];
                return <label key={k} className="flex items-center gap-2 text-sm py-1"><input type="checkbox" checked={cur.includes(k)} onChange={(e) => set(q.id, e.target.checked ? [...cur, k] : cur.filter((x) => x !== k))} /> {o}</label>;
              })}
              {q.kind === "truefalse" && [true, false].map((v) => (
                <label key={String(v)} className="flex items-center gap-2 text-sm py-1"><input type="radio" name={q.id} checked={answers[q.id] === v} onChange={() => set(q.id, v)} /> {t(v ? "True" : "False")}</label>
              ))}
              {(q.kind === "short" || q.kind === "number") && (
                <input aria-label={t("Answer to question {n}", { n: i + 1 })} inputMode={q.kind === "number" ? "decimal" : "text"} className={inputClass}
                  value={String(answers[q.id] ?? "")} onChange={(e) => set(q.id, e.target.value)} />
              )}
            </fieldset>
          ))}
          <button onClick={() => submit()} disabled={busy} className="w-full py-3.5 rounded-xl bg-indigo-600 text-white font-bold flex items-center justify-center gap-2 disabled:opacity-50">
            <Send size={16} /> {t("Hand in")}
          </button>
        </div>
      )}
    </Modal>
  );
}

function Review({ quiz, onClose }: { quiz: Row; onClose: () => void }) {
  const t = useT();
  const [data, setData] = useState<Row | null>(null);
  useEffect(() => {
    supabase.rpc("quiz_review", { p_quiz: quiz.id }).then(({ data, error }) => (error ? toast(errorMessage(error), "error") : setData(data as Row)));
  }, [quiz.id]);
  const show = (q: Row, v: unknown) =>
    v === null || v === undefined ? "—"
      : q.kind === "single" ? (q.options as string[])[v as number]
      : q.kind === "multi" ? (v as number[]).map((k) => (q.options as string[])[k]).join(", ")
      : q.kind === "truefalse" ? t(v ? "True" : "False")
      : q.kind === "short" ? (Array.isArray(v) ? v.join(" / ") : String(v))
      : q.kind === "number" && typeof v === "object" ? `${(v as Row).value} ± ${(v as Row).tol ?? 0}` : String(v);
  return (
    <Modal title={`${t("Review")} — ${quiz.title}`} icon={Eye} onClose={onClose} wide>
      {!data ? <Loading /> : (
        <div className="space-y-4">
          <p className="text-2xl font-black text-indigo-700">{Number(data.score)} / {Number(data.max_score)}</p>
          {!data.questions ? (
            <p className="text-sm text-slate-500">{t("The correct answers are shown after the quiz closes ({at}).", { at: fmtDateTime(data.answers_shown_from) })}</p>
          ) : (data.questions as Row[]).map((q, i) => (
            <div key={q.id} className="p-4 rounded-2xl border border-slate-100 space-y-1">
              <p className="font-bold text-slate-800 flex items-center gap-2">
                {Number(q.earned) >= Number(q.points) ? <CheckCircle2 size={16} className="text-emerald-600" /> : <XCircle size={16} className="text-red-600" />}
                {i + 1}. {q.prompt}
              </p>
              <p className="text-sm text-slate-600">{t("Your answer")}: {show(q, q.given)}</p>
              <p className="text-sm text-emerald-700">{t("Correct answer")}: {show(q, q.answer)}</p>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

// Online quizzes: teachers write and publish, students take them once; the server marks them.
export default function Quizzes() {
  const { role, profile } = useSession();
  const t = useT();
  const staff = isStaff(role);
  const [quizzes, setQuizzes] = useState<Row[]>([]);
  const [classes, setClasses] = useState<Row[]>([]);
  const [attempts, setAttempts] = useState<Row[]>([]);
  const [questions, setQuestions] = useState<Row[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"list" | "results">("list");
  const [openQuiz, setOpenQuiz] = useState<Row | null>(null);
  const [creating, setCreating] = useState(false);
  const [nq, setNq] = useState({ class_id: "", title: "", instructions: "", opens_at: toLocalInput(new Date()), closes_at: "", time_limit_min: "" });
  const [qf, setQf] = useState(emptyQ);
  const [taking, setTaking] = useState<Row | null>(null);
  const [reviewing, setReviewing] = useState<Row | null>(null);
  const [analysis, setAnalysis] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  // "Now" for open/closed labels, refreshed every half minute.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const load = useCallback(async () => {
    const [q, c, a, p] = await Promise.all([
      supabase.from("quizzes").select("*").order("created_at", { ascending: false }),
      supabase.from("classes").select("id, name, teacher_id").order("name"),
      supabase.from("quiz_attempts").select("id, quiz_id, student_id, started_at, submitted_at, score, max_score"),
      staff ? supabase.from("profiles").select("id, full_name") : Promise.resolve({ data: [] as Row[] }),
    ]);
    return { q: q.data ?? [], c: c.data ?? [], a: a.data ?? [], p: p.data ?? [] };
  }, [staff]);
  const apply = (x: Awaited<ReturnType<typeof load>>) => {
    setQuizzes(x.q); setClasses(x.c); setAttempts(x.a);
    setNames(Object.fromEntries(x.p.map((r) => [r.id, r.full_name])));
    setLoading(false);
  };
  useEffect(() => {
    let off = false;
    load().then((x) => !off && apply(x));
    return () => { off = true; };
  }, [load]); // eslint-disable-line react-hooks/exhaustive-deps
  const reload = async () => apply(await load());

  const loadQuestions = useCallback(async (quizId: string) => {
    const [qq, ia] = await Promise.all([
      supabase.from("quiz_questions").select("*").eq("quiz_id", quizId).order("position"),
      supabase.rpc("quiz_item_analysis", { p_quiz: quizId }),
    ]);
    setQuestions(qq.data ?? []);
    setAnalysis((ia.data ?? []) as Row[]);
  }, []);
  useEffect(() => {
    if (openQuiz && staff) void loadQuestions(openQuiz.id); // eslint-disable-line react-hooks/set-state-in-effect
  }, [openQuiz, staff, loadQuestions]);

  const myClasses = useMemo(() => classes.filter((c) => isAdmin(role) || c.teacher_id === profile?.id), [classes, role, profile]);
  const className = (id: string) => classes.find((c) => c.id === id)?.name ?? "—";

  if (role === "parent" || role === "alumni") return <AccessDenied message="Quizzes are for teachers and students." />;

  const createQuiz = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { data, error } = await supabase.from("quizzes").insert({
      class_id: nq.class_id, title: nq.title.trim(), instructions: nq.instructions.trim() || null,
      opens_at: new Date(nq.opens_at).toISOString(), closes_at: nq.closes_at ? new Date(nq.closes_at).toISOString() : null,
      time_limit_min: nq.time_limit_min ? Number(nq.time_limit_min) : null,
    }).select().single();
    setBusy(false);
    if (error) return toast(errorMessage(error), "error");
    toast(t("Quiz created. Add its questions."));
    setCreating(false);
    await reload();
    setOpenQuiz(data);
  };
  const addQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!openQuiz) return;
    const options = qf.options.split("\n").map((s) => s.trim()).filter(Boolean);
    const answer =
      qf.kind === "single" ? qf.correct[0] ?? -1
      : qf.kind === "multi" ? qf.correct
      : qf.kind === "truefalse" ? qf.tf === "true"
      : qf.kind === "short" ? qf.accepted.split(/[\n,]/).map((s) => s.trim()).filter(Boolean)
      : { value: Number(qf.value.replace(",", ".")), tol: Number(qf.tol.replace(",", ".")) || 0 };
    setBusy(true);
    const { error } = await supabase.from("quiz_questions").insert({
      quiz_id: openQuiz.id, kind: qf.kind, prompt: qf.prompt.trim(), options: qf.kind === "single" || qf.kind === "multi" ? options : [],
      answer, points: Number(qf.points) || 1, position: questions.length + 1,
    });
    setBusy(false);
    if (error) return toast(errorMessage(error), "error");
    toast(t("Question added."));
    setQf({ ...emptyQ, kind: qf.kind });
    void loadQuestions(openQuiz.id);
  };
  const removeQuestion = async (id: string) => {
    const { error } = await supabase.from("quiz_questions").delete().eq("id", id);
    if (error) return toast(errorMessage(error), "error");
    if (openQuiz) void loadQuestions(openQuiz.id);
  };
  const publish = async () => {
    if (!openQuiz) return;
    const { error } = await supabase.rpc("publish_quiz", { p_quiz: openQuiz.id });
    if (error) return toast(errorMessage(error), "error");
    toast(t("Quiz published. The class has been told."));
    setOpenQuiz({ ...openQuiz, published: true });
    void reload();
  };

  const status = (q: Row) =>
    !q.published ? "draft" : new Date(q.opens_at).getTime() > now ? "upcoming" : q.closes_at && new Date(q.closes_at).getTime() < now ? "closed" : "open";
  const STATUS_COLOR: Record<string, string> = { draft: "slate", upcoming: "blue", open: "green", closed: "orange" };
  const myAttempt = (quizId: string) => attempts.find((a) => a.quiz_id === quizId && a.student_id === profile?.id);
  const optionLines = qf.options.split("\n").map((s) => s.trim()).filter(Boolean);

  return (
    <ModuleShell
      title="Quizzes"
      icon={ListChecks}
      tabs={staff ? [{ id: "list" as const, label: "Quizzes", icon: ListChecks }] : [{ id: "list" as const, label: "My quizzes", icon: ListChecks }]}
      activeTab={tab}
      onTab={setTab}
      action={staff && <ActionButton icon={Plus} onClick={() => { setNq({ ...nq, class_id: myClasses[0]?.id ?? "" }); setCreating(true); }}>New quiz</ActionButton>}
    >
      {creating && (
        <Modal title="New quiz" icon={ListChecks} onClose={() => setCreating(false)}>
          <form onSubmit={createQuiz} className="space-y-4">
            <Field label="Class">
              <select required className={inputClass} value={nq.class_id} onChange={(e) => setNq({ ...nq, class_id: e.target.value })}>
                {myClasses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            <Field label="Title"><input required className={inputClass} value={nq.title} onChange={(e) => setNq({ ...nq, title: e.target.value })} /></Field>
            <Field label="Instructions"><textarea rows={2} className={inputClass} value={nq.instructions} onChange={(e) => setNq({ ...nq, instructions: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Opens"><input type="datetime-local" required className={inputClass} value={nq.opens_at} onChange={(e) => setNq({ ...nq, opens_at: e.target.value })} /></Field>
              <Field label="Closes (optional)"><input type="datetime-local" className={inputClass} value={nq.closes_at} onChange={(e) => setNq({ ...nq, closes_at: e.target.value })} /></Field>
            </div>
            <Field label="Time limit in minutes (optional)"><input type="number" min={1} max={300} className={inputClass} value={nq.time_limit_min} onChange={(e) => setNq({ ...nq, time_limit_min: e.target.value })} /></Field>
            <SubmitButton busy={busy}>Create quiz</SubmitButton>
          </form>
        </Modal>
      )}
      {taking && <TakeQuiz quiz={taking} onDone={() => { setTaking(null); void reload(); }} />}
      {reviewing && <Review quiz={reviewing} onClose={() => setReviewing(null)} />}

      {openQuiz && staff && (
        <Modal title={openQuiz.title} icon={ListChecks} onClose={() => { setOpenQuiz(null); void reload(); }} wide>
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-3">
              <Badge color={STATUS_COLOR[status(openQuiz)]}>{t(status(openQuiz))}</Badge>
              <span className="text-sm text-slate-500">{className(openQuiz.class_id)} · {t("{n} questions", { n: questions.length })} · {t("{p} points", { p: questions.reduce((s, q) => s + Number(q.points), 0) })}</span>
              {!openQuiz.published && <button onClick={publish} disabled={!questions.length} className="ml-auto px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-bold disabled:opacity-40">{t("Publish")}</button>}
            </div>
            <div className="space-y-2">
              {questions.map((q, i) => {
                const a = analysis.find((x) => x.question_id === q.id);
                return (
                  <div key={q.id} className="p-3 rounded-xl border border-slate-100 flex items-start gap-3 text-sm">
                    <span className="font-black text-slate-400">{i + 1}.</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-slate-800">{q.prompt}</p>
                      <p className="text-xs text-slate-500">{t(KINDS.find((k) => k.id === q.kind)?.label ?? q.kind)} · {t("{p} pt", { p: Number(q.points) })}</p>
                    </div>
                    {a && a.attempts > 0 && <span className="text-xs font-bold text-slate-600 flex items-center gap-1" title={t("Share of students who got it right")}><BarChart3 size={12} /> {Math.round((a.correct / a.attempts) * 100)}%</span>}
                    {!attempts.some((x) => x.quiz_id === openQuiz.id) && <button onClick={() => removeQuestion(q.id)} aria-label={t("Remove")} className="text-slate-400 hover:text-red-600"><Trash2 size={14} /></button>}
                  </div>
                );
              })}
            </div>
            {!attempts.some((x) => x.quiz_id === openQuiz.id) && (
              <form onSubmit={addQuestion} className="p-4 rounded-2xl bg-slate-50 space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <Field label="Type">
                    <select className={inputClass} value={qf.kind} onChange={(e) => setQf({ ...emptyQ, kind: e.target.value as Kind })}>
                      {KINDS.map((k) => <option key={k.id} value={k.id}>{t(k.label)}</option>)}
                    </select>
                  </Field>
                  <div className="md:col-span-2"><Field label="Question"><input required className={inputClass} value={qf.prompt} onChange={(e) => setQf({ ...qf, prompt: e.target.value })} /></Field></div>
                </div>
                {(qf.kind === "single" || qf.kind === "multi") && (
                  <>
                    <Field label="Choices (one per line)"><textarea rows={3} className={inputClass} value={qf.options} onChange={(e) => setQf({ ...qf, options: e.target.value, correct: [] })} /></Field>
                    {optionLines.length > 0 && (
                      <Field label="Correct" group>
                        <div className="flex flex-wrap gap-3">
                          {optionLines.map((o, k) => (
                            <label key={k} className="flex items-center gap-1 text-sm">
                              <input type={qf.kind === "single" ? "radio" : "checkbox"} name="correct" checked={qf.correct.includes(k)}
                                onChange={(e) => setQf({ ...qf, correct: qf.kind === "single" ? [k] : e.target.checked ? [...qf.correct, k] : qf.correct.filter((x) => x !== k) })} /> {o}
                            </label>
                          ))}
                        </div>
                      </Field>
                    )}
                  </>
                )}
                {qf.kind === "truefalse" && (
                  <Field label="Correct">
                    <select className={inputClass} value={qf.tf} onChange={(e) => setQf({ ...qf, tf: e.target.value })}><option value="true">{t("True")}</option><option value="false">{t("False")}</option></select>
                  </Field>
                )}
                {qf.kind === "short" && <Field label="Accepted answers (comma or one per line)"><input required className={inputClass} value={qf.accepted} onChange={(e) => setQf({ ...qf, accepted: e.target.value })} /></Field>}
                {qf.kind === "number" && (
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Correct number"><input required inputMode="decimal" className={inputClass} value={qf.value} onChange={(e) => setQf({ ...qf, value: e.target.value })} /></Field>
                    <Field label="Allowed difference"><input inputMode="decimal" className={inputClass} value={qf.tol} onChange={(e) => setQf({ ...qf, tol: e.target.value })} /></Field>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3 items-end">
                  <Field label="Points"><input type="number" min={0.5} step={0.5} className={inputClass} value={qf.points} onChange={(e) => setQf({ ...qf, points: e.target.value })} /></Field>
                  <SubmitButton busy={busy}><Plus size={16} /> Add question</SubmitButton>
                </div>
              </form>
            )}
            {attempts.some((x) => x.quiz_id === openQuiz.id) && (
              <Table headers={["Student", "Handed in", "Score"]}>
                {attempts.filter((x) => x.quiz_id === openQuiz.id).map((x) => (
                  <tr key={x.id}>
                    <td className="px-6 py-3 font-bold text-slate-800">{names[x.student_id] ?? "—"}</td>
                    <td className="px-6 py-3 text-sm text-slate-500">{x.submitted_at ? fmtDateTime(x.submitted_at) : t("in progress")}</td>
                    <td className="px-6 py-3 font-bold">{x.score === null ? "—" : `${Number(x.score)} / ${Number(x.max_score)}`}</td>
                  </tr>
                ))}
              </Table>
            )}
          </div>
        </Modal>
      )}

      {loading ? <Loading /> : quizzes.length === 0 ? (
        <Empty>{staff ? "No quizzes yet. Click “New quiz” to write one." : "No quizzes for your classes yet."}</Empty>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {quizzes.map((q) => {
            const st = status(q);
            const mine = myAttempt(q.id);
            return (
              <Card key={q.id}>
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-black text-slate-800">{q.title}</p>
                    <p className="text-xs text-slate-500">{className(q.class_id)}{q.time_limit_min ? ` · ${t("{n} min", { n: q.time_limit_min })}` : ""}{q.closes_at ? ` · ${t("closes")} ${fmtDateTime(q.closes_at)}` : ""}</p>
                  </div>
                  <Badge color={STATUS_COLOR[st]}>{t(st)}</Badge>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {staff ? (
                    <button onClick={() => setOpenQuiz(q)} className="px-4 py-2 rounded-xl bg-indigo-50 text-indigo-700 text-sm font-bold">{t(q.published ? "Results" : "Edit")}</button>
                  ) : mine?.submitted_at ? (
                    <>
                      <span className="text-sm font-bold text-emerald-700 flex items-center gap-1"><CheckCircle2 size={14} /> {Number(mine.score)} / {Number(mine.max_score)}</span>
                      <button onClick={() => setReviewing(q)} className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-sm font-bold flex items-center gap-1"><Eye size={14} /> {t("Review")}</button>
                    </>
                  ) : st === "open" ? (
                    <button onClick={() => setTaking(q)} className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-bold flex items-center gap-1"><PlayCircle size={14} /> {t(mine ? "Continue" : "Start")}</button>
                  ) : null}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </ModuleShell>
  );
}
