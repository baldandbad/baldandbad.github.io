// js/auto-music-class.js
// Autoplay attempt on entry, loop, save/restore position, mute/unmute via element with class.
// Change AUDIO_SRC to your audio file path.
(function(){
  const AUDIO_SRC = '/assets/music.mp3'; // <-- set your audio path
  const POS_KEY = 'auto-music-pos';
  const MUTED_KEY = 'auto-music-muted';
  const STATE_KEY = 'auto-music-state';

  // class element selector
  const toggleEl = document.querySelector('.auto-music-toggle');
  const iconEl = document.querySelector('.auto-music-icon');

  // create/find audio element
  let audio = document.getElementById('auto-music-audio') || document.getElementById('bg-audio') || null;
  if(!audio){
    audio = document.createElement('audio');
    audio.id = 'auto-music-audio';
    audio.src = AUDIO_SRC;
    audio.preload = 'auto';
    audio.loop = true;
    audio.style.display = 'none';
    document.body.appendChild(audio);
  } else {
    audio.loop = true;
    audio.preload = audio.preload || 'auto';
  }

  // BroadcastChannel for mute sync (fallback to localStorage events)
  let bc = null;
  try { bc = new BroadcastChannel('auto-music-class'); } catch(e){ bc = null; }

  // helper: update UI class & ARIA
  function setUI(muted){
    if(!toggleEl) return;
    toggleEl.classList.toggle('muted', !!muted);
    toggleEl.setAttribute('aria-pressed', String(!muted));
    if(iconEl) iconEl.style.opacity = muted ? '0.65' : '1';
  }

  // restore saved mute and position
  try {
    const savedMuted = localStorage.getItem(MUTED_KEY);
    if(savedMuted !== null) audio.muted = savedMuted === '1';

    const savedPos = parseFloat(localStorage.getItem(POS_KEY) || '0');
    if(!isNaN(savedPos) && savedPos > 0){
      audio.addEventListener('loadedmetadata', function _onMeta(){
        const dur = audio.duration || 0;
        if(dur > 0){
          const t = (savedPos % dur + dur) % dur;
          if(Math.abs(audio.currentTime - t) > 0.5) audio.currentTime = t;
        }
        audio.removeEventListener('loadedmetadata', _onMeta);
      });
    }
  } catch(e){ /* ignore storage errors */ }

  // incoming sync handler
  function handleIncoming(m){
    if(!m) return;
    if(m.type === 'muted'){
      audio.muted = !!m.value;
      try { localStorage.setItem(MUTED_KEY, audio.muted ? '1' : '0'); } catch(e){}
      setUI(audio.muted);
    }
    if(m.type === 'seek' && typeof m.time === 'number'){
      const t = m.time;
      if(!isNaN(audio.duration) && audio.duration > 0){
        const desired = (t % audio.duration + audio.duration) % audio.duration;
        if(Math.abs(audio.currentTime - desired) > 0.5) audio.currentTime = desired;
      } else {
        if(Math.abs(audio.currentTime - t) > 0.5) audio.currentTime = t;
      }
    }
  }

  if(bc){
    bc.onmessage = ev => handleIncoming(ev.data);
  } else {
    window.addEventListener('storage', (e) => {
      if(e.key === MUTED_KEY){
        audio.muted = e.newValue === '1';
        setUI(audio.muted);
      }
      if(e.key === POS_KEY && e.newValue){
        const t = parseFloat(e.newValue);
        if(!isNaN(t) && Math.abs(audio.currentTime - t) > 0.5) audio.currentTime = t;
      }
    });
  }

  // autoplay attempt on entry
  window.addEventListener('load', async () => {
    // respect user choice: if they paused previously don't force
    const lastState = localStorage.getItem(STATE_KEY) || 'playing';
    if(lastState !== 'playing'){
      setUI(audio.muted);
      return;
    }

    async function tryPlayUnmuted(){
      try {
        audio.muted = audio.muted; // keep stored mute if exists; we want unmuted attempt only if currently not muted
        await audio.play();
        try { localStorage.setItem(STATE_KEY, 'playing'); } catch(e){}
        setUI(audio.muted);
        return true;
      } catch(e){
        return false;
      }
    }

    async function tryPlayMuted(){
      try {
        audio.muted = true;
        await audio.play();
        try { localStorage.setItem(STATE_KEY, 'playing'); } catch(e){}
        try { localStorage.setItem(MUTED_KEY, '1'); } catch(e){}
        setUI(true);
        if(bc) bc.postMessage({type:'muted', value: true});
        return true;
      } catch(err){
        audio.muted = false;
        return false;
      }
    }

    // Prefer audible if stored preference isn't muted; otherwise still try audible first.
    let ok = await tryPlayUnmuted();
    if(ok) return;
    ok = await tryPlayMuted();
    if(ok) return;

    // can't autoplay at all — UI stays according to stored state; user will click to start.
    setUI(audio.muted);
  });

  // keyboard support: Enter/Space toggles when element focused
  function toggleMuteAndPlay(){
    const newMuted = !audio.muted;
    audio.muted = newMuted;
    setUI(newMuted);
    // attempt to play if paused (click is user gesture)
    audio.play().catch(()=>{ /* play may still fail, ignore */ });
    try { localStorage.setItem(MUTED_KEY, audio.muted ? '1' : '0'); } catch(e){}
    if(bc) bc.postMessage({type:'muted', value: audio.muted});
    else try { localStorage.setItem(MUTED_KEY, audio.muted ? '1' : '0'); } catch(e){}
  }

  if(toggleEl){
    toggleEl.addEventListener('click', (ev) => { ev.preventDefault(); toggleMuteAndPlay(); });
    toggleEl.addEventListener('keydown', (ev) => {
      if(ev.key === 'Enter' || ev.key === ' '){
        ev.preventDefault();
        toggleMuteAndPlay();
      }
    });
  }

  // save position periodically
  const SAVE_INTERVAL = 800;
  setInterval(()=> {
    try { if(!audio.paused) localStorage.setItem(POS_KEY, String(audio.currentTime)); } catch(e){}
  }, SAVE_INTERVAL);

  // also save on unload
  window.addEventListener('beforeunload', ()=> {
    try { localStorage.setItem(POS_KEY, String(audio.currentTime || 0)); } catch(e){}
    try { localStorage.setItem(MUTED_KEY, audio.muted ? '1' : '0'); } catch(e){}
  });

  // broadcast position occasionally for cross-tab sync
  setInterval(()=> {
    if(bc && !audio.paused){
      bc.postMessage({type:'seek', time: audio.currentTime});
    }
  }, 4500);

  // initialize UI
  setUI(audio.muted);

  // expose API if needed
  window.AutoMusicClass = {
    audio,
    isMuted: () => audio.muted,
    toggle: () => toggleEl && toggleEl.click()
  };

})();
