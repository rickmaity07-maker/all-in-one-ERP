"use client";

import { useEffect, useState } from "react";
import { Library, Plus, BookOpen, BookMarked, Trash2, Undo2, AlertTriangle, FileText, BookPlus } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useSession, isStaff } from "@/lib/session";
import { useTable } from "@/lib/useTable";
import { ModuleShell, Modal, Field, SubmitButton, ActionButton, PageHeading, Card, Table, Loading, Badge, StatCard, IconButton, inputClass, toast, confirmAction } from "@/components/ui";
import { errorMessage, fmtDate, matches, openStoredFile, removeStoredFile, uploadFile, localDate, type Row } from "@/lib/utils";

type TabId = "catalog" | "loans";
const BUCKET = "library-files";
const LOAN_DAYS = 21;
const addDays = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return localDate(d);
};

export default function DigitalLibrary() {
  const { role, profile } = useSession();
  const staff = isStaff(role);
  const [activeTab, setActiveTab] = useState<TabId>("catalog");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const books = useTable("library_books", { orderBy: "title", ascending: true });
  const loans = useTable("library_loans", { orderBy: "due_date", ascending: true });
  const [people, setPeople] = useState<Row[]>([]);

  const [modal, setModal] = useState<"" | "book" | "issue">("");
  const [busy, setBusy] = useState(false);
  const [bookForm, setBookForm] = useState({ title: "", author: "", isbn: "", category: "Engineering", copies_total: "1" });
  const [bookFile, setBookFile] = useState<File | null>(null);
  const [issue, setIssue] = useState({ book_id: "", borrower_id: "", due_date: addDays(LOAN_DAYS) });

  useEffect(() => {
    if (staff) supabase.from("profiles").select("id, full_name").order("full_name").then(({ data }) => setPeople(data ?? []));
  }, [staff]);

  const today = localDate();
  const titleOf = (id: string) => books.rows.find((b) => b.id === id)?.title ?? "Removed title";
  const active = loans.rows.filter((l) => !l.returned_at);
  const overdue = active.filter((l) => l.due_date < today);
  const myActive = active.filter((l) => l.borrower_id === profile?.id);

  const refreshAfterLoan = async () => {
    await Promise.all([books.reload(), loans.reload()]);
  };

  const borrow = async (book: Row) => {
    if (myActive.some((l) => l.book_id === book.id)) return toast("You already have this title on loan.", "error");
    const row = await loans.insert({ book_id: book.id, borrower_id: profile?.id, borrower_name: profile?.full_name, due_date: addDays(LOAN_DAYS) }, `Borrowed — due ${fmtDate(addDays(LOAN_DAYS))}.`);
    if (row) refreshAfterLoan();
  };

  const markReturned = async (loan: Row) => {
    if (await loans.update(loan.id, { returned_at: new Date().toISOString() }, "Returned.")) refreshAfterLoan();
  };

  const submitBook = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const file_path = bookFile ? await uploadFile(BUCKET, bookFile) : null;
      const copies = Math.max(0, parseInt(bookForm.copies_total) || 0);
      const row = await books.insert({ ...bookForm, copies_total: copies, copies_available: copies, file_path }, "Title added to the catalog.");
      if (row) {
        setBookForm({ title: "", author: "", isbn: "", category: "Engineering", copies_total: "1" });
        setBookFile(null);
        setModal("");
      }
    } catch (err) {
      toast(errorMessage(err), "error");
    }
    setBusy(false);
  };

  const submitIssue = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const person = people.find((p) => p.id === issue.borrower_id);
    const row = await loans.insert({ ...issue, borrower_name: person?.full_name }, "Loan recorded.");
    setBusy(false);
    if (row) {
      setModal("");
      refreshAfterLoan();
    }
  };

  const deleteBook = async (b: Row) => {
    if (!confirmAction(`Remove "${b.title}" from the catalog?`)) return;
    await removeStoredFile(BUCKET, b.file_path);
    await books.remove(b.id, "Title removed.");
  };

  const categories = ["All", ...Array.from(new Set(books.rows.map((b) => b.category).filter(Boolean)))];
  const visibleBooks = books.rows
    .filter((b) => category === "All" || b.category === category)
    .filter((b) => matches(search, b.title, b.author, b.isbn, b.category));
  const loanRows = (staff ? active : myActive).filter((l) => matches(search, titleOf(l.book_id), l.borrower_name));

  return (
    <ModuleShell
      title="Library"
      icon={Library}
      tabs={[
        { id: "catalog", label: "Catalog & E-Books", icon: BookOpen, group: "Digital Library" },
        { id: "loans", label: staff ? `Active Loans (${active.length})` : `My Loans (${myActive.length})`, icon: BookMarked, group: "Digital Library" },
      ]}
      activeTab={activeTab}
      onTab={setActiveTab}
      search={search}
      onSearch={setSearch}
      searchPlaceholder="Search title, author, ISBN..."
      action={
        staff && (
          <div className="flex gap-2">
            <button onClick={() => { setIssue({ book_id: "", borrower_id: "", due_date: addDays(LOAN_DAYS) }); setModal("issue"); }} className="flex items-center gap-2 bg-white text-slate-700 border border-slate-200 px-5 py-3.5 rounded-2xl text-sm font-bold hover:bg-slate-50">
              <BookPlus size={18} /> Issue Loan
            </button>
            <ActionButton icon={Plus} onClick={() => setModal("book")}>Add Title</ActionButton>
          </div>
        )
      }
    >
      {modal === "book" && (
        <Modal title="Add Title" icon={BookOpen} onClose={() => setModal("")}>
          <form onSubmit={submitBook} className="space-y-4">
            <Field label="Title"><input required className={inputClass} value={bookForm.title} onChange={(e) => setBookForm({ ...bookForm, title: e.target.value })} /></Field>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Author"><input className={inputClass} value={bookForm.author} onChange={(e) => setBookForm({ ...bookForm, author: e.target.value })} /></Field>
              <Field label="ISBN"><input className={inputClass} value={bookForm.isbn} onChange={(e) => setBookForm({ ...bookForm, isbn: e.target.value })} /></Field>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Category"><input className={inputClass} value={bookForm.category} onChange={(e) => setBookForm({ ...bookForm, category: e.target.value })} /></Field>
              <Field label="Physical Copies"><input type="number" min="0" className={inputClass} value={bookForm.copies_total} onChange={(e) => setBookForm({ ...bookForm, copies_total: e.target.value })} /></Field>
            </div>
            <Field label="E-Book File (optional, PDF/EPUB)"><input type="file" accept=".pdf,.epub" className={inputClass} onChange={(e) => setBookFile(e.target.files?.[0] ?? null)} /></Field>
            <SubmitButton busy={busy}>Add to Catalog</SubmitButton>
          </form>
        </Modal>
      )}

      {modal === "issue" && (
        <Modal title="Issue Loan" icon={BookPlus} onClose={() => setModal("")}>
          <form onSubmit={submitIssue} className="space-y-4">
            <Field label="Title">
              <select required className={inputClass} value={issue.book_id} onChange={(e) => setIssue({ ...issue, book_id: e.target.value })}>
                <option value="">Select a title…</option>
                {books.rows.map((b) => <option key={b.id} value={b.id} disabled={b.copies_available < 1}>{b.title} ({b.copies_available} available)</option>)}
              </select>
            </Field>
            <Field label="Borrower">
              <select required className={inputClass} value={issue.borrower_id} onChange={(e) => setIssue({ ...issue, borrower_id: e.target.value })}>
                <option value="">Select a person…</option>
                {people.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
              </select>
            </Field>
            <Field label="Due Date"><input type="date" required className={inputClass} value={issue.due_date} onChange={(e) => setIssue({ ...issue, due_date: e.target.value })} /></Field>
            <SubmitButton busy={busy}>Record Loan</SubmitButton>
          </form>
        </Modal>
      )}

      {books.loading ? (
        <Loading />
      ) : activeTab === "catalog" ? (
        <>
          <PageHeading title="Digital Library" subtitle={`Borrow physical copies for ${LOAN_DAYS} days or read e-books instantly.`}>
            <select value={category} onChange={(e) => setCategory(e.target.value)} className="text-sm font-semibold bg-white border border-slate-200 rounded-xl px-3 py-2 outline-none">
              {categories.map((c) => <option key={c}>{c}</option>)}
            </select>
          </PageHeading>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <StatCard label="Titles" value={books.rows.length} icon={BookOpen} color="indigo" />
            <StatCard label="On Loan" value={active.length} icon={BookMarked} color="blue" />
            <StatCard label={staff ? "Overdue" : "My Overdue"} value={staff ? overdue.length : myActive.filter((l) => l.due_date < today).length} icon={AlertTriangle} color="red" />
          </div>
          <Card>
            <Table headers={["Title", "Category", "Availability", "Actions"]} empty={visibleBooks.length === 0 && "No titles found."}>
              {visibleBooks.map((b) => (
                <tr key={b.id} className="hover:bg-indigo-50/30">
                  <td className="px-6 py-4">
                    <div className="font-bold text-slate-800">{b.title}</div>
                    <div className="text-xs text-slate-500">{b.author || "Unknown author"}{b.isbn ? ` • ISBN ${b.isbn}` : ""}</div>
                  </td>
                  <td className="px-6 py-4"><Badge color="purple">{b.category || "General"}</Badge></td>
                  <td className="px-6 py-4">
                    {b.copies_total > 0 ? <Badge color={b.copies_available > 0 ? "green" : "orange"}>{b.copies_available}/{b.copies_total} copies</Badge> : <span className="text-xs text-slate-400">Digital only</span>}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end items-center gap-2">
                      {b.file_path && (
                        <button onClick={() => openStoredFile(BUCKET, b.file_path).catch((e) => toast(errorMessage(e), "error"))} className="text-xs font-bold text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-lg flex items-center gap-1"><FileText size={12} /> Read</button>
                      )}
                      {b.copies_total > 0 && (
                        <button disabled={b.copies_available < 1} onClick={() => borrow(b)} className="text-xs font-bold text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-lg disabled:opacity-40">Borrow</button>
                      )}
                      {staff && <IconButton icon={Trash2} title="Remove" danger onClick={() => deleteBook(b)} />}
                    </div>
                  </td>
                </tr>
              ))}
            </Table>
          </Card>
        </>
      ) : (
        <>
          <PageHeading title={staff ? "Active Loans" : "My Loans"} subtitle={staff ? "Check items back in when they are returned to the desk." : "Return items to the library desk before the due date."} />
          <Card>
            {loans.loading ? (
              <Loading />
            ) : (
              <Table headers={staff ? ["Title", "Borrower", "Borrowed", "Due", "Actions"] : ["Title", "Borrowed", "Due", "Status"]} empty={loanRows.length === 0 && "No active loans."}>
                {loanRows.map((l) => {
                  const late = l.due_date < today;
                  return (
                    <tr key={l.id}>
                      <td className="px-6 py-4 font-bold text-slate-800">{titleOf(l.book_id)}</td>
                      {staff && <td className="px-6 py-4 text-slate-600">{l.borrower_name}</td>}
                      <td className="px-6 py-4 text-slate-500">{fmtDate(l.created_at)}</td>
                      <td className={`px-6 py-4 font-semibold ${late ? "text-red-600" : "text-slate-600"}`}>{fmtDate(l.due_date)}</td>
                      <td className="px-6 py-4 text-right">
                        {staff ? (
                          <button onClick={() => markReturned(l)} className="text-xs font-bold text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-lg inline-flex items-center gap-1"><Undo2 size={12} /> Check In</button>
                        ) : (
                          <Badge color={late ? "red" : "green"}>{late ? "Overdue" : "On Loan"}</Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </Table>
            )}
          </Card>
        </>
      )}
    </ModuleShell>
  );
}
