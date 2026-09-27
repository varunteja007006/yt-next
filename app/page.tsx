"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ChevronDown,
  Download,
  ExternalLink,
  ListFilter,
  RotateCw,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const STORAGE_KEY = "yt-next:upload";

type VideoMetadata = {
  id: string;
  title: string;
  channel: string;
  publishedAt: string;
  duration: number | null;
  viewCount: number | null;
  thumbnail: string;
  artist: string | null;
  album: string | null;
  url: string;
};

type ApiResult = {
  videos: VideoMetadata[];
  notFound: string[];
  invalid: string[];
  uniqueIds: number;
};

type VideoFormatInfo = {
  itag: string;
  kind: "audio" | "video" | "muxed";
  ext: string;
  label: string;
  height: number | null;
  fps: number | null;
  tbr: number | null;
  sizeBytes: number | null;
  approx: boolean;
};

type DownloadEntry = {
  formatKey: string;
  label: string;
  status: "queued" | "in_progress" | "done" | "failed";
  file?: string;
  sizeBytes?: number;
  error?: string;
};

type DownloadRegistry = Record<string, Record<string, DownloadEntry>>;

function formatDuration(seconds: number | null): string {
  if (seconds === null) return "-";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

function formatCount(n: number | null): string {
  if (n === null) return "-";
  return new Intl.NumberFormat("en-US", { notation: "compact" }).format(n);
}

function formatSize(bytes: number | null, approx: boolean): string {
  if (bytes === null) return "?";
  const mb = bytes / 1e6;
  return `${approx ? "~" : ""}${mb >= 1024 ? (mb / 1024).toFixed(2) + " GB" : mb.toFixed(1) + " MB"}`;
}

function formatFormatSize(
  f: VideoFormatInfo,
  durationSeconds: number | null,
): string {
  if (f.sizeBytes !== null) return formatSize(f.sizeBytes, f.approx);
  if (f.tbr && durationSeconds)
    return formatSize(f.tbr * 125 * durationSeconds, true);
  return "?";
}

function formatKeyFor(itag: string): string {
  return `itag-${itag}`;
}

function FormatPanel({
  video,
  formats,
  loading,
  error,
  entries,
  onDownload,
}: {
  video: VideoMetadata;
  formats?: VideoFormatInfo[];
  loading: boolean;
  error?: string;
  entries: Record<string, DownloadEntry>;
  onDownload: (
    videoId: string,
    mode: string,
    itag?: string,
    label?: string,
  ) => void;
}) {
  const audioFormats = (formats ?? []).filter((f) => f.kind === "audio");
  const videoFormats = (formats ?? []).filter(
    (f) => f.kind !== "audio" && (f.height ?? 0) > 0,
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          onClick={() =>
            onDownload(
              video.id,
              "video-best",
              undefined,
              "Best video (max quality)",
            )
          }
          disabled={
            entries["video-best"]?.status === "done" ||
            entries["video-best"]?.status === "in_progress"
          }
        >
          <Download className="size-3.5" />
          {entries["video-best"]?.status === "done"
            ? `Video ✓ ${formatSize(entries["video-best"].sizeBytes ?? null, false)}`
            : entries["video-best"]
              ? "Downloading…"
              : "Best video (max)"}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() =>
            onDownload(video.id, "audio-best", undefined, "Best audio")
          }
          disabled={
            entries["audio-best"]?.status === "done" ||
            entries["audio-best"]?.status === "in_progress"
          }
        >
          <Download className="size-3.5" />
          {entries["audio-best"]?.status === "done"
            ? `Audio ✓ ${formatSize(entries["audio-best"].sizeBytes ?? null, false)}`
            : entries["audio-best"]
              ? "Downloading…"
              : "Best audio"}
        </Button>
        <span className="text-xs text-slate-500">
          Saved to <code>downloads/{video.id}/</code>
        </span>
      </div>

      {loading && <p className="text-sm text-slate-400">Loading formats…</p>}
      {error && <p className="text-sm text-rose-300">{error}</p>}

      {formats && formats.length === 0 && (
        <p className="text-sm text-slate-400">No downloadable formats found.</p>
      )}

      {videoFormats.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">
            Video
          </p>
          <div className="flex flex-wrap gap-1.5">
            {videoFormats.map((f) => {
              const entry = entries[formatKeyFor(f.itag)];
              const busy =
                entry?.status === "in_progress" || entry?.status === "queued";
              return (
                <button
                  key={f.itag}
                  disabled={busy || entry?.status === "done"}
                  onClick={() =>
                    onDownload(
                      video.id,
                      f.kind === "muxed" ? "muxed-itag" : "video-only-itag",
                      f.itag,
                      `${f.label} ${f.ext.toUpperCase()}`,
                    )
                  }
                  title={entry?.error}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs transition-colors ${
                    entry?.status === "done"
                      ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-200"
                      : busy
                        ? "border-red-500/40 bg-red-500/10 text-red-200"
                        : entry?.status === "failed"
                          ? "border-rose-400/40 bg-rose-400/10 text-rose-200 hover:bg-rose-400/20"
                          : "border-slate-700 bg-slate-950/40 text-slate-200 hover:border-slate-500 hover:bg-slate-800"
                  }`}
                >
                  {entry?.status === "failed" && (
                    <RotateCw className="size-3" />
                  )}
                  <strong>{f.label}</strong>
                  <span className="text-slate-500">
                    {f.ext} · {formatFormatSize(f, video.duration)}
                    {f.fps && f.fps > 30 ? ` · ${f.fps}fps` : ""}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {audioFormats.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">
            Audio
          </p>
          <div className="flex flex-wrap gap-1.5">
            {audioFormats.map((f) => {
              const entry = entries[formatKeyFor(f.itag)];
              const busy =
                entry?.status === "in_progress" || entry?.status === "queued";
              return (
                <button
                  key={f.itag}
                  disabled={busy || entry?.status === "done"}
                  onClick={() =>
                    onDownload(video.id, "audio-itag", f.itag, f.label)
                  }
                  title={entry?.error}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs transition-colors ${
                    entry?.status === "done"
                      ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-200"
                      : busy
                         ? "border-red-500/40 bg-red-500/10 text-red-200"
                        : entry?.status === "failed"
                          ? "border-rose-400/40 bg-rose-400/10 text-rose-200 hover:bg-rose-400/20"
                          : "border-slate-700 bg-slate-950/40 text-slate-200 hover:border-slate-500 hover:bg-slate-800"
                  }`}
                >
                  {entry?.status === "failed" && (
                    <RotateCw className="size-3" />
                  )}
                  <strong>{f.label}</strong>
                  <span className="text-slate-500">
                    {f.ext} · {formatFormatSize(f, video.duration)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

type Filters = {
  query: string;
  channel: string;
  duration: "all" | "short" | "medium" | "long";
  minViews: string;
  musicOnly: boolean;
  status: "all" | "found" | "notFound";
  downloadedOnly: boolean;
};

const DEFAULT_FILTERS: Filters = {
  query: "",
  channel: "all",
  duration: "all",
  minViews: "",
  musicOnly: false,
  status: "all",
  downloadedOnly: false,
};

function durationBucket(seconds: number | null): "short" | "medium" | "long" {
  if (seconds === null) return "short";
  if (seconds < 300) return "short";
  if (seconds <= 1200) return "medium";
  return "long";
}

function applyFilters(
  videos: VideoMetadata[],
  notFound: string[],
  f: Filters,
  downloadedIds: Set<string>,
) {
  const q = f.query.trim().toLowerCase();
  const minViews = Number(f.minViews) || 0;

  const matchedVideos = videos.filter((v) => {
    if (
      q &&
      !`${v.title} ${v.channel} ${v.artist ?? ""} ${v.album ?? ""}`
        .toLowerCase()
        .includes(q)
    )
      return false;
    if (f.channel !== "all" && v.channel !== f.channel) return false;
    if (f.duration !== "all" && durationBucket(v.duration) !== f.duration)
      return false;
    if (minViews > 0 && (v.viewCount ?? 0) < minViews) return false;
    if (f.musicOnly && !v.artist) return false;
    if (f.status === "notFound") return false;
    if (f.downloadedOnly && !downloadedIds.has(v.id)) return false;
    return true;
  });

  const matchedNotFound =
    f.status === "found"
      ? []
      : notFound.filter((id) => q && id.toLowerCase().includes(q));

  return { matchedVideos, matchedNotFound };
}

export default function Home() {
  const [fileName, setFileName] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const loadingRef = useRef(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ApiResult | null>(null);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [registry, setRegistry] = useState<DownloadRegistry>({});
  const [formatsByVideo, setFormatsByVideo] = useState<
    Record<string, VideoFormatInfo[]>
  >({});
  const [formatsLoading, setFormatsLoading] = useState<Record<string, boolean>>(
    {},
  );
  const [formatsError, setFormatsError] = useState<Record<string, string>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const channels = useMemo(
    () =>
      result
        ? [
            ...new Set(result.videos.map((v) => v.channel).filter(Boolean)),
          ].sort()
        : [],
    [result],
  );

  const downloadedIds = useMemo(
    () =>
      new Set(
        Object.entries(registry)
          .filter(([, entries]) =>
            Object.values(entries).some((e) => e.status === "done"),
          )
          .map(([id]) => id),
      ),
    [registry],
  );

  const { matchedVideos, matchedNotFound } = useMemo(
    () =>
      result
        ? applyFilters(result.videos, result.notFound, filters, downloadedIds)
        : { matchedVideos: [], matchedNotFound: [] },
    [result, filters, downloadedIds],
  );

  function setFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((f) => ({ ...f, [key]: value }));
  }

  function isFiltered() {
    return JSON.stringify(filters) !== JSON.stringify(DEFAULT_FILTERS);
  }

  const refreshDownloads = useCallback(async () => {
    try {
      const res = await fetch("/api/downloads");
      if (res.ok) {
        const data = await res.json();
        setRegistry(data.downloads ?? {});
      }
    } catch {
      // ignore transient polling errors
    }
  }, []);

  useEffect(() => {
    if (!result) return;
    const initial = setTimeout(refreshDownloads, 0);
    const interval = setInterval(refreshDownloads, 3000);
    return () => {
      clearTimeout(initial);
      clearInterval(interval);
    };
  }, [result, refreshDownloads]);

  async function toggleFormats(videoId: string) {
    if (expandedId === videoId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(videoId);
    if (formatsByVideo[videoId] || formatsLoading[videoId]) return;

    setFormatsLoading((s) => ({ ...s, [videoId]: true }));
    try {
      const res = await fetch(`/api/formats?videoId=${videoId}`);
      const data = await res.json();
      if (!res.ok) {
        setFormatsError((s) => ({
          ...s,
          [videoId]: data?.error ?? `Failed (${res.status})`,
        }));
      } else {
        setFormatsByVideo((s) => ({ ...s, [videoId]: data.formats ?? [] }));
      }
    } catch {
      setFormatsError((s) => ({ ...s, [videoId]: "Network error" }));
    } finally {
      setFormatsLoading((s) => ({ ...s, [videoId]: false }));
    }
  }

  async function requestDownload(
    videoId: string,
    mode: string,
    itag?: string,
    label?: string,
  ) {
    try {
      const res = await fetch("/api/downloads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId, mode, itag, label }),
      });
      const data = await res.json();
      if (res.ok) {
        if (data.downloads) setRegistry(data.downloads);
        if (!data.skipped) refreshDownloads();
      }
    } catch {
      // entry stays queued in registry via polling
    }
  }

  async function loadCsv(
    csv: string,
    name: string,
    opts: { persist?: boolean; silent?: boolean } = {},
  ) {
    const { persist = true, silent = false } = opts;
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    if (!silent) {
      setError(null);
      setResult(null);
      setFilters(DEFAULT_FILTERS);
    }

    try {
      const res = await fetch("/api/metadata", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (!silent) setError(data?.error ?? `Request failed (${res.status})`);
      } else {
        setResult(data as ApiResult);
        if (persist) {
          try {
            await fetch("/api/library", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ name, csv }),
            });
          } catch {
            // persist failure — non-fatal
          }
        }
      }
    } catch {
      if (!silent)
        setError("Something went wrong. Check your connection and try again.");
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError("Choose a CSV file first");
      return;
    }
    const csv = await file.text();
    await loadCsv(csv, file.name);
  }

  function clearSaved() {
    fetch("/api/library", { method: "DELETE" }).catch(() => {});
    setResult(null);
    setFileName(null);
    setFilters(DEFAULT_FILTERS);
    setError(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  useEffect(() => {
    const timer = setTimeout(async () => {
      // Server-side library (SQLite) — shared across browsers and ports.
      try {
        const res = await fetch("/api/library");
        const data = await res.json();
        if (data.library?.csv) {
          const { name, csv } = data.library;
          setFileName(name ?? "saved library");
          loadCsv(csv, name, { persist: false, silent: true });
          return;
        }
      } catch {
        return;
      }

      // One-time migration from localStorage to the server DB.
      let raw: string | null = null;
      try {
        raw = localStorage.getItem(STORAGE_KEY);
      } catch {
        return;
      }
      if (!raw) return;
      try {
        const { name, csv } = JSON.parse(raw);
        if (typeof csv === "string" && csv.trim()) {
          setFileName(name ?? "saved upload");
          await fetch("/api/library", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, csv }),
          }).catch(() => {});
          localStorage.removeItem(STORAGE_KEY);
          loadCsv(csv, name, { persist: false, silent: true });
        }
      } catch {
        // corrupt saved data — ignore
      }
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="flex min-h-screen flex-col items-center bg-[#0f080b] px-3 py-5 sm:px-5 sm:py-8">
      <main className="w-full max-w-7xl">
        <header className="mb-4 flex items-center justify-between gap-4">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-red-400">
            Cliproom <span className="text-slate-600">/</span> local library
          </p>
          <p className="hidden text-xs text-slate-500 sm:block">CSV in, formats out</p>
        </header>

        <form
          onSubmit={handleSubmit}
          className="grid gap-3 rounded-xl border border-slate-800 bg-[#1b1015] p-3 shadow-xl shadow-black/20 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center sm:p-4"
        >
          <div className="sm:min-w-36">
            <p className="text-sm font-semibold text-slate-100">Load a library</p>
            <p className="text-xs text-slate-500">One video ID per CSV row</p>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
            className="block min-w-0 w-full cursor-pointer rounded-lg border border-dashed border-slate-700 bg-slate-950/40 p-1.5 text-xs text-slate-400 file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-red-500 file:px-2.5 file:py-1.5 file:text-xs file:font-bold file:text-white hover:border-red-400/60 hover:file:bg-red-400"
          />
          <div className="flex items-center gap-2 sm:justify-end">
            <Button type="submit" size="sm" disabled={loading}>
              {loading ? "Fetching…" : "Fetch metadata"}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={clearSaved} disabled={loading}>
              Reset
            </Button>
          </div>
          {fileName && (
            <p className="truncate text-xs text-slate-400 sm:col-start-2 sm:-mt-2">Loaded: {fileName}</p>
          )}
        </form>

        {error && (
          <p className="mt-4 rounded-xl border border-rose-400/30 bg-rose-400/10 p-4 text-sm text-rose-200">
            {error}
          </p>
        )}

        {result && (
          <section className="mt-5">
            <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 text-xs text-slate-400">
              <span>
                <strong className="text-slate-100">
                  {result.videos.length}
                </strong>{" "}
                videos loaded
              </span>
              <span>{result.uniqueIds} unique IDs in CSV</span>
              {result.notFound.length > 0 && (
                <span className="text-amber-300">
                  {result.notFound.length} not found
                </span>
              )}
              {result.invalid.length > 0 && (
                <span className="text-amber-300">
                  {result.invalid.length} invalid IDs skipped
                </span>
              )}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2 border-b border-slate-800 pb-3">
              <label className="relative min-w-0 flex-1 sm:max-w-lg">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
                <input
                  type="search"
                  aria-label="Search library"
                  placeholder="Search titles, channels, artists…"
                  value={filters.query}
                  onChange={(e) => setFilter("query", e.target.value)}
                  className="h-10 w-full rounded-lg border border-slate-700 bg-slate-950/70 pl-9 pr-3 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-red-500"
                />
              </label>
              <details className="filter-details group relative">
                <summary className="inline-flex h-10 cursor-pointer list-none items-center gap-1.5 rounded-lg border border-slate-700 px-3 text-xs font-semibold text-slate-300 hover:border-slate-500 hover:bg-slate-800 [&::-webkit-details-marker]:hidden">
                  <ListFilter className="size-3.5 text-red-400" />
                  Filters
                  {isFiltered() && <span className="rounded-full bg-red-500/15 px-1.5 text-red-200">active</span>}
                  <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" />
                </summary>
                <div className="filter-panel mt-2 flex flex-wrap items-center gap-2 border-t border-slate-800 pt-2">
                  <select value={filters.channel} onChange={(e) => setFilter("channel", e.target.value)} className="h-8 rounded-lg border border-slate-700 bg-slate-950/70 px-2 text-xs text-slate-100 outline-none focus:border-red-500">
                    <option value="all">All channels</option>
                    {channels.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <select value={filters.duration} onChange={(e) => setFilter("duration", e.target.value as Filters["duration"])} className="h-8 rounded-lg border border-slate-700 bg-slate-950/70 px-2 text-xs text-slate-100 outline-none focus:border-red-500">
                    <option value="all">Any duration</option>
                    <option value="short">&lt; 5 min</option>
                    <option value="medium">5 – 20 min</option>
                    <option value="long">&gt; 20 min</option>
                  </select>
                  <input type="number" min={0} placeholder="Min views" value={filters.minViews} onChange={(e) => setFilter("minViews", e.target.value)} className="no-spinner h-8 w-24 rounded-lg border border-slate-700 bg-slate-950/70 px-2 text-xs text-slate-100 outline-none placeholder:text-slate-500 focus:border-red-500" />
                  <select value={filters.status} onChange={(e) => setFilter("status", e.target.value as Filters["status"])} className="h-8 rounded-lg border border-slate-700 bg-slate-950/70 px-2 text-xs text-slate-100 outline-none focus:border-red-500">
                    <option value="all">All status</option>
                    <option value="found">Found only</option>
                    <option value="notFound">Not found only</option>
                  </select>
                  <label className="flex h-8 items-center gap-1.5 text-xs text-slate-400"><input type="checkbox" checked={filters.musicOnly} onChange={(e) => setFilter("musicOnly", e.target.checked)} className="size-3.5 accent-red-500" />Music only</label>
                  <label className="flex h-8 items-center gap-1.5 text-xs text-slate-400"><input type="checkbox" checked={filters.downloadedOnly} onChange={(e) => setFilter("downloadedOnly", e.target.checked)} className="size-3.5 accent-red-500" />Downloaded <span className="text-slate-500">({downloadedIds.size})</span></label>
                  {isFiltered() && <Button size="sm" variant="ghost" onClick={() => setFilters(DEFAULT_FILTERS)}>Clear</Button>}
                </div>
              </details>
            </div>

            <p className="mt-3 text-xs font-medium uppercase tracking-wide text-slate-500">
              Showing {matchedVideos.length + matchedNotFound.length} of{" "}
              {result.videos.length + result.notFound.length}
            </p>

            <div className="responsive-table mt-2 overflow-hidden rounded-xl border border-slate-800 bg-[#1b1015] shadow-xl shadow-black/10">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead className="bg-slate-950/70 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-medium">Video</th>
                    <th className="hidden px-3 py-2 font-medium lg:table-cell">Channel</th>
                    <th className="px-3 py-2 font-medium">Duration</th>
                    <th className="px-3 py-2 font-medium">Views</th>
                    <th className="hidden px-3 py-2 font-medium xl:table-cell">Published</th>
                    <th className="px-3 py-2 font-medium">YouTube</th>
                    <th className="px-3 py-2 font-medium">Download</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 bg-[#1b1015]">
                  {matchedVideos.map((v) => {
                    const entries = registry[v.id] ?? {};
                    const downloadedCount = Object.values(entries).filter(
                      (e) => e.status === "done",
                    ).length;
                    const activeCount = Object.values(entries).filter(
                      (e) =>
                        e.status === "queued" || e.status === "in_progress",
                    ).length;
                    const isExpanded = expandedId === v.id;
                    return (
                      <Fragment key={v.id}>
                        <tr
                          className={
                            isExpanded
                              ? "bg-slate-800/70"
                              : "hover:bg-slate-800/40"
                          }
                        >
                          <td className="max-w-md px-3 py-2">
                            <a
                              href={v.url}
                              target="_blank"
                              rel="noopener noreferrer"
                               className="group flex items-center gap-2"
                            >
                              {v.thumbnail && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={v.thumbnail}
                                  alt=""
                                   className="h-8 w-14 shrink-0 rounded object-cover"
                                />
                              )}
                               <span className="line-clamp-2 font-medium text-slate-100 group-hover:underline">
                                {v.title}
                                {v.artist && (
                                  <span className="ml-2 text-xs font-normal text-slate-500">
                                    {v.artist}
                                    {v.album ? ` — ${v.album}` : ""}
                                  </span>
                                )}
                              </span>
                            </a>
                          </td>
                          <td className="hidden px-3 py-2 text-slate-400 lg:table-cell">
                            {v.channel || "-"}
                          </td>
                          <td className="px-3 py-2 tabular-nums text-slate-400">
                            {formatDuration(v.duration)}
                          </td>
                          <td className="px-3 py-2 tabular-nums text-slate-400">
                            {formatCount(v.viewCount)}
                          </td>
                          <td className="hidden px-3 py-2 text-slate-400 xl:table-cell">
                            {v.publishedAt
                              ? new Date(v.publishedAt).toLocaleDateString()
                              : "-"}
                          </td>
                          <td className="px-3 py-2">
                            <a
                              href={v.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="Open on YouTube"
                              className="inline-flex text-slate-500 hover:text-slate-100"
                            >
                              <ExternalLink className="size-4" />
                            </a>
                          </td>
                          <td className="px-3 py-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => toggleFormats(v.id)}
                            >
                              <ChevronDown
                                className={`size-3.5 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                              />
                              Formats
                              {downloadedCount > 0 && (
                                <span className="ml-1 rounded-full bg-emerald-400/15 px-1.5 text-xs text-emerald-200">
                                  {downloadedCount}
                                  {activeCount > 0 ? ` +${activeCount}↓` : ""}
                                </span>
                              )}
                            </Button>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr className="bg-slate-950/40">
                            <td colSpan={7} className="px-4 py-3 sm:px-6">
                              <FormatPanel
                                video={v}
                                formats={formatsByVideo[v.id]}
                                loading={!!formatsLoading[v.id]}
                                error={formatsError[v.id]}
                                entries={entries}
                                onDownload={requestDownload}
                              />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                  {matchedNotFound.map((id) => (
                    <tr key={id} className="bg-amber-400/10">
                      <td className="px-3 py-2 text-amber-200">
                        Not found: <code>{id}</code>
                      </td>
                      <td colSpan={4} />
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
