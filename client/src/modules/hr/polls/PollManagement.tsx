import { useCallback, useEffect, useState } from "react";
import { FiBarChart2, FiCheckCircle, FiClock, FiPlus, FiTrash2, FiUsers, FiX } from "react-icons/fi";
import { toast } from "sonner";
import { hrApi } from "../../../common/api/hrApi";

interface PollOption {
  option_id: number;
  option_text: string;
  vote_count: number;
}

interface Poll {
  poll_id: number;
  question: string;
  allow_multiple: boolean;
  status: "published" | "closed";
  closes_at: string | null;
  created_at: string;
  participant_count: number;
  options: PollOption[];
}

const emptyOptions = () => ["", ""];

function errorMessage(error: unknown) {
  const candidate = error as { response?: { data?: { message?: string } } };
  return candidate.response?.data?.message || "Something went wrong. Please try again.";
}

export default function PollManagement() {
  const [polls, setPolls] = useState<Poll[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(emptyOptions);
  const [allowMultiple, setAllowMultiple] = useState(false);
  const [closesAt, setClosesAt] = useState("");

  const loadPolls = useCallback(async () => {
    try {
      const response = await hrApi.get("/polls");
      setPolls(response.data?.data || []);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadPolls(); }, [loadPolls]);

  const publish = async (event: React.FormEvent) => {
    event.preventDefault();
    const cleanOptions = options.map((option) => option.trim()).filter(Boolean);
    if (question.trim().length < 3 || cleanOptions.length < 2) {
      toast.error("Enter a question and at least two options.");
      return;
    }
    setSaving(true);
    try {
      await hrApi.post("/polls", {
        question: question.trim(), options: cleanOptions,
        allow_multiple: allowMultiple,
        closes_at: closesAt ? new Date(closesAt).toISOString() : null,
      });
      setQuestion(""); setOptions(emptyOptions()); setAllowMultiple(false); setClosesAt("");
      toast.success("Poll published to your company");
      await loadPolls();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (poll: Poll) => {
    const status = poll.status === "published" ? "closed" : "published";
    try {
      await hrApi.patch(`/polls/${poll.poll_id}/status`, { status });
      setPolls((current) => current.map((item) => item.poll_id === poll.poll_id ? { ...item, status } : item));
      toast.success(status === "closed" ? "Poll closed" : "Poll reopened");
    } catch (error) { toast.error(errorMessage(error)); }
  };

  const removePoll = async (poll: Poll) => {
    if (!window.confirm(`Delete “${poll.question}”? This also removes its votes.`)) return;
    try {
      await hrApi.delete(`/polls/${poll.poll_id}`);
      setPolls((current) => current.filter((item) => item.poll_id !== poll.poll_id));
      toast.success("Poll deleted");
    } catch (error) { toast.error(errorMessage(error)); }
  };

  return (
    <main className="min-h-screen bg-slate-50/70 p-5 md:p-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-7">
          <p className="mb-1 text-xs font-bold uppercase tracking-[0.2em] text-[#852BAF]">Employee engagement</p>
          <h1 className="text-3xl font-black tracking-tight text-slate-900">Company polls</h1>
          <p className="mt-2 text-sm text-slate-500">Create quick, WhatsApp-style polls for everyone in your company.</p>
        </div>

        <div className="grid items-start gap-6 xl:grid-cols-[390px_1fr]">
          <form onSubmit={publish} className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm xl:sticky xl:top-6">
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-purple-50 text-[#852BAF]"><FiBarChart2 size={21} /></div>
              <div><h2 className="font-extrabold text-slate-900">Create a poll</h2><p className="text-xs text-slate-500">Visible only inside your company</p></div>
            </div>

            <label className="mb-2 block text-sm font-bold text-slate-700">Question</label>
            <textarea value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={500} rows={3} placeholder="Ask a question…" className="w-full resize-none rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-[#852BAF] focus:ring-4 focus:ring-purple-50" />
            <p className="mt-1 text-right text-[11px] text-slate-400">{question.length}/500</p>

            <div className="mt-3 space-y-2">
              <label className="block text-sm font-bold text-slate-700">Options</label>
              {options.map((option, index) => (
                <div key={index} className="flex gap-2">
                  <input value={option} onChange={(e) => setOptions((current) => current.map((item, i) => i === index ? e.target.value : item))} maxLength={250} placeholder={`Option ${index + 1}`} className="min-w-0 flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-[#852BAF] focus:ring-4 focus:ring-purple-50" />
                  {options.length > 2 && <button type="button" onClick={() => setOptions((current) => current.filter((_, i) => i !== index))} aria-label={`Remove option ${index + 1}`} className="rounded-xl px-3 text-slate-400 hover:bg-red-50 hover:text-red-500"><FiX /></button>}
                </div>
              ))}
              {options.length < 12 && <button type="button" onClick={() => setOptions((current) => [...current, ""])} className="flex items-center gap-2 py-2 text-sm font-bold text-[#852BAF]"><FiPlus /> Add option</button>}
            </div>

            <label className="mt-3 flex cursor-pointer items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
              <span><span className="block text-sm font-bold text-slate-700">Allow multiple answers</span><span className="text-xs text-slate-500">People can select more than one</span></span>
              <input type="checkbox" checked={allowMultiple} onChange={(e) => setAllowMultiple(e.target.checked)} className="h-5 w-5 accent-[#852BAF]" />
            </label>

            <label className="mt-4 block text-sm font-bold text-slate-700">Automatically close <span className="font-normal text-slate-400">(optional)</span></label>
            <input type="datetime-local" value={closesAt} min={new Date(Date.now() + 60000).toISOString().slice(0, 16)} onChange={(e) => setClosesAt(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-[#852BAF]" />

            <button disabled={saving} className="mt-6 w-full rounded-2xl bg-gradient-to-r from-[#852BAF] to-[#FC3F78] px-5 py-3 text-sm font-extrabold text-white shadow-lg shadow-purple-200 transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60">
              {saving ? "Publishing…" : "Publish poll"}
            </button>
          </form>

          <section>
            <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-extrabold text-slate-900">Your polls</h2><span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-slate-500 shadow-sm">{polls.length} total</span></div>
            {loading ? <div className="rounded-3xl bg-white p-12 text-center text-sm text-slate-500">Loading polls…</div> : polls.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-slate-200 bg-white p-14 text-center"><FiBarChart2 className="mx-auto mb-3 text-3xl text-slate-300" /><h3 className="font-bold text-slate-700">No polls yet</h3><p className="mt-1 text-sm text-slate-400">Your published polls will appear here.</p></div>
            ) : <div className="space-y-4">{polls.map((poll) => {
              const totalVotes = poll.options.reduce((sum, option) => sum + option.vote_count, 0);
              const expired = Boolean(poll.closes_at && new Date(poll.closes_at).getTime() <= Date.now());
              const active = poll.status === "published" && !expired;
              return <article key={poll.poll_id} className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm">
                <div className="p-5 md:p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div><div className="mb-2 flex flex-wrap items-center gap-2"><span className={`rounded-full px-2.5 py-1 text-[11px] font-extrabold ${active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{active ? "Live" : "Closed"}</span>{poll.allow_multiple && <span className="rounded-full bg-purple-50 px-2.5 py-1 text-[11px] font-bold text-[#852BAF]">Multiple answers</span>}</div><h3 className="text-lg font-extrabold text-slate-900">{poll.question}</h3></div>
                    <button onClick={() => void removePoll(poll)} aria-label="Delete poll" className="shrink-0 rounded-xl p-2.5 text-slate-400 hover:bg-red-50 hover:text-red-500"><FiTrash2 /></button>
                  </div>
                  <div className="mt-5 space-y-3">{poll.options.map((option) => {
                    const percentage = totalVotes ? Math.round((option.vote_count / totalVotes) * 100) : 0;
                    return <div key={option.option_id}><div className="mb-1.5 flex justify-between text-sm"><span className="font-semibold text-slate-700">{option.option_text}</span><span className="font-bold text-slate-500">{percentage}%</span></div><div className="h-2.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-gradient-to-r from-[#852BAF] to-[#FC3F78] transition-all" style={{ width: `${percentage}%` }} /></div></div>;
                  })}</div>
                  <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-500"><span className="flex items-center gap-1.5"><FiUsers /> {poll.participant_count} participants</span><span className="flex items-center gap-1.5"><FiCheckCircle /> {totalVotes} votes</span><span className="flex items-center gap-1.5"><FiClock /> {poll.closes_at ? `Closes ${new Date(poll.closes_at).toLocaleString()}` : "No closing date"}</span></div>
                </div>
                <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/60 px-5 py-3"><span className="text-[11px] text-slate-400">Created {new Date(poll.created_at).toLocaleDateString()}</span><button onClick={() => void changeStatus(poll)} className="text-xs font-extrabold text-[#852BAF] hover:underline">{poll.status === "published" ? "Close poll" : "Reopen poll"}</button></div>
              </article>;
            })}</div>}
          </section>
        </div>
      </div>
    </main>
  );
}
