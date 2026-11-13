import { type GroupSwipeSession, type SwipeCardItem, type SwipeVote } from '../types';

/**
 * Codifica un objeto JSON con caracteres Unicode (acentos, €, emojis) en Base64URL compacto
 * para compartir mazos de votación entre móviles mediante WhatsApp sin requerir cuentas.
 */
function encodeUtf8Base64Url(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decodeUtf8Base64Url(base64Url: string): string {
  let base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  const pad = base64.length % 4;
  if (pad) {
    base64 += '='.repeat(4 - pad);
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

interface CompactCard {
  i: string;
  t: string;
  p: string;
  a: string;
  n: string;
  m: string;
  pr?: string;
  op?: boolean;
  rt?: number;
  ph: string;
  sd: string;
  cg: string;
  lt: number;
  lg: number;
}

interface CompactSessionPayload {
  s: string; // sessionId
  c: string; // cityName
  d: CompactCard[];
  v: Record<string, 1 | 0>; // p1Votes (1 = like, 0 = pass)
}

export function encodeGroupSessionPayload(session: GroupSwipeSession): string {
  const compactVotes: Record<string, 1 | 0> = {};
  Object.entries(session.p1Votes || {}).forEach(([k, val]) => {
    compactVotes[k] = val === 'like' ? 1 : 0;
  });

  const payload: CompactSessionPayload = {
    s: session.sessionId,
    c: session.cityName,
    d: session.deck.map((card) => ({
      i: card.id,
      t: card.title,
      p: card.placeName,
      a: card.placeAddress,
      n: card.neighborhood,
      m: card.ambience,
      ...(card.priceLevel ? { pr: card.priceLevel } : {}),
      ...(typeof card.isOpenNow === 'boolean' ? { op: card.isOpenNow } : {}),
      ...(typeof card.rating === 'number' ? { rt: card.rating } : {}),
      ph: card.photoUrl,
      sd: card.shortDescription,
      cg: card.categoryTag,
      lt: Number(card.location.lat.toFixed(5)),
      lg: Number(card.location.lng.toFixed(5)),
    })),
    v: compactVotes,
  };

  return encodeUtf8Base64Url(JSON.stringify(payload));
}

export function decodeGroupSessionPayload(encoded: string): GroupSwipeSession | null {
  try {
    const jsonStr = decodeUtf8Base64Url(encoded);
    const parsed = JSON.parse(jsonStr) as CompactSessionPayload;
    if (!parsed || !Array.isArray(parsed.d) || parsed.d.length === 0) {
      return null;
    }

    const deck: SwipeCardItem[] = parsed.d.map((c, idx) => ({
      id: c.i || `card-${idx + 1}`,
      title: c.t || c.p,
      placeName: c.p,
      placeAddress: c.a || '',
      neighborhood: c.n || parsed.c || 'Centro',
      ambience: c.m || 'Calmo / Relajado',
      priceLevel: c.pr,
      isOpenNow: typeof c.op === 'boolean' ? c.op : undefined,
      rating: typeof c.rt === 'number' ? c.rt : undefined,
      photoUrl: c.ph || '/api/place-photo?category=bistro',
      shortDescription: c.sd || '',
      categoryTag: c.cg || 'Local',
      location: { lat: Number(c.lt), lng: Number(c.lg) },
    }));

    const p1Votes: Record<string, SwipeVote> = {};
    if (parsed.v && typeof parsed.v === 'object') {
      Object.entries(parsed.v).forEach(([k, val]) => {
        p1Votes[k] = val === 1 ? 'like' : 'pass';
      });
    }

    return {
      sessionId: parsed.s || `gs-${Date.now()}`,
      cityName: parsed.c || 'Tu ciudad',
      deck,
      p1Votes,
      createdAt: new Date().toISOString(),
    };
  } catch (err) {
    console.warn('Error decodificando sesión de grupo en URL:', err);
    return null;
  }
}

export function buildGroupShareUrl(session: GroupSwipeSession, originUrl?: string): string {
  const baseOrigin =
    originUrl || (typeof window !== 'undefined' ? window.location.origin + window.location.pathname : '');
  const encoded = encodeGroupSessionPayload(session);
  const url = new URL(baseOrigin || 'https://tastelocal.app/');
  url.searchParams.set('gs', session.sessionId);
  url.searchParams.set('g', encoded);
  return url.toString();
}

export function buildWhatsAppGroupShareUrl(shareUrl: string, cityName: string): string {
  const text = `🫂 ¿Hacemos plan en ${cityName}?\nYa voté mis 5 opciones en TasteLocal Living. Desliza las tuyas en 30 segundos y veamos si hacemos Match:\n${shareUrl}`;
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
