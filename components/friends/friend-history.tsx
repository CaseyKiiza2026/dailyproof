"use client";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { FriendSummaryResult } from "@/lib/friend-summary";
import { shiftDateKey } from "@/lib/timezone";
import { proofImageUrl } from "@/lib/actions/proofs";
import { Proof } from "@/lib/proofs";
export function FriendHistory({ userId }: { userId: string }) {
  return <AuthorizedFriendHistory key={userId} userId={userId} />;
}
function AuthorizedFriendHistory({ userId }: { userId: string }) {
  const [days, setDays] = useState<FriendSummaryResult[]>([]),
    [proofs, setProofs] = useState<Proof[]>([]),
    [open, setOpen] = useState(false),
    [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const state = useRef({
    live: true,
    generation: 0,
    open: false,
    pending: null as Promise<FriendSummaryResult> | null,
  });
  function readToday() {
    const s = state.current;
    if (s.pending) return s.pending;
    const promise = Promise.resolve(
      createClient().rpc("get_friend_day_summary", {
        p_target_user_id: userId,
      }),
    )
      .then(({ data, error }) => {
        if (error || !data) throw new Error("Summary unavailable.");
        return data as FriendSummaryResult;
      })
      .finally(() => {
        if (s.pending === promise) s.pending = null;
      });
    s.pending = promise;
    return promise;
  }
  useEffect(() => {
    const s = state.current;
    s.live = true;
    const request = ++s.generation;
    void readToday()
      .then((today) => {
        if (s.live && request === s.generation)
          setDays([{ ...today, statuses: [] }]);
      })
      .catch(() => {
        if (s.live && request === s.generation)
          setError("Summary unavailable.");
      });
    return () => {
      s.live = false;
      s.generation++;
    };
    // This component is keyed by userId; every new owner gets a new request scope.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  async function show() {
    const s = state.current;
    if (s.open) {
      s.open = false;
      s.generation++;
      setOpen(false);
      setLoading(false);
      setDays((current) =>
        current.slice(0, 1).map((day) => ({ ...day, statuses: [] })),
      );
      setProofs([]);
      return;
    }
    s.open = true;
    const request = ++s.generation;
    setOpen(true);
    setLoading(true);
    setError("");
    setProofs([]);
    try {
      const today = await readToday();
      if (!s.live || request !== s.generation) return;
      const db = createClient();
      const history = await Promise.all(
        Array.from({ length: 6 }, async (_, i) => {
          const { data, error } = await db.rpc("get_friend_day_summary", {
            p_target_user_id: userId,
            p_target_date: shiftDateKey(today.today_key, -i - 1),
          });
          if (error || !data) throw new Error("History unavailable.");
          return data as FriendSummaryResult;
        }),
      );
      if (!s.live || request !== s.generation) return;
      const { data: shared, error: proofError } = await db
        .from("proofs")
        .select("id,user_id,type,content,storage_path,visibility,created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(20);
      if (proofError) throw new Error("Unable to load shared proof.");
      if (s.live && request === s.generation) {
        setDays([today, ...history]);
        setProofs(shared ?? []);
      }
    } catch (e) {
      if (s.live && request === s.generation) {
        setDays([]);
        setProofs([]);
        setError((e as Error).message);
      }
    } finally {
      if (s.live && request === s.generation) setLoading(false);
    }
  }
  return (
    <div className="space-y-2">
      <button
        disabled={loading}
        onClick={() => void show()}
        className="proof-action"
      >
        {open ? "Hide recent days" : "View recent days"}
      </button>
      {error && (
        <p role="alert" className="text-sm text-proof-red">
          {error}
        </p>
      )}
      <div className="min-h-10">
        {days.length === 0 && !error && !loading && (
          <div
            aria-label="Summary not yet available"
            className="my-2 h-4 w-3/4 rounded bg-white/10"
          />
        )}
        {open && loading && (
          <div
            role="status"
            aria-label="Loading recent days"
            className="space-y-3"
          >
            {Array.from({ length: 7 }, (_, i) => (
              <div key={i} className="h-8 rounded bg-white/5" />
            ))}
          </div>
        )}
        {(!loading ? days : days.slice(0, 1)).map((d) => (
          <div key={d.log_date} className="text-sm text-white/65">
            <p>
              {d.log_date}: {d.completion}% · {d.complete_count}/{d.total_count}{" "}
              · {d.streak} day streak
            </p>
            {open &&
              !loading &&
              d.details_visible &&
              d.statuses?.map((s, i) => (
                <p key={i} className="mt-1 break-words text-xs">
                  {s.habit_name}: {s.status}
                </p>
              ))}
          </div>
        ))}
      </div>
      {open &&
        !loading &&
        proofs.map((p) => (
          <div key={p.id} className="rounded-xl border border-white/10 p-3">
            {p.type === "note" ? (
              <p className="whitespace-pre-wrap break-words text-sm">
                {p.content}
              </p>
            ) : p.type === "link" ? (
              <a
                href={p.content!}
                target="_blank"
                rel="noopener noreferrer"
                className="proof-action"
              >
                Shared proof link
              </a>
            ) : (
              <button
                className="proof-action"
                onClick={async () => {
                  try {
                    window.open(
                      await proofImageUrl(p.id),
                      "_blank",
                      "noopener,noreferrer",
                    );
                  } catch {
                    setProofs([]);
                    setDays((current) =>
                      current.map((day) => ({ ...day, statuses: [] })),
                    );
                    setError("Proof is no longer available.");
                  }
                }}
              >
                Open shared image
              </button>
            )}
          </div>
        ))}
    </div>
  );
}
