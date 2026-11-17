import Link from "next/link";

export function TasksPaused() {
  return <section className="space-y-4 p-6">
    <h1 className="text-2xl font-semibold">Tasks are paused</h1>
    <p>Existing tasks and history are preserved. Client deliveries remain available.</p>
    <Link href="/app/deliveries" className="btn-secondary">Client deliveries</Link>
  </section>;
}
