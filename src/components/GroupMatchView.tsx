import React, { useState, useEffect, useRef } from 'react';
import { useAppContext } from '../context/AppContext';
import { type SwipeCardItem, type SwipeVote, type GroupSwipeSession, type ProposalPlan } from '../types';
import { createGroupSessionProxy } from '../services/apiProxy';
import { buildGroupShareUrl, buildWhatsAppGroupShareUrl } from '../utils/groupSessionCodec';

type GroupPhase = 'p1_voting' | 'p1_complete' | 'p2_ready' | 'p2_voting' | 'results';

const getGoogleMapsGoNowUrl = (card: SwipeCardItem): string => {
  if (card.location && typeof card.location.lat === 'number' && typeof card.location.lng === 'number') {
    return `https://www.google.com/maps/dir/?api=1&destination=${card.location.lat},${card.location.lng}&travelmode=walking`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    `${card.placeName} ${card.placeAddress || card.neighborhood}`
  )}`;
};

const CardImageWithFallback: React.FC<{
  src: string;
  alt: string;
  categoryTag: string;
  className?: string;
}> = ({ src, alt, categoryTag, className = '' }) => {
  const [failed, setFailed] = useState(false);

  if (failed || !src) {
    return (
      <div
        className={`w-full h-full bg-gradient-to-br from-[#1C1E26] via-[#13151C] to-[#0B0C0E] flex flex-col items-center justify-center p-6 text-center ${className}`}
      >
        <div className="w-12 h-12 rounded-2xl bg-[#FF5E2B]/15 border border-[#FF5E2B]/30 flex items-center justify-center text-[#FF5E2B] mb-2">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
            />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </div>
        <span className="text-xs font-bold text-gray-300">{categoryTag}</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={`w-full h-full object-cover ${className}`}
      draggable={false}
    />
  );
};

const GroupMatchView: React.FC = () => {
  const {
    groupDeck,
    groupDeckCity,
    groupLoading,
    groupError,
    groupErrorDetails,
    incomingGroupSession,
    userLocation,
    handleStartGroupMode,
    handleExitGroupMode,
    savePlan,
    savedPlans,
  } = useAppContext();

  const [phase, setPhase] = useState<GroupPhase>(() =>
    incomingGroupSession ? 'p2_voting' : 'p1_voting'
  );
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [p1Votes, setP1Votes] = useState<Record<string, SwipeVote>>(
    () => incomingGroupSession?.p1Votes || {}
  );
  const [p2Votes, setP2Votes] = useState<Record<string, SwipeVote>>({});
  const [sessionId, setSessionId] = useState<string>(
    () =>
      incomingGroupSession?.sessionId ||
      `tl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
  );

  // Share link state
  const [shareUrl, setShareUrl] = useState<string>('');
  const [copiedLink, setCopiedLink] = useState<boolean>(false);

  // Tie-breaker / selected winning card in results
  const [chosenWinnerId, setChosenWinnerId] = useState<string | null>(null);

  // Swipe drag gesture physics
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [flyOutDir, setFlyOutDir] = useState<'left' | 'right' | null>(null);
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);

  // Sync when incoming shared session or a freshly generated deck arrives
  useEffect(() => {
    if (incomingGroupSession) {
      setSessionId(incomingGroupSession.sessionId);
      setP1Votes(incomingGroupSession.p1Votes || {});
      setP2Votes({});
      setCurrentIndex(0);
      setChosenWinnerId(null);
      setShareUrl('');
      setPhase('p2_voting');
    }
  }, [incomingGroupSession]);

  useEffect(() => {
    if (!incomingGroupSession && groupDeck.length > 0 && groupLoading === false) {
      setP1Votes({});
      setP2Votes({});
      setCurrentIndex(0);
      setChosenWinnerId(null);
      setShareUrl('');
      setSessionId(`tl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`);
      setPhase('p1_voting');
    }
  }, [groupDeck, groupLoading, incomingGroupSession]);

  // Persist session to backend and build share URL when Persona 1 completes voting
  useEffect(() => {
    if (phase !== 'p1_complete' || groupDeck.length === 0 || shareUrl) return;

    const sessionPayload: GroupSwipeSession = {
      sessionId,
      cityName: groupDeckCity || userLocation?.cityName || 'tu ciudad',
      deck: groupDeck,
      p1Votes,
      createdAt: new Date().toISOString(),
    };

    const generatedUrl = buildGroupShareUrl(sessionPayload);
    setShareUrl(generatedUrl);

    createGroupSessionProxy(sessionPayload).then((res) => {
      if (res.sessionId && res.sessionId !== sessionId) {
        setSessionId(res.sessionId);
        setShareUrl(buildGroupShareUrl({ ...sessionPayload, sessionId: res.sessionId }));
      }
    });
  }, [phase, groupDeck, groupDeckCity, p1Votes, sessionId, shareUrl, userLocation]);

  const activeCity = incomingGroupSession?.cityName || groupDeckCity || userLocation?.cityName || 'tu zona';
  const totalCards = groupDeck.length;
  const activeCard = groupDeck[currentIndex];
  const nextCard = groupDeck[currentIndex + 1];

  const commitVote = (vote: SwipeVote) => {
    if (!activeCard || flyOutDir) return;
    const dir = vote === 'like' ? 'right' : 'left';
    setFlyOutDir(dir);

    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(vote === 'like' ? 30 : 15);
      } catch {
        // Ignore blocked haptic feedback
      }
    }

    setTimeout(() => {
      const cardId = activeCard.id;
      if (phase === 'p1_voting') {
        const updatedP1 = { ...p1Votes, [cardId]: vote };
        setP1Votes(updatedP1);
        if (currentIndex + 1 >= totalCards) {
          setPhase('p1_complete');
        } else {
          setCurrentIndex((prev) => prev + 1);
        }
      } else if (phase === 'p2_voting') {
        const updatedP2 = { ...p2Votes, [cardId]: vote };
        setP2Votes(updatedP2);
        if (currentIndex + 1 >= totalCards) {
          setPhase('results');
        } else {
          setCurrentIndex((prev) => prev + 1);
        }
      }

      setFlyOutDir(null);
      setDragOffset({ x: 0, y: 0 });
    }, 190);
  };

  const handleUndo = () => {
    if (currentIndex <= 0 || flyOutDir) return;
    const prevIdx = currentIndex - 1;
    const prevCard = groupDeck[prevIdx];
    if (!prevCard) return;

    if (phase === 'p1_voting') {
      const copy = { ...p1Votes };
      delete copy[prevCard.id];
      setP1Votes(copy);
    } else if (phase === 'p2_voting') {
      const copy = { ...p2Votes };
      delete copy[prevCard.id];
      setP2Votes(copy);
    }
    setCurrentIndex(prevIdx);
  };

  // Pointer/touch drag handlers for native swipe deck feel
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (flyOutDir) return;
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    pointerStartRef.current = { x: e.clientX, y: e.clientY };
    setIsDragging(true);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging || !pointerStartRef.current || flyOutDir) return;
    const dx = e.clientX - pointerStartRef.current.x;
    const dy = e.clientY - pointerStartRef.current.y;
    setDragOffset({ x: dx, y: dy });
  };

  const handlePointerEnd = () => {
    if (!isDragging) return;
    setIsDragging(false);
    pointerStartRef.current = null;

    if (dragOffset.x >= 85) {
      commitVote('like');
    } else if (dragOffset.x <= -85) {
      commitVote('pass');
    } else {
      setDragOffset({ x: 0, y: 0 });
    }
  };

  const handleCopyShareLink = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    } catch {
      setCopiedLink(false);
    }
  };

  const handleSaveMatchedCard = (card: SwipeCardItem) => {
    const planEquivalent: ProposalPlan = {
      id: 'ideal',
      badge: 'MATCH EN PAREJA',
      tagline: `Acuerdo en ${activeCity}`,
      title: card.title,
      shortDescription: card.shortDescription,
      matchReason: card.matchReason || `Ambos elegisteis ${card.placeName} en ${card.neighborhood}.`,
      approxDuration: card.estimatedDuration || '1 - 2 horas',
      budgetEstimate: card.priceLevel || '€€',
      energyRequired: card.ambience,
      photoUrl: card.photoUrl,
      isOpenNow: card.isOpenNow,
      rating: card.rating,
      userRatingsTotal: card.userRatingsTotal,
      priceLevel: card.priceLevel,
      schedule: [
        {
          order: 1,
          time: 'Ahora / Cuando queráis',
          activity: card.categoryTag,
          placeName: card.placeName,
          placeId: card.id,
          placeAddress: card.placeAddress,
          location: { ...card.location, cityName: activeCity },
          description: card.shortDescription,
          photoUrl: card.photoUrl,
          isOpenNow: card.isOpenNow,
          rating: card.rating,
          userRatingsTotal: card.userRatingsTotal,
          priceLevel: card.priceLevel,
        },
      ],
    };
    savePlan(planEquivalent);
  };

  // Header compartido de la vista de grupo
  const renderHeader = () => (
    <header className="px-4 sm:px-6 py-3.5 bg-[#0F1015]/95 backdrop-blur-md border-b border-white/[0.08] flex items-center justify-between gap-4 sticky top-0 z-20 safe-pt">
      <button
        type="button"
        onClick={handleExitGroupMode}
        className="min-h-[44px] px-3 py-2 rounded-xl bg-white/[0.05] hover:bg-white/10 text-gray-300 hover:text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap shrink-0"
      >
        <svg className="w-4 h-4 text-[#FF5E2B]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" />
        </svg>
        <span>Salir</span>
      </button>

      <div className="min-w-0 text-center">
        <span className="text-xs font-extrabold tracking-tight text-white block truncate">
          Decidir juntos
        </span>
        <span className="text-[11px] text-gray-400 block truncate">
          {activeCity}
        </span>
      </div>

      <button
        type="button"
        onClick={() => handleStartGroupMode(userLocation || undefined)}
        disabled={groupLoading || !userLocation}
        className="min-h-[44px] px-3 py-2 rounded-xl bg-white/[0.05] hover:bg-[#FF5E2B]/15 disabled:opacity-40 text-gray-200 hover:text-white border border-white/10 text-xs font-bold transition cursor-pointer whitespace-nowrap shrink-0"
        title="Generar otro mazo de 5 planes"
      >
        Nuevo mazo
      </button>
    </header>
  );

  // Estado de carga con Skeleton Card oscura
  if (groupLoading) {
    return (
      <div className="flex flex-col h-full bg-[#0F1015] text-white overflow-hidden select-none">
        {renderHeader()}
        <main className="flex-grow flex flex-col items-center justify-center p-5 sm:p-8 max-w-md mx-auto w-full space-y-5">
          <div className="text-center space-y-1.5">
            <h2 className="text-lg sm:text-xl font-black text-white tracking-tight">
              Preparando 5 propuestas en {activeCity}...
            </h2>
            <p className="text-xs text-gray-400">
              Seleccionando locales variados y verificando disponibilidad en tiempo real
            </p>
          </div>

          <div className="w-full h-[430px] rounded-3xl border border-white/10 bg-[#14161D] overflow-hidden flex flex-col shadow-2xl">
            <div className="h-60 w-full skeleton-shimmer" />
            <div className="p-5 space-y-3 flex-grow">
              <div className="h-4 w-1/2 rounded-lg skeleton-shimmer" />
              <div className="h-6 w-4/5 rounded-lg skeleton-shimmer" />
              <div className="h-4 w-full rounded-lg skeleton-shimmer" />
              <div className="h-4 w-2/3 rounded-lg skeleton-shimmer" />
            </div>
          </div>

          <div className="flex items-center justify-center gap-6 w-full">
            <div className="w-16 h-16 rounded-full skeleton-shimmer" />
            <div className="w-16 h-16 rounded-full skeleton-shimmer" />
          </div>
        </main>
      </div>
    );
  }

  if (groupError || groupDeck.length === 0) {
    const isRadiusInsufficient = groupErrorDetails?.code === 'NO_VERIFIED_PLACES_IN_RADIUS';
    return (
      <div className="flex flex-col h-full bg-[#0F1015] text-white overflow-hidden">
        {renderHeader()}
        <main className="flex-grow flex flex-col items-center justify-center p-6 text-center space-y-4 max-w-md mx-auto">
          <div className="w-14 h-14 rounded-2xl bg-[#FF5E2B]/15 border border-[#FF5E2B]/30 flex items-center justify-center text-2xl">
            {isRadiusInsufficient ? '📍' : groupErrorDetails?.code === 'RATE_LIMITED' ? '⏳' : '🫂'}
          </div>
          <h2 className="text-lg font-black text-white">
            {isRadiusInsufficient
              ? 'Pocos lugares verificados cerca'
              : groupErrorDetails?.code === 'RATE_LIMITED'
              ? 'Límite temporal de consultas'
              : 'No pudimos cargar el mazo'}
          </h2>
          <p className="text-xs text-gray-300 leading-relaxed">
            {groupError || 'Necesitamos una ubicación activa para generar planes reales cercanos.'}
          </p>
          {groupErrorDetails?.requestId && (
            <p className="text-[10px] font-mono text-gray-500">
              Ref: {groupErrorDetails.requestId}
            </p>
          )}
          <div className="flex flex-wrap justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={handleExitGroupMode}
              className="min-h-[44px] px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-bold cursor-pointer"
            >
              Volver al inicio
            </button>
            {userLocation && isRadiusInsufficient && (
              <button
                type="button"
                onClick={() => handleStartGroupMode(userLocation, 15)}
                className="min-h-[44px] px-5 py-2.5 rounded-xl bg-[#FF5E2B] hover:bg-[#E84D1C] text-white text-xs font-bold cursor-pointer"
              >
                Ampliar radio a 15 km
              </button>
            )}
            {userLocation && !isRadiusInsufficient && groupErrorDetails?.retryable !== false && (
              <button
                type="button"
                onClick={() => handleStartGroupMode(userLocation)}
                className="min-h-[44px] px-5 py-2.5 rounded-xl bg-[#FF5E2B] hover:bg-[#E84D1C] text-white text-xs font-bold cursor-pointer"
              >
                Reintentar
              </button>
            )}
          </div>
        </main>
      </div>
    );
  }

  // Pantalla intermedia tras votar Persona 1: Pásale el móvil O WhatsApp link
  if (phase === 'p1_complete') {
    const p1LikedCount = Object.values(p1Votes).filter((v) => v === 'like').length;
    const whatsAppHref = shareUrl ? buildWhatsAppGroupShareUrl(shareUrl, activeCity) : '#';

    return (
      <div className="flex flex-col h-full bg-[#0F1015] text-white overflow-y-auto scrollbar-hide select-none">
        {renderHeader()}
        <main className="flex-grow flex flex-col items-center justify-center p-5 sm:p-8 max-w-lg mx-auto w-full space-y-6 animate-fade-in">
          <div className="text-center space-y-2">
            <div className="w-14 h-14 rounded-2xl bg-[#FF5E2B]/15 border border-[#FF5E2B]/30 text-[#FF5E2B] flex items-center justify-center text-2xl mx-auto shadow-lg">
              🤝
            </div>
            <h2 className="text-2xl font-black text-white tracking-tight text-balance">
              ¡Turno completado!
            </h2>
            <p className="text-xs sm:text-sm text-gray-300 leading-relaxed max-w-sm mx-auto">
              Has marcado <strong className="text-[#FF5E2B]">{p1LikedCount}</strong> de {totalCards} planes en {activeCity}. Ahora toca que decida tu acompañante sin registros ni cuentas.
            </p>
          </div>

          <div className="w-full space-y-3.5">
            {/* Opción A: Mismo móvil */}
            <button
              type="button"
              onClick={() => setPhase('p2_ready')}
              className="w-full p-5 rounded-2xl bg-[#FF5E2B] hover:bg-[#E84D1C] text-white text-left transition transform active:scale-[0.99] shadow-[0_10px_30px_rgba(255,94,43,0.3)] cursor-pointer flex items-center justify-between gap-4 min-h-[72px]"
            >
              <div className="space-y-1">
                <span className="text-sm sm:text-base font-black block">
                  En el mismo móvil · Pasa el teléfono
                </span>
                <span className="text-xs text-white/90 block">
                  Ocultamos tus votos para que vote justo ahora sin pistas
                </span>
              </div>
              <svg className="w-6 h-6 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </button>

            {/* Divider */}
            <div className="flex items-center gap-3 py-1">
              <div className="h-px flex-grow bg-white/10" />
              <span className="text-[11px] font-semibold text-gray-500">o si no estáis juntos ahora</span>
              <div className="h-px flex-grow bg-white/10" />
            </div>

            {/* Opción B: Enlace inteligente por WhatsApp */}
            <div className="p-5 rounded-2xl bg-white/[0.04] border border-white/10 space-y-3">
              <div>
                <h3 className="text-sm font-extrabold text-white">
                  Enviar enlace inteligente por WhatsApp
                </h3>
                <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">
                  Tu acompañante abrirá las mismas 5 tarjetas en su teléfono y verá el Match al instante al terminar.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                <a
                  href={whatsAppHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-h-[48px] py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer whitespace-nowrap"
                >
                  <span>💬</span>
                  <span>Enviar por WhatsApp</span>
                </a>

                <button
                  type="button"
                  onClick={handleCopyShareLink}
                  className="min-h-[48px] py-3 px-4 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-white text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer whitespace-nowrap"
                >
                  <span>{copiedLink ? '✓ Enlace copiado' : '🔗 Copiar enlace'}</span>
                </button>
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // Buffer de privacidad antes de que vote Persona 2 en el mismo móvil
  if (phase === 'p2_ready') {
    return (
      <div className="flex flex-col h-full bg-[#0F1015] text-white overflow-hidden select-none">
        {renderHeader()}
        <main className="flex-grow flex flex-col items-center justify-center p-6 text-center max-w-md mx-auto w-full space-y-6 animate-fade-in">
          <div className="w-16 h-16 rounded-3xl bg-[#FF5E2B]/15 border border-[#FF5E2B]/30 text-[#FF5E2B] flex items-center justify-center text-3xl shadow-lg">
            📱
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-black text-white tracking-tight text-balance">
              ¡Listo! Pásale el móvil a tu acompañante
            </h2>
            <p className="text-xs sm:text-sm text-gray-300 leading-relaxed">
              Los votos anteriores están ocultos. Desliza las mismas 5 propuestas en {activeCity} y descubrid en qué hacéis Match.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setCurrentIndex(0);
              setDragOffset({ x: 0, y: 0 });
              setPhase('p2_voting');
            }}
            className="w-full min-h-[54px] py-4 px-6 rounded-2xl bg-[#FF5E2B] hover:bg-[#E84D1C] text-white text-sm font-black shadow-[0_8px_24px_rgba(255,94,43,0.35)] transition active:scale-[0.98] cursor-pointer"
          >
            Empezar turno de Persona 2
          </button>
        </main>
      </div>
    );
  }

  // Pantalla de "¡ES UN MATCH!" o Desempate rápido
  if (phase === 'results') {
    const matches = groupDeck.filter(
      (card) => p1Votes[card.id] === 'like' && p2Votes[card.id] === 'like'
    );
    const p1Favorites = groupDeck.filter((card) => p1Votes[card.id] === 'like');
    const p2Favorites = groupDeck.filter((card) => p2Votes[card.id] === 'like');
    const unionFavorites = groupDeck.filter(
      (card) => p1Votes[card.id] === 'like' || p2Votes[card.id] === 'like'
    );

    const activeWinner: SwipeCardItem | undefined =
      (chosenWinnerId && groupDeck.find((c) => c.id === chosenWinnerId)) ||
      matches[0] ||
      undefined;

    const handleRandomTieBreak = () => {
      const pool = unionFavorites.length > 0 ? unionFavorites : groupDeck;
      const randomCard = pool[Math.floor(Math.random() * pool.length)];
      if (randomCard) {
        setChosenWinnerId(randomCard.id);
      }
    };

    const isWinningCardSaved = activeWinner
      ? savedPlans.some(
          (sp) =>
            sp.plan.title === activeWinner.title &&
            sp.plan.schedule?.[0]?.placeName === activeWinner.placeName
        )
      : false;

    return (
      <div className="flex flex-col h-full bg-[#0F1015] text-white overflow-y-auto scrollbar-hide select-none">
        {renderHeader()}

        <main className="flex-grow p-5 sm:p-8 max-w-2xl mx-auto w-full space-y-6 animate-fade-in pb-10">
          {matches.length > 0 && activeWinner ? (
            <>
              {/* Celebración ¡ES UN MATCH! */}
              <div className="text-center space-y-2 pt-1">
                <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#FF5E2B]/15 border border-[#FF5E2B]/40 text-[#FF5E2B] text-xs font-black tracking-wide">
                  <span>🎉</span>
                  <span>{matches.length === 1 ? 'Coincidencia perfecta' : `${matches.length} coincidencias`}</span>
                </div>
                <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight text-balance">
                  ¡Es un Match!
                </h1>
                <p className="text-xs sm:text-sm text-gray-300">
                  Ambos habéis elegido este plan en {activeCity}. Ya no hay que darle más vueltas.
                </p>
              </div>

              {/* Selector rápido si hubo más de 1 coincidencia */}
              {matches.length > 1 && (
                <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
                  {matches.map((m, idx) => {
                    const isSelected = activeWinner.id === m.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setChosenWinnerId(m.id)}
                        className={`min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-bold border transition whitespace-nowrap shrink-0 cursor-pointer ${
                          isSelected
                            ? 'bg-[#FF5E2B] border-[#FF5E2B] text-white shadow-sm'
                            : 'bg-white/[0.04] border-white/10 text-gray-300 hover:text-white'
                        }`}
                      >
                        Match {idx + 1}: {m.placeName}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Tarjeta Ganadora */}
              <article className="rounded-3xl bg-[#14161D] border border-[#FF5E2B]/40 overflow-hidden shadow-[0_16px_48px_rgba(255,94,43,0.18)]">
                <div className="relative h-56 sm:h-64 w-full bg-[#0B0C0E]">
                  <CardImageWithFallback
                    src={activeWinner.photoUrl}
                    alt={activeWinner.placeName}
                    categoryTag={activeWinner.categoryTag}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#14161D] via-[#14161D]/45 to-transparent" />
                  <div className="absolute bottom-4 left-5 right-5 space-y-1">
                    <div className="flex items-center gap-2 text-xs text-gray-200 flex-wrap">
                      <span className="font-bold text-[#FF5E2B]">{activeWinner.neighborhood}</span>
                      <span aria-hidden="true">·</span>
                      <span>{activeWinner.categoryTag}</span>
                      {activeWinner.priceLevel && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-bold text-white">{activeWinner.priceLevel}</span>
                        </>
                      )}
                      {activeWinner.isOpenNow === true && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="text-emerald-300 font-semibold">Abierto ahora</span>
                        </>
                      )}
                    </div>
                    <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight leading-snug">
                      {activeWinner.placeName}
                    </h2>
                  </div>
                </div>

                <div className="p-5 sm:p-6 space-y-4">
                  <div className="space-y-1.5">
                    <p className="text-sm font-bold text-[#FF5E2B]">{activeWinner.title}</p>
                    <p className="text-xs sm:text-sm text-gray-300 leading-relaxed">
                      {activeWinner.shortDescription}
                    </p>
                  </div>

                  <div className="flex items-center justify-between gap-3 text-xs text-gray-400 pt-2 border-t border-white/[0.08] flex-wrap">
                    <span>📍 {activeWinner.placeAddress}</span>
                    <span>
                      {activeWinner.ambience}
                      {activeWinner.rating ? ` · ★ ${activeWinner.rating.toFixed(1)}` : ''}
                    </span>
                  </div>

                  <div className="pt-2 space-y-2.5">
                    <a
                      href={getGoogleMapsGoNowUrl(activeWinner)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full min-h-[54px] py-4 px-6 rounded-2xl bg-[#FF5E2B] hover:bg-[#E84D1C] text-white text-sm font-black shadow-[0_8px_24px_rgba(255,94,43,0.4)] transition transform active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <span>🧭</span>
                      <span>Ir ahora (Abrir en Google Maps)</span>
                    </a>

                    <div className="grid grid-cols-2 gap-2.5">
                      <button
                        type="button"
                        onClick={() => handleSaveMatchedCard(activeWinner)}
                        className="min-h-[44px] py-2.5 px-4 rounded-xl bg-white/[0.06] hover:bg-white/10 border border-white/10 text-xs font-bold text-white transition cursor-pointer"
                      >
                        {isWinningCardSaved ? '❤️ Guardado' : '❤️ Guardar plan'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleStartGroupMode(userLocation || undefined)}
                        disabled={!userLocation}
                        className="min-h-[44px] py-2.5 px-4 rounded-xl bg-white/[0.06] hover:bg-white/10 border border-white/10 disabled:opacity-40 text-xs font-bold text-gray-200 transition cursor-pointer"
                      >
                        🔄 Nuevo mazo
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            </>
          ) : (
            /* No direct match -> Quick Tie-Breaker */
            <div className="space-y-6">
              <div className="text-center space-y-2 pt-1">
                <span className="text-xs font-bold text-[#FF5E2B]">Sin coincidencia directa</span>
                <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight text-balance">
                  Desempate rápido
                </h1>
                <p className="text-xs sm:text-sm text-gray-300 max-w-md mx-auto leading-relaxed">
                  {unionFavorites.length > 0
                    ? 'Cada uno se inclinó por planes distintos. Elegid una opción favorita de la lista o dejad que la suerte decida.'
                    : 'Ninguno marcó "Me apetece" en este mazo. Podéis sortear uno ahora o pedir 5 propuestas nuevas.'}
                </p>
              </div>

              {activeWinner && (
                <article className="rounded-3xl bg-[#14161D] border border-[#FF5E2B] p-5 space-y-4 shadow-xl animate-fade-in">
                  <div className="flex items-center gap-4">
                    <div className="w-20 h-20 rounded-2xl overflow-hidden flex-shrink-0 bg-[#0B0C0E]">
                      <CardImageWithFallback
                        src={activeWinner.photoUrl}
                        alt={activeWinner.placeName}
                        categoryTag={activeWinner.categoryTag}
                      />
                    </div>
                    <div className="min-w-0 space-y-1">
                      <span className="text-[11px] font-bold text-[#FF5E2B] block">
                        Opción elegida para ir ahora
                      </span>
                      <h2 className="text-lg font-black text-white truncate">{activeWinner.placeName}</h2>
                      <p className="text-xs text-gray-400 truncate">
                        {activeWinner.neighborhood} · {activeWinner.ambience}
                        {activeWinner.priceLevel ? ` · ${activeWinner.priceLevel}` : ''}
                      </p>
                    </div>
                  </div>

                  <a
                    href={getGoogleMapsGoNowUrl(activeWinner)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full min-h-[52px] py-3.5 px-6 rounded-2xl bg-[#FF5E2B] hover:bg-[#E84D1C] text-white text-sm font-black shadow-[0_8px_24px_rgba(255,94,43,0.35)] transition flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <span>🧭</span>
                    <span>Ir ahora (Abrir en Google Maps)</span>
                  </a>
                </article>
              )}

              {/* Favoritos lado a lado */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <section className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-3">
                  <h3 className="text-xs font-extrabold uppercase tracking-wider text-gray-300">
                    Favoritos Persona 1 ({p1Favorites.length})
                  </h3>
                  {p1Favorites.length === 0 ? (
                    <p className="text-xs text-gray-500">Sin favoritos marcados</p>
                  ) : (
                    <div className="space-y-2.5">
                      {p1Favorites.map((c) => (
                        <div
                          key={`p1-${c.id}`}
                          className="p-3 rounded-xl bg-black/30 border border-white/10 flex items-center justify-between gap-2.5"
                        >
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-white truncate">{c.placeName}</p>
                            <p className="text-[11px] text-gray-400 truncate">
                              {c.neighborhood} · {c.categoryTag}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setChosenWinnerId(c.id)}
                            className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap shrink-0 cursor-pointer ${
                              chosenWinnerId === c.id
                                ? 'bg-[#FF5E2B] text-white'
                                : 'bg-white/10 hover:bg-[#FF5E2B] text-white'
                            }`}
                          >
                            {chosenWinnerId === c.id ? 'Elegido' : 'Elegir'}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                <section className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-3">
                  <h3 className="text-xs font-extrabold uppercase tracking-wider text-gray-300">
                    Favoritos Persona 2 ({p2Favorites.length})
                  </h3>
                  {p2Favorites.length === 0 ? (
                    <p className="text-xs text-gray-500">Sin favoritos marcados</p>
                  ) : (
                    <div className="space-y-2.5">
                      {p2Favorites.map((c) => (
                        <div
                          key={`p2-${c.id}`}
                          className="p-3 rounded-xl bg-black/30 border border-white/10 flex items-center justify-between gap-2.5"
                        >
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-white truncate">{c.placeName}</p>
                            <p className="text-[11px] text-gray-400 truncate">
                              {c.neighborhood} · {c.categoryTag}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setChosenWinnerId(c.id)}
                            className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap shrink-0 cursor-pointer ${
                              chosenWinnerId === c.id
                                ? 'bg-[#FF5E2B] text-white'
                                : 'bg-white/10 hover:bg-[#FF5E2B] text-white'
                            }`}
                          >
                            {chosenWinnerId === c.id ? 'Elegido' : 'Elegir'}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={handleRandomTieBreak}
                  className="min-h-[48px] py-3 px-5 rounded-2xl bg-[#FF5E2B] hover:bg-[#E84D1C] text-white text-xs font-black transition cursor-pointer flex items-center justify-center gap-2"
                >
                  <span>🎲</span>
                  <span>Desempatar al azar</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleStartGroupMode(userLocation || undefined)}
                  disabled={!userLocation}
                  className="min-h-[48px] py-3 px-5 rounded-2xl bg-white/10 hover:bg-white/15 disabled:opacity-40 text-white text-xs font-bold transition cursor-pointer flex items-center justify-center gap-2"
                >
                  <span>🔄</span>
                  <span>Probar otras 5 propuestas</span>
                </button>
              </div>
            </div>
          )}
        </main>
      </div>
    );
  }

  // Vista principal: SWIPE DECK (Persona 1 o Persona 2)
  const voterLabel = phase === 'p1_voting' ? 'Turno de Persona 1' : 'Turno de Persona 2';
  const progressPercent = ((currentIndex + 1) / Math.max(1, totalCards)) * 100;
  const activeTranslateX =
    flyOutDir === 'right' ? 420 : flyOutDir === 'left' ? -420 : dragOffset.x;
  const activeTranslateY = flyOutDir ? 30 : dragOffset.y * 0.25;
  const activeRotate =
    flyOutDir === 'right' ? 16 : flyOutDir === 'left' ? -16 : dragOffset.x * 0.055;
  const activeOpacity = flyOutDir ? 0 : 1;

  const likeStampOpacity =
    flyOutDir === 'right' ? 1 : Math.max(0, Math.min(1, (dragOffset.x - 24) / 80));
  const passStampOpacity =
    flyOutDir === 'left' ? 1 : Math.max(0, Math.min(1, (-dragOffset.x - 24) / 80));

  return (
    <div className="flex flex-col h-full bg-[#0F1015] text-white overflow-hidden select-none">
      {renderHeader()}

      <main className="flex-grow flex flex-col justify-between px-4 sm:px-6 py-4 max-w-md mx-auto w-full overflow-hidden">
        {/* Top Progress & Voter Indicator */}
        <div className="space-y-2 flex-shrink-0">
          {incomingGroupSession && phase === 'p2_voting' && currentIndex === 0 && (
            <p className="text-[11px] text-[#FF5E2B] font-semibold text-center">
              Te han invitado a elegir plan en {activeCity} · Desliza tus 5 opciones
            </p>
          )}

          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-white">{voterLabel}</span>
            <span className="font-mono tabular-nums text-gray-400">
              {currentIndex + 1} / {totalCards}
            </span>
          </div>

          <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full bg-[#FF5E2B] transition-all duration-300 rounded-full"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* Interactive Swipe Deck Stack */}
        <div className="relative flex-grow my-3 min-h-[360px] max-h-[500px] flex items-center justify-center">
          {/* Next Card Peeking Behind */}
          {nextCard && (
            <div
              key={`next-${nextCard.id}`}
              className="absolute inset-0 rounded-3xl bg-[#14161D] border border-white/10 overflow-hidden pointer-events-none transform scale-[0.95] translate-y-3 opacity-60"
            >
              <CardImageWithFallback
                src={nextCard.photoUrl}
                alt={nextCard.placeName}
                categoryTag={nextCard.categoryTag}
              />
              <div className="absolute inset-0 bg-[#0F1015]/60" />
            </div>
          )}

          {/* Top Draggable Card */}
          {activeCard && (
            <div
              key={`active-${phase}-${activeCard.id}`}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerEnd}
              onPointerCancel={handlePointerEnd}
              style={{
                touchAction: 'none',
                transform: `translate3d(${activeTranslateX}px, ${activeTranslateY}px, 0) rotate(${activeRotate}deg)`,
                opacity: activeOpacity,
                transition: isDragging
                  ? 'none'
                  : 'transform 200ms cubic-bezier(0.16, 1, 0.3, 1), opacity 180ms ease-out',
              }}
              className="absolute inset-0 rounded-3xl bg-[#14161D] border border-white/15 overflow-hidden shadow-2xl flex flex-col cursor-grab active:cursor-grabbing"
            >
              {/* Photo Header (upper ~58%) */}
              <div className="relative h-[58%] w-full bg-[#0B0C0E] flex-shrink-0">
                <CardImageWithFallback
                  src={activeCard.photoUrl}
                  alt={activeCard.placeName}
                  categoryTag={activeCard.categoryTag}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#14161D] via-[#14161D]/40 to-transparent" />

                {/* Swipe Right Stamp: ME APETECE */}
                <div
                  style={{ opacity: likeStampOpacity }}
                  className="absolute top-5 left-5 px-4 py-1.5 rounded-xl border-2 border-[#FF5E2B] bg-[#0F1015]/80 text-[#FF5E2B] font-black text-base tracking-wider transform -rotate-12 pointer-events-none"
                >
                  ME APETECE
                </div>

                {/* Swipe Left Stamp: PASAR */}
                <div
                  style={{ opacity: passStampOpacity }}
                  className="absolute top-5 right-5 px-4 py-1.5 rounded-xl border-2 border-red-400 bg-[#0F1015]/80 text-red-400 font-black text-base tracking-wider transform rotate-12 pointer-events-none"
                >
                  PASAR
                </div>

                {/* Quick Status Overlay on Image Bottom */}
                <div className="absolute bottom-3 left-5 right-5 flex items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2 font-semibold truncate">
                    {activeCard.isOpenNow === true ? (
                      <span className="text-emerald-300">Abierto ahora</span>
                    ) : activeCard.isOpenNow === false ? (
                      <span className="text-red-300">Cerrado ahora</span>
                    ) : (
                      <span className="text-amber-300">Consultar horario</span>
                    )}
                    {activeCard.rating && (
                      <>
                        <span className="text-gray-400" aria-hidden="true">·</span>
                        <span className="text-white font-bold tabular-nums">
                          ★ {activeCard.rating.toFixed(1)}
                        </span>
                      </>
                    )}
                  </div>

                  {activeCard.priceLevel && (
                    <span className="font-black text-[#FF5E2B] text-sm">
                      {activeCard.priceLevel}
                    </span>
                  )}
                </div>
              </div>

              {/* Card Details (lower ~42%) */}
              <div className="p-5 flex-grow flex flex-col justify-between gap-2 bg-[#14161D]">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-xs text-gray-400 truncate">
                    <span className="font-bold text-[#FF5E2B]">{activeCard.neighborhood}</span>
                    <span aria-hidden="true">·</span>
                    <span>{activeCard.categoryTag}</span>
                    <span aria-hidden="true">·</span>
                    <span className="truncate">{activeCard.ambience}</span>
                  </div>

                  <h2 className="text-lg sm:text-xl font-black text-white tracking-tight leading-snug line-clamp-1">
                    {activeCard.placeName}
                  </h2>

                  <p className="text-xs text-gray-300 leading-relaxed line-clamp-2">
                    {activeCard.shortDescription}
                  </p>
                </div>

                <p className="text-[11px] text-gray-500 truncate pt-1 border-t border-white/[0.06]">
                  📍 {activeCard.placeAddress}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Thumb-Zone Bottom Swipe Action Controls */}
        <div className="flex items-center justify-center gap-4 pt-1 pb-2 flex-shrink-0 safe-pb">
          <button
            type="button"
            onClick={() => commitVote('pass')}
            disabled={Boolean(flyOutDir)}
            className="flex-1 min-h-[54px] py-3 px-4 rounded-2xl bg-white/[0.06] hover:bg-white/10 border border-white/15 text-gray-200 hover:text-white text-sm font-black transition active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
            aria-label="Pasar esta propuesta"
          >
            <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
            </svg>
            <span>Pasar</span>
          </button>

          <button
            type="button"
            onClick={handleUndo}
            disabled={currentIndex === 0 || Boolean(flyOutDir)}
            className="w-12 h-[54px] rounded-2xl bg-white/[0.04] hover:bg-white/10 disabled:opacity-30 border border-white/10 text-gray-300 flex items-center justify-center transition active:scale-95 cursor-pointer flex-shrink-0"
            title="Deshacer último voto"
            aria-label="Deshacer último voto"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M3 10h10a5 5 0 015 5v2M3 10l5-5M3 10l5 5" />
            </svg>
          </button>

          <button
            type="button"
            onClick={() => commitVote('like')}
            disabled={Boolean(flyOutDir)}
            className="flex-1 min-h-[54px] py-3 px-4 rounded-2xl bg-[#FF5E2B] hover:bg-[#E84D1C] text-white text-sm font-black shadow-[0_8px_24px_rgba(255,94,43,0.35)] transition active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
            aria-label="Me apetece esta propuesta"
          >
            <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
            </svg>
            <span>Me apetece</span>
          </button>
        </div>
      </main>
    </div>
  );
};

export default GroupMatchView;
