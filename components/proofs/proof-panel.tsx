"use client";
import { useEffect, useRef, useState } from "react";
import { isAuthorizationError } from "@/lib/read-errors";
import { Proof, ProofTarget } from "@/lib/proofs";
import {
  addProof,
  deleteProof,
  getProofs,
  proofImageUrl,
} from "@/lib/actions/proofs";
import { createClient } from "@/lib/supabase/client";
import { assessProof } from "@/lib/actions/assistant";
export function ProofPanel({ target }: { target: ProofTarget }) {
  return (
    <OwnerProofPanel
      key={target.taskId ?? `${target.habitId}:${target.logDate}`}
      target={target}
    />
  );
}
function accessLost(error: unknown) {
  return (
    isAuthorizationError(error) ||
    (error instanceof Error &&
      /completed (task|habit log) not found|proof unavailable|please sign in|not authorized/i.test(
        error.message,
      ))
  );
}
function OwnerProofPanel({ target }: { target: ProofTarget }) {
  const [assessment, setAssessment] = useState("");
  const [open, setOpen] = useState(false),
    [proofs, setProofs] = useState<Proof[] | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(false),
    [type, setType] = useState<Proof["type"]>("note");
  const state = useRef({
    live: true,
    generation: 0,
    reading: false,
    writing: false,
  });
  useEffect(() => {
    const s = state.current;
    s.live = true;
    return () => {
      s.live = false;
      s.generation++;
    };
  }, []);
  async function refresh() {
    const s = state.current;
    if (s.reading || s.writing) return;
    s.reading = true;
    const request = ++s.generation;
    setLoading(true);
    setError("");
    try {
      const rows = await getProofs(target);
      if (s.live && request === s.generation) setProofs(rows);
    } catch (e) {
      if (s.live && request === s.generation) {
        if (accessLost(e)) {
          setProofs(null);
          setAssessment("");
        }
        setError((e as Error).message);
      }
    } finally {
      if (s.live && request === s.generation) {
        s.reading = false;
        setLoading(false);
      }
    }
  }
  async function run(action: () => Promise<unknown>, changesList = false) {
    const s = state.current;
    if (s.writing) return;
    s.writing = true;
    s.generation++;
    s.reading = false;
    setLoading(false);
    setBusy(true);
    setError("");
    try {
      await action();
      if (changesList && s.live) {
        setAssessment("");
        s.writing = false;
        await refresh();
      }
    } catch (e) {
      if (s.live) {
        setError((e as Error).message);
        if (accessLost(e)) {
          setProofs(null);
          setAssessment("");
        }
      }
    } finally {
      s.writing = false;
      if (s.live) setBusy(false);
    }
  }
  return (
    <div className="evidence-panel space-y-3">
      <button
        className="proof-action"
        aria-expanded={open}
        onClick={() => {
          setOpen(!open);
          if (!open && proofs === null) void refresh();
        }}
      >
        {" "}
        {open ? "Hide proof" : "Attach / view proof"}
      </button>

      {open && (
        <>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.currentTarget,
                f = new FormData(form);
              void run(async () => {
                const file = f.get("image") as File | null;
                if (
                  type === "image" &&
                  (!file ||
                    !file.size ||
                    file.size > 5242880 ||
                    !["image/png", "image/jpeg", "image/webp"].includes(
                      file.type,
                    ))
                )
                  throw new Error(
                    "Choose a PNG, JPEG or WebP image up to 5 MB.",
                  );
                const result = await addProof(
                  target,
                  type,
                  String(f.get("content") ?? ""),
                  f.get("visibility") as Proof["visibility"],
                );
                if (result.path && result.token && file) {
                  const { error } = await createClient()
                    .storage.from("proofs")
                    .uploadToSignedUrl(result.path, result.token, file, {
                      contentType: file.type,
                    });
                  if (error) {
                    await deleteProof(result.id);
                    throw new Error("Image upload failed. Please retry.");
                  }
                }
                form.reset();
              }, true);
            }}
          >
            <label className="proof-field">
              Proof type
              <select
                value={type}
                onChange={(e) => setType(e.target.value as Proof["type"])}
              >
                <option value="note">Text note</option>
                <option value="link">URL / link</option>
                <option value="image">Image / screenshot</option>
              </select>
            </label>
            {type === "image" ? (
              <label className="proof-field">
                Image (up to 5 MB)
                <input
                  name="image"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  required
                />
              </label>
            ) : (
              <label className="proof-field">
                {type === "note" ? "Note" : "Link"}
                <textarea name="content" required maxLength={10000} />
              </label>
            )}
            <label className="proof-field">
              Visibility
              <select name="visibility">
                <option value="private">Private</option>
                <option value="friends">
                  Friends (requires profile sharing enabled)
                </option>
              </select>
            </label>
            <button disabled={busy} className="proof-action">
              Save proof
            </button>
          </form>
          <section aria-label="Saved proofs" className="min-h-40 space-y-3">
            {" "}
            {error && (
              <p role="alert" className="text-sm text-proof-red">
                {error}
              </p>
            )}
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-semibold">Saved proofs</h3>
              <button
                disabled={busy || loading}
                className="proof-action"
                onClick={() => void refresh()}
              >
                Refresh proofs
              </button>
            </div>
            {proofs === null && (
              <div
                role="status"
                className="min-h-24 rounded-xl border border-white/10 p-4"
              >
                {error ? "Proofs unavailable." : "Loading proofs..."}
              </div>
            )}
            {proofs?.length === 0 && (
              <p className="min-h-24 text-sm text-white/50">
                No proofs attached.
              </p>
            )}
            {(proofs ?? []).map((p) => (
              <article
                key={p.id}
                className="space-y-2 rounded-xl border border-white/10 p-3"
              >
                <p className="text-xs text-white/50">
                  {p.type} · {p.visibility}
                </p>
                {p.type === "note" ? (
                  <p className="whitespace-pre-wrap break-words text-sm">
                    {p.content}
                  </p>
                ) : p.type === "link" ? (
                  <a
                    className="proof-action break-all"
                    href={p.content!}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open link
                  </a>
                ) : (
                  <button
                    disabled={busy}
                    className="proof-action"
                    onClick={() =>
                      void run(async () => {
                        const url = await proofImageUrl(p.id);
                        if (state.current.live)
                          window.open(url, "_blank", "noopener,noreferrer");
                      })
                    }
                  >
                    Open image
                  </button>
                )}
                <button
                  disabled={busy}
                  className="proof-action"
                  onClick={() =>
                    void run(async () => {
                      await deleteProof(p.id);
                      if (state.current.live) {
                        setProofs(
                          (current) =>
                            current?.filter((proof) => proof.id !== p.id) ??
                            null,
                        );
                        setAssessment("");
                      }
                    })
                  }
                >
                  Remove proof
                </button>
                <button
                  disabled={busy}
                  className="proof-action"
                  onClick={() =>
                    void run(async () => {
                      const result = await assessProof(p.id);
                      if (state.current.live)
                        setAssessment(
                          `${result.verification} (${Math.round(result.confidence * 100)}% confidence): ${result.reason}`,
                        );
                    })
                  }
                >
                  Assess {p.type} proof with Gemini
                </button>
              </article>
            ))}
            <p role="status" className="min-h-16 text-sm text-white/70">
              {assessment &&
                `${assessment} This assessment is not fraud-proof.`}
            </p>
          </section>
        </>
      )}
    </div>
  );
}
