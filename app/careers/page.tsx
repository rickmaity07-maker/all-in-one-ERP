"use client";

import { useState } from "react";
import { Briefcase, Plus, MapPin, CalendarClock, ExternalLink, Trash2, Send, FolderGit2, CheckCircle2 } from "lucide-react";
import { useSession, isStaff } from "@/lib/session";
import { useTable } from "@/lib/useTable";
import { ModuleShell, Modal, Field, SubmitButton, ActionButton, PageHeading, Card, Table, Loading, Empty, Badge, IconButton, inputClass, toast, confirmAction } from "@/components/ui";
import { fmtDate, initials, matches, openExternal, localDate } from "@/lib/utils";

type TabId = "jobs" | "applications" | "portfolio";
const APP_STATUSES = ["Submitted", "Shortlisted", "Interview", "Offer", "Rejected"];
const APP_COLORS: Record<string, string> = { Submitted: "slate", Shortlisted: "blue", Interview: "orange", Offer: "green", Rejected: "red" };

const safeUrl = (u: string) => (/^https?:\/\//i.test(u) ? u : `https://${u}`);

export default function Careers() {
  const { role, profile } = useSession();
  const staff = isStaff(role);
  const [activeTab, setActiveTab] = useState<TabId>("jobs");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("All");
  const postings = useTable("career_postings");
  const applications = useTable("career_applications");
  const portfolio = useTable("portfolio_items");

  const [modal, setModal] = useState<"" | "posting" | "project">("");
  const [busy, setBusy] = useState(false);
  const [post, setPost] = useState({ title: "", company: "", posting_type: "Internship", location: "", deadline: "", link: "", description: "" });
  const [proj, setProj] = useState({ title: "", description: "", url: "" });

  const today = localDate();
  const postingOf = (id: string) => postings.rows.find((p) => p.id === id);
  const myApp = (postingId: string) => applications.rows.find((a) => a.posting_id === postingId && a.applicant_id === profile?.id);

  const apply = async (postingId: string) => {
    if (myApp(postingId)) return toast("You already applied for this role.", "error");
    await applications.insert({ posting_id: postingId, applicant_id: profile?.id, applicant_name: profile?.full_name, status: "Submitted" }, "Application sent.");
  };

  const submitPosting = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const row = await postings.insert({ ...post, deadline: post.deadline || null, link: post.link ? safeUrl(post.link) : null }, "Opportunity posted.");
    setBusy(false);
    if (row) {
      setPost({ title: "", company: "", posting_type: "Internship", location: "", deadline: "", link: "", description: "" });
      setModal("");
    }
  };

  const submitProject = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const row = await portfolio.insert({ ...proj, url: proj.url ? safeUrl(proj.url) : null, owner_id: profile?.id, owner_name: profile?.full_name }, "Project added to your portfolio.");
    setBusy(false);
    if (row) {
      setProj({ title: "", description: "", url: "" });
      setModal("");
    }
  };

  const jobs = postings.rows
    .filter((p) => typeFilter === "All" || p.posting_type === typeFilter)
    .filter((p) => matches(search, p.title, p.company, p.location, p.description));
  const apps = (staff ? applications.rows : applications.rows.filter((a) => a.applicant_id === profile?.id)).filter((a) =>
    matches(search, a.applicant_name, postingOf(a.posting_id)?.title, postingOf(a.posting_id)?.company)
  );
  const projects = portfolio.rows.filter((p) => matches(search, p.title, p.description, p.owner_name));

  return (
    <ModuleShell
      title="Careers"
      icon={Briefcase}
      tabs={[
        { id: "jobs", label: "Job & Internship Board", group: "Career Center" },
        { id: "applications", label: staff ? "All Applications" : "My Applications", group: "Career Center" },
        { id: "portfolio", label: "Portfolio Showcase", group: "Portfolio" },
      ]}
      activeTab={activeTab}
      onTab={setActiveTab}
      search={search}
      onSearch={setSearch}
      searchPlaceholder="Search roles, companies, projects..."
      action={
        activeTab === "portfolio" ? (
          <ActionButton icon={Plus} onClick={() => setModal("project")}>Add Project</ActionButton>
        ) : (
          staff && <ActionButton icon={Plus} onClick={() => setModal("posting")}>Post Opportunity</ActionButton>
        )
      }
    >
      {modal === "posting" && (
        <Modal title="Post Opportunity" icon={Briefcase} onClose={() => setModal("")} wide>
          <form onSubmit={submitPosting} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Role Title"><input required className={inputClass} value={post.title} onChange={(e) => setPost({ ...post, title: e.target.value })} /></Field>
              <Field label="Company"><input required className={inputClass} value={post.company} onChange={(e) => setPost({ ...post, company: e.target.value })} /></Field>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Field label="Type">
                <select className={inputClass} value={post.posting_type} onChange={(e) => setPost({ ...post, posting_type: e.target.value })}>
                  {["Internship", "Working Student", "Full-time", "Thesis"].map((t) => <option key={t}>{t}</option>)}
                </select>
              </Field>
              <Field label="Location"><input className={inputClass} value={post.location} onChange={(e) => setPost({ ...post, location: e.target.value })} /></Field>
              <Field label="Deadline"><input type="date" className={inputClass} value={post.deadline} onChange={(e) => setPost({ ...post, deadline: e.target.value })} /></Field>
            </div>
            <Field label="External Link (optional)"><input className={inputClass} value={post.link} onChange={(e) => setPost({ ...post, link: e.target.value })} placeholder="https://company.com/careers/..." /></Field>
            <Field label="Description"><textarea rows={4} className={inputClass} value={post.description} onChange={(e) => setPost({ ...post, description: e.target.value })} /></Field>
            <SubmitButton busy={busy}>Publish</SubmitButton>
          </form>
        </Modal>
      )}

      {modal === "project" && (
        <Modal title="Add Portfolio Project" icon={FolderGit2} onClose={() => setModal("")}>
          <form onSubmit={submitProject} className="space-y-4">
            <Field label="Project Title"><input required className={inputClass} value={proj.title} onChange={(e) => setProj({ ...proj, title: e.target.value })} /></Field>
            <Field label="Description"><textarea rows={4} className={inputClass} value={proj.description} onChange={(e) => setProj({ ...proj, description: e.target.value })} /></Field>
            <Field label="Link (GitHub, video, website)"><input className={inputClass} value={proj.url} onChange={(e) => setProj({ ...proj, url: e.target.value })} /></Field>
            <SubmitButton busy={busy}>Add Project</SubmitButton>
          </form>
        </Modal>
      )}

      {postings.loading ? (
        <Loading />
      ) : activeTab === "jobs" ? (
        <>
          <PageHeading title="Career & Portfolio" subtitle="Internships, working-student roles and graduate jobs from partner companies.">
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="text-sm font-semibold bg-white border border-slate-200 rounded-xl px-3 py-2 outline-none">
              {["All", "Internship", "Working Student", "Full-time", "Thesis"].map((t) => <option key={t}>{t}</option>)}
            </select>
          </PageHeading>
          {jobs.length === 0 ? (
            <Empty>No opportunities posted yet.</Empty>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {jobs.map((p) => {
                const mine = myApp(p.id);
                const closed = p.deadline && p.deadline < today;
                const count = applications.rows.filter((a) => a.posting_id === p.id).length;
                return (
                  <div key={p.id} className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm flex flex-col">
                    <div className="flex justify-between items-start mb-3 gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-12 h-12 rounded-2xl bg-slate-900 text-white flex items-center justify-center font-black shrink-0">{initials(p.company)}</div>
                        <div className="min-w-0">
                          <h4 className="font-black text-slate-800 truncate">{p.title}</h4>
                          <p className="text-sm text-slate-500 font-semibold">{p.company}</p>
                        </div>
                      </div>
                      <Badge color="blue">{p.posting_type}</Badge>
                    </div>
                    <div className="flex gap-4 text-xs text-slate-500 font-medium mb-3">
                      {p.location && <span className="flex items-center gap-1"><MapPin size={12} /> {p.location}</span>}
                      {p.deadline && <span className={`flex items-center gap-1 ${closed ? "text-red-500" : ""}`}><CalendarClock size={12} /> {closed ? "Closed" : `Apply by ${fmtDate(p.deadline)}`}</span>}
                    </div>
                    {p.description && <p className="text-sm text-slate-600 mb-4 line-clamp-3 whitespace-pre-wrap">{p.description}</p>}
                    <div className="mt-auto flex items-center gap-2">
                      {staff ? (
                        <span className="text-xs font-bold text-slate-500 flex-1">{count} applicant(s)</span>
                      ) : mine ? (
                        <span className="flex-1"><Badge color={APP_COLORS[mine.status]}><CheckCircle2 size={12} /> {mine.status}</Badge></span>
                      ) : (
                        <button disabled={!!closed} onClick={() => apply(p.id)} className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 disabled:opacity-40 flex items-center justify-center gap-2">
                          <Send size={14} /> Apply
                        </button>
                      )}
                      {p.link && <IconButton icon={ExternalLink} title="Open listing" onClick={() => openExternal(p.link)} />}
                      {staff && <IconButton icon={Trash2} title="Delete" danger onClick={() => confirmAction("Delete this posting and its applications?") && postings.remove(p.id, "Posting removed.")} />}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      ) : activeTab === "applications" ? (
        <>
          <PageHeading title={staff ? "Applications" : "My Applications"} subtitle={staff ? "Move candidates through the hiring stages." : "Track where each of your applications stands."} />
          <Card>
            <Table headers={staff ? ["Applicant", "Role", "Applied", "Stage", "Actions"] : ["Role", "Company", "Applied", "Stage", "Actions"]} empty={apps.length === 0 && "No applications yet."}>
              {apps.map((a) => {
                const p = postingOf(a.posting_id);
                return (
                  <tr key={a.id}>
                    <td className="px-6 py-4 font-bold text-slate-800">{staff ? a.applicant_name : p?.title}</td>
                    <td className="px-6 py-4 text-slate-600">{staff ? `${p?.title} @ ${p?.company}` : p?.company}</td>
                    <td className="px-6 py-4 text-slate-500">{fmtDate(a.created_at)}</td>
                    <td className="px-6 py-4">
                      {staff ? (
                        <select value={a.status} onChange={(e) => applications.update(a.id, { status: e.target.value }, "Stage updated.")} className="text-xs font-bold uppercase bg-slate-100 rounded-lg px-2 py-1 outline-none">
                          {APP_STATUSES.map((s) => <option key={s}>{s}</option>)}
                        </select>
                      ) : (
                        <Badge color={APP_COLORS[a.status]}>{a.status}</Badge>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <IconButton icon={Trash2} title={staff ? "Delete" : "Withdraw"} danger onClick={() => confirmAction(staff ? "Delete this application?" : "Withdraw your application?") && applications.remove(a.id, staff ? "Application deleted." : "Application withdrawn.")} />
                    </td>
                  </tr>
                );
              })}
            </Table>
          </Card>
        </>
      ) : (
        <>
          <PageHeading title="Portfolio Showcase" subtitle="Projects from students across campus. Add yours to show recruiters what you've built." />
          {portfolio.loading ? (
            <Loading />
          ) : projects.length === 0 ? (
            <Empty>No projects yet — be the first to add one.</Empty>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {projects.map((p) => (
                <div key={p.id} className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm flex flex-col">
                  <div className="w-12 h-12 rounded-2xl bg-linear-to-br from-[#2A0845] to-[#6441A5] text-white flex items-center justify-center mb-4"><FolderGit2 size={22} /></div>
                  <h4 className="font-black text-slate-800">{p.title}</h4>
                  <p className="text-xs text-slate-400 mb-3">by {p.owner_name} • {fmtDate(p.created_at)}</p>
                  <p className="text-sm text-slate-600 mb-4 whitespace-pre-wrap line-clamp-4">{p.description}</p>
                  <div className="mt-auto flex gap-2">
                    {p.url && (
                      <button onClick={() => openExternal(p.url)} className="flex-1 py-2 bg-slate-100 text-slate-700 rounded-xl text-sm font-bold hover:bg-slate-200 flex items-center justify-center gap-2">
                        <ExternalLink size={14} /> View
                      </button>
                    )}
                    {(p.owner_id === profile?.id || staff) && (
                      <IconButton icon={Trash2} title="Delete" danger onClick={() => confirmAction("Remove this project?") && portfolio.remove(p.id, "Project removed.")} />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </ModuleShell>
  );
}
