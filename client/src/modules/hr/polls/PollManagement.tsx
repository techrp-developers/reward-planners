import { useCallback, useEffect, useState } from "react";
import { FiChevronDown, FiPlus, FiTrash2, FiX } from "react-icons/fi";
import { toast } from "sonner";
import { hrApi } from "../../../common/api/hrApi";
import { Card, EmptyState, Initials, LoadingRow, PageHeader, StatusDot } from "../components/ui";
import { button, field, iconButton, label } from "../components/styles";

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

interface Participant {
  user_id: number;
  name: string;
  email: string;
  user_image: string | null;
  voted_at: string;
}

interface OptionParticipants {
  option_id: number;
  option_text: string;
  participants: Participant[];
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
  const [openParticipants, setOpenParticipants] = useState<number | null>(null);
  const [participantData, setParticipantData] = useState<Record<number, OptionParticipants[]>>({});
  const [participantsLoading, setParticipantsLoading] = useState<number | null>(null);

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

  const toggleParticipants = async (pollId: number) => {
    if (openParticipants === pollId) {
      setOpenParticipants(null);
      return;
    }
    setOpenParticipants(pollId);
    setParticipantsLoading(pollId);
    try {
      const response = await hrApi.get(`/polls/${pollId}/participants`);
      setParticipantData((current) => ({ ...current, [pollId]: response.data?.data || [] }));
    } catch (error) {
      setOpenParticipants(null);
      toast.error(errorMessage(error));
    } finally {
      setParticipantsLoading(null);
    }
  };

  return (
    <>
      <PageHeader
        title="Polls"
        description="Ask your company a quick question. Everyone in the company can vote from the app."
      />

      <div className="grid items-start gap-6 xl:grid-cols-[360px_1fr]">
        <Card className="xl:sticky xl:top-20">
          <form onSubmit={publish}>
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 className="text-sm font-semibold text-slate-900">New poll</h2>
              <p className="mt-0.5 text-xs text-slate-500">Only people in your company will see it</p>
            </div>

            <div className="space-y-4 p-5">
              <div>
                <label htmlFor="poll-question" className={label}>Question</label>
                <textarea id="poll-question" value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={500} rows={3} placeholder="Where should we go for the team lunch?" className={`${field} resize-none`} />
                {question.length > 400 && <p className="mt-1 text-right text-xs text-slate-400">{question.length}/500</p>}
              </div>

              <div>
                <p className={label}>Options</p>
                <div className="space-y-2">
                  {options.map((option, index) => (
                    <div key={index} className="flex gap-1.5">
                      <input value={option} onChange={(e) => setOptions((current) => current.map((item, i) => i === index ? e.target.value : item))} maxLength={250} placeholder={`Option ${index + 1}`} aria-label={`Option ${index + 1}`} className={field} />
                      {options.length > 2 && (
                        <button type="button" onClick={() => setOptions((current) => current.filter((_, i) => i !== index))} aria-label={`Remove option ${index + 1}`} className={`${iconButton} h-9 w-9 shrink-0`}>
                          <FiX className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                {options.length < 12 && (
                  <button type="button" onClick={() => setOptions((current) => [...current, ""])} className="mt-2 inline-flex items-center gap-1.5 text-sm text-[#852BAF] hover:underline cursor-pointer">
                    <FiPlus className="h-3.5 w-3.5" /> Add another option
                  </button>
                )}
              </div>

              <label className="flex cursor-pointer items-start gap-2.5">
                <input type="checkbox" checked={allowMultiple} onChange={(e) => setAllowMultiple(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#852BAF]" />
                <span>
                  <span className="block text-sm text-slate-800">Allow more than one answer</span>
                  <span className="text-xs text-slate-500">Voters can tick several options</span>
                </span>
              </label>

              <div>
                <label htmlFor="poll-closes" className={label}>
                  Close automatically <span className="font-normal text-slate-400">(optional)</span>
                </label>
                <input id="poll-closes" type="datetime-local" value={closesAt} min={new Date(Date.now() + 60000).toISOString().slice(0, 16)} onChange={(e) => setClosesAt(e.target.value)} className={field} />
              </div>
            </div>

            <div className="border-t border-slate-200 px-5 py-3">
              <button disabled={saving} className={`${button.primary} w-full`}>
                {saving ? "Publishing…" : "Publish poll"}
              </button>
            </div>
          </form>
        </Card>

        <section>
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-sm font-semibold text-slate-900">Your polls</h2>
            {polls.length > 0 && <span className="text-sm text-slate-500">{polls.length} total</span>}
          </div>

          {loading ? (
            <Card><LoadingRow text="Loading polls…" /></Card>
          ) : polls.length === 0 ? (
            <Card><EmptyState title="No polls yet" hint="Write a question on the left and publish it. Results will show up here as people vote." /></Card>
          ) : (
            <div className="space-y-4">
              {polls.map((poll) => {
                const totalVotes = poll.options.reduce((sum, option) => sum + option.vote_count, 0);
                const expired = Boolean(poll.closes_at && new Date(poll.closes_at).getTime() <= Date.now());
                const active = poll.status === "published" && !expired;
                const leading = Math.max(...poll.options.map((option) => option.vote_count), 0);
                return (
                  <Card key={poll.poll_id}>
                    <div className="p-5">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="mb-1.5 flex flex-wrap items-center gap-3">
                            <StatusDot tone={active ? "green" : "grey"}>{active ? "Open" : "Closed"}</StatusDot>
                            {poll.allow_multiple && <span className="text-xs text-slate-500">Multiple answers</span>}
                          </div>
                          <h3 className="text-base font-medium text-slate-900">{poll.question}</h3>
                        </div>
                        <button onClick={() => void removePoll(poll)} aria-label="Delete poll" title="Delete poll" className={`${iconButton} hover:text-red-600`}>
                          <FiTrash2 className="h-4 w-4" />
                        </button>
                      </div>

                      <ul className="mt-4 space-y-3">
                        {poll.options.map((option) => {
                          const percentage = totalVotes ? Math.round((option.vote_count / totalVotes) * 100) : 0;
                          const isLeading = totalVotes > 0 && option.vote_count === leading;
                          return (
                            <li key={option.option_id}>
                              <div className="mb-1 flex justify-between gap-3 text-sm">
                                <span className={isLeading ? "font-medium text-slate-900" : "text-slate-700"}>{option.option_text}</span>
                                <span className="shrink-0 tabular-nums text-slate-500">
                                  {option.vote_count} · {percentage}%
                                </span>
                              </div>
                              <div className="h-1.5 rounded-full bg-slate-100">
                                <div className={`h-full rounded-full transition-all ${isLeading ? "bg-gradient-to-r from-[#852BAF] from-60% to-[#C13A8E]" : "bg-purple-200"}`} style={{ width: `${percentage}%` }} />
                              </div>
                            </li>
                          );
                        })}
                      </ul>

                      <p className="mt-4 text-xs text-slate-500">
                        {poll.participant_count} {poll.participant_count === 1 ? "person" : "people"} voted · {totalVotes} {totalVotes === 1 ? "vote" : "votes"} ·{" "}
                        {poll.closes_at ? `${expired ? "Closed" : "Closes"} ${new Date(poll.closes_at).toLocaleString()}` : "No closing date"}
                      </p>

                      {openParticipants === poll.poll_id && (
                        <div className="mt-4 rounded-lg border border-slate-200">
                          {participantsLoading === poll.poll_id ? (
                            <LoadingRow text="Loading votes…" />
                          ) : (
                            <div className="divide-y divide-slate-100">
                              {(participantData[poll.poll_id] || []).map((option) => (
                                <div key={option.option_id} className="px-4 py-3">
                                  <p className="mb-2 text-xs font-medium text-slate-500">
                                    {option.option_text} · {option.participants.length}
                                  </p>
                                  {option.participants.length === 0 ? (
                                    <p className="text-sm text-slate-400">Nobody picked this</p>
                                  ) : (
                                    <ul className="grid gap-2 sm:grid-cols-2">
                                      {option.participants.map((participant) => (
                                        <li key={`${option.option_id}-${participant.user_id}`} className="flex items-center gap-2.5">
                                          {participant.user_image ? (
                                            <img src={participant.user_image} alt="" className="h-7 w-7 rounded-full object-cover" />
                                          ) : (
                                            <Initials name={participant.name} size="sm" />
                                          )}
                                          <div className="min-w-0">
                                            <p className="truncate text-sm text-slate-800">{participant.name}</p>
                                            <p className="truncate text-xs text-slate-400">{participant.email}</p>
                                          </div>
                                        </li>
                                      ))}
                                    </ul>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-5 py-2.5">
                      <button type="button" onClick={() => void toggleParticipants(poll.poll_id)} aria-expanded={openParticipants === poll.poll_id} className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900 cursor-pointer">
                        {openParticipants === poll.poll_id ? "Hide who voted" : "See who voted"}
                        <FiChevronDown className={`h-4 w-4 transition-transform ${openParticipants === poll.poll_id ? "rotate-180" : ""}`} />
                      </button>
                      <div className="flex items-center gap-3">
                        <span className="hidden text-xs text-slate-400 sm:inline">Posted {new Date(poll.created_at).toLocaleDateString()}</span>
                        <button onClick={() => void changeStatus(poll)} className={button.secondary}>
                          {poll.status === "published" ? "Close poll" : "Reopen"}
                        </button>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
