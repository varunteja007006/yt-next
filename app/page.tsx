"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Download, ExternalLink, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";

const STORAGE_KEY = "yt-next:upload";

type VideoMetadata = {
  id: string;
  title: string;
  channel: string;
  publishedAt: string;
  duration: number | null;
  viewCount: number | null;
  likeCount: number | null;
  thumbnail: string;
  artist: string | null;
  album: string | null;
  url: string;
};

type ApiResult = {
  videos: VideoMetadata[];
  notFound: string[];
  invalid: string[];
  totalRows: number;
  uniqueIds: number;
};

type VideoFormatInfo = {
  itag: string;
  kind: "audio" | "video" | "muxed";
  ext: string;
  label: string;
  height: number | null;
  fps: number | null;
  abr: number | null;
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
  durationSeconds: number | null
): string {
  if (f.sizeBytes !== null) return formatSize(f.sizeBytes, f.approx);
  if (f.tbr && durationSeconds)
    return formatSize((f.tbr * 125 * durationSeconds), true);
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
    label?: string
  ) => void;
}) {
  const audioFormats = (formats ?? []).filter((f) => f.kind === "audio");
  const videoFormats = (formats ?? []).filter(
    (f) => f.kind !== "audio" && (f.height ?? 0) > 0
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          onClick={() => onDownload(video.id, "video-best", undefined, "Best video (max quality)")}
          disabled={entries["video-best"]?.status === "done" || entries["video-best"]?.status === "in_progress"}
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
          onClick={() => onDownload(video.id, "audio-best", undefined, "Best audio")}
          disabled={entries["audio-best"]?.status === "done" || entries["audio-best"]?.status === "in_progress"}
        >
          <Download className="size-3.5" />
          {entries["audio-best"]?.status === "done"
            ? `Audio ✓ ${formatSize(entries["audio-best"].sizeBytes ?? null, false)}`
            : entries["audio-best"]
              ? "Downloading…"
              : "Best audio"}
        </Button>
        <span className="text-xs text-zinc-500">
          Saved to <code>downloads/{video.id}/</code>
        </span>
      </div>

      {loading && <p className="text-sm text-zinc-500">Loading formats…</p>}
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      {formats && formats.length === 0 && (
        <p className="text-sm text-zinc-500">No downloadable formats found.</p>
      )}

      {videoFormats.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-500">
            Video
          </p>
          <div className="flex flex-wrap gap-1.5">
            {videoFormats.map((f) => {
              const entry = entries[formatKeyFor(f.itag)];
              const busy = entry?.status === "in_progress" || entry?.status === "queued";
              return (
                <button
                  key={f.itag}
                  disabled={busy || entry?.status === "done"}
                  onClick={() =>
                    onDownload(
                      video.id,
                      f.kind === "muxed" ? "muxed-itag" : "video-only-itag",
                      f.itag,
                      `${f.label} ${f.ext.toUpperCase()}`
                    )
                  }
                  title={entry?.error}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs transition-colors ${
                    entry?.status === "done"
                      ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400"
                      : busy
                        ? "border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-400"
                        : entry?.status === "failed"
                          ? "border-red-300 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-800 dark:bg-red-950 dark:text-red-400"
                          : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  }`}
                >
                  {entry?.status === "failed" && <RotateCw className="size-3" />}
                  <strong>{f.label}</strong>
                  <span className="text-zinc-500">
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
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-500">
            Audio
          </p>
          <div className="flex flex-wrap gap-1.5">
            {audioFormats.map((f) => {
              const entry = entries[formatKeyFor(f.itag)];
              const busy = entry?.status === "in_progress" || entry?.status === "queued";
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
                      ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400"
                      : busy
                        ? "border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-400"
                        : entry?.status === "failed"
                          ? "border-red-300 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-800 dark:bg-red-950 dark:text-red-400"
                          : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  }`}
                >
                  {entry?.status === "failed" && <RotateCw className="size-3" />}
                  <strong>{f.label}</strong>
                  <span className="text-zinc-500">
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
  downloadedIds: Set<string>
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
    {}
  );
  const [formatsError, setFormatsError] = useState<Record<string, string>>(
    {}
  );
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const channels = useMemo(
    () =>
      result
        ? [...new Set(result.videos.map((v) => v.channel).filter(Boolean))].sort()
        : [],
    [result]
  );

  const downloadedIds = useMemo(
    () =>
      new Set(
        Object.entries(registry)
          .filter(([, entries]) =>
            Object.values(entries).some((e) => e.status === "done")
          )
          .map(([id]) => id)
      ),
    [registry]
  );

  const { matchedVideos, matchedNotFound } = useMemo(
    () =>
      result
        ? applyFilters(result.videos, result.notFound, filters, downloadedIds)
        : { matchedVideos: [], matchedNotFound: [] },
    [result, filters, downloadedIds]
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
    label?: string
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
    opts: { persist?: boolean; silent?: boolean } = {}
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
            localStorage.setItem(STORAGE_KEY, JSON.stringify({ name, csv }));
          } catch {
            // storage full — non-fatal
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
    localStorage.removeItem(STORAGE_KEY);
    setResult(null);
    setFileName(null);
    setFilters(DEFAULT_FILTERS);
    setError(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  useEffect(() => {
    const timer = setTimeout(() => {
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
          loadCsv(csv, name, { persist: false, silent: true });
        }
      } catch {
        // corrupt saved data — ignore
      }
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="flex min-h-screen flex-col items-center bg-zinc-50 px-4 py-16 dark:bg-black">
      <main className="w-full max-w-5xl">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          YouTube Metadata Viewer
        </h1>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">
          Upload a CSV of video IDs to fetch and browse their metadata.
        </p>

        <form
          onSubmit={handleSubmit}
          className="mt-8 flex flex-col gap-4 rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950"
        >
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
            className="block w-full cursor-pointer text-sm text-zinc-600 file:mr-4 file:cursor-pointer file:rounded-lg file:border-0 file:bg-zinc-900 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-zinc-700 dark:text-zinc-400 dark:file:bg-zinc-100 dark:file:text-zinc-900"
          />
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={loading}>
              {loading ? "Fetching metadata…" : "Fetch metadata"}
            </Button>
            {fileName && (
              <span className="text-sm text-zinc-500">{fileName}</span>
            )}
            <Button
              type="button"
              variant="ghost"
              onClick={clearSaved}
              disabled={loading}
            >
              Reset
            </Button>
          </div>
        </form>

        {error && (
          <p className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-400">
            {error}
          </p>
        )}

        {result && (
          <section className="mt-8">
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-zinc-600 dark:text-zinc-400">
              <span>
                <strong className="text-zinc-900 dark:text-zinc-100">
                  {result.videos.length}
                </strong>{" "}
                videos loaded
              </span>
              <span>{result.uniqueIds} unique IDs in CSV</span>
              {result.notFound.length > 0 && (
                <span className="text-amber-600 dark:text-amber-400">
                  {result.notFound.length} not found
                </span>
              )}
              {result.invalid.length > 0 && (
                <span className="text-amber-600 dark:text-amber-400">
                  {result.invalid.length} invalid IDs skipped
                </span>
              )}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <input
                type="search"
                placeholder="Search title, channel, artist…"
                value={filters.query}
                onChange={(e) => setFilter("query", e.target.value)}
                className="h-9 w-56 rounded-lg border border-zinc-300 bg-white px-3 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              />
              <select
                value={filters.channel}
                onChange={(e) => setFilter("channel", e.target.value)}
                className="h-9 rounded-lg border border-zinc-300 bg-white px-2 text-sm outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              >
                <option value="all">All channels</option>
                {channels.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <select
                value={filters.duration}
                onChange={(e) =>
                  setFilter("duration", e.target.value as Filters["duration"])
                }
                className="h-9 rounded-lg border border-zinc-300 bg-white px-2 text-sm outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              >
                <option value="all">Any duration</option>
                <option value="short">&lt; 5 min</option>
                <option value="medium">5 – 20 min</option>
                <option value="long">&gt; 20 min</option>
              </select>
              <input
                type="number"
                min={0}
                placeholder="Min views"
                value={filters.minViews}
                onChange={(e) => setFilter("minViews", e.target.value)}
                className="h-9 w-28 rounded-lg border border-zinc-300 bg-white px-3 text-sm outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              />
              <select
                value={filters.status}
                onChange={(e) =>
                  setFilter("status", e.target.value as Filters["status"])
                }
                className="h-9 rounded-lg border border-zinc-300 bg-white px-2 text-sm outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              >
                <option value="all">All status</option>
                <option value="found">Found only</option>
                <option value="notFound">Not found only</option>
              </select>
              <label className="flex h-9 items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
                <input
                  type="checkbox"
                  checked={filters.musicOnly}
                  onChange={(e) => setFilter("musicOnly", e.target.checked)}
                  className="size-4 accent-zinc-900 dark:accent-zinc-100"
                />
                Music only
              </label>
              <label className="flex h-9 items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
                <input
                  type="checkbox"
                  checked={filters.downloadedOnly}
                  onChange={(e) => setFilter("downloadedOnly", e.target.checked)}
                  className="size-4 accent-zinc-900 dark:accent-zinc-100"
                />
                Downloaded
                <span className="text-zinc-400">({downloadedIds.size})</span>
              </label>
              {isFiltered() && (
                <Button variant="ghost" onClick={() => setFilters(DEFAULT_FILTERS)}>
                  Clear
                </Button>
              )}
            </div>

            <p className="mt-2 text-sm text-zinc-500">
              Showing {matchedVideos.length + matchedNotFound.length} of{" "}
              {result.videos.length + result.notFound.length}
            </p>

            <div className="mt-2 overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
              <table className="w-full text-left text-sm">
                <thead className="bg-zinc-100 text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900">
                  <tr>
                    <th className="px-4 py-3 font-medium">Video</th>
                    <th className="px-4 py-3 font-medium">Channel</th>
                    <th className="px-4 py-3 font-medium">Duration</th>
                    <th className="px-4 py-3 font-medium">Views</th>
                    <th className="px-4 py-3 font-medium">Published</th>
                    <th className="px-4 py-3 font-medium">YouTube</th>
                    <th className="px-4 py-3 font-medium">Download</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 bg-white dark:divide-zinc-800 dark:bg-zinc-950">
                  {matchedVideos.map((v) => {
                    const entries = registry[v.id] ?? {};
                    const downloadedCount = Object.values(entries).filter(
                      (e) => e.status === "done"
                    ).length;
                    const activeCount = Object.values(entries).filter(
                      (e) => e.status === "queued" || e.status === "in_progress"
                    ).length;
                    const isExpanded = expandedId === v.id;
                    return (
                      <Fragment key={v.id}>
                        <tr
                          className={
                            isExpanded
                              ? "bg-zinc-50 dark:bg-zinc-900"
                              : "hover:bg-zinc-50 dark:hover:bg-zinc-900"
                          }
                        >
                          <td className="max-w-md px-4 py-3">
                            <a
                              href={v.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-3 group"
                            >
                              {v.thumbnail && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={v.thumbnail}
                                  alt=""
                                  className="h-9 w-16 shrink-0 rounded object-cover"
                                />
                              )}
                              <span className="font-medium text-zinc-900 group-hover:underline dark:text-zinc-100">
                                {v.title}
                                {v.artist && (
                                  <span className="ml-2 text-xs font-normal text-zinc-500 dark:text-zinc-400">
                                    {v.artist}
                                    {v.album ? ` — ${v.album}` : ""}
                                  </span>
                                )}
                              </span>
                            </a>
                          </td>
                          <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                            {v.channel || "-"}
                          </td>
                          <td className="px-4 py-3 tabular-nums text-zinc-600 dark:text-zinc-400">
                            {formatDuration(v.duration)}
                          </td>
                          <td className="px-4 py-3 tabular-nums text-zinc-600 dark:text-zinc-400">
                            {formatCount(v.viewCount)}
                          </td>
                          <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                            {v.publishedAt
                              ? new Date(v.publishedAt).toLocaleDateString()
                              : "-"}
                          </td>
                          <td className="px-4 py-3">
                            <a
                              href={v.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="Open on YouTube"
                              className="inline-flex text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                            >
                              <ExternalLink className="size-4" />
                            </a>
                          </td>
                          <td className="px-4 py-3">
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
                                <span className="ml-1 rounded-full bg-emerald-100 px-1.5 text-xs text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-400">
                                  {downloadedCount}
                                  {activeCount > 0 ? ` +${activeCount}↓` : ""}
                                </span>
                              )}
                            </Button>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr className="bg-zinc-50 dark:bg-zinc-900/60">
                            <td colSpan={7} className="px-8 py-4">
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
                    <tr key={id} className="bg-amber-50 dark:bg-amber-950/30">
                      <td className="px-4 py-3 text-amber-700 dark:text-amber-400">
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
