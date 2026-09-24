"use client";

import { useState } from "react";
import { Plus, Settings, Code, Wrench, Trash2, CheckSquare, CalendarClock, User, Pencil } from "lucide-react";
import { useSession, isStaff } from "@/lib/session";
import { useTable } from "@/lib/useTable";
import { ModuleShell, Modal, Field, SubmitButton, ActionButton, Card, Loading, Empty, AccessDenied, Badge, inputClass, confirmAction } from "@/components/ui";
import { fmtDate, matches, localDate, type Row } from "@/lib/utils";

// Older rows stored the category in `assignee` and the workflow type in `priority`; kept for compatibility.
const CATEGORIES = {
  mechatronics: { label: "Mechatronics", icon: Wrench, dot: "bg-blue-500", tile: "bg-blue-50 text-blue-500" },
  horology: { label: "Horological Design", icon: Settings, dot: "bg-orange-500", tile: "bg-orange-50 text-orange-500" },
  software: { label: "Software Dev", icon: Code, dot: "bg-pink-500", tile: "bg-pink-50 text-pink-500" },
  admin: { label: "Administration", icon: CheckSquare, dot: "bg-emerald-500", tile: "bg-emerald-50 text-emerald-500" },
} as const;
type Cat = keyof typeof CATEGORIES;
const NEXT_STATUS: Record<string, string> = { Pending: "In Progress", "In Progress": "Done", Done: "Pending" };

const emptyForm = { task_title: "", assignee: "mechatronics", priority: "", owner_name: "", due_date: "", notes: "" };

export default function TasksPortal() {
  const { role } = useSession();
  const [activeCategory, setActiveCategory] = useState<Cat | "all">("all");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("Open");
  const tasks = useTable("tasks", { enabled: isStaff(role) });

  const [editing, setEditing] = useState<Row | "new" | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);

  if (!isStaff(role)) return <AccessDenied message="Task Management is available to staff only." />;

  const openEditor = (t: Row | "new") => {
    setEditing(t);
    setForm(t === "new" ? emptyForm : { task_title: t.task_title, assignee: t.assignee ?? "mechatronics", priority: t.priority ?? "", owner_name: t.owner_name ?? "", due_date: t.due_date ?? "", notes: t.notes ?? "" });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const values = { ...form, due_date: form.due_date || null };
    const ok = editing === "new" ? await tasks.insert({ ...values, status: "Pending" }, "Task created.") : await tasks.update((editing as Row).id, values, "Task updated.");
    setBusy(false);
    if (ok) setEditing(null);
  };

  const today = localDate();
  const catOf = (t: Row): Cat => ((t.assignee as Cat) in CATEGORIES ? (t.assignee as Cat) : "mechatronics");
  const filtered = tasks.rows
    .filter((t) => activeCategory === "all" || catOf(t) === activeCategory)
    .filter((t) => statusFilter === "All" || (statusFilter === "Open" ? t.status !== "Done" : t.status === statusFilter))
    .filter((t) => matches(search, t.task_title, t.priority, t.owner_name, t.notes))
    .sort((a, b) => String(a.due_date ?? "9999").localeCompare(String(b.due_date ?? "9999")));

  return (
    <ModuleShell
      title="Workspace"
      icon={CheckSquare}
      tabs={[
        { id: "all" as const, label: "All Projects", group: "Categories" },
        ...(Object.keys(CATEGORIES) as Cat[]).map((k) => ({ id: k, label: CATEGORIES[k].label, group: "Categories" })),
      ]}
      activeTab={activeCategory}
      onTab={setActiveCategory}
      search={search}
      onSearch={setSearch}
      searchPlaceholder="Search tasks, owners, notes..."
      action={<ActionButton icon={Plus} onClick={() => openEditor("new")}>Create Task</ActionButton>}
    >
      {editing && (
        <Modal title={editing === "new" ? "Create Task" : "Edit Task"} icon={CheckSquare} onClose={() => setEditing(null)}>
          <form onSubmit={handleSave} className="space-y-4">
            <Field label="Task Title"><input required className={inputClass} value={form.task_title} onChange={(e) => setForm({ ...form, task_title: e.target.value })} /></Field>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Category">
                <select className={inputClass} value={form.assignee} onChange={(e) => setForm({ ...form, assignee: e.target.value })}>
                  {(Object.keys(CATEGORIES) as Cat[]).map((k) => <option key={k} value={k}>{CATEGORIES[k].label}</option>)}
                </select>
              </Field>
              <Field label="Workflow Type"><input className={inputClass} value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} placeholder="e.g. SolidWorks CAD" /></Field>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Owner"><input className={inputClass} value={form.owner_name} onChange={(e) => setForm({ ...form, owner_name: e.target.value })} /></Field>
              <Field label="Due Date"><input type="date" className={inputClass} value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} /></Field>
            </div>
            <Field label="Notes"><textarea rows={3} className={inputClass} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
            <SubmitButton busy={busy}>Save to Workspace</SubmitButton>
          </form>
        </Modal>
      )}

      <Card
        title={`Priority Workflow (${filtered.length})`}
        action={
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="text-sm font-semibold bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 outline-none">
            {["Open", "Pending", "In Progress", "Done", "All"].map((s) => <option key={s}>{s}</option>)}
          </select>
        }
      >
        {tasks.loading ? (
          <Loading label="Syncing tasks with cloud..." />
        ) : filtered.length === 0 ? (
          <Empty>No tasks here.</Empty>
        ) : (
          <div className="space-y-4">
            {filtered.map((task) => {
              const cat = CATEGORIES[catOf(task)];
              const Icon = cat.icon;
              const overdue = task.due_date && task.due_date < today && task.status !== "Done";
              return (
                <div key={task.id} className="flex items-center justify-between p-5 rounded-2xl border border-slate-100 hover:shadow-md transition-all bg-white group gap-4">
                  <div className="flex items-center gap-5 min-w-0">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${cat.tile}`}><Icon size={24} /></div>
                    <div className="min-w-0">
                      <h4 className={`font-bold text-base mb-1 ${task.status === "Done" ? "text-slate-400 line-through" : "text-slate-800"}`}>{task.task_title}</h4>
                      <p className="text-xs font-medium text-slate-500 flex items-center gap-3 flex-wrap">
                        <span className="flex items-center gap-1.5"><span className={`w-1.5 h-1.5 rounded-full ${cat.dot}`}></span> {task.priority || cat.label}</span>
                        {task.owner_name && <span className="flex items-center gap-1"><User size={12} /> {task.owner_name}</span>}
                        {task.due_date && <span className={`flex items-center gap-1 ${overdue ? "text-red-600 font-bold" : ""}`}><CalendarClock size={12} /> {fmtDate(task.due_date)}{overdue ? " (overdue)" : ""}</span>}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => tasks.update(task.id, { status: NEXT_STATUS[task.status] ?? "Pending" })} title="Click to advance status">
                      <Badge color={task.status === "Done" ? "green" : task.status === "In Progress" ? "orange" : "slate"}>{task.status}</Badge>
                    </button>
                    <button onClick={() => openEditor(task)} className="p-2 text-slate-300 hover:text-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity"><Pencil size={16} /></button>
                    <button onClick={() => confirmAction("Delete this task?") && tasks.remove(task.id, "Task deleted.")} className="p-2 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 size={16} /></button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </ModuleShell>
  );
}
