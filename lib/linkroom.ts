import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { z } from "zod";
import { llmJson } from "./llm";

const MAX_BYTES = 500_000;

/** True for loopback, private, link-local, CGNAT and other non-public addresses (IPv4 and IPv6). */
export function isPrivateIp(ip: string): boolean {
  const v4 = ip.startsWith("::ffff:") ? ip.slice(7) : ip;
  if (isIP(v4) === 4) {
    const [a, b] = v4.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19));
  }
  const x = ip.toLowerCase();
  return x === "::" || x === "::1" || x.startsWith("fc") || x.startsWith("fd") || x.startsWith("fe8") || x.startsWith("fe9") || x.startsWith("fea") || x.startsWith("feb");
}

async function assertPublic(url: URL) {
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new LinkError("Only http and https links are supported.");
  if (url.username || url.password) throw new LinkError("Links with credentials aren't supported.");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => []);
  if (!addrs.length) throw new LinkError("Couldn't find that website.");
  if (addrs.some((a) => isPrivateIp(a.address))) throw new LinkError("That link points to a private address.");
}

export class LinkError extends Error {}

/** Fetch a public page (redirects re-checked, 5 s timeout, 500 KB cap) and return its readable text. */
export async function fetchReadable(raw: string): Promise<string> {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new LinkError("That doesn't look like a link.");
  }
  const deadline = AbortSignal.timeout(5000);
  let res: Response | undefined;
  for (let hop = 0; hop < 4; hop++) {
    await assertPublic(url);
    res = await fetch(url, { redirect: "manual", signal: deadline, headers: { "User-Agent": "ReadTheRoomBot/1.0", Accept: "text/html,text/plain" } }).catch(() => {
      throw new LinkError("Couldn't load that page in time.");
    });
    const loc = res.status >= 300 && res.status < 400 ? res.headers.get("location") : null;
    if (!loc) break;
    url = new URL(loc, url);
    res = undefined;
  }
  if (!res) throw new LinkError("Too many redirects.");
  if (!res.ok) throw new LinkError(`That page returned an error (${res.status}).`);
  if (!/text\/(html|plain)/.test(res.headers.get("content-type") ?? "text/html")) throw new LinkError("That link isn't a web page.");

  const reader = res.body!.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    chunks.push(value);
    if (size >= MAX_BYTES) {
      await reader.cancel();
      break;
    }
  }
  const html = new TextDecoder().decode(Buffer.concat(chunks).subarray(0, MAX_BYTES));
  return htmlToText(html).slice(0, 8000);
}

export function htmlToText(html: string): string {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "";
  const metas = [...html.matchAll(/<meta[^>]+(?:name|property)=["'](?:og:)?description["'][^>]*content=["']([^"']*)["']/gi)].map((m) => m[1]);
  const body = html
    .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ");
  return [title, ...metas, body].join("\n").trim();
}

export const RoomProposalSchema = z.object({
  city: z.string().describe("City where the event takes place, or empty if unknown"),
  ageRange: z.string().describe('Likely audience age range, e.g. "25–34", or empty if no basis'),
  reasoning: z.string().describe("One short sentence explaining the guess"),
});

export function proposeRoom(source: string) {
  return llmJson(
    RoomProposalSchema,
    "You read an event page or description and propose its audience: the city where it happens and a likely age range. " +
      "Base it only on the text (venue, event type, ticket tiers, wording). Keep the reasoning to one sentence. Leave fields empty when there is no basis.",
    source,
  );
}
