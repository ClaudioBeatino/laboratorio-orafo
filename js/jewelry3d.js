/**
 * @file jewelry3d.js — Sebastiano Fotia Laboratorio Orafo
 * @author Claudio Beatino
 *
 * Visualizzatori 3D interattivi dei gioielli tramite Three.js.
 * Crea quattro scene indipendenti nei canvas #j3d-1…#j3d-4 con:
 *   · Materiali PBR (Physically Based Rendering) per oro e gemme
 *   · Studio di illuminazione a 5 luci fisse + 2 sparkle orbitanti
 *   · Interazione drag-to-rotate su mouse e touch
 *   · Rotazione automatica che si disattiva al primo tocco
 *
 * Dipendenza: three@0.161.0/build/three.min.js
 * Deve essere caricato DOPO Three.js. Se Three.js non è disponibile,
 * il modulo esce silenziosamente grazie al guard iniziale.
 */

(function () {
  if (!window.THREE) return; // Three.js non ancora caricato: esci senza errori
  const T = THREE;

  /* ── Materiali PBR ──────────────────────────────────────────────── */

  /**
   * Oro giallo 18 kt.
   *
   * metalness:0.97  → quasi completamente metallico; il 3% residuo evita
   *                   un nero puro nelle cavità dove non arriva la luce
   * roughness:0.13  → superficie lucidata a specchio con leggera diffusione,
   *                   evitando riflessi artificialmente perfetti (aspetto "plasticoso")
   */
  const matGold = () => new T.MeshStandardMaterial({
    color: 0xC9A84C, metalness: 0.97, roughness: 0.13
  });

  /**
   * Oro bianco 18 kt (lega con palladio o platino — aspetto argenteo neutro).
   *
   * roughness leggermente più bassa rispetto all'oro giallo: le leghe di oro bianco
   * lucidato hanno riflessi più freddi e nitidi rispetto all'oro giallo satinato.
   */
  const matWhiteGold = () => new T.MeshStandardMaterial({
    color: 0xDDDDD8, metalness: 0.97, roughness: 0.10
  });

  /**
   * Diamante taglio brillante.
   *
   * Usa MeshPhysicalMaterial (non MeshStandardMaterial): solo Physical
   * supporta i parametri di rifrazione volumetrica (transmission, ior, thickness).
   *
   * transmission:0.92     → il 92% dei raggi di luce attraversa la gemma (quasi trasparente)
   * thickness:0.6         → profondità stimata del gioiello in scene units, usata dal
   *                         modello di rifrazione volumetrica per calcolare il percorso della luce
   * ior:2.42              → Indice di Rifrazione reale del diamante (uno dei più alti in natura;
   *                         causa la caratteristica dispersione cromatica "arcobaleno")
   * specularIntensity:2.0 → riflessi amplificati per simulare il bagliore delle faccette
   * clearcoat:1.0         → strato superiore extra-lucido (effetto "bagnato" della superficie)
   * flatShading:true      → facce piatte anziché smooth: simula le faccette nette del taglio brillante
   */
  const matDiamond = () => new T.MeshPhysicalMaterial({
    color: 0xffffff, metalness: 0, roughness: 0,
    transmission: 0.92, thickness: 0.6, ior: 2.42,
    specularIntensity: 2.0, reflectivity: 1.0,
    clearcoat: 1.0, clearcoatRoughness: 0,
    flatShading: true
  });

  /**
   * Gemma colorata generica (smeraldi, rubini, ecc.).
   *
   * Non usa transmission perché le gemme colorate hanno opacità significativa;
   * il caratteristico scintillio si ottiene tramite specularIntensity elevata
   * e clearcoat per il riflesso superficiale.
   *
   * @param {number} hex  Colore esadecimale (es. 0x00712a = smeraldo, 0xaa0000 = rubino).
   */
  const matGem = hex => new T.MeshPhysicalMaterial({
    color: hex, metalness: 0.05, roughness: 0.04,
    specularIntensity: 1.8, reflectivity: 0.95,
    clearcoat: 1.0, clearcoatRoughness: 0
  });

  /* ── Studio di illuminazione ────────────────────────────────────── */

  /**
   * Configura il rig di luci per la fotografia professionale di gioielleria.
   *
   * Schema a 5 luci fisse + 2 sparkle dinamici:
   *
   *  AmbientLight (0x1a1608, 12)      — base scurissima color caldo: il 3% di luce
   *                                     ambient non appiattisce i materiali metallici
   *                                     come farebbe un ambient bianco standard
   *
   *  SpotLight key (ore 2, alto)      — luce principale frontale-alta; angolo stretto
   *                                     (PI/4.5) con penombra (0.35) per ombre morbide
   *                                     simili a quelle di un softbox professionale
   *
   *  DirectionalLight fill (sinistra) — luce blu-fredda complementare; riempie le ombre
   *                                     proiettate dalla key light senza eliminarle
   *
   *  DirectionalLight rim (ore 6, dietro) — controluce basso-posteriore: crea un alone
   *                                     luminoso che "stacca" il gioiello dallo sfondo scuro
   *
   *  PointLight bounce (basso-destra) — rimbalzo color oro dal basso; simula la luce
   *                                     riflessa dal fondo in velluto dorato usato nella
   *                                     fotografia gioielleria professionale
   *
   *  PointLight top (zenitale)        — highlight puro dall'alto per esaltare
   *                                     le superfici piatte (tavola del diamante, ecc.)
   *
   *  PointLight sp1, sp2 (orbitanti)  — luci sparkle animate nel loop di render:
   *                                     simulano i riflessi dinamici delle gemme quando
   *                                     la luce ambiente cambia prospettiva
   *
   * @param   {THREE.Scene} scene
   * @returns {{ sp1: THREE.PointLight, sp2: THREE.PointLight }}
   */
  function setupLights(scene) {
    scene.add(new T.AmbientLight(0x1a1608, 12));

    const key = new T.SpotLight(0xfff5cc, 6, 40, Math.PI / 4.5, 0.35, 1);
    key.position.set(6, 10, 6);
    key.castShadow = true;
    scene.add(key);

    const fill = new T.DirectionalLight(0x99bbff, 1.8);
    fill.position.set(-6, 3, 5);
    scene.add(fill);

    const rim = new T.DirectionalLight(0xfff8e0, 1.4);
    rim.position.set(0, -4, -9);
    scene.add(rim);

    const bounce = new T.PointLight(0xC9A84C, 2.5, 15);
    bounce.position.set(4, -4, 4);
    scene.add(bounce);

    const top = new T.PointLight(0xffffff, 3.5, 12);
    top.position.set(0, 8, 0);
    scene.add(top);

    const sp1 = new T.PointLight(0xffffff, 1.8, 7);
    const sp2 = new T.PointLight(0xffe8a0, 1.2, 6);
    scene.add(sp1);
    scene.add(sp2);
    return { sp1, sp2 };
  }

  /* ── Viewer generico ────────────────────────────────────────────── */

  /**
   * Crea e avvia una scena Three.js interattiva all'interno di un canvas.
   *
   * Scelte tecniche rilevanti:
   *
   *  ACESFilmic tone mapping — standard industriale per la CGI:
   *    comprime le alte luci in modo naturale, evitando sovraesposizioni
   *    bianche sui materiali metallici lucidi ad alta intensità luminosa
   *
   *  FOV 42° (invece del default 75°) — angolo ristretto per ridurre
   *    la distorsione prospettica su oggetti piccoli, avvicinando il
   *    risultato a una foto macro con obiettivo a focale lunga (tele corta)
   *
   *  devicePixelRatio cappato a 2× — i display Retina 3× e 4× hanno
   *    poco guadagno visivo oltre 2× ma triplicano/quadruplicano i pixel
   *    da renderizzare, degradando le prestazioni su mobile
   *
   *  ResizeObserver — gestisce il ridimensionamento responsive del canvas
   *    senza appoggiarsi a window.resize (meno reattivo e costoso)
   *
   * @param {string}   canvasId  ID del canvas HTML di destinazione.
   * @param {Function} buildFn   Factory che restituisce un THREE.Group del gioiello.
   */
  function createViewer(canvasId, buildFn) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const getSize = () => ({
      w: canvas.parentElement.offsetWidth  || 300,
      h: canvas.parentElement.offsetHeight || 300
    });

    const { w, h } = getSize();
    const renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h);
    renderer.toneMapping         = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.7;
    renderer.shadowMap.enabled   = true;
    renderer.shadowMap.type      = T.PCFSoftShadowMap; // ombre morbide (PCF = Percentage Closer Filtering)

    const scene  = new T.Scene();
    const camera = new T.PerspectiveCamera(42, 1, 0.1, 100);
    camera.position.set(0, 0.4, 5.2);
    camera.lookAt(0, 0, 0);

    const { sp1, sp2 } = setupLights(scene);
    const jewelry       = buildFn();
    scene.add(jewelry);

    let dragging = false, autoRot = true, prev = { x: 0, y: 0 };

    canvas.addEventListener('mousedown', e => {
      dragging = true;
      autoRot  = false; // la rotazione automatica si disattiva al primo drag
      prev = { x: e.clientX, y: e.clientY };
      canvas.parentElement.classList.add('dragging');
    });
    window.addEventListener('mouseup', () => {
      dragging = false;
      canvas.parentElement.classList.remove('dragging');
    });
    window.addEventListener('mousemove', e => {
      if (!dragging) return;
      jewelry.rotation.y += (e.clientX - prev.x) * 0.013;
      // Clamp della rotazione X: evita che il gioiello si ribalti completamente,
      // mantenendo una prospettiva sempre leggibile (±~69°, circa ±1.2 rad).
      jewelry.rotation.x  = Math.max(-1.2, Math.min(1.2,
        jewelry.rotation.x + (e.clientY - prev.y) * 0.009));
      prev = { x: e.clientX, y: e.clientY };
    });

    canvas.addEventListener('touchstart', e => {
      dragging = true; autoRot = false;
      prev = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }, { passive: true });
    window.addEventListener('touchend', () => dragging = false);
    window.addEventListener('touchmove', e => {
      if (!dragging) return;
      jewelry.rotation.y += (e.touches[0].clientX - prev.x) * 0.013;
      jewelry.rotation.x  = Math.max(-1.2, Math.min(1.2,
        jewelry.rotation.x + (e.touches[0].clientY - prev.y) * 0.009));
      prev = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }, { passive: true });

    const ro = new ResizeObserver(() => {
      const { w: nw } = getSize();
      if (!nw) return;
      renderer.setSize(nw, nw);
    });
    ro.observe(canvas.parentElement);

    // t incrementa di ~0.016 per frame a 60fps.
    // Le due luci sparkle orbitano in ellissi desfasate (frequenze diverse)
    // per un effetto di scintillio non ripetitivo e non sincrono.
    let t = 0;
    (function animate() {
      requestAnimationFrame(animate);
      t += 0.016;
      if (autoRot) jewelry.rotation.y += 0.006;
      sp1.position.set(Math.sin(t * 1.4) * 4, Math.cos(t * 0.9) * 2.5 + 1.5, Math.cos(t * 1.4) * 4);
      sp2.position.set(Math.cos(t * 0.8) * 3.5, Math.sin(t * 1.2) * 2,        Math.sin(t * 0.8) * 3.5);
      renderer.render(scene, camera);
    })();
  }

  /* ── 1. Anello Solitario ────────────────────────────────────────── */

  /**
   * Costruisce un anello solitario con castone a 6 griffe e diamante brillante.
   *
   * Struttura geometrica:
   *   · TorusGeometry(1.05, 0.17, 32, 128) — fascia: raggio 1.05, tubo 0.17
   *   · CylinderGeometry(0.28, 0.22, 0.24) — castone tronco-conico (più largo in basso
   *                                           per accogliere la cintura del diamante)
   *   · 6× CylinderGeometry sottile         — griffe disposte radialmente a 60° l'una dall'altra
   *   · Diamante (4 parti):
   *       ConeGeometry invertito            — padiglione (pavilion): la parte inferiore conica
   *       CylinderGeometry sottile          — cintura (girdle): il bordo equatoriale
   *       CylinderGeometry troncoconico     — corona (crown): la parte superiore a gradini
   *       CircleGeometry                    — tavola (table): la faccia piana superiore
   *
   * @returns {THREE.Group}
   */
  function buildRing() {
    const g    = new T.Group();
    const gold = matGold();

    g.add(new T.Mesh(new T.TorusGeometry(1.05, 0.17, 32, 128), gold));

    g.add(Object.assign(
      new T.Mesh(new T.CylinderGeometry(0.28, 0.22, 0.24, 24), gold),
      { position: new T.Vector3(0, 1.17, 0) }
    ));

    // 6 griffe a 60° l'una dall'altra; sin/cos sull'angolo producono
    // l'inclinazione verso il centro che le fa "abbracciare" la pietra.
    for (let i = 0; i < 6; i++) {
      const a  = (i / 6) * Math.PI * 2;
      const pr = new T.Mesh(new T.CylinderGeometry(0.033, 0.022, 0.52, 8), gold);
      pr.position.set(Math.sin(a) * 0.24, 1.24, Math.cos(a) * 0.24);
      pr.rotation.z =  Math.sin(a) * 0.28;
      pr.rotation.x =  Math.cos(a) * 0.28;
      g.add(pr);
    }

    const dMat = matDiamond();

    const pav = new T.Mesh(new T.ConeGeometry(0.22, 0.34, 8, 1), dMat);
    pav.rotation.x = Math.PI; pav.position.y = 1.50; g.add(pav); // padiglione (cono invertito)

    const gir = new T.Mesh(new T.CylinderGeometry(0.22, 0.22, 0.04, 8), dMat);
    gir.position.y = 1.67; g.add(gir); // cintura/girdle

    const cro = new T.Mesh(new T.CylinderGeometry(0.16, 0.22, 0.14, 8), dMat);
    cro.position.y = 1.78; g.add(cro); // corona (si restringe verso l'alto)

    const tab = new T.Mesh(new T.CircleGeometry(0.155, 8),
      new T.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0, transmission: 0.5, ior: 2.4, clearcoat: 1 }));
    tab.rotation.x = -Math.PI / 2; tab.position.y = 1.86; g.add(tab); // tavola (faccia piatta superiore)

    // Luce interna bluastra: simula la fluorescenza UV caratteristica
    // dei diamanti di alta qualità sotto illuminazione da studio.
    const dGlow = new T.PointLight(0xd0e8ff, 1.2, 1.8);
    dGlow.position.set(0, 1.68, 0); g.add(dGlow);

    g.rotation.x = 0.32; // inclinazione verso la camera per mostrare la pietra
    return g;
  }

  /* ── 2. Collana con Pendente ────────────────────────────────────── */

  /**
   * Costruisce una collana con catena curva e ciondolo a goccia con smeraldo.
   *
   * Tecnica della catena — CatmullRomCurve3 (spline passante per i punti):
   *   Preferita a un arco circolare perché produce la curvatura naturale di
   *   una catena appesa per gravità (approssimazione della catenaria).
   *   TubeGeometry estrude un cilindro lungo la curva.
   *
   * Tecnica del ciondolo — LatheGeometry (solido di rotazione):
   *   I punti Vector2 definiscono il profilo meridiano della forma "teardrop".
   *   LatheGeometry ruota questo profilo attorno all'asse Y per 32 segmenti,
   *   generando la superficie di rivoluzione del corpo del ciondolo.
   *
   * @returns {THREE.Group}
   */
  function buildPendant() {
    const g    = new T.Group();
    const gold = matGold();

    const curve = new T.CatmullRomCurve3([
      new T.Vector3(-2.2, 2.0, 0), new T.Vector3(-1.4, 2.5, 0),
      new T.Vector3( 0,   2.7, 0), new T.Vector3( 1.4, 2.5, 0),
      new T.Vector3( 2.2, 2.0, 0)
    ]);
    g.add(new T.Mesh(new T.TubeGeometry(curve, 64, 0.038, 8, false), gold));

    // 19 maglie sferiche distribuite uniformemente lungo la curva (getPoint 0…1)
    for (let i = 0; i <= 18; i++) {
      const pt = curve.getPoint(i / 18);
      const lk = new T.Mesh(new T.SphereGeometry(0.058, 8, 8), gold);
      lk.position.copy(pt); g.add(lk);
    }

    // Asola di aggancio (bail): toro piccolo che collega la catena al ciondolo
    const bail = new T.Mesh(new T.TorusGeometry(0.14, 0.038, 12, 32), gold);
    bail.position.set(0, 1.75, 0); bail.rotation.x = Math.PI / 2; g.add(bail);

    // Profilo meridiano del ciondolo: da punta inferiore (y=0) a punta superiore (y=1.6).
    // La forma "teardrop" si ottiene con un massimo di larghezza verso y=0.55.
    const pts = [
      new T.Vector2(0,    0   ),
      new T.Vector2(0.22, 0.22),
      new T.Vector2(0.38, 0.55),
      new T.Vector2(0.36, 0.95),
      new T.Vector2(0.24, 1.25),
      new T.Vector2(0.10, 1.5 ),
      new T.Vector2(0,    1.6 )
    ];
    const body = new T.Mesh(new T.LatheGeometry(pts, 32), gold);
    body.rotation.x = Math.PI; body.position.y = 1.6; g.add(body);

    // OctahedronGeometry con scale non uniforme simula un taglio smeraldo
    // (rettangolare): scale.x=0.9 (larghezza), .y=0.65 (altezza), .z=0.48 (profondità)
    const sm = new T.Mesh(new T.OctahedronGeometry(0.28, 0), matGem(0x00712a));
    sm.position.set(0, 0.78, 0.10); sm.scale.set(0.9, 0.65, 0.48); g.add(sm);

    // 4 griffe agli angoli (a 45°, offset di PI/4)
    for (let i = 0; i < 4; i++) {
      const a  = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const pr = new T.Mesh(new T.CylinderGeometry(0.022, 0.014, 0.22, 6), gold);
      pr.position.set(Math.sin(a) * 0.28, 0.78, Math.cos(a) * 0.18 + 0.10);
      pr.rotation.z = Math.sin(a) * 0.18; g.add(pr);
    }

    // Luce verde interna: esagera la fluorescenza dello smeraldo
    // per massimizzare l'effetto "pietra viva" nel render in tempo reale
    const smGlow = new T.PointLight(0x00ff60, 0.8, 1.4);
    smGlow.position.set(0, 0.78, 0.10); g.add(smGlow);

    g.scale.setScalar(0.66); g.position.y = -0.1;
    return g;
  }

  /* ── 3. Orecchini a Cerchio ─────────────────────────────────────── */

  /**
   * Costruisce una coppia di orecchini a cerchio (hoop earrings) in oro bianco.
   *
   * I due cerchi sono costruiti da una funzione interna riutilizzabile
   * e posizionati simmetricamente. La leggera rotazione verso la camera
   * (rotation.y ±0.28) rende visibile la sezione cilindrica del cerchio
   * anziché mostrarlo di piatto come una linea sottile.
   *
   * @returns {THREE.Group}
   */
  function buildHoops() {
    const g  = new T.Group();
    const wg = matWhiteGold();

    function oneHoop(offsetX) {
      const h = new T.Group();

      // TorusGeometry(raggio, spessore_tubo, segmenti_radiali, segmenti_tubolari)
      h.add(new T.Mesh(new T.TorusGeometry(0.72, 0.10, 28, 100), wg));

      // Cerchio interno decorativo più sottile, scalato all'84% del raggio esterno
      const inner = new T.Mesh(new T.TorusGeometry(0.72, 0.028, 14, 100), wg);
      inner.scale.setScalar(0.84); h.add(inner);

      // Spillo per il lobo dell'orecchio
      const post = new T.Mesh(new T.CylinderGeometry(0.038, 0.038, 0.28, 10), wg);
      post.position.y = 0.76; h.add(post);

      // 5 diamantini centrati sulla parte inferiore del cerchio (angolo -PI/2).
      // Spaziatura di 0.24 rad (~14°) tra le gemme per un aspetto naturale.
      for (let i = 0; i < 5; i++) {
        const a   = -Math.PI / 2 + (i - 2) * 0.24;
        const gem = new T.Mesh(new T.OctahedronGeometry(0.068, 0), matDiamond());
        gem.position.set(Math.cos(a) * 0.72, Math.sin(a) * 0.72, 0.06);
        gem.scale.set(0.9, 0.6, 0.45); h.add(gem);
      }

      h.position.x = offsetX;
      h.rotation.y = offsetX > 0 ? 0.28 : -0.28;
      return h;
    }

    g.add(oneHoop(-0.95)); // orecchino sinistro
    g.add(oneHoop( 0.95)); // orecchino destro
    g.rotation.x = 0.18;
    return g;
  }

  /* ── 4. Fede con Brillanti (channel setting) ────────────────────── */

  /**
   * Costruisce una fede nuziale con 16 diamanti in incastonatura a canale.
   *
   * Il "channel setting" prevede che le gemme siano trattenute lateralmente
   * da due bordi continui di metallo (i "canali") anziché da griffe singole.
   * I setti separatori (BoxGeometry) simulano le pareti interne del canale.
   *
   * La fascia è più spessa (tubo 0.22) rispetto all'anello solitario (0.17)
   * per contenere fisicamente il canale con le gemme incassate.
   *
   * @returns {THREE.Group}
   */
  function buildWeddingBand() {
    const g    = new T.Group();
    const gold = matGold();

    g.add(new T.Mesh(new T.TorusGeometry(1.05, 0.22, 40, 128), gold));

    // Due bordi laterali lucidati (roughness ~0): il contrasto tra la fascia
    // satin (roughness 0.13) e i bordi a specchio è tipico della lavorazione
    // high-end delle fedi con channel setting.
    [-0.20, 0.20].forEach(z => {
      const edge = new T.Mesh(new T.TorusGeometry(1.05, 0.014, 12, 128),
        new T.MeshStandardMaterial({ color: 0xE8C96A, metalness: 1, roughness: 0.05 }));
      edge.scale.z = 0.5; edge.position.z = z; g.add(edge);
    });

    // 16 diamanti equidistribuiti (ogni 22.5°, passo = 2π/16)
    const N = 16;
    for (let i = 0; i < N; i++) {
      const a   = (i / N) * Math.PI * 2;
      const gem = new T.Mesh(new T.OctahedronGeometry(0.075, 0), matDiamond());
      gem.position.set(Math.cos(a) * 1.05, Math.sin(a) * 1.05, 0);
      gem.scale.set(0.72, 0.72, 0.46); g.add(gem);

      // Setto separatore: lookAt(0,0,0) orienta il BoxGeometry
      // perpendicolarmente alla fascia, come nella gioielleria reale.
      const sep = new T.Mesh(new T.BoxGeometry(0.035, 0.035, 0.46), gold);
      sep.position.copy(gem.position);
      sep.lookAt(0, 0, 0); g.add(sep);
    }

    g.rotation.x = 0.42; // inclinazione accentuata per mostrare la superficie superiore con i diamanti
    return g;
  }

  /* ── Avvio ──────────────────────────────────────────────────────── */

  // Avvia su window.load (non DOMContentLoaded) per garantire che:
  //   · Three.js sia completamente inizializzato
  //   · I canvas siano stati dimensionati dal layout CSS prima del primo render
  //   · Le dimensioni di canvas.parentElement.offsetWidth siano già calcolate
  window.addEventListener('load', () => {
    createViewer('j3d-1', buildRing);
    createViewer('j3d-2', buildPendant);
    createViewer('j3d-3', buildHoops);
    createViewer('j3d-4', buildWeddingBand);
  });

})();
