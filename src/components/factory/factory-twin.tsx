"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft, ChevronLeft, ChevronRight, Expand, Loader2, Minimize, Moon, Move3d, Pause, Play, RefreshCw, RotateCcw, Route, Sun, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DEPARTMENTS,
  DEPARTMENT_BY_ID,
  STATUS_LABEL,
  TOUR_ORDER,
  type DepartmentGroup,
  type DepartmentId,
  type DepartmentSnapshot,
  type DeptStatus,
  type FactorySnapshot,
  type Tone,
} from "@/lib/factory";
import { Button } from "@/components/ui/button";
import { hasWebGL, isLowPower, prefersReducedMotion } from "@/components/landing/capabilities";
import type { FactoryScene } from "./factory-scene";

const POLL_MS = 15_000;
const TOUR_STEP_MS = 8_000;
const GROUPS: DepartmentGroup[] = ["Stores", "Production line", "Finished goods"];

const DOT: Record<DeptStatus | "neutral", string> = {
  ok: "bg-green-500",
  warning: "bg-amber-500",
  critical: "bg-red-500",
  idle: "bg-zinc-400",
  neutral: "bg-zinc-400",
};
const TONE_TEXT: Record<Tone, string> = {
  ok: "text-success",
  warning: "text-warning",
  critical: "text-destructive",
  muted: "text-muted-foreground",
};

export function StatusPill({ status, running }: { status: DeptStatus; running?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border bg-card px-2 py-0.5 text-[11px] font-medium">
      <span className={cn("size-2 rounded-full", DOT[status])} aria-hidden="true" />
      {STATUS_LABEL[status]}
      {running !== undefined && <span className="text-muted-foreground">· {running ? "Running" : "Idle"}</span>}
    </span>
  );
}

function Legend({ className }: { className?: string }) {
  return (
    <ul className={cn("flex flex-wrap gap-x-3 gap-y-1 text-[11px]", className)} aria-label="Status colours">
      {(["ok", "warning", "critical", "idle"] as DeptStatus[]).map((s) => (
        <li key={s} className="flex items-center gap-1.5">
          <span className={cn("size-2 rounded-full", DOT[s])} aria-hidden="true" />
          {STATUS_LABEL[s]}
        </li>
      ))}
    </ul>
  );
}

function timeOf(iso: string) {
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Asia/Kolkata" });
}

/** Department overview list: the accessible 2D twin, also used when WebGL is unavailable. */
function DepartmentList({ snapshot, selected, onSelect }: { snapshot: FactorySnapshot | null; selected: DepartmentId | null; onSelect: (id: DepartmentId) => void }) {
  return (
    <div className="space-y-4">
      {GROUPS.map((g) => (
        <section key={g} aria-label={g}>
          <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{g}</h3>
          <ul className="space-y-1">
            {DEPARTMENTS.filter((d) => d.group === g).map((d) => {
              const s = snapshot?.departments[d.id];
              return (
                <li key={d.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(d.id)}
                    aria-pressed={selected === d.id}
                    className={cn(
                      "flex w-full items-start gap-2.5 rounded-lg border px-3 py-2 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      selected === d.id && "border-brand bg-brand-soft/40",
                    )}
                  >
                    <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", DOT[s?.status ?? "neutral"])} aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium">{d.name}</span>
                        {s && <span className="shrink-0 text-[11px] text-muted-foreground">{STATUS_LABEL[s.status]}</span>}
                      </span>
                      <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">{s ? s.statusText : d.whatHappens}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

function DepartmentDetail({ id, snap, permissions, showcase, onBack }: { id: DepartmentId; snap?: DepartmentSnapshot; permissions: string[]; showcase: boolean; onBack: () => void }) {
  const info = DEPARTMENT_BY_ID[id];
  const links = info.links.filter((l) => permissions.includes(l.permission));
  return (
    <div className="space-y-4">
      <div>
        <button type="button" onClick={onBack} className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-3.5" /> All departments
        </button>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{info.group}</p>
        <h2 className="text-lg font-semibold tracking-tight">{info.name}</h2>
        {snap && (
          <div className="mt-2 space-y-1.5">
            <StatusPill status={snap.status} running={snap.activity === "running"} />
            <p className="text-sm">{snap.statusText}</p>
          </div>
        )}
      </div>
      <div className="rounded-lg bg-muted/60 p-3 text-sm">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">What happens here</div>
        <p className="mt-1">{info.whatHappens}</p>
      </div>
      {snap && snap.metrics.length > 0 && (
        <dl className="grid grid-cols-2 gap-2">
          {snap.metrics.map((m, i) => (
            <div key={i} className="rounded-lg border p-2.5">
              <dt className="truncate text-[11px] text-muted-foreground" title={m.label}>{m.label}</dt>
              <dd className={cn("tabular mt-0.5 text-sm font-semibold", m.tone && TONE_TEXT[m.tone])}>{m.value}</dd>
              {m.hint && <dd className="mt-0.5 text-[11px] text-muted-foreground">{m.hint}</dd>}
            </div>
          ))}
        </dl>
      )}
      {snap?.visual.gauges && snap.visual.gauges.length > 0 && (
        <div>
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Stock levels</div>
          <ul className="space-y-2">
            {snap.visual.gauges.map((g) => (
              <li key={g.label} className="text-xs">
                <div className="flex justify-between gap-2"><span className="font-medium">{g.label}</span><span className="text-muted-foreground">{STATUS_LABEL[g.status]}</span></div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${g.label}: ${g.text}`}>
                  <div className={cn("h-full rounded-full", DOT[g.status])} style={{ width: `${Math.round(g.ratio * 100)}%` }} />
                </div>
                <div className="mt-0.5 text-muted-foreground">{g.text}</div>
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-[11px] text-muted-foreground">Bars and 3D gauges are full at three times the reorder level.</p>
        </div>
      )}
      {snap?.visual.unitLabel && <p className="text-[11px] text-muted-foreground">3D scale: {snap.visual.unitLabel}. {snap.visual.units ?? 0} shown.</p>}
      {snap?.tables.map((t) => (
        <div key={t.title}>
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t.title}</div>
          {t.rows.length ? (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-xs">
                <thead className="bg-muted/60 text-left text-muted-foreground">
                  <tr>{t.columns.map((c) => <th key={c} scope="col" className="whitespace-nowrap px-2 py-1.5 font-medium">{c}</th>)}</tr>
                </thead>
                <tbody>
                  {t.rows.map((r, i) => (
                    <tr key={i} className="border-t">
                      {r.map((c, j) => <td key={j} className="whitespace-nowrap px-2 py-1.5 tabular">{c}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="text-xs text-muted-foreground">{t.empty ?? "Nothing to show"}</p>}
        </div>
      ))}
      <p className="text-[11px] text-muted-foreground"><span className="font-medium">Data source:</span> {info.dataSource}</p>
      {showcase ? (
        <Button asChild variant="brand" className="w-full"><Link href="/login?next=/factory">Sign in to see live data</Link></Button>
      ) : links.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {links.map((l) => <Button key={l.href} asChild size="sm" variant="outline"><Link href={l.href}>{l.label}</Link></Button>)}
        </div>
      ) : null}
    </div>
  );
}

export function FactoryTwin({
  initial,
  mode = "live",
  permissions = [],
  className,
  viewportClassName,
}: {
  initial: FactorySnapshot | null;
  mode?: "live" | "showcase";
  permissions?: string[];
  className?: string;
  viewportClassName?: string;
}) {
  const showcase = mode === "showcase";
  const wrapRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<FactoryScene | null>(null);
  const [snapshot, setSnapshot] = useState<FactorySnapshot | null>(initial);
  const [selected, setSelected] = useState<DepartmentId | null>(null);
  const [render, setRender] = useState<"pending" | "3d" | "2d">("pending");
  const [loading, setLoading] = useState(true);
  const [sceneError, setSceneError] = useState(false);
  const [syncError, setSyncError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [lighting, setLighting] = useState<"day" | "night">("day");
  const [freeCam, setFreeCam] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [tour, setTour] = useState<{ index: number; playing: boolean } | null>(null);
  const reduced = useMemo(() => (typeof window === "undefined" ? false : prefersReducedMotion()), []);

  useEffect(() => {
    setRender(hasWebGL() ? "3d" : "2d");
  }, []);

  // Build the 3D scene lazily (Three.js is code-split out of the main bundle).
  useEffect(() => {
    if (render !== "3d" || !stageRef.current) return;
    let disposed = false;
    let ro: ResizeObserver | null = null;
    let io: IntersectionObserver | null = null;
    const onVisibility = () => (document.hidden ? sceneRef.current?.stop() : sceneRef.current?.start());
    import("./factory-scene")
      .then(({ createFactoryScene }) => {
        if (disposed || !stageRef.current) return;
        const stage = stageRef.current;
        const scene = createFactoryScene(stage, { reducedMotion: prefersReducedMotion(), lowPower: isLowPower(), onSelect: setSelected });
        sceneRef.current = scene;
        if (showcase || !initial) scene.showcase();
        else scene.update(initial);
        ro = new ResizeObserver(() => scene.resize(stage.clientWidth, stage.clientHeight));
        ro.observe(stage);
        io = new IntersectionObserver(([e]) => (e.isIntersecting && !document.hidden ? scene.start() : scene.stop()));
        io.observe(stage);
        document.addEventListener("visibilitychange", onVisibility);
        setLoading(false);
      })
      .catch((e) => {
        console.error("[factory] 3D scene failed", e);
        setSceneError(true);
        setRender("2d");
        setLoading(false);
      });
    return () => {
      disposed = true;
      ro?.disconnect();
      io?.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      sceneRef.current?.dispose();
      sceneRef.current = null;
    };
    // The scene is created once; data updates flow through `update` below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [render, showcase]);

  // Live data: poll the ERP snapshot and push it into the scene.
  const refresh = useCallback(async () => {
    if (showcase) return;
    setRefreshing(true);
    try {
      const res = await fetch("/api/factory", { cache: "no-store", credentials: "same-origin" });
      if (!res.ok) throw new Error(String(res.status));
      const next = (await res.json()) as FactorySnapshot;
      setSnapshot(next);
      setSyncError(false);
    } catch {
      setSyncError(true);
    } finally {
      setRefreshing(false);
    }
  }, [showcase]);
  useEffect(() => {
    if (showcase) return;
    const t = setInterval(() => !document.hidden && refresh(), POLL_MS);
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(t);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh, showcase]);
  useEffect(() => {
    if (snapshot && !showcase) sceneRef.current?.update(snapshot);
  }, [snapshot, showcase, loading]);

  const select = useCallback((id: DepartmentId | null) => {
    if (sceneRef.current) sceneRef.current.select(id, true);
    else setSelected(id);
  }, []);

  // Guided tour: steps through departments in material-flow order.
  useEffect(() => {
    if (!tour) return;
    select(TOUR_ORDER[tour.index]);
    if (!tour.playing || reduced) return;
    const t = setTimeout(() => setTour((x) => (x ? (x.index + 1 < TOUR_ORDER.length ? { ...x, index: x.index + 1 } : { ...x, playing: false }) : x)), TOUR_STEP_MS);
    return () => clearTimeout(t);
  }, [tour, select, reduced]);

  useEffect(() => {
    const onFs = () => {
      setFullscreen(document.fullscreenElement === wrapRef.current);
      setTimeout(() => stageRef.current && sceneRef.current?.resize(stageRef.current.clientWidth, stageRef.current.clientHeight), 50);
    };
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else wrapRef.current?.requestFullscreen?.().catch(() => undefined);
  };

  const stepTour = (delta: number) => setTour((x) => (x ? { index: Math.min(TOUR_ORDER.length - 1, Math.max(0, x.index + delta)), playing: x.playing } : x));
  const tourDept = tour ? DEPARTMENT_BY_ID[TOUR_ORDER[tour.index]] : null;

  return (
    <div
      ref={wrapRef}
      className={cn("grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]", fullscreen && "h-dvh gap-0 bg-background lg:grid-cols-[minmax(0,1fr)_400px]", className)}
      onKeyDown={(e) => {
        if (e.key === "Escape" && selected && !document.fullscreenElement) select(null);
      }}
    >
      <div className={cn("relative overflow-hidden rounded-xl border bg-[#d7dde3] dark:bg-[#0b0d10]", fullscreen && "rounded-none border-0", viewportClassName ?? "h-[58svh] min-h-[360px] lg:h-[calc(100dvh-190px)] lg:min-h-[520px]", fullscreen && "h-full lg:h-full")}>
        {render === "3d" && (
          <div
            ref={stageRef}
            tabIndex={0}
            aria-label="3D factory view. Drag to rotate, scroll or pinch to zoom, right-drag to pan. Department labels are buttons. In free camera mode use W, A, S, D to move."
            className="absolute inset-0 cursor-grab outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring active:cursor-grabbing"
          />
        )}
        {render === "2d" && (
          <div className="absolute inset-0 overflow-y-auto bg-card p-4">
            <p className="mb-3 text-sm text-muted-foreground">{sceneError ? "The 3D view could not start on this device." : "This browser does not support WebGL, so the factory is shown as a list."} Every department and its live status is below.</p>
            <DepartmentList snapshot={showcase ? null : snapshot} selected={selected} onSelect={(id) => select(id)} />
          </div>
        )}
        {render !== "2d" && loading && (
          <div className="absolute inset-0 grid place-items-center text-sm text-zinc-600 dark:text-zinc-300" role="status">
            <span className="inline-flex items-center gap-2"><Loader2 className="size-4 animate-spin" /> Loading the 3D factory…</span>
          </div>
        )}

        {/* Toolbar */}
        {render === "3d" && !loading && (
          <div className="absolute left-2 top-2 flex flex-wrap gap-1.5" role="toolbar" aria-label="3D view controls">
            <ToolButton label="Reset camera" onClick={() => { setTour(null); sceneRef.current?.resetView(); select(null); }}><RotateCcw /></ToolButton>
            <ToolButton label={tour ? "Stop tour" : "Guided tour"} pressed={!!tour} onClick={() => setTour((t) => (t ? null : { index: 0, playing: !reduced }))}>{tour ? <X /> : <Route />}<span className="hidden sm:inline">{tour ? "Stop tour" : "Guided tour"}</span></ToolButton>
            <ToolButton label={freeCam ? "Free camera on (WASD to move)" : "Free camera"} pressed={freeCam} onClick={() => { const v = !freeCam; setFreeCam(v); sceneRef.current?.setFreeCamera(v); }}><Move3d /><span className="hidden md:inline">{freeCam ? "Free camera: WASD" : "Free camera"}</span></ToolButton>
            <ToolButton label={lighting === "day" ? "Night lighting" : "Day lighting"} onClick={() => { const v = lighting === "day" ? "night" : "day"; setLighting(v); sceneRef.current?.setLighting(v); }}>{lighting === "day" ? <Moon /> : <Sun />}</ToolButton>
            <ToolButton label={fullscreen ? "Exit full screen" : "Full screen"} onClick={toggleFullscreen}>{fullscreen ? <Minimize /> : <Expand />}</ToolButton>
          </div>
        )}
        {render === "3d" && !loading && !tour && (
          <div className="pointer-events-none absolute bottom-2 left-2 right-2 flex flex-wrap items-end justify-between gap-2">
            <div className="rounded-md bg-white/85 px-2 py-1 text-zinc-800 shadow-sm dark:bg-zinc-900/85 dark:text-zinc-100">
              {showcase ? <span className="text-[11px]">Illustration · stock shown is not live data</span> : <Legend />}
            </div>
            <div className="hidden rounded-md bg-white/85 px-2 py-1 text-[11px] text-zinc-600 shadow-sm sm:block dark:bg-zinc-900/85 dark:text-zinc-300">Drag to rotate · scroll to zoom · right-drag to pan · click a department</div>
          </div>
        )}
        {tour && tourDept && (
          <div className="absolute inset-x-2 bottom-2 rounded-lg border bg-card/95 p-3 shadow-lg backdrop-blur" role="region" aria-label="Guided tour" aria-live="polite">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[11px] font-medium text-muted-foreground">Guided tour · step {tour.index + 1} of {TOUR_ORDER.length}</div>
                <div className="text-sm font-semibold">{tourDept.name}</div>
                <p className="mt-0.5 line-clamp-3 text-xs text-muted-foreground sm:line-clamp-2">{tourDept.whatHappens}</p>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button size="icon" variant="outline" className="size-8" onClick={() => stepTour(-1)} disabled={tour.index === 0} aria-label="Previous department"><ChevronLeft /></Button>
                {!reduced && <Button size="icon" variant="outline" className="size-8" onClick={() => setTour((x) => (x ? { ...x, playing: !x.playing } : x))} aria-label={tour.playing ? "Pause tour" : "Play tour"}>{tour.playing ? <Pause /> : <Play />}</Button>}
                <Button size="icon" variant="outline" className="size-8" onClick={() => stepTour(1)} disabled={tour.index === TOUR_ORDER.length - 1} aria-label="Next department"><ChevronRight /></Button>
              </div>
            </div>
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted"><div className="h-full bg-brand transition-all" style={{ width: `${((tour.index + 1) / TOUR_ORDER.length) * 100}%` }} /></div>
          </div>
        )}
      </div>

      <aside className={cn("min-w-0 rounded-xl border bg-card", fullscreen ? "overflow-y-auto rounded-none border-0 border-l p-4" : "p-4 lg:max-h-[calc(100dvh-190px)] lg:overflow-y-auto")} aria-label="Department information">
        {!showcase && (
          <div className="mb-4 flex items-center justify-between gap-2 border-b pb-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5" aria-live="polite">
              <span className={cn("size-2 rounded-full", syncError ? "bg-red-500" : "bg-green-500")} aria-hidden="true" />
              {syncError ? `Connection lost; showing data from ${snapshot ? timeOf(snapshot.generatedAt) : "—"}` : snapshot ? `Live from the ERP database · ${timeOf(snapshot.generatedAt)}` : "No data"}
            </span>
            <Button size="sm" variant="ghost" onClick={refresh} disabled={refreshing} aria-label="Refresh now"><RefreshCw className={cn(refreshing && "animate-spin")} /></Button>
          </div>
        )}
        {selected ? (
          <DepartmentDetail id={selected} snap={showcase ? undefined : snapshot?.departments[selected]} permissions={permissions} showcase={showcase} onBack={() => { setTour(null); select(null); }} />
        ) : (
          <>
            <div className="mb-3">
              <h2 className="text-sm font-semibold">{showcase ? "13 departments, raw material to truck" : "Factory departments"}</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">{showcase ? "Select a department to learn what happens there and which ERP records drive it." : `Select a department for live figures. Variance tolerance ±${Number(snapshot?.tolerancePct ?? 3).toFixed(0)}%. ${snapshot?.activeRuns ? `${snapshot.activeRuns} run(s) in progress.` : "No production run in progress."}`}</p>
            </div>
            <DepartmentList snapshot={showcase ? null : snapshot} selected={selected} onSelect={(id) => select(id)} />
          </>
        )}
      </aside>
    </div>
  );
}

function ToolButton({ label, pressed, onClick, children }: { label: string; pressed?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-md border border-black/10 bg-white/90 px-2 text-xs font-medium text-zinc-800 shadow-sm backdrop-blur transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:border-white/10 dark:bg-zinc-900/90 dark:text-zinc-100 dark:hover:bg-zinc-800 [&_svg]:size-4",
        pressed && "border-amber-500 bg-amber-50 text-amber-900 dark:bg-amber-500/15 dark:text-amber-200",
      )}
    >
      {children}
    </button>
  );
}
