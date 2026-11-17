/**
 * Assembles the recorded segments and narration into the final demo video.
 *
 *   FFMPEG=<full ffmpeg> AUDIO_DIR=<wav dir> OUT_DIR=<recording dir> FONT=<ttf> node demo/assemble-demo.mjs
 *
 * Writes demo/sutra-erp-demo.mp4 (burned-in subtitles + a soft subtitle track),
 * demo/sutra-erp-demo.srt, demo/thumbnail.png and demo/narration.md (script with timings).
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const FFMPEG = process.env.FFMPEG || "ffmpeg";
const AUDIO_DIR = process.env.AUDIO_DIR;
const OUT_DIR = process.env.OUT_DIR;
const FONT = process.env.FONT; // e.g. C:/Windows/Fonts/segoeuib.ttf mounted path
const DEMO = path.dirname(fileURLToPath(import.meta.url));
const LEAD = 0.3; // narration starts 0.3 s into each segment

const segments = JSON.parse(fs.readFileSync(path.join(DEMO, "segments.json"), "utf8"));
const timings = JSON.parse(fs.readFileSync(path.join(OUT_DIR, "timings.json"), "utf8"));
const ff = (args) => execFileSync(FFMPEG, ["-hide_banner", "-loglevel", "error", "-y", ...args], { stdio: "inherit" });
const esc = (s) => s.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\u2019").replace(/%/g, "\\%");

const parts = [];
let cursor = 0;
const cues = [];
const srtTime = (t) => {
  const ms = Math.round(t * 1000);
  const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000), s = Math.floor((ms % 60000) / 1000), r = ms % 1000;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(r).padStart(3, "0")}`;
};

/** Split display text into subtitle cues of at most ~84 characters, at sentence or clause breaks. */
function chunks(text) {
  const sentences = text.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g).map((x) => x.trim());
  const out = [];
  for (const s of sentences) {
    if (s.length <= 84) { out.push(s); continue; }
    let cur = "";
    for (const piece of s.split(/(?<=[,:;])\s+/)) {
      if ((cur + " " + piece).trim().length > 84 && cur) { out.push(cur.trim()); cur = piece; } else cur = (cur + " " + piece).trim();
    }
    if (cur) out.push(cur);
  }
  return out;
}

fs.mkdirSync(path.join(OUT_DIR, "parts"), { recursive: true });
segments.forEach((seg, i) => {
  const tm = timings[seg.id];
  if (!tm) throw new Error("Missing recording for " + seg.id);
  const wav = path.join(AUDIO_DIR, `${seg.id}.wav`);
  const narration = tm.duration - 1.0;
  const total = tm.duration + LEAD;
  const out = path.join(OUT_DIR, "parts", `${seg.id}.mp4`);
  const title = `${i + 1} · ${seg.title}`;
  const base = tm.mobile
    ? "scale=-2:720:flags=lanczos,pad=1280:720:(ow-iw)/2:0:color=0x0c0c0d"
    : "scale=1280:720:flags=lanczos";
  const label = FONT
    ? `,drawtext=fontfile='${esc(FONT)}':text='${esc(title)}':x=w-tw-28:y=24:fontsize=22:fontcolor=white:box=1:boxcolor=0x18181bE6:boxborderw=12:alpha='if(lt(t,0.3),t/0.3,if(lt(t,4),1,if(lt(t,4.6),(4.6-t)/0.6,0)))'`
    : "";
  ff([
    "-ss", tm.trimStart.toFixed(3), "-t", total.toFixed(3), "-i", tm.file,
    "-i", wav,
    "-filter_complex", `[0:v]${base},fps=25,tpad=stop_mode=clone:stop_duration=2${label},trim=duration=${total.toFixed(3)},setpts=PTS-STARTPTS[v];[1:a]adelay=${LEAD * 1000}|${LEAD * 1000},apad,atrim=duration=${total.toFixed(3)},aresample=44100[a]`,
    "-map", "[v]", "-map", "[a]",
    "-c:v", "libx264", "-preset", "medium", "-crf", "21", "-pix_fmt", "yuv420p", "-r", "25",
    "-c:a", "aac", "-b:a", "128k", "-ac", "1",
    out,
  ]);
  // Subtitle cues: the segment's narration time shared out by character count.
  const cs = chunks(seg.sub);
  const totalChars = cs.reduce((a, c) => a + c.length, 0);
  let t = cursor + LEAD;
  for (const c of cs) {
    const d = (narration * c.length) / totalChars;
    cues.push({ start: t, end: t + d - 0.05, text: c });
    t += d;
  }
  seg.start = cursor;
  seg.length = total;
  cursor += total;
  parts.push(out);
  console.log(`part ${seg.id}: ${total.toFixed(2)}s`);
});

// Concatenate the parts.
const list = path.join(OUT_DIR, "parts.txt");
fs.writeFileSync(list, parts.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n"));
const joined = path.join(OUT_DIR, "joined.mp4");
ff(["-f", "concat", "-safe", "0", "-i", list, "-c", "copy", joined]);

// Subtitles: SRT next to the video, burned in, and also embedded as a soft track.
const srtPath = path.join(DEMO, "sutra-erp-demo.srt");
fs.writeFileSync(srtPath, cues.map((c, i) => `${i + 1}\n${srtTime(c.start)} --> ${srtTime(c.end)}\n${c.text}\n`).join("\n"));
const fontsDir = FONT ? path.dirname(FONT) : undefined;
const style = "FontName=Segoe UI,FontSize=17,PrimaryColour=&H00FFFFFF,OutlineColour=&H80000000,BackColour=&H99000000,BorderStyle=4,Outline=0,Shadow=0,MarginV=22,Alignment=2";
const subFilter = `subtitles='${esc(srtPath)}'${fontsDir ? `:fontsdir='${esc(fontsDir)}'` : ""}:force_style='${style}'`;
const finalPath = path.join(DEMO, "sutra-erp-demo.mp4");
ff(["-i", joined, "-i", srtPath, "-vf", subFilter, "-map", "0:v", "-map", "0:a", "-map", "1:s", "-c:v", "libx264", "-preset", "medium", "-crf", "21", "-pix_fmt", "yuv420p", "-c:a", "copy", "-c:s", "mov_text", "-metadata:s:s:0", "language=eng", "-movflags", "+faststart", finalPath]);

// Thumbnail: a frame from the digital-twin segment with the title.
const twin = segments.find((s) => s.id === "15-digital-twin");
const thumb = path.join(DEMO, "thumbnail.png");
const ttl = FONT
  ? `,drawbox=x=0:y=ih-200:w=iw:h=200:color=0x0c0c0dE0:t=fill,drawtext=fontfile='${esc(FONT)}':text='Sutra Food Manufacturing ERP':x=48:y=h-170:fontsize=56:fontcolor=white,drawtext=fontfile='${esc(FONT)}':text='Live 3D factory digital twin · BOM production · one stock ledger · GST invoicing':x=50:y=h-92:fontsize=26:fontcolor=0xF59E0B`
  : "";
ff(["-ss", (twin.start + twin.length * 0.12).toFixed(2), "-i", joined, "-frames:v", "1", "-vf", `scale=1280:720${ttl}`, thumb]);

// Narration script with timings.
const fmt = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
const md = [
  "# Demo video narration",
  "",
  `Final video: \`demo/sutra-erp-demo.mp4\` (${fmt(cursor)}, 1280×720, H.264/AAC, burned-in English subtitles plus a soft subtitle track). Subtitles: \`demo/sutra-erp-demo.srt\`. Thumbnail: \`demo/thumbnail.png\`.`,
  "",
  "Narration voice: Microsoft Heera (English, India), synthesised offline with the Windows speech engine. The screen recording is the real application, driven by `demo/record-demo.mjs`.",
  "",
  "| # | Time | Segment | Narration |",
  "|---|---|---|---|",
  ...segments.map((s, i) => `| ${i + 1} | ${fmt(s.start)}–${fmt(s.start + s.length)} | ${s.title} | ${s.sub.replace(/\|/g, "\\|")} |`),
  "",
].join("\n");
fs.writeFileSync(path.join(DEMO, "narration.md"), md);
console.log(`final ${finalPath} ${fmt(cursor)} (${cursor.toFixed(1)}s), ${cues.length} subtitle cues`);
