import { NextRequest, NextResponse } from 'next/server';
import { lookup } from 'dns/promises';
import { isIP } from 'net';
import { parseReceiptWithAI, findDateInText } from '@/lib/geminiReceiptParser';
import { parsePdfBuffer } from '@/lib/receiptIngest';

// Digital receipts arrive as links by SMS/WhatsApp (Weezmo, chain sites…).
// Fetch the link server-side and parse whatever it serves: a PDF directly,
// an HTML page with a PDF/download link, or the page text itself.
export const maxDuration = 60;

const FETCH_TIMEOUT_MS = 15_000;
const MAX_BYTES = 10 * 1024 * 1024;
const UA = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Mobile Safari/537.36';

function isPrivateAddress(ip: string): boolean {
  if (ip === '::1' || ip.startsWith('fc') || ip.startsWith('fd') || ip.startsWith('fe80')) return true;
  const v4 = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
  if (isIP(v4) !== 4) return false;
  const [a, b] = v4.split('.').map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
}

/** Only public https hosts: the server must not be usable to probe internal networks. */
async function assertPublicHttps(raw: string): Promise<URL> {
  const url = new URL(raw);
  if (url.protocol !== 'https:') throw new Error('רק קישורי https נתמכים');
  const host = url.hostname;
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) throw new Error('כתובת לא נתמכת');
  const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  if (addrs.some((a) => isPrivateAddress(a.address))) throw new Error('כתובת לא נתמכת');
  return url;
}

async function fetchPublic(raw: string): Promise<{ res: Response; url: URL }> {
  let current = await assertPublicHttps(raw);
  // Follow redirects manually so every hop is checked.
  for (let hop = 0; hop < 5; hop++) {
    const res = await fetch(current, {
      redirect: 'manual',
      headers: { 'User-Agent': UA, Accept: 'application/pdf,text/html;q=0.9,*/*;q=0.8' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    const loc = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && loc) {
      current = await assertPublicHttps(new URL(loc, current).toString());
      continue;
    }
    return { res, url: current };
  }
  throw new Error('יותר מדי הפניות');
}

async function readLimited(res: Response): Promise<Buffer> {
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_BYTES) throw new Error('הקובץ גדול מדי');
  return buf;
}

const isPdf = (res: Response, buf: Buffer) =>
  (res.headers.get('content-type') || '').includes('pdf') || buf.subarray(0, 5).toString() === '%PDF-';

function findPdfLink(html: string, base: URL): string | null {
  const hrefs = Array.from(html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)).map((m) => m[1]);
  const pick = hrefs.find((h) => /\.pdf(\?|$)/i.test(h)) ?? hrefs.find((h) => /pdf|download|הורד/i.test(h));
  if (!pick) return null;
  try { return new URL(pick.replace(/&amp;/g, '&'), base).toString(); } catch { return null; }
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<(br|\/p|\/div|\/tr|\/li|\/h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

export async function POST(request: NextRequest) {
  let link: string;
  let candidateNames: string[] = [];
  try {
    const body = await request.json();
    link = String(body?.url ?? '').trim();
    if (Array.isArray(body?.candidates)) candidateNames = body.candidates.filter((n: unknown) => typeof n === 'string');
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 });
  }
  // Allow pasting a whole SMS: take the first https URL in it.
  const found = link.match(/https:\/\/[^\s"'<>]+/);
  if (!found) return NextResponse.json({ success: false, error: 'לא נמצא קישור https בטקסט' }, { status: 400 });

  try {
    const { res, url } = await fetchPublic(found[0]);
    if (!res.ok) throw new Error(`הקישור החזיר שגיאה (${res.status})`);
    const buf = await readLimited(res);
    const opts = { candidateNames };

    if (isPdf(res, buf)) {
      return NextResponse.json({ success: true, data: await parsePdfBuffer(buf, opts) });
    }

    const html = buf.toString('utf8');
    const pdfLink = findPdfLink(html, url);
    if (pdfLink) {
      const pdfFetch = await fetchPublic(pdfLink).catch(() => null);
      if (pdfFetch?.res.ok) {
        const pdfBuf = await readLimited(pdfFetch.res);
        if (isPdf(pdfFetch.res, pdfBuf)) {
          return NextResponse.json({ success: true, data: await parsePdfBuffer(pdfBuf, opts) });
        }
      }
    }

    const text = htmlToText(html);
    if (text.length < 80) {
      throw new Error('הדף לא מכיל את פרטי הקבלה (ייתכן שהוא נטען רק בדפדפן). פתחו את הקישור, הורידו PDF והעלו אותו.');
    }
    const parsed = await parseReceiptWithAI(text, opts);
    if (!parsed.purchaseDate) parsed.purchaseDate = findDateInText(text);
    if (parsed.items.length === 0) {
      throw new Error('לא הצלחתי לקרוא פריטים מהקישור. פתחו אותו, הורידו PDF והעלו אותו.');
    }
    return NextResponse.json({ success: true, data: { ...parsed, rawText: text.slice(0, 20000) } });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'שגיאה בטעינת הקישור' },
      { status: 422 }
    );
  }
}
