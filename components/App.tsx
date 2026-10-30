"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { DEMOS } from "@/lib/demo-list";
import type { RunResult, StepEvent } from "@/lib/types";
import { streamRun } from "@/lib/run-client";
import { AgentTimeline } from "./AgentTimeline";
import { BatchPanel } from "./BatchPanel";
import { EventLinkInput } from "./EventLinkInput";
import { HowItWorks } from "./HowItWorks";
import { RecordingUpload } from "./RecordingUpload";
import { ResultView } from "./ResultView";
import { TourMap } from "./TourMap";

type Lane = "a" | "b";
const ROOM_EXAMPLES = ["Atlanta, ages 45–60", "Brooklyn, ages 25–34", "London, 25–34", "Fans of Taylor Swift and Peloton"];
const RANDOM_ROOMS = [
  "Nashville, ages 25–34",
  "Chicago, ages 55 and over",
  "Los Angeles, ages 18–24",
  "Miami, ages 35–44",
  "Seattle, ages 25–34",
  "Dallas, ages 45–54",
  "Toronto, ages 25–34",
  "London, ages 35–44",
  "New Orleans, ages 30–45",
  "Denver, ages 25–34",
];

export function App() {
  const [text, setText] = useState("");
  const [room, setRoom] = useState("");
  const [roomB, setRoomB] = useState("");
  const [results, setResults] = useState<Partial<Record<Lane, RunResult>>>({});
  const [steps, setSteps] = useState<Record<Lane, StepEvent[]>>({ a: [], b: [] });
  const [running, setRunning] = useState<Lane | null>(null);
  const [error, setError] = useState("");
  const [split, setSplit] = useState(false);
  const [askB, setAskB] = useState(false);
  const [demo, setDemo] = useState<string | null>(null);
  const [suggest, setSuggest] = useState(false);
  const resultsRef = useRef<HTMLDivElement>(null);

  const scrollToResults = () => setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);

  async function openDemo(slug: string) {
    const d = DEMOS.find((x) => x.slug === slug)!;
    setError("");
    setDemo(slug);
    setText(d.text);
    setRoom(d.roomA);
    setRoomB(d.roomB);
    setSplit(false);
    setAskB(false);
    try {
      const res = await fetch(`/api/demo/${slug}`);
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { a: RunResult; b?: RunResult };
      setResults(data);
      setSteps({ a: data.a.steps ?? [], b: data.b?.steps ?? [] });
      scrollToResults();
    } catch {
      setResults({});
      setSteps({ a: [], b: [] });
      setError("This example isn't ready yet. Press “Read the room” to run it live.");
    }
  }

  function openResult(r: RunResult) {
    setDemo(null);
    setError("");
    setRoom(r.room.label);
    setResults({ a: r });
    setSteps({ a: r.steps ?? [], b: [] });
    setSplit(false);
    setAskB(false);
    scrollToResults();
  }

  async function run(lane: Lane, roomOverride?: string) {
    const r = roomOverride ?? (lane === "a" ? room : roomB);
    setError("");
    setRunning(lane);
    setSteps((s) => ({ ...s, [lane]: [] }));
    setResults((x) => (lane === "a" ? {} : { ...x, b: undefined }));
    if (lane === "a") setSplit(false);
    else setSplit(true);
    scrollToResults();
    try {
      await streamRun({ text, room: r, suggest }, (m) => {
        if (m.type === "step") setSteps((s) => ({ ...s, [lane]: [...s[lane], m] }));
        else if (m.type === "result") setResults((x) => ({ ...x, [lane]: m.data }));
        else if (m.type === "error") setError(m.message);
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRunning(null);
    }
  }

  const canRun = text.trim().length >= 10 && room.trim().length >= 2 && !running;
  const a = results.a;
  const b = results.b;

  return (
    <div className="flex min-h-screen flex-col">
      {/* Hero */}
      <header className="spotlight px-4 pb-10 pt-10 sm:pt-16">
        <div className="mx-auto max-w-5xl">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="font-display text-xl uppercase tracking-widest text-spot">Read the Room</span>
            <span className="text-[#bdb5a8]">
              Powered by <b className="text-spot">Qloo</b>&apos;s taste graph
            </span>
          </div>
          <div className="marquee-dots mt-4" aria-hidden />
          <h1 className="mt-8 max-w-4xl font-display text-[2.6rem] uppercase leading-[0.95] tracking-tight sm:text-7xl">
            Every joke, ad and speech is written for a room the writer has <span className="text-spot">never been in.</span>
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-[#d8d1c5]">
            Paste your text and describe the audience. An agent checks every cultural reference against Qloo&apos;s taste data for that room, swaps the ones that won&apos;t land, and proves each swap scores higher.
          </p>

          {/* Examples */}
          <h2 className="mt-10 text-xs font-bold uppercase tracking-[0.2em] text-spot">Try an example. Results load instantly.</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {DEMOS.map((d) => (
              <button
                key={d.slug}
                type="button"
                onClick={() => openDemo(d.slug)}
                className={`group rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 hover:border-spot ${demo === d.slug ? "border-spot bg-stage-2" : "border-stage-line bg-stage-2/60"}`}
              >
                <div className="text-[11px] font-bold uppercase tracking-widest text-spot">{d.kind}</div>
                <div className="mt-1 font-display text-xl uppercase leading-tight">{d.title}</div>
                <div className="mt-2 text-xs text-[#bdb5a8]">for {d.roomA}</div>
              </button>
            ))}
          </div>

          {/* Input */}
          <form
            className="mt-8 rounded-2xl border border-stage-line bg-stage-2/70 p-4 sm:p-5"
            onSubmit={(e) => {
              e.preventDefault();
              if (canRun) {
                setDemo(null);
                run("a");
              }
            }}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label htmlFor="text" className="text-xs font-bold uppercase tracking-[0.2em] text-spot">
                Or paste your own
              </label>
              <RecordingUpload onText={setText} disabled={!!running} />
            </div>
            <textarea
              id="text"
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, 2500))}
              rows={5}
              placeholder="Your stand-up bit, toast, ad or pitch…"
              className="mt-2 w-full resize-y rounded-xl bg-paper p-4 text-ink placeholder:text-ink-soft/60"
            />
            <div className="mt-1 text-right text-xs text-[#8f877b]">{text.length}/2,500</div>
            <div className="mt-2 flex flex-col gap-3 sm:flex-row">
              <label className="sr-only" htmlFor="room">
                Room
              </label>
              <input
                id="room"
                value={room}
                onChange={(e) => setRoom(e.target.value.slice(0, 200))}
                list="room-examples"
                placeholder={`The room, e.g. "${ROOM_EXAMPLES[0]}"`}
                className="flex-1 rounded-xl bg-paper px-4 py-3 text-ink placeholder:text-ink-soft/60"
              />
              <datalist id="room-examples">
                {ROOM_EXAMPLES.map((r) => (
                  <option key={r} value={r} />
                ))}
              </datalist>
              <button type="submit" disabled={!canRun} className="rounded-xl bg-spot px-6 py-3 font-display text-lg uppercase tracking-wide text-stage transition hover:brightness-110 disabled:opacity-40">
                {running ? "Reading…" : "Read the room"}
              </button>
            </div>
            <label className="mt-3 inline-flex items-center gap-2 text-sm text-[#d8d1c5]">
              <input type="checkbox" checked={suggest} onChange={(e) => setSuggest(e.target.checked)} className="h-4 w-4 accent-[#f5b335]" />
              Suggest new references for lines that have none (picked only from Qloo&apos;s audience snapshot)
            </label>
            <div>
              <EventLinkInput onUse={setRoom} />
            </div>
            <div>
              <BatchPanel text={text} suggest={suggest} onOpen={openResult} />
            </div>
          </form>
        </div>
      </header>

      {/* Results */}
      <main ref={resultsRef} className="mx-auto w-full max-w-6xl flex-1 scroll-mt-4 px-4 py-8">
        {error && (
          <div role="alert" className="mb-5 rounded-xl border border-weak/50 bg-weak/10 px-4 py-3 text-[#ffc9c9]">
            {error}
          </div>
        )}

        {(running === "a" || (!a && steps.a.length > 0)) && (
          <div className="mx-auto max-w-2xl">
            <AgentTimeline steps={steps.a} running={running === "a"} dark />
          </div>
        )}

        {a && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-display text-3xl uppercase tracking-wide">
                Tuned for <span className="text-spot">{a.room.label}</span>
              </h2>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => (b ? setSplit(!split) : setAskB(!askB))}
                  className="rounded-full border border-spot px-4 py-2 text-sm font-semibold text-spot hover:bg-spot hover:text-stage"
                >
                  {split ? "Single room" : "Compare with another room"}
                </button>
                <button
                  type="button"
                  disabled={!!running}
                  onClick={() => {
                    const pick = RANDOM_ROOMS.filter((x) => x !== room)[Math.floor(Math.random() * (RANDOM_ROOMS.length - 1))];
                    setRoom(pick);
                    setDemo(null);
                    run("a", pick);
                  }}
                  className="rounded-full border border-stage-line px-4 py-2 text-sm font-semibold text-[#d8d1c5] hover:border-spot hover:text-spot disabled:opacity-40"
                >
                  Try a random room
                </button>
                <ShareButton a={a} b={split ? b : undefined} />
              </div>
            </div>

            {askB && !b && (
              <form
                className="flex flex-col gap-2 rounded-2xl border border-stage-line bg-stage-2 p-4 sm:flex-row"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (roomB.trim().length >= 2 && !running) run("b");
                }}
              >
                <input value={roomB} onChange={(e) => setRoomB(e.target.value.slice(0, 200))} placeholder='Second room, e.g. "Brooklyn, ages 25–34"' className="flex-1 rounded-xl bg-paper px-4 py-3 text-ink" aria-label="Second room" />
                <button type="submit" disabled={!!running} className="rounded-xl bg-spot px-5 py-3 font-semibold text-stage disabled:opacity-40">
                  Tune for this room too
                </button>
              </form>
            )}

            {split ? (
              <div className="grid gap-5 lg:grid-cols-2">
                <SplitColumn label={a.room.label}>
                  <ResultView result={a} compact onChange={(r) => setResults((x) => ({ ...x, a: r }))} />
                </SplitColumn>
                <SplitColumn label={b?.room.label ?? roomB}>
                  {b ? <ResultView result={b} compact onChange={(r) => setResults((x) => ({ ...x, b: r }))} /> : <AgentTimeline steps={steps.b} running={running === "b"} dark />}
                </SplitColumn>
              </div>
            ) : (
              <ResultView result={a} onChange={(r) => setResults((x) => ({ ...x, a: r }))} />
            )}

            {!split && <TourMap key={`${a.createdAt}|${a.room.label}`} result={a} />}

            {!split && <AgentTimeline steps={steps.a} budget={20} dark />}
          </div>
        )}
      </main>

      <footer className="border-t border-stage-line px-4 py-6 text-sm text-[#8f877b]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
          <span>
            Read the Room · built on the <b className="text-[#d8d1c5]">Qloo</b> Taste AI API · MIT licensed
          </span>
          <span className="flex gap-4">
            <HowItWorks />
            <Link href="/developers" className="hover:text-spot">
              Public API
            </Link>
          </span>
        </div>
      </footer>
    </div>
  );
}

function SplitColumn({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <h3 className="mb-3 font-display text-xl uppercase tracking-wide text-spot">{label}</h3>
      {children}
    </div>
  );
}

function ShareButton({ a, b }: { a: RunResult; b?: RunResult }) {
  const [state, setState] = useState<"idle" | "saving" | "done" | "error">("idle");
  const [url, setUrl] = useState("");
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled={state === "saving"}
        onClick={async () => {
          setState("saving");
          try {
            const res = await fetch("/api/share", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ a, b }) });
            const j = await res.json();
            if (!res.ok) throw new Error();
            setUrl(j.url);
            setState("done");
            await navigator.clipboard?.writeText(j.url).catch(() => {});
          } catch {
            setState("error");
          }
        }}
        className="rounded-full bg-spot px-4 py-2 text-sm font-semibold text-stage hover:brightness-110 disabled:opacity-50"
      >
        {state === "saving" ? "Saving…" : state === "done" ? "Link copied ✓" : "Share"}
      </button>
      {state === "done" && (
        <a href={url} className="max-w-[12rem] truncate text-xs text-spot underline" target="_blank" rel="noreferrer">
          {url}
        </a>
      )}
      {state === "error" && <span className="text-xs text-[#ffc9c9]">Couldn&apos;t save. Try again.</span>}
    </span>
  );
}
