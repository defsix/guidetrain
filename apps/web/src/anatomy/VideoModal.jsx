import React, { useEffect, useRef } from 'react';

/**
 * A YouTube demonstration, played in the app rather than in a new tab.
 *
 * Click-to-load: nothing from YouTube is fetched until this opens, so the
 * explorer doesn't drag the player's scripts and cookies along with it on every
 * visit. The nocookie host is used for the same reason.
 *
 * A *search* cannot be embedded — YouTube removed `listType=search` in November
 * 2020 and it now 4xxs — so this needs a real video id, resolved at build time
 * by tools/exercises/resolve-videos.py. Exercises without one keep the plain
 * search link instead of opening an empty player.
 */
export default function VideoModal({ exercise, onClose }) {
  const closeRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    closeRef.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!exercise?.videoId) return null;
  const src = `https://www.youtube-nocookie.com/embed/${exercise.videoId}`
    + '?autoplay=1&rel=0&modestbranding=1';

  return (
    <div
      className="video-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`${exercise.name} demonstration`}
    >
      <div className="video-box" onClick={(e) => e.stopPropagation()}>
        <div className="video-bar">
          <span className="vtitle">{exercise.name}</span>
          <button ref={closeRef} className="vclose" onClick={onClose} aria-label="Close video">✕</button>
        </div>
        <div className="video-frame">
          <iframe
            src={src}
            title={`${exercise.name} demonstration`}
            allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            loading="lazy"
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </div>
        <div className="video-foot">
          {exercise.videoChannel && <span>{exercise.videoChannel}</span>}
          {/* Videos get deleted and made private, and an owner can withdraw
              embedding at any time, so the way out to YouTube always stays. */}
          <a href={exercise.youtube} target="_blank" rel="noreferrer noopener">
            Search YouTube →
          </a>
        </div>
      </div>
    </div>
  );
}
