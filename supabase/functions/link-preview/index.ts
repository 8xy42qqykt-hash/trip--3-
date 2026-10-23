import { createClient } from "npm:@supabase/supabase-js@2";
import * as cheerio from "npm:cheerio@1.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const MAX_URL_LENGTH = 2048;
const MAX_HEAD_BYTES = 1_500_000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const USER_AGENT =
  "Mozilla/5.0 (compatible; TripLinkPreview/1.0; +https://supabase.com)";

type PreviewData = {
  url: string;
  title: string;
  description: string | null;
  image: string | null;
  siteName: string;
  favicon: string | null;
  video: boolean;
};

class PreviewError extends Error {}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isBlockedIpv4(address: string): boolean {
  const parts = address.split(".").map(Number);
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) return true;
  const [a, b, c] = parts;
  return a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 168 || (b === 0 && c === 0) || (b === 0 && c === 2))) ||
    (a === 192 && b === 88 && c === 99) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113);
}

function isBlockedIpv6(address: string): boolean {
  const normalized = address.toLowerCase().split("%")[0];
  const mapped = normalized.match(/(?:^|:)ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (mapped) return isBlockedIpv4(mapped[1]);

  const firstGroup = Number.parseInt(normalized.split(":")[0] || "0", 16);
  const secondGroup = Number.parseInt(normalized.split(":")[1] || "0", 16);
  return (firstGroup & 0xe000) !== 0x2000 ||
    (firstGroup === 0x2001 && (secondGroup === 0 || secondGroup === 0x0db8));
}

function isPublicAddress(address: string): boolean {
  return address.includes(":") ? !isBlockedIpv6(address) : !isBlockedIpv4(address);
}

async function assertPublicHost(url: URL): Promise<void> {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new PreviewError("Only HTTP and HTTPS URLs are supported.");
  }
  if (
    url.username ||
    url.password ||
    (url.port && (url.protocol === "https:" ? url.port !== "443" : url.port !== "80"))
  ) {
    throw new PreviewError("This URL is not supported.");
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  ) throw new PreviewError("Private network URLs are not supported.");

  if (/^[\d.]+$/.test(hostname) || hostname.includes(":")) {
    if (!isPublicAddress(hostname)) {
      throw new PreviewError("Private network URLs are not supported.");
    }
    return;
  }

  let addresses: string[] = [];
  try {
    const [ipv4, ipv6] = await Promise.all([
      Deno.resolveDns(hostname, "A").catch(() => []),
      Deno.resolveDns(hostname, "AAAA").catch(() => []),
    ]);
    addresses = [...ipv4, ...ipv6];
  } catch {
    throw new PreviewError("The website address could not be resolved.");
  }
  if (addresses.length === 0 || addresses.some((address) => !isPublicAddress(address))) {
    throw new PreviewError("Private or unavailable network addresses are not supported.");
  }
}

async function fetchWithSafeRedirects(
  initialUrl: string,
  signal: AbortSignal,
  method: "GET" = "GET",
): Promise<{ response: Response; finalUrl: URL }> {
  let current = new URL(initialUrl);
  for (let redirects = 0; redirects <= 5; redirects++) {
    await assertPublicHost(current);
    const response = await fetch(current, {
      method,
      redirect: "manual",
      signal,
      headers: { "User-Agent": USER_AGENT },
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      await response.body?.cancel();
      if (!location || redirects === 5) {
        throw new PreviewError("The website redirected too many times.");
      }
      current = new URL(location, current);
      continue;
    }
    return { response, finalUrl: current };
  }
  throw new PreviewError("The website redirected too many times.");
}

function cleanText(value: string | undefined): string | null {
  const cleaned = value?.replace(/\s+/g, " ").trim();
  return cleaned ? cleaned.slice(0, 1000) : null;
}

function decodeEntities(value: string): string {
  return cheerio.load(`<span>${value}</span>`)("span").text().trim();
}

function absoluteUrl(candidate: string | undefined, base: URL): string | null {
  if (!candidate) return null;
  const decoded = decodeEntities(candidate);
  try {
    const resolved = new URL(decoded, base);
    if (resolved.protocol !== "http:" && resolved.protocol !== "https:") return null;
    resolved.hash = "";
    return resolved.toString();
  } catch {
    return null;
  }
}

async function isImageResponse(url: string, signal: AbortSignal): Promise<boolean> {
  try {
    const { response } = await fetchWithSafeRedirects(url, signal);
    const contentType = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
    const isImage = response.ok && Boolean(contentType?.startsWith("image/"));
    await response.body?.cancel();
    return isImage;
  } catch (error) {
    if (error instanceof PreviewError) return false;
    if (signal.aborted) throw error;
    return false;
  }
}

async function findVerifiedImage(candidates: string[], signal: AbortSignal): Promise<string | null> {
  for (const candidate of candidates) {
    const secureCandidate = candidate.startsWith("http:")
      ? candidate.replace(/^http:/, "https:")
      : candidate;
    for (const variant of [...new Set([secureCandidate, candidate])]) {
      if (await isImageResponse(variant, signal)) return variant;
    }
  }
  return null;
}

async function getVerifiedFavicon(base: URL, signal: AbortSignal): Promise<string | null> {
  const candidate = new URL("/favicon.ico", base).toString();
  return findVerifiedImage([candidate], signal);
}

function youtubeVideoId(url: URL): string | null {
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (host === "youtu.be") return url.pathname.split("/").filter(Boolean)[0] ?? null;
  if (host !== "youtube.com" && host !== "m.youtube.com" && host !== "youtube-nocookie.com") {
    return null;
  }
  return url.searchParams.get("v") ??
    url.pathname.match(/^\/(?:embed|shorts|live)\/([^/?]+)/)?.[1] ??
    null;
}

async function readHead(response: Response): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let html = "";
  let bytes = 0;
  try {
    while (bytes < MAX_HEAD_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      const remaining = MAX_HEAD_BYTES - bytes;
      const chunk = value.subarray(0, remaining);
      bytes += chunk.byteLength;
      html += decoder.decode(chunk, { stream: true });
      if (html.toLowerCase().includes("</head>") || chunk.byteLength < value.byteLength) break;
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return html;
}

async function loadPreview(urlText: string, signal: AbortSignal): Promise<PreviewData> {
  const requestedUrl = new URL(urlText);
  const videoId = youtubeVideoId(requestedUrl);
  const domain = requestedUrl.hostname.replace(/^www\./i, "");
  const fallback: PreviewData = {
    url: requestedUrl.toString(),
    title: domain,
    description: null,
    image: null,
    siteName: domain,
    favicon: null,
    video: Boolean(videoId),
  };

  if (/\.(?:avif|bmp|gif|jpe?g|png|webp)$/i.test(requestedUrl.pathname)) {
    const image = await findVerifiedImage([requestedUrl.toString()], signal);
    const favicon = await getVerifiedFavicon(requestedUrl, signal);
    if (image) {
      return { ...fallback, title: requestedUrl.pathname.split("/").pop() || domain, image, favicon };
    }
    return { ...fallback, favicon };
  }

  if (videoId) {
    const thumbnail = `https://img.youtube.com/vi/${encodeURIComponent(videoId)}/hqdefault.jpg`;
    return {
      ...fallback,
      title: "YouTube",
      image: await findVerifiedImage([thumbnail], signal),
      siteName: "YouTube",
      favicon: await getVerifiedFavicon(requestedUrl, signal),
    };
  }

  let response: Response;
  let finalUrl: URL;
  try {
    ({ response, finalUrl } = await fetchWithSafeRedirects(requestedUrl.toString(), signal));
  } catch (error) {
    if (error instanceof PreviewError) {
      return { ...fallback, favicon: await getVerifiedFavicon(requestedUrl, signal) };
    }
    throw error;
  }
  if (!response.ok || !response.headers.get("content-type")?.toLowerCase().includes("text/html")) {
    await response.body?.cancel();
    return { ...fallback, favicon: await getVerifiedFavicon(finalUrl, signal) };
  }

  const html = await readHead(response);
  const $ = cheerio.load(html);
  const meta = (name: string, attribute = "property"): string | undefined =>
    $(`meta[${attribute}="${name}"]`).first().attr("content");
  const title = cleanText(meta("og:title") ?? meta("twitter:title", "name") ?? $("title").first().text()) ??
    fallback.title;
  const description = cleanText(
    meta("og:description") ??
      meta("twitter:description", "name") ??
      meta("description", "name"),
  );
  const siteName = cleanText(meta("og:site_name")) ?? domain;
  const imageCandidates = [
    meta("og:image"),
    meta("og:image:secure_url"),
    meta("twitter:image", "name"),
    $('link[rel="image_src"]').first().attr("href"),
    $('link[rel="apple-touch-icon"]').first().attr("href"),
  ]
    .map((candidate) => absoluteUrl(candidate, finalUrl))
    .filter((candidate): candidate is string => Boolean(candidate));

  const faviconCandidates = [
    $('link[rel~="icon"]').first().attr("href"),
    $('link[rel="shortcut icon"]').first().attr("href"),
    "/favicon.ico",
  ]
    .map((candidate) => absoluteUrl(candidate, finalUrl))
    .filter((candidate): candidate is string => Boolean(candidate));
  const verifiedFaviconUrl = await findVerifiedImage([...new Set(faviconCandidates)], signal);
  let image = await findVerifiedImage([...new Set(imageCandidates)], signal);
  if (!image && verifiedFaviconUrl) image = verifiedFaviconUrl;

  return {
    url: requestedUrl.toString(),
    title,
    description,
    image,
    siteName,
    favicon: verifiedFaviconUrl,
    video: false,
  };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return jsonResponse({ error: "Authentication is required." }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    console.error("Link preview function is missing Supabase environment configuration.");
    return jsonResponse({ error: "Link previews are temporarily unavailable." }, 500);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) return jsonResponse({ error: "Authentication is required." }, 401);

  let input: { url?: unknown };
  try {
    input = await request.json();
  } catch {
    return jsonResponse({ error: "A valid URL is required." }, 400);
  }
  if (typeof input.url !== "string" || input.url.trim().length > MAX_URL_LENGTH) {
    return jsonResponse({ error: "A valid URL is required." }, 400);
  }

  let normalizedUrl: URL;
  try {
    normalizedUrl = new URL(input.url.trim());
    await assertPublicHost(normalizedUrl);
    normalizedUrl.hash = "";
  } catch (error) {
    return jsonResponse({
      error: error instanceof PreviewError ? error.message : "A valid HTTP(S) URL is required.",
    }, 400);
  }
  const cacheKey = normalizedUrl.toString();
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: cached, error: cacheReadError } = await admin
    .from("link_preview_cache")
    .select("preview, expires_at")
    .eq("url", cacheKey)
    .maybeSingle();
  if (cacheReadError) console.error("Failed to read link preview cache:", cacheReadError.message);
  if (cached && new Date(cached.expires_at).getTime() > Date.now()) {
    return jsonResponse(cached.preview);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const preview = await loadPreview(cacheKey, controller.signal);
    const { error: cacheError } = await admin.from("link_preview_cache").upsert({
      url: cacheKey,
      preview,
      expires_at: new Date(Date.now() + CACHE_TTL_MS).toISOString(),
      updated_at: new Date().toISOString(),
    });
    if (cacheError) console.error("Failed to save link preview cache entry:", cacheError.message);
    return jsonResponse(preview);
  } catch (error) {
    if (controller.signal.aborted) {
      return jsonResponse({ error: "The website took too long to respond." }, 504);
    }
    console.error("Failed to fetch link preview:", error);
    return jsonResponse({ error: "The website preview could not be loaded." }, 502);
  } finally {
    clearTimeout(timeout);
  }
});
