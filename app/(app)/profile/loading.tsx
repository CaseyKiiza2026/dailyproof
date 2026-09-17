export default function ProfileLoading() {
  return (
    <div role="status" aria-label="Loading profile" className="space-y-6">
      <section className="proof-panel min-h-[160px] p-6">
        <p className="text-sm text-white/35">Loading profile…</p>
      </section>
      <section aria-hidden="true" className="proof-panel min-h-[290px] p-6">
        <div className="mx-auto h-24 w-24 rounded-full bg-white/[0.04]" />
        <div className="mx-auto mt-5 h-6 w-32 rounded bg-white/[0.04]" />
      </section>
      <section aria-hidden="true" className="proof-panel min-h-[240px]" />
    </div>
  );
}
