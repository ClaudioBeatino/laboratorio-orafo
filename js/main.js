/**
 * @file main.js — Sebastiano Fotia Laboratorio Orafo
 * @author Claudio Beatino
 *
 * Script principale dell'interfaccia.
 * Caricato in fondo al <body> senza defer/async: il DOM è già pronto
 * all'esecuzione, quindi DOMContentLoaded è opzionale per tutto ciò
 * che non aspetta risorse esterne.
 *
 * Struttura:
 *   1.  Sicurezza      — eseguita subito, prima del DOM ready
 *   2.  DOM ready      — binding centralizzato degli eventi
 *   3.  Hamburger menu
 *   4.  Cursor personalizzato
 *   5.  Navbar scroll
 *   6.  Particelle hero
 *   7.  Scroll reveal
 *   8.  Nav indicator
 *   9.  Gallery filter
 *   10. Comparison sliders (prima/dopo)
 *   11. File upload     — validazione MIME e dimensione
 *   12. Form di contatto
 *   13. Smooth scroll
 *   14. Tasto Escape
 *   15. Cookie consent manager (GDPR)
 *
 * Dipendenze esterne: nessuna (vanilla JS, zero framework).
 */

/* ════════════════════════════════════════════════════════════
   1. SICUREZZA — eseguito immediatamente, prima del DOM
   ════════════════════════════════════════════════════════════ */

// Forza HTTPS in produzione. Il check sul hostname evita redirect
// infiniti su localhost e sviluppo file://.
if (location.protocol === 'http:' &&
    location.hostname !== 'localhost' &&
    location.hostname !== '127.0.0.1') {
  location.replace(location.href.replace('http:', 'https:'));
}

// Anti-clickjacking runtime — secondo strato rispetto al meta X-Frame-Options.
// Copre scenari in cui gli header HTTP vengono rimossi da proxy o CDN intermedi.
if (window.self !== window.top) {
  document.body.innerHTML = '';
  window.top.location = window.self.location;
}

// Timestamp del caricamento pagina, usato dal timing-check nel form:
// un modulo compilato in meno di 2 secondi indica quasi certamente un bot
// (nessun umano può leggere e compilare 4 campi in così poco tempo).
const _pageLoadTime = Date.now();

// Rate limiting lato client: un invio ogni 60 secondi per utente.
// Complemento al rate limit di Formspree, non sostituto.
let _lastSubmit = 0;
const SUBMIT_COOLDOWN_MS = 60_000;

/* ════════════════════════════════════════════════════════════
   2. DOM READY — binding centralizzato degli eventi
   ════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {

  // Obfuscazione email: ricostruisce l'indirizzo da tre attributi data-*
  // separati per rendere difficile la raccolta automatica da scraper.
  // Il markup originale contiene solo frammenti (data-u, data-d, data-t).
  document.querySelectorAll('.obf-email').forEach(a => {
    const email = `${a.dataset.u}@${a.dataset.d}.${a.dataset.t}`;
    a.textContent = email;
    a.href = 'mailto:' + email;
  });

  // Blocca drag e context menu sulle illustrazioni SVG della galleria
  // per rendere più difficile il salvataggio delle immagini.
  document.querySelectorAll('.gallery-item, .storia-frame').forEach(el => {
    el.addEventListener('contextmenu', e => e.preventDefault());
    el.addEventListener('dragstart',   e => e.preventDefault());
  });

  // Ctrl+S / Cmd+S: impedisce il "Salva pagina" del browser,
  // che salverebbe l'HTML con le SVG facilmente estraibili.
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') e.preventDefault();
  });

  // Chiude il menu mobile cliccando su qualsiasi voce di navigazione.
  document.querySelectorAll('.mobile-nav a').forEach(a => {
    a.addEventListener('click', closeMobileNav);
  });

  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => filterGallery(btn.dataset.filter, btn));
  });

  const fileInput = document.getElementById('fileInput');
  if (fileInput) fileInput.addEventListener('change', () => handleFiles(fileInput));

  const submitBtn = document.getElementById('submitBtn');
  if (submitBtn) submitBtn.addEventListener('click', submitForm);

  // Rimuove lo stato di errore non appena l'utente inizia a correggere
  // il campo, per un feedback immediato e non punitivo.
  ['fname', 'email', 'reqtype', 'desc'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', () => setFieldError(id, false));
  });
  document.getElementById('gdpr')?.addEventListener('change', () => setFieldError('gdpr', false));

  // Cookie banner
  document.getElementById('ckBannerReject')  ?.addEventListener('click', rejectCookies);
  document.getElementById('ckBannerSettings')?.addEventListener('click', openCookieSettings);
  document.getElementById('ckBannerAccept')  ?.addEventListener('click', acceptAllCookies);
  document.getElementById('ckBannerLink')    ?.addEventListener('click', e => {
    e.preventDefault();
    openCookieSettings();
  });

  // Cookie modal
  document.querySelector('.ck-modal-close')?.addEventListener('click', closeCookieModal);
  document.getElementById('ckModalReject')  ?.addEventListener('click', rejectCookies);
  document.getElementById('ckModalSave')    ?.addEventListener('click', saveCookiePrefs);

  // Clic sul backdrop del modal → chiude (pattern UX standard per i dialog).
  document.getElementById('cookieModal')?.addEventListener('click', function (e) {
    if (e.target === this) closeCookieModal();
  });

  document.querySelectorAll('.ck-cat-head').forEach(head => {
    head.addEventListener('click', () => toggleCatDetail(head));
  });

  // stopPropagation: impedisce che il clic sul toggle attivi anche
  // l'handler del header padre (che aprirebbe/chiuderebbe il pannello dettaglio).
  document.querySelectorAll('.ck-toggle').forEach(label => {
    label.addEventListener('click', e => e.stopPropagation());
  });

  document.getElementById('footerCookieBtn')?.addEventListener('click', openCookieSettings);

  // Link Privacy/Cookie Policy non ancora implementati: preventDefault
  // evita che il browser salti a #top perdendo la posizione di scroll.
  document.querySelectorAll('a[data-noop]').forEach(a => {
    a.addEventListener('click', e => e.preventDefault());
  });
});

/* ════════════════════════════════════════════════════════════
   3. HAMBURGER MENU
   ════════════════════════════════════════════════════════════ */
const hamburger = document.getElementById('hamburger');
const mobileNav = document.getElementById('mobileNav');
let _scrollY = 0;

/** Apre il menu di navigazione mobile con scroll lock. */
function openMobileNav() {
  mobileNav.style.display = 'flex';

  // Doppio requestAnimationFrame: garantisce che il browser applichi
  // display:flex prima di aggiungere la classe .open (che attiva la
  // transizione CSS sull'opacità). Senza questo, la transizione è ignorata
  // su Safari iOS perché l'elemento viene visto come appena creato nel layout.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    mobileNav.classList.add('open');
  }));

  hamburger.classList.add('open');
  hamburger.setAttribute('aria-expanded', 'true');
  mobileNav.setAttribute('aria-hidden', 'false');

  // Scroll lock iOS-safe: su Safari mobile, overflow:hidden sul body
  // non impedisce lo scroll. La tecnica position:fixed + top negativo
  // è l'unico workaround affidabile cross-browser senza librerie esterne.
  _scrollY = window.scrollY;
  document.body.style.position  = 'fixed';
  document.body.style.top       = `-${_scrollY}px`;
  document.body.style.width     = '100%';
  document.body.style.overflowY = 'scroll'; // mantiene la scrollbar per evitare layout shift
}

/** Chiude il menu mobile e ripristina la posizione di scroll. */
function closeMobileNav() {
  mobileNav.classList.remove('open');
  hamburger.classList.remove('open');
  hamburger.setAttribute('aria-expanded', 'false');
  mobileNav.setAttribute('aria-hidden', 'true');

  // Ripristina il body prima di scrollTo: nell'ordine inverso rispetto
  // all'apertura per evitare un salto visivo durante il restore.
  document.body.style.position  = '';
  document.body.style.top       = '';
  document.body.style.width     = '';
  document.body.style.overflowY = '';
  window.scrollTo({ top: _scrollY, behavior: 'instant' });

  setTimeout(() => { mobileNav.style.display = 'none'; }, 350); // attende la transizione CSS
}

hamburger.addEventListener('click', () => {
  hamburger.classList.contains('open') ? closeMobileNav() : openMobileNav();
});

/* ════════════════════════════════════════════════════════════
   4. CURSOR PERSONALIZZATO
   ════════════════════════════════════════════════════════════ */
const cursor = document.getElementById('cursor');
const ring   = document.getElementById('cursorRing');

document.addEventListener('mousemove', e => {
  cursor.style.left = e.clientX + 'px';
  cursor.style.top  = e.clientY + 'px';

  // Il ring segue con un ritardo intenzionale di 60ms per simulare inerzia
  // visiva. requestAnimationFrame sincronizzerebbe il ring al cursore senza
  // lag percepibile, annullando l'effetto voluto.
  setTimeout(() => {
    ring.style.left = e.clientX + 'px';
    ring.style.top  = e.clientY + 'px';
  }, 60);
});

/* ════════════════════════════════════════════════════════════
   5. NAVBAR SCROLL
   ════════════════════════════════════════════════════════════ */
window.addEventListener('scroll', () => {
  document.getElementById('navbar').classList.toggle('scrolled', scrollY > 80);
});

/* ════════════════════════════════════════════════════════════
   6. PARTICELLE HERO
   ════════════════════════════════════════════════════════════ */
(function () {
  const container = document.getElementById('particles');
  if (!container) return;

  // 18 particelle con dimensioni e timing casuali per un effetto organico.
  // Le proprietà di animazione sono definite nel CSS (floatParticle keyframe);
  // qui si randomizzano solo posizione, dimensione e durata per variabilità.
  for (let i = 0; i < 18; i++) {
    const p    = document.createElement('div');
    p.className = 'particle';
    const size  = Math.random() * 3 + 1;
    p.style.cssText = `
      width:${size}px; height:${size}px;
      left:${Math.random() * 100}%;
      top:${Math.random() * 100}%;
      animation-duration:${Math.random() * 6 + 4}s;
      animation-delay:${Math.random() * 6}s;
      position:absolute;
    `;
    container.appendChild(p);
  }
})();

/* ════════════════════════════════════════════════════════════
   7. SCROLL REVEAL
   ════════════════════════════════════════════════════════════ */
const reveals = document.querySelectorAll('.reveal, .reveal-l, .reveal-r');
const io = new IntersectionObserver(entries => {
  entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible'); });
}, {
  // 0.15: l'elemento deve essere visibile per il 15% prima che scatti
  // l'animazione. Un valore troppo basso (0) provoca transizioni che partono
  // appena l'elemento entra dal bordo inferiore dello schermo, risultando
  // in movimenti poco percepibili su scroll veloce.
  threshold: .15
});
reveals.forEach(el => io.observe(el));

/* ════════════════════════════════════════════════════════════
   8. NAV INDICATOR
   ════════════════════════════════════════════════════════════ */
const navIndicator = document.getElementById('navIndicator');
const navLinks     = document.querySelectorAll('.nav-links a');
const sections     = ['hero', 'storia', 'servizi', 'galleria', 'prima-dopo', 'richiesta'];

/**
 * Sposta la barra indicatore dorata sotto il link di navigazione specificato,
 * calcolando la posizione relativa alla lista .nav-links.
 *
 * @param {HTMLElement|null} el  Link da evidenziare. null nasconde l'indicatore.
 */
function moveIndicator(el) {
  if (!el) { navIndicator.style.opacity = '0'; return; }
  const navRect  = document.querySelector('.nav-links').getBoundingClientRect();
  const linkRect = el.getBoundingClientRect();
  navIndicator.style.opacity = '1';
  navIndicator.style.left    = (linkRect.left - navRect.left) + 'px';
  navIndicator.style.width   = linkRect.width + 'px';
}

navLinks.forEach(a => {
  a.addEventListener('mouseenter', () => moveIndicator(a));
});
document.querySelector('.nav-links')?.addEventListener('mouseleave', highlightActive);

/**
 * Evidenzia il link corrispondente alla sezione attualmente visibile
 * basandosi sulla posizione di scroll.
 *
 * L'offset di 120px tiene conto dell'altezza della navbar fissa:
 * senza di esso, la sezione verrebbe marcata attiva prima che il suo
 * contenuto sia effettivamente visibile sotto la barra.
 */
function highlightActive() {
  let current = null;
  sections.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (window.scrollY >= el.offsetTop - 120) current = id;
  });
  const activeLink = document.querySelector(`.nav-links a[href="#${current}"]`);
  navLinks.forEach(a => a.style.color = '');
  if (activeLink) {
    activeLink.style.color = 'var(--gold)';
    moveIndicator(activeLink);
  } else {
    navIndicator.style.opacity = '0';
  }
}

window.addEventListener('scroll', highlightActive);
window.addEventListener('resize', highlightActive);
highlightActive();

/* ════════════════════════════════════════════════════════════
   9. GALLERY FILTER
   ════════════════════════════════════════════════════════════ */

/**
 * Filtra gli elementi della galleria per categoria.
 *
 * Gli elementi non corrispondenti vengono resi quasi trasparenti (opacity 0.2)
 * invece di essere nascosti con display:none, per mantenere la griglia CSS
 * stabile ed evitare il ricalcolo del layout (reflow).
 *
 * @param {string}      cat  Categoria da mostrare ('tutti' | 'anelli' | 'collane' | 'orecchini').
 * @param {HTMLElement} btn  Pulsante filtro cliccato (per aggiornare la classe .active).
 */
function filterGallery(cat, btn) {
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll('.gallery-item').forEach(item => {
    const match = cat === 'tutti' || item.dataset.cat === cat;
    item.style.opacity   = match ? '1' : '0.2';
    item.style.transform = match ? 'scale(1)' : 'scale(0.96)';
    item.style.transition = 'opacity .4s, transform .4s';
  });
}

/* ════════════════════════════════════════════════════════════
   10. COMPARISON SLIDERS (prima/dopo)
   ════════════════════════════════════════════════════════════ */

/**
 * Inizializza uno slider interattivo prima/dopo.
 *
 * La rivelazione usa `clip-path: inset(0 X% 0 0)` sul layer "dopo"
 * anziché modificare width o left, perché clip-path è composited dalla GPU
 * e non innesca reflow del layout ad ogni evento puntatore (ottimizzazione
 * critica su mobile dove gli eventi touchmove sono frequentissimi).
 *
 * @param {HTMLElement} sliderEl  Contenitore con position:relative.
 * @param {HTMLElement} handleEl  Barra divisoria trascinabile.
 * @param {HTMLElement} afterEl   Layer "dopo" che viene ritagliato via clip-path.
 */
function initSlider(sliderEl, handleEl, afterEl) {
  let dragging = false;

  /**
   * Calcola la percentuale di avanzamento dall'evento puntatore.
   * Gestione unificata mouse/touch per evitare duplicazione logica.
   *
   * @param {MouseEvent|TouchEvent} e
   * @param {DOMRect} rect  Bounding box del contenitore slider.
   * @returns {number}  Percentuale clampata in [0, 100].
   */
  const getPercent = (e, rect) => {
    const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
    return Math.max(0, Math.min(100, x / rect.width * 100));
  };

  const update = pct => {
    handleEl.style.left    = pct + '%';
    afterEl.style.clipPath = `inset(0 ${100 - pct}% 0 0)`;
  };

  update(50); // posizione iniziale centrata

  handleEl.addEventListener('mousedown',  () => dragging = true);
  handleEl.addEventListener('touchstart', () => dragging = true, { passive: true });
  window.addEventListener('mouseup',  () => dragging = false);
  window.addEventListener('touchend', () => dragging = false);

  window.addEventListener('mousemove', e => {
    if (!dragging) return;
    update(getPercent(e, sliderEl.getBoundingClientRect()));
  });
  // passive:true su touchmove: segnala al browser che non chiameremo
  // preventDefault(), permettendogli di ottimizzare lo scroll su mobile.
  window.addEventListener('touchmove', e => {
    if (!dragging) return;
    update(getPercent(e, sliderEl.getBoundingClientRect()));
  }, { passive: true });

  // Permette anche un singolo click per posizionare il divisore.
  sliderEl.addEventListener('click', e => {
    update(getPercent(e, sliderEl.getBoundingClientRect()));
  });
}

[1, 2, 3, 4].forEach(n => {
  initSlider(
    document.getElementById('slider' + n),
    document.getElementById('handle' + n),
    document.getElementById('after'  + n)
  );
});

/* ════════════════════════════════════════════════════════════
   11. FILE UPLOAD — validazione MIME e dimensione lato client
   ════════════════════════════════════════════════════════════ */

/**
 * Valida i file selezionati e mostra l'esito all'utente.
 *
 * Questa validazione è un layer UX: la vera validazione deve sempre
 * avvenire lato server (Formspree o backend proprio). Non fidarsi
 * mai della sola validazione client-side per la sicurezza.
 *
 * Se almeno un file non è valido, l'intero input viene svuotato
 * per forzare una nuova selezione anziché inviare silenziosamente
 * file non conformi insieme a quelli validi.
 *
 * @param {HTMLInputElement} input  L'elemento input[type=file] da validare.
 */
function handleFiles(input) {
  const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  const MAX_SIZE_MB   = 10;
  const list  = document.getElementById('fileList');
  list.innerHTML = '';
  let blocked = 0;

  Array.from(input.files).forEach(f => {
    const div = document.createElement('div');
    div.style.cssText = 'font-family:Jost,sans-serif;font-size:.72rem;padding:.3rem 0;font-weight:300;';

    if (!ALLOWED_TYPES.includes(f.type)) {
      div.style.color = '#c0614a';
      div.textContent = '✗ ' + f.name + ' — tipo non consentito';
      blocked++;
    } else if (f.size > MAX_SIZE_MB * 1024 * 1024) {
      div.style.color = '#c0614a';
      div.textContent = '✗ ' + f.name + ' — supera ' + MAX_SIZE_MB + ' MB';
      blocked++;
    } else {
      div.style.color = '#7A7060';
      div.textContent = '✓ ' + f.name + ' (' + Math.round(f.size / 1024) + ' KB)';
    }
    list.appendChild(div);
  });

  if (blocked > 0) input.value = '';
}

/* ════════════════════════════════════════════════════════════
   12. FORM DI CONTATTO
   ════════════════════════════════════════════════════════════ */

/**
 * Applica o rimuove lo stato di errore visivo su un campo del form.
 *
 * @param {string}  id        ID del gruppo campo (elemento con id="grp-{id}").
 * @param {boolean} hasError  true = mostra errore, false = rimuove errore.
 */
function setFieldError(id, hasError) {
  const grp = document.getElementById('grp-' + id);
  if (grp) grp.classList.toggle('has-error', hasError);
}

/**
 * Valida il form e invia i dati a Formspree via fetch (JSON).
 *
 * Strati anti-bot applicati nell'ordine:
 *   1. Honeypot    — se hp_website è compilato → fake-success silenzioso
 *   2. Timing      — compilazione < 2 s → drop (impossibile per un umano)
 *   3. Rate limit  — cooldown 60 s tra un invio e il successivo
 *   4. Validazione — campi obbligatori + regex email + consenso GDPR
 *
 * NOTA sugli allegati: i file NON vengono inviati tramite questo payload JSON.
 * L'endpoint JSON di Formspree non supporta multipart/form-data.
 * Per abilitare l'invio di file: sostituire JSON.stringify con FormData
 * e rimuovere l'header Content-Type (il browser lo imposta automaticamente).
 *
 * TODO produzione: verificare l'endpoint Formspree → xaqkkokk
 */
async function submitForm() {
  // Honeypot: un bot automatico compila tutti i campi del DOM; un utente
  // reale non vede né raggiunge questo campo (nascosto con CSS fuori schermo).
  // La risposta fake-success non rivela al bot di essere stato bloccato.
  if (document.getElementById('hp_website').value !== '') {
    document.getElementById('requestForm').style.display = 'none';
    document.getElementById('formSuccess').style.display = 'block';
    return;
  }

  // Timing check: 2 secondi è sotto il minimo fisiologico per leggere
  // e compilare 4 campi di testo. Soglia bassa per evitare falsi positivi
  // su utenti con form pre-compilati (es. password manager).
  if (Date.now() - _pageLoadTime < 2000) return;

  const now = Date.now();
  if (now - _lastSubmit < SUBMIT_COOLDOWN_MS) {
    const wait = Math.ceil((SUBMIT_COOLDOWN_MS - (now - _lastSubmit)) / 1000);
    const btn  = document.getElementById('submitBtn');
    btn.innerHTML = `<span>Attendi ${wait}s prima di reinviare</span>`;
    return;
  }

  const name    = document.getElementById('fname').value.trim();
  const lname   = document.getElementById('lname').value.trim();
  const email   = document.getElementById('email').value.trim();
  const phone   = document.getElementById('phone').value.trim();
  const type    = document.getElementById('reqtype').value;
  const desc    = document.getElementById('desc').value.trim();
  const gdpr    = document.getElementById('gdpr').checked;
  // Regex minimalista: esclude solo indirizzi senza @ e senza dominio.
  // Validazione più rigorosa spetta al server.
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);

  setFieldError('fname',   !name);
  setFieldError('email',   !emailOk);
  setFieldError('reqtype', !type);
  setFieldError('desc',    !desc);
  setFieldError('gdpr',    !gdpr);

  if (!name || !emailOk || !type || !desc || !gdpr) return;

  const btn = document.getElementById('submitBtn');
  btn.innerHTML           = '<span>Invio in corso…</span>';
  btn.style.opacity       = '0.6';
  btn.style.pointerEvents = 'none';

  try {
    const res = await fetch('https://formspree.io/f/xaqkkokk', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({
        nome:      name + ' ' + lname,
        email,
        telefono:  phone || 'Non fornito',
        tipo:      type,
        messaggio: desc,
        gdpr:      'Accettato'
      })
    });

    if (res.ok) {
      _lastSubmit = Date.now();
      document.getElementById('requestForm').style.display = 'none';
      document.getElementById('formSuccess').style.display = 'block';
    } else {
      btn.innerHTML           = '<span>Errore — riprova</span>';
      btn.style.opacity       = '1';
      btn.style.pointerEvents = 'auto';
    }
  } catch {
    btn.innerHTML           = '<span>Errore di rete — riprova</span>';
    btn.style.opacity       = '1';
    btn.style.pointerEvents = 'auto';
  }
}

/* ════════════════════════════════════════════════════════════
   13. SMOOTH SCROLL
   ════════════════════════════════════════════════════════════ */
document.querySelectorAll('a[href^="#"]').forEach(a => {
  a.addEventListener('click', e => {
    const href = a.getAttribute('href');
    // href="#" è usato dai link placeholder (privacy policy, cookie policy).
    // Non intercettare: altri listener gestiscono il preventDefault su questi.
    if (!href || href === '#') return;
    e.preventDefault();
    try {
      const target = document.querySelector(href);
      if (target) target.scrollIntoView({ behavior: 'smooth' });
    } catch { /* selector CSS non valido — ignora silenziosamente */ }
  });
});

/* ════════════════════════════════════════════════════════════
   14. TASTO ESCAPE — chiude menu mobile e modal cookie
   ════════════════════════════════════════════════════════════ */
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeMobileNav();
    closeCookieModal();
  }
});

/* ════════════════════════════════════════════════════════════
   15. COOKIE CONSENT MANAGER
       Conforme a:
         · GDPR (Reg. UE 2016/679)
         · Provvedimento Garante Privacy 10 giugno 2021
   ════════════════════════════════════════════════════════════ */

// CK_VERSION è il numero di versione della cookie policy.
// Incrementarlo forza il re-consent di tutti gli utenti esistenti:
// getCookiePrefs() scarta i record con versione diversa da CK_VERSION.
const CK_KEY     = 'fotia_cookie_consent_v1';
const CK_VERSION = 1;

/**
 * Legge le preferenze cookie da localStorage.
 * Restituisce null se non trovate, non valide JSON, o di versione obsoleta.
 *
 * @returns {{ analytics: boolean, marketing: boolean, functional: boolean, version: number, date: string } | null}
 */
function getCookiePrefs() {
  try {
    const raw = localStorage.getItem(CK_KEY);
    if (!raw) return null;
    const prefs = JSON.parse(raw);
    if (prefs.version !== CK_VERSION) return null;
    return prefs;
  } catch { return null; }
}

/**
 * Persiste le preferenze cookie su localStorage aggiungendo versione
 * e data di consenso (ISO 8601, solo giorno) per l'audit GDPR.
 *
 * @param {{ analytics: boolean, marketing: boolean, functional: boolean }} prefs
 */
function savePrefsToDisk(prefs) {
  prefs.version   = CK_VERSION;
  prefs.date      = new Date().toISOString().slice(0, 10);
  prefs.necessary = true; // i cookie necessari sono sempre attivi, non modificabili dall'utente
  localStorage.setItem(CK_KEY, JSON.stringify(prefs));
}

/**
 * Carica dinamicamente gli script di terze parti in base al consenso.
 * I flag window._gaLoaded e window._fbLoaded evitano che gli script
 * vengano iniettati più volte se applyConsent viene chiamata più volte.
 *
 * TODO produzione — sostituire prima di andare live:
 *   · 'G-XXXXXXXXXX'         → GA4 Measurement ID reale (da Google Analytics)
 *   · 'XXXXXXXXXXXXXXXXXX'   → Meta Pixel ID reale (da Facebook Business Manager)
 *
 * @param {{ analytics: boolean, marketing: boolean, functional: boolean }} prefs
 */
function applyConsent(prefs) {
  if (prefs.analytics && !window._gaLoaded) {
    window._gaLoaded = true;
    const GA_ID = 'G-3YRDY1CVE6';
    const s     = document.createElement('script');
    s.src   = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
    s.async = true;
    document.head.appendChild(s);
    window.dataLayer = window.dataLayer || [];
    // Funzione gtag locale: pattern ufficiale Google.
    // Non sovrascrive una eventuale gtag globale già presente (es. GTM).
    function gtag() { dataLayer.push(arguments); }
    gtag('js', new Date());
    gtag('config', GA_ID, { anonymize_ip: true });
  }

  if (prefs.marketing && !window._fbLoaded) {
    window._fbLoaded = true;
    const PIXEL_ID = 'XXXXXXXXXXXXXXXXXX'; // ← sostituire con Pixel ID reale
    // Snippet ufficiale Meta Pixel v2.0 — non modificare la struttura interna.
    !function (f, b, e, v, n, t, s) {
      if (f.fbq) return;
      n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
      if (!f._fbq) f._fbq = n;
      n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = [];
      t = b.createElement(e); t.async = !0; t.src = v;
      s = b.getElementsByTagName(e)[0];
      s.parentNode.insertBefore(t, s);
    }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
    fbq('init', PIXEL_ID);
    fbq('track', 'PageView');
  }

  if (prefs.functional) {
    // Aggiungere qui widget WhatsApp Business, live chat, o altri script funzionali.
  }
}

/**
 * Sincronizza lo stato dei toggle nel modal con le preferenze salvate,
 * in modo che riaprendo le impostazioni l'utente veda le sue scelte precedenti.
 *
 * @param {{ analytics: boolean, marketing: boolean, functional: boolean } | null} prefs
 */
function syncToggles(prefs) {
  if (!prefs) return;
  const map = {
    analytics:  'toggle_analytics',
    marketing:  'toggle_marketing',
    functional: 'toggle_functional'
  };
  Object.entries(map).forEach(([key, id]) => {
    const el = document.getElementById(id);
    if (el) el.checked = !!prefs[key];
  });
}

function showBanner() {
  const el = document.getElementById('cookieBanner');
  el.style.display = 'flex';
  // Doppio rAF: stessa ragione del menu mobile. Necessario perché la
  // transizione CSS slideUp sia visibile dopo il display:flex.
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('ck-visible')));
}

function hideBanner() {
  const el = document.getElementById('cookieBanner');
  el.classList.remove('ck-visible');
  setTimeout(() => { el.style.display = 'none'; }, 450); // durata transizione CSS
}

function openCookieSettings() {
  syncToggles(getCookiePrefs());
  const m = document.getElementById('cookieModal');
  m.style.display = 'flex';
  requestAnimationFrame(() => m.classList.add('ck-visible'));
  // Focus sul pulsante di chiusura per accessibilità keyboard (WCAG 2.1 §2.4.3).
  m.querySelector('.ck-modal-close').focus();
}

function closeCookieModal() {
  const m = document.getElementById('cookieModal');
  m.classList.remove('ck-visible');
  setTimeout(() => { m.style.display = 'none'; }, 300);
}

function acceptAllCookies() {
  const prefs = { analytics: true, marketing: true, functional: true };
  savePrefsToDisk(prefs);
  applyConsent(prefs);
  hideBanner();
  closeCookieModal();
}

function rejectCookies() {
  const prefs = { analytics: false, marketing: false, functional: false };
  savePrefsToDisk(prefs);
  // Non chiamare applyConsent: nessun script di terze parti da caricare.
  hideBanner();
  closeCookieModal();
}

function saveCookiePrefs() {
  const prefs = {
    analytics:  document.getElementById('toggle_analytics').checked,
    marketing:  document.getElementById('toggle_marketing').checked,
    functional: document.getElementById('toggle_functional').checked
  };
  savePrefsToDisk(prefs);
  applyConsent(prefs);
  hideBanner();
  closeCookieModal();
}

/**
 * Apre o chiude il pannello dettaglio di una categoria cookie.
 *
 * La categoria "necessary" è sempre espansa e non può essere collassata:
 * comportamento atteso dagli standard GDPR UI (i cookie necessari non
 * richiedono consenso e devono essere sempre visibili all'utente).
 *
 * @param {HTMLElement} headEl  Header della categoria cliccata.
 */
function toggleCatDetail(headEl) {
  const cat = headEl.closest('.ck-cat');
  if (cat.dataset.cat === 'necessary') return;
  cat.classList.toggle('open');
}

// Inizializzazione: se il consenso esiste già viene applicato immediatamente;
// altrimenti il banner appare dopo 800ms per permettere alla pagina di
// caricarsi visivamente prima di sovrapporre l'UI del consenso.
(function initCookieBanner() {
  const prefs = getCookiePrefs();
  if (prefs) {
    applyConsent(prefs);
  } else {
    setTimeout(showBanner, 800);
  }
})();
