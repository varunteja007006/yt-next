// Shared, dependency-free logic for resolving "best" download modes to the
// concrete format (itag) yt-dlp would pick. Used by both the server
// (lib/downloads.ts) and the client (app/page.tsx) so both agree on which
// registry entry (`itag-<itag>`) a best-mode download maps to.

export type BestFormatCandidate = {
  itag: string;
  kind: "audio" | "video" | "muxed";
  ext: string;
  height: number | null;
  abr: number | null;
  tbr: number | null;
};

export type BestMode = "audio-best" | "video-best";

// Mirrors yt-dlp's selection closely enough for dedup purposes:
// - audio-best (`bestaudio[ext=m4a]/bestaudio`): prefer m4a, highest abr.
// - video-best (`bv*+ba/b -S res,ext:mp4:m4a`): highest resolution, then
//   mp4 ext, then bitrate. Muxed formats are considered (bv* allows them)
//   but in practice video-only formats win on resolution.
export function resolveBestFormat(
  mode: BestMode,
  formats: BestFormatCandidate[],
): BestFormatCandidate | undefined {
  if (mode === "audio-best") {
    const audio = formats.filter((f) => f.kind === "audio");
    const m4a = audio.filter((f) => f.ext === "m4a");
    const pool = m4a.length > 0 ? m4a : audio;
    return [...pool].sort((a, b) => (b.abr ?? 0) - (a.abr ?? 0))[0];
  }

  const video = formats.filter((f) => f.kind !== "audio" && (f.height ?? 0) > 0);
  return [...video].sort((a, b) => {
    if ((b.height ?? 0) !== (a.height ?? 0)) {
      return (b.height ?? 0) - (a.height ?? 0);
    }
    const aMp4 = a.ext === "mp4" ? 1 : 0;
    const bMp4 = b.ext === "mp4" ? 1 : 0;
    if (aMp4 !== bMp4) return bMp4 - aMp4;
    return (b.tbr ?? 0) - (a.tbr ?? 0);
  })[0];
}
