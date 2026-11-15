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
  AArrowDown,
  AArrowUp,
  Archive,
  Check,
  ChevronDown,
  Download,
  ExternalLink,
  ListFilter,
  Loader2,
  Music,
  Play,
  RotateCcw,
  RotateCw,
  Search,
  Trash2,
  Video,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { VIDEO_ID_RE } from "@/lib/csv";
import { resolveBestFormat } from "@/lib/best-format";
import type { DownloadEntry, DownloadRegistry } from "@/lib/downloads";
import type { VideoFormatInfo } from "@/lib/formats";

const STORAGE_KEY = "yt-next:upload";
const FONT_SCALE_MIN = 0.75;
const FONT_SCALE_MAX = 1.5;
const FONT_SCALE_STEP = 0.125;
const FONT_SCALE_DEFAULT = 1;
const PAGE_SIZE_OPTIONS = [25, 50, 100];
const PAGE_SIZE_DEFAULT = 50;
const PAGE_URL_PARAM = "page";
const PAGE_SIZE_URL_PARAM = "pageSize";

function clampFontScale(value: number): number {
  const steps = Math.round(value / FONT_SCALE_STEP);
  const snapped = steps * FONT_SCALE_STEP;
  return Math.min(FONT_SCALE_MAX, Math.max(FONT_SCALE_MIN, snapped));
}

// Initial pagination state comes from the URL so a refresh (or a shared
// link) reopens the library on the same page. On the server these fall back
// to the defaults; the client hydrates with them too because `result` is
// always null on first render, so the URL-derived values never change the
// initial markup.
function readUrlPage(): number {
  if (typeof window === "undefined") return 1;
  const value = Number(
    new URLSearchParams(window.location.search).get(PAGE_URL_PARAM),
  );
  return Number.isInteger(value) && value >= 1 ? value : 1;
}

function readUrlPageSize(): number {
  if (typeof window === "undefined") return PAGE_SIZE_DEFAULT;
  const value = Number(
    new URLSearchParams(window.location.search).get(PAGE_SIZE_URL_PARAM),
  );
  return PAGE_SIZE_OPTIONS.includes(value) ? value : PAGE_SIZE_DEFAULT;
}

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

// Client-side key for a download request that is still in flight, before
// the registry poll reflects it. itag requests key on the itag; best modes
// key on the mode because the server resolves the itag.
function downloadKey(videoId: string, mode: string, itag?: string): string {
  return itag ? `${videoId}:itag-${itag}` : `${videoId}:${mode}`;
}

function FormatPanel({
  video,
  formats,
  loading,
  error,
  entries,
  pending,
  onDownload,
}: {
  video: VideoMetadata;
  formats?: VideoFormatInfo[];
  loading: boolean;
  error?: string;
  entries: Record<string, DownloadEntry>;
  pending: Set<string>;
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

  // Best-mode requests are registered server-side under the resolved itag
  // key, so look the entry up the same way (falling back to the legacy
  // mode-named key while formats are unknown or resolution failed).
  const bestEntry = (
    mode: "video-best" | "audio-best",
  ): DownloadEntry | undefined => {
    if (formats) {
      const resolved = resolveBestFormat(mode, formats);
      if (resolved) return entries[formatKeyFor(resolved.itag)] ?? entries[mode];
    }
    return entries[mode];
  };
  const bestVideoEntry = bestEntry("video-best");
  const bestAudioEntry = bestEntry("audio-best");
  const bestVideoPending = pending.has(`${video.id}:video-best`);
  const bestAudioPending = pending.has(`${video.id}:audio-best`);

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
            bestVideoEntry?.status === "done" ||
            bestVideoEntry?.status === "in_progress" ||
            bestVideoPending
          }
        >
          {bestVideoPending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Download className="size-3.5" />
          )}
          {bestVideoEntry?.status === "done"
            ? `Video ✓ ${formatSize(bestVideoEntry.sizeBytes ?? null, false)}`
            : bestVideoPending
              ? "Starting…"
              : bestVideoEntry
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
            bestAudioEntry?.status === "done" ||
            bestAudioEntry?.status === "in_progress" ||
            bestAudioPending
          }
        >
          {bestAudioPending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Download className="size-3.5" />
          )}
          {bestAudioEntry?.status === "done"
            ? `Audio ✓ ${formatSize(bestAudioEntry.sizeBytes ?? null, false)}`
            : bestAudioPending
              ? "Starting…"
              : bestAudioEntry
                ? "Downloading…"
                : "Best audio"}
        </Button>
        <span className="text-xs text-slate-500">
          Saved to <code>downloads/{video.id}/</code>
        </span>
      </div>

      {loading && (
        <div className="flex flex-col gap-4">
          {[0, 1].map((group) => (
            <div key={group}>
              <p className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">
                {group === 0 ? "Video" : "Audio"}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {Array.from({ length: group === 0 ? 4 : 3 }, (_, i) => (
                  <div
                    key={i}
                    className={`h-6 animate-pulse rounded-lg bg-slate-800 ${
                      group === 0
                        ? i % 2
                          ? "w-20"
                          : "w-24"
                        : i % 2
                          ? "w-16"
                          : "w-20"
                    }`}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
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
              const pendingDownload = pending.has(
                downloadKey(video.id, "", f.itag),
              );
              const busy =
                pendingDownload ||
                entry?.status === "in_progress" ||
                entry?.status === "queued";
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
                  {entry?.status === "failed" &&
                    (pendingDownload ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <RotateCw className="size-3" />
                    ))}
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
              const pendingDownload = pending.has(
                downloadKey(video.id, "", f.itag),
              );
              const busy =
                pendingDownload ||
                entry?.status === "in_progress" ||
                entry?.status === "queued";
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
                  {entry?.status === "failed" &&
                    (pendingDownload ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <RotateCw className="size-3" />
                    ))}
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
  const [mergeNote, setMergeNote] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const loadingRef = useRef(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ApiResult | null>(null);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [page, setPage] = useState(readUrlPage);
  const [pageSize, setPageSize] = useState(readUrlPageSize);
  const [registry, setRegistry] = useState<DownloadRegistry>({});
  const [formatsByVideo, setFormatsByVideo] = useState<
    Record<string, VideoFormatInfo[]>
  >({});
  const [formatsLoading, setFormatsLoading] = useState<Record<string, boolean>>(
    {},
  );
  const [formatsError, setFormatsError] = useState<Record<string, string>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batchLoading, setBatchLoading] = useState(false);
  const [zipLoading, setZipLoading] = useState(false);
  const [zipNote, setZipNote] = useState<string | null>(null);
  const [pendingDownloads, setPendingDownloads] = useState<Set<string>>(
    new Set(),
  );
  const [removingKey, setRemovingKey] = useState<string | null>(null);
  const [deletingVideoId, setDeletingVideoId] = useState<string | null>(null);
  const [playing, setPlaying] = useState<{
    videoId: string;
    formatKey: string;
  } | null>(null);
  const [fontScale, setFontScale] = useState(FONT_SCALE_DEFAULT);
  const fontScaleLoadedRef = useRef(false);
  const headerCheckboxRef = useRef<HTMLInputElement>(null);
  const pendingRef = useRef<Set<string>>(new Set());

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

  const downloadedCount = useMemo(
    () =>
      Object.values(registry).reduce(
        (sum, entries) =>
          sum + Object.values(entries).filter((e) => e.status === "done").length,
        0,
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

  const totalItems = matchedVideos.length + matchedNotFound.length;
  const pageCount = Math.max(1, Math.ceil(totalItems / pageSize));
  // Clamp without an effect: the stored page may exceed pageCount when the
  // list shrinks (e.g. a row deletion); the derived value is what's rendered.
  const currentPage = Math.min(page, pageCount);
  const { pageVideos, pageNotFound } = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    const end = start + pageSize;
    const videosUpTo = matchedVideos.length;
    const sliceVideos = matchedVideos.slice(
      Math.min(start, videosUpTo),
      Math.min(end, videosUpTo),
    );
    const sliceNotFound =
      end > videosUpTo
        ? matchedNotFound.slice(
            Math.max(0, start - videosUpTo),
            end - videosUpTo,
          )
        : [];
    return { pageVideos: sliceVideos, pageNotFound: sliceNotFound };
  }, [matchedVideos, matchedNotFound, currentPage, pageSize]);

  function setFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    setPage(1);
    setFilters((f) => ({ ...f, [key]: value }));
  }

  function isFiltered() {
    return JSON.stringify(filters) !== JSON.stringify(DEFAULT_FILTERS);
  }

  const allSelected =
    pageVideos.length > 0 && pageVideos.every((v) => selected.has(v.id));
  const someSelected = pageVideos.some((v) => selected.has(v.id));

  useEffect(() => {
    if (headerCheckboxRef.current) {
      headerCheckboxRef.current.indeterminate = someSelected && !allSelected;
    }
  }, [someSelected, allSelected]);

  function toggleSelect(videoId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(videoId)) next.delete(videoId);
      else next.add(videoId);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        pageVideos.forEach((v) => next.delete(v.id));
      } else {
        pageVideos.forEach((v) => next.add(v.id));
      }
      return next;
    });
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
    const key = downloadKey(videoId, mode, itag);
    if (pendingRef.current.has(key)) return;
    pendingRef.current.add(key);
    setPendingDownloads((prev) => new Set(prev).add(key));
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
    } finally {
      pendingRef.current.delete(key);
      setPendingDownloads((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  }

  async function removeDownloadEntry(videoId: string, formatKey: string) {
    const key = `${videoId}:${formatKey}`;
    if (removingKey) return;
    setRemovingKey(key);
    try {
      const res = await fetch("/api/downloads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "remove", videoId, formatKey }),
      });
      const data = await res.json();
      if (res.ok && data.downloads) setRegistry(data.downloads);
    } catch {
      // registry catches up via polling
    } finally {
      setRemovingKey(null);
    }
  }

  async function deleteVideoRow(id: string) {
    if (deletingVideoId) return;
    setDeletingVideoId(id);
    try {
      const res = await fetch(
        `/api/library/videos?id=${encodeURIComponent(id)}`,
        { method: "DELETE" },
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? `Request failed (${res.status})`);
        return;
      }
      setResult((prev) => {
        if (!prev) return prev;
        const hadVideo = prev.videos.some((v) => v.id === id);
        const hadNotFound = prev.notFound.includes(id);
        if (!hadVideo && !hadNotFound) return prev;
        return {
          ...prev,
          videos: prev.videos.filter((v) => v.id !== id),
          notFound: prev.notFound.filter((n) => n !== id),
          uniqueIds: Math.max(0, prev.uniqueIds - 1),
        };
      });
      setSelected((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    } catch {
      setError("Something went wrong. Check your connection and try again.");
    } finally {
      setDeletingVideoId(null);
    }
  }

  async function redownloadEntry(videoId: string, entry: DownloadEntry) {
    if (!entry.mode || removingKey) return;
    const key = `${videoId}:${entry.formatKey}`;
    setRemovingKey(key);
    try {
      const removeRes = await fetch("/api/downloads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "remove",
          videoId,
          formatKey: entry.formatKey,
        }),
      });
      const removeData = await removeRes.json();
      if (removeRes.ok && removeData.downloads)
        setRegistry(removeData.downloads);

      const startRes = await fetch("/api/downloads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videoId,
          mode: entry.mode,
          itag: entry.itag,
          label: entry.label,
        }),
      });
      const startData = await startRes.json();
      if (startRes.ok && startData.downloads)
        setRegistry(startData.downloads);
    } catch {
      // registry catches up via polling
    } finally {
      setRemovingKey(null);
    }
  }

  async function requestBatchDownload(mode: "video-best" | "audio-best") {
    if (selected.size === 0 || batchLoading) return;
    setBatchLoading(true);
    try {
      const res = await fetch("/api/downloads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: [...selected].map((videoId) => ({ videoId, mode })),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        if (data.downloads) setRegistry(data.downloads);
        setSelected(new Set());
      } else {
        setError(data?.error ?? `Request failed (${res.status})`);
      }
    } catch {
      setError("Something went wrong. Check your connection and try again.");
    } finally {
      setBatchLoading(false);
    }
  }

  async function zipAllDownloads() {
    if (zipLoading) return;
    setZipLoading(true);
    setZipNote(null);
    try {
      const res = await fetch("/api/downloads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "zip" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? `Request failed (${res.status})`);
      } else {
        setZipNote(
          `Zipped ${data.count} file${data.count === 1 ? "" : "s"} → downloads-export.zip (${(data.sizeBytes / 1024 / 1024).toFixed(1)} MB)`,
        );
        if (data.downloads) setRegistry(data.downloads);
      }
    } catch {
      setError("Something went wrong. Check your connection and try again.");
    } finally {
      setZipLoading(false);
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
      setSelected(new Set());
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
        setPage(1);
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
    const files = Array.from(fileRef.current?.files ?? []);
    if (files.length === 0) {
      setError("Choose a CSV file first");
      return;
    }
    if (files.length === 1) {
      const csv = await files[0].text();
      await loadCsv(csv, files[0].name);
      return;
    }

    // Multiple Takeout CSVs: server merges them into the library format,
    // then the merged CSV goes through the normal load flow.
    setMergeNote(null);
    const body = new FormData();
    files.forEach((file) => body.append("files", file));
    try {
      const res = await fetch("/api/library/merge", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? `Request failed (${res.status})`);
        return;
      }
      const s = data.stats;
      setMergeNote(
        `Merged ${s.files} files — ${s.uniqueVideos} videos, ${s.duplicates} duplicates, ${s.invalid} skipped`,
      );
      await loadCsv(data.csv, data.name);
    } catch {
      setError("Something went wrong. Check your connection and try again.");
    }
  }

  function clearSaved() {
    fetch("/api/library", { method: "DELETE" }).catch(() => {});
    setResult(null);
    setPage(1);
    setFileName(null);
    setMergeNote(null);
    setFilters(DEFAULT_FILTERS);
    setError(null);
    setSelected(new Set());
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

  useEffect(() => {
    // Load after mount only — initial render uses the default to avoid a
    // hydration mismatch from the stored value.
    const timer = setTimeout(() => {
      fetch("/api/settings")
        .then((res) => (res.ok ? res.json() : null))
        .then((data: { fontScale?: number | null } | null) => {
          if (data && typeof data.fontScale === "number" && Number.isFinite(data.fontScale)) {
            setFontScale(clampFontScale(data.fontScale));
          }
        })
        .catch(() => {})
        .finally(() => {
          fontScaleLoadedRef.current = true;
        });
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    document.documentElement.style.fontSize = `${16 * fontScale}px`;
    // Skip until the initial load attempt resolves so we don't clobber the
    // saved value with the default before it is read.
    if (!fontScaleLoadedRef.current) return;
    fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fontScale }),
    }).catch(() => {});
  }, [fontScale]);

  useEffect(() => {
    // Mirror page/pageSize into the URL so pagination survives a refresh.
    // Only written once data is loaded so an empty app doesn't grow a noisy
    // query string.
    if (!result) return;
    const params = new URLSearchParams(window.location.search);
    params.set(PAGE_URL_PARAM, String(currentPage));
    params.set(PAGE_SIZE_URL_PARAM, String(pageSize));
    window.history.replaceState(null, "", `?${params.toString()}`);
  }, [result, currentPage, pageSize]);

  function changeFontScale(delta: number) {
    setFontScale((scale) => clampFontScale(scale + delta));
  }

  return (
    <div className="flex min-h-screen flex-col items-center bg-[#0f080b] px-3 py-5 sm:px-5 sm:py-8">
      <main className="w-full max-w-7xl">
        <header className="mb-4 flex items-center justify-between gap-4">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-red-400">
            Cliproom <span className="text-slate-600">/</span> local library
          </p>
          <p className="hidden text-xs text-slate-500 sm:block">CSV in, formats out</p>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              title="Decrease font size"
              aria-label="Decrease font size"
              onClick={() => changeFontScale(-FONT_SCALE_STEP)}
              disabled={fontScale <= FONT_SCALE_MIN}
            >
              <AArrowDown className="size-3.5" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              title="Reset font size"
              aria-label="Reset font size"
              onClick={() => setFontScale(FONT_SCALE_DEFAULT)}
              disabled={fontScale === FONT_SCALE_DEFAULT}
            >
              <RotateCcw className="size-3.5" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              title="Increase font size"
              aria-label="Increase font size"
              onClick={() => changeFontScale(FONT_SCALE_STEP)}
              disabled={fontScale >= FONT_SCALE_MAX}
            >
              <AArrowUp className="size-3.5" />
            </Button>
          </div>
        </header>

        <form
          onSubmit={handleSubmit}
          className="grid gap-3 rounded-xl border border-slate-800 bg-[#1b1015] p-3 shadow-xl shadow-black/20 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center sm:p-4"
        >
          <div className="sm:min-w-36">
            <p className="text-sm font-semibold text-slate-100">Load a library</p>
            <p className="text-xs text-slate-500">One video ID per CSV row — or multiple Takeout CSVs</p>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            multiple
            onChange={(e) => {
              const list = e.target.files;
              setFileName(
                list && list.length > 1
                  ? `${list.length} files selected`
                  : (list?.[0]?.name ?? null),
              );
              setMergeNote(null);
            }}
            className="block min-w-0 w-full cursor-pointer rounded-lg border border-dashed border-slate-700 bg-slate-950/40 p-1.5 text-xs text-slate-400 file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-red-500 file:px-2.5 file:py-1.5 file:text-xs file:font-bold file:text-white hover:border-red-400/60 hover:file:bg-red-400"
          />
          <div className="flex items-center gap-2 sm:justify-end">
            <Button type="submit" size="sm" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  Fetching…
                </>
              ) : (
                "Fetch metadata"
              )}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={clearSaved} disabled={loading}>
              Reset
            </Button>
          </div>
          {fileName && (
            <p className="truncate text-xs text-slate-400 sm:col-start-2 sm:-mt-2">Loaded: {fileName}</p>
          )}
          {mergeNote && (
            <p className="truncate text-xs text-emerald-300/90 sm:col-start-2 sm:-mt-2">{mergeNote}</p>
          )}
        </form>

        {error && (
          <p className="mt-4 rounded-xl border border-rose-400/30 bg-rose-400/10 p-4 text-sm text-rose-200">
            {error}
          </p>
        )}

        {loading && !result && (
          <section className="mt-5">
            <div className="responsive-table mt-2 overflow-hidden rounded-xl border border-slate-800 bg-[#1b1015] shadow-xl shadow-black/10">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead className="bg-slate-950/70 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="w-8 px-3 py-2">
                      <span className="sr-only">Select</span>
                    </th>
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
                  {Array.from({ length: 6 }, (_, i) => (
                    <tr key={i}>
                      <td className="px-3 py-2">
                        <div className="size-3.5 animate-pulse rounded bg-slate-800" />
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-2">
                          <div className="h-8 w-14 shrink-0 animate-pulse rounded bg-slate-800" />
                          <div className="h-3 w-2/5 animate-pulse rounded bg-slate-800" />
                        </div>
                      </td>
                      <td className="hidden px-3 py-2 lg:table-cell">
                        <div className="h-3 w-24 animate-pulse rounded bg-slate-800" />
                      </td>
                      <td className="px-3 py-2">
                        <div className="h-3 w-12 animate-pulse rounded bg-slate-800" />
                      </td>
                      <td className="px-3 py-2">
                        <div className="h-3 w-10 animate-pulse rounded bg-slate-800" />
                      </td>
                      <td className="hidden px-3 py-2 xl:table-cell">
                        <div className="h-3 w-20 animate-pulse rounded bg-slate-800" />
                      </td>
                      <td className="px-3 py-2">
                        <div className="size-4 animate-pulse rounded bg-slate-800" />
                      </td>
                      <td className="px-3 py-2">
                        <div className="h-7 w-24 animate-pulse rounded-lg bg-slate-800" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
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
                  {isFiltered() && <Button size="sm" variant="ghost" onClick={() => { setPage(1); setFilters(DEFAULT_FILTERS); }}>Clear</Button>}
                </div>
              </details>
              {downloadedCount > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={zipAllDownloads}
                  disabled={zipLoading}
                  title="Zip all downloaded files to downloads-export.zip in the project root"
                >
                  {zipLoading ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Archive className="size-3.5" />
                  )}
                  {zipLoading ? "Zipping…" : `Zip all (${downloadedCount})`}
                </Button>
              )}
            </div>

            {zipNote && (
              <p className="mt-2 text-xs text-emerald-300/90">{zipNote}</p>
            )}
            <p className="mt-3 text-xs font-medium uppercase tracking-wide text-slate-500">
              {totalItems === 0
                ? "Showing 0"
                : `Showing ${((currentPage - 1) * pageSize + 1).toLocaleString()}–${Math.min(currentPage * pageSize, totalItems).toLocaleString()} of ${totalItems.toLocaleString()}`}
              {isFiltered() &&
                ` (${(result.videos.length + result.notFound.length).toLocaleString()} loaded)`}
            </p>

            {(pageCount > 1 || totalItems > PAGE_SIZE_OPTIONS[0]) && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {pageCount > 1 && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage <= 1}
                    >
                      Prev
                    </Button>
                    <span className="text-xs text-slate-400">
                      Page {currentPage.toLocaleString()} of {pageCount.toLocaleString()}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                      disabled={currentPage >= pageCount}
                    >
                      Next
                    </Button>
                  </>
                )}
                {totalItems > PAGE_SIZE_OPTIONS[0] && (
                  <label className="ml-auto flex items-center gap-1.5 text-xs text-slate-400">
                    Rows per page
                    <select
                      value={pageSize}
                      onChange={(e) => {
                        setPageSize(Number(e.target.value));
                        setPage(1);
                      }}
                      className="h-8 rounded-lg border border-slate-700 bg-slate-950/70 px-2 text-xs text-slate-100 outline-none focus:border-red-500"
                    >
                      {PAGE_SIZE_OPTIONS.map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
            )}

            <div className="responsive-table mt-2 overflow-hidden rounded-xl border border-slate-800 bg-[#1b1015] shadow-xl shadow-black/10">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead className="bg-slate-950/70 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="w-8 px-3 py-2">
                      <input
                        ref={headerCheckboxRef}
                        type="checkbox"
                        checked={allSelected}
                        onChange={toggleSelectAll}
                        aria-label="Select all filtered videos"
                        className="size-3.5 accent-red-500"
                      />
                    </th>
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
                  {pageVideos.map((v) => {
                    const entries = registry[v.id] ?? {};
                    const allEntries = Object.values(entries);
                    const doneEntries = allEntries.filter(
                      (e) => e.status === "done",
                    );
                    const activeEntries = allEntries.filter(
                      (e) =>
                        e.status === "queued" || e.status === "in_progress",
                    );
                    const failedEntries = allEntries.filter(
                      (e) => e.status === "failed",
                    );
                    const isExpanded = expandedId === v.id;
                    const playingEntry =
                      playing?.videoId === v.id
                        ? doneEntries.find(
                            (e) => e.formatKey === playing.formatKey,
                          )
                        : undefined;
                    return (
                      <Fragment key={v.id}>
                        <tr
                          className={
                            isExpanded
                              ? "bg-slate-800/70"
                              : "hover:bg-slate-800/40"
                          }
                        >
                          <td className="px-3 py-2">
                            <input
                              type="checkbox"
                              checked={selected.has(v.id)}
                              onChange={() => toggleSelect(v.id)}
                              aria-label={`Select ${v.title}`}
                              className="size-3.5 accent-red-500"
                            />
                          </td>
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
                            {allEntries.length > 0 && (
                              <div className="mt-1 flex min-h-[1.25rem] flex-wrap items-center gap-1">
                                {doneEntries.map((e) => (
                                  <span
                                    key={e.formatKey}
                                    title={e.file}
                                    className="inline-flex items-center gap-1 rounded bg-emerald-400/10 px-1.5 py-px text-[10px] text-emerald-300"
                                  >
                                    <Check className="size-2.5" />
                                    {e.label}
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setPlaying(
                                          playing?.videoId === v.id &&
                                            playing.formatKey === e.formatKey
                                            ? null
                                            : {
                                                videoId: v.id,
                                                formatKey: e.formatKey,
                                              },
                                        )
                                      }
                                      title="Play"
                                      aria-label={`Play ${e.label}`}
                                      className="text-emerald-300 hover:text-emerald-100"
                                    >
                                      <Play className="size-2.5" />
                                    </button>
                                    {e.mode && (
                                      <button
                                        type="button"
                                        onClick={() => redownloadEntry(v.id, e)}
                                        disabled={
                                          removingKey ===
                                          `${v.id}:${e.formatKey}`
                                        }
                                        title="Redownload"
                                        aria-label={`Redownload ${e.label}`}
                                        className="text-emerald-300 hover:text-emerald-100 disabled:opacity-50"
                                      >
                                        {removingKey ===
                                        `${v.id}:${e.formatKey}` ? (
                                          <Loader2 className="size-2.5 animate-spin" />
                                        ) : (
                                          <RotateCcw className="size-2.5" />
                                        )}
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() =>
                                        removeDownloadEntry(v.id, e.formatKey)
                                      }
                                      disabled={
                                        removingKey === `${v.id}:${e.formatKey}`
                                      }
                                      title="Delete"
                                      aria-label={`Delete ${e.label}`}
                                      className="text-emerald-300 hover:text-rose-300 disabled:opacity-50"
                                    >
                                      {removingKey ===
                                      `${v.id}:${e.formatKey}` ? (
                                        <Loader2 className="size-2.5 animate-spin" />
                                      ) : (
                                        <Trash2 className="size-2.5" />
                                      )}
                                    </button>
                                  </span>
                                ))}
                                {activeEntries.map((e) => (
                                  <span
                                    key={e.formatKey}
                                    className="inline-flex items-center gap-0.5 rounded bg-slate-800/70 px-1.5 py-px text-[10px] text-slate-400"
                                  >
                                    <Download className="size-2.5 animate-pulse" />
                                    {e.label}
                                  </span>
                                ))}
                                {failedEntries.map((e) => {
                                  const key = `${v.id}:${e.formatKey}`;
                                  const removing = removingKey === key;
                                  return (
                                    <span
                                      key={e.formatKey}
                                      title={e.error}
                                      className="inline-flex items-center gap-0.5 rounded bg-rose-400/10 px-1.5 py-px text-[10px] text-rose-300"
                                    >
                                      <RotateCw className="size-2.5" />
                                      {e.label}
                                      {e.mode && (
                                        <button
                                          type="button"
                                          onClick={() => redownloadEntry(v.id, e)}
                                          disabled={removing}
                                          title="Retry"
                                          aria-label={`Retry ${e.label}`}
                                          className="text-rose-300 hover:text-rose-100 disabled:opacity-50"
                                        >
                                          {removing ? (
                                            <Loader2 className="size-2.5 animate-spin" />
                                          ) : (
                                            <RotateCcw className="size-2.5" />
                                          )}
                                        </button>
                                      )}
                                      <button
                                        type="button"
                                        onClick={() =>
                                          removeDownloadEntry(v.id, e.formatKey)
                                        }
                                        disabled={removing}
                                        title="Delete"
                                        aria-label={`Delete ${e.label}`}
                                        className="text-rose-300 hover:text-rose-100 disabled:opacity-50"
                                      >
                                        {removing ? (
                                          <Loader2 className="size-2.5 animate-spin" />
                                        ) : (
                                          <Trash2 className="size-2.5" />
                                        )}
                                      </button>
                                    </span>
                                  );
                                })}
                              </div>
                            )}
                            {playingEntry && (
                              <div className="mt-1.5 flex items-center gap-1.5">
                                {/\.(m4a|mp3|opus|ogg|weba)$/i.test(
                                  playingEntry.file ?? "",
                                ) ? (
                                  <audio
                                    key={playingEntry.formatKey}
                                    controls
                                    autoPlay
                                    src={`/api/downloads/file?videoId=${v.id}&formatKey=${encodeURIComponent(playingEntry.formatKey)}`}
                                    className="h-8 w-full max-w-md"
                                  />
                                ) : (
                                  <video
                                    key={playingEntry.formatKey}
                                    controls
                                    autoPlay
                                    src={`/api/downloads/file?videoId=${v.id}&formatKey=${encodeURIComponent(playingEntry.formatKey)}`}
                                    className="w-full max-w-md rounded-lg"
                                  />
                                )}
                                <button
                                  type="button"
                                  onClick={() => setPlaying(null)}
                                  title="Close player"
                                  aria-label="Close player"
                                  className="text-slate-500 hover:text-slate-100"
                                >
                                  <X className="size-3.5" />
                                </button>
                              </div>
                            )}
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
                            <div className="flex items-center gap-1.5">
                              <a
                                href={v.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                title="Open on YouTube"
                                className="inline-flex text-slate-500 hover:text-slate-100"
                              >
                                <ExternalLink className="size-4" />
                              </a>
                              <button
                                type="button"
                                onClick={() => deleteVideoRow(v.id)}
                                disabled={deletingVideoId === v.id}
                                title="Remove from library"
                                aria-label={`Remove ${v.title} from library`}
                                className="inline-flex text-slate-500 hover:text-rose-300 disabled:opacity-50"
                              >
                                {deletingVideoId === v.id ? (
                                  <Loader2 className="size-3.5 animate-spin" />
                                ) : (
                                  <Trash2 className="size-3.5" />
                                )}
                              </button>
                            </div>
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
                            </Button>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr className="bg-slate-950/40">
                            <td colSpan={8} className="px-4 py-3 sm:px-6">
                              <FormatPanel
                                video={v}
                                formats={formatsByVideo[v.id]}
                                loading={!!formatsLoading[v.id]}
                                error={formatsError[v.id]}
                                entries={entries}
                                pending={pendingDownloads}
                                onDownload={requestDownload}
                              />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                  {pageNotFound.map((id) => (
                    <tr key={id} className="bg-amber-400/10">
                      <td className="px-3 py-2 text-amber-200">
                        Not found: <code>{id}</code>
                      </td>
                      <td colSpan={6} />
                      <td className="px-3 py-2">
                        {VIDEO_ID_RE.test(id) && (
                          <button
                            type="button"
                            onClick={() => deleteVideoRow(id)}
                            disabled={deletingVideoId === id}
                            title="Remove from library"
                            aria-label={`Remove ${id} from library`}
                            className="inline-flex text-slate-500 hover:text-rose-300 disabled:opacity-50"
                          >
                            {deletingVideoId === id ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="size-3.5" />
                            )}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {result && selected.size > 0 && (
          <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 flex-wrap items-center justify-center gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-2.5 py-1.5 shadow-lg backdrop-blur">
            <span className="text-xs font-semibold text-red-200">
              {selected.size} selected
            </span>
            <Button
              size="sm"
              onClick={() => requestBatchDownload("video-best")}
              disabled={batchLoading}
            >
              {batchLoading ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Video className="size-3.5" />
              )}
              {batchLoading ? "Starting…" : "Download best video"}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => requestBatchDownload("audio-best")}
              disabled={batchLoading}
            >
              {batchLoading ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Music className="size-3.5" />
              )}
              {batchLoading ? "Starting…" : "Download best audio"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setSelected(new Set())}
              disabled={batchLoading}
            >
              Clear
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}
