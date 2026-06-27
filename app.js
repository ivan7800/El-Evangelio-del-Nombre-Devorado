(() => {
  'use strict';

  const data = window.EVANGELIO_DATA || { stats: { chapters: 0, words: 0 }, chapters: [], lore: [], symbols: [] };
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const storageKey = 'evangelio.nombre.devorado.v2';

  const defaultState = {
    route: 'inicio',
    chapterId: firstReadableChapterId(),
    read: {},
    bookmarks: {},
    skin: 'grimorio',
    fontScale: 100,
    readerWidth: 72,
    effects: true,
    readability: false,
    audio: false,
    lastSeen: Date.now()
  };

  let state = loadState();
  state.audio = false;
  if (!data.chapters.some(chapter => chapter.id === state.chapterId)) {
    state.chapterId = firstReadableChapterId();
  }
  let deferredInstallPrompt = null;
  let audioContext = null;
  let droneNodes = [];
  let audioMaster = null;
  let ambienceTimers = [];

  const ambienceProfiles = {
    grimorio: { name: 'Scripturae Devorata', base: [43.65, 65.41, 87.31], noise: 'lowpass', cutoff: 780, pulse: true, chime: 0.018, whisper: 0.020, master: 0.045 },
    catedral: { name: 'Catedral Sepultada', base: [32.70, 49.00, 98.00], noise: 'lowpass', cutoff: 520, pulse: true, chime: 0.030, whisper: 0.012, master: 0.043 },
    vhs: { name: 'VHS 1987', base: [55.00, 110.00, 220.00], noise: 'bandpass', cutoff: 1400, pulse: true, chime: 0.010, whisper: 0.030, master: 0.040 },
    cuatrocero: { name: 'Universo 404', base: [40.00, 80.00, 160.00], noise: 'bandpass', cutoff: 980, pulse: true, chime: 0.020, whisper: 0.045, master: 0.040 },
    pergamino: { name: 'Pergamino Sangrante', base: [48.99, 73.42, 146.83], noise: 'highpass', cutoff: 1200, pulse: false, chime: 0.012, whisper: 0.025, master: 0.038 },
    sangre: { name: 'Pulso de Sangre', base: [36.71, 55.00, 73.42], noise: 'lowpass', cutoff: 430, pulse: true, chime: 0.008, whisper: 0.018, master: 0.047 },
    biblioteca: { name: 'Biblioteca Prohibida', base: [41.20, 61.74, 123.47], noise: 'highpass', cutoff: 1800, pulse: false, chime: 0.006, whisper: 0.050, master: 0.034 }
  };

  const skins = [
    ['grimorio', 'Grimorio'],
    ['catedral', 'Catedral'],
    ['vhs', 'VHS 1987'],
    ['cuatrocero', 'Universo 404'],
    ['pergamino', 'Pergamino'],
    ['sangre', 'Sangre'],
    ['biblioteca', 'Biblioteca']
  ];

  const rituals = [
    { id: 'first-open', title: 'Abrir el grimorio', description: 'Entrar por primera vez en la app.' },
    { id: 'first-read', title: 'Primera sangre', description: 'Marcar un versículo como leído.' },
    { id: 'five-read', title: 'Cinco heridas', description: 'Leer cinco secciones completas.' },
    { id: 'ten-read', title: 'Décima grieta', description: 'Leer diez secciones completas.' },
    { id: 'bookmark', title: 'Marca en el margen', description: 'Guardar una marca de lectura.' },
    { id: 'codex', title: 'Códice consultado', description: 'Abrir el códice de entidades.' },
    { id: 'skin', title: 'Cambio de piel', description: 'Cambiar el skin de la app.' },
    { id: 'complete', title: 'Nombre devorado', description: 'Completar todas las secciones.' }
  ];

  function loadState() {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return { ...defaultState };
      const parsed = JSON.parse(raw);
      return { ...defaultState, ...parsed, read: parsed.read || {}, bookmarks: parsed.bookmarks || {} };
    } catch (error) {
      console.warn('No se pudo cargar el estado local.', error);
      return { ...defaultState };
    }
  }

  function saveState() {
    state.lastSeen = Date.now();
    try {
      localStorage.setItem(storageKey, JSON.stringify(state));
    } catch (error) {
      console.warn('No se pudo guardar el estado local.', error);
    }
    updateProgressUI();
  }

  function routeFromHash() {
    const hash = location.hash.replace(/^#/, '');
    const known = ['inicio', 'biblioteca', 'lector', 'codice', 'rituales', 'mapa', 'ajustes'];
    return known.includes(hash) ? hash : 'inicio';
  }

  function showRoute(route) {
    state.route = route;
    $$('.view').forEach(view => view.hidden = view.dataset.view !== route);
    $$('[data-route]').forEach(link => link.classList.toggle('active', link.dataset.route === route));
    closeSidebar();
    if (route === 'lector') renderChapter(state.chapterId);
    if (route === 'codice') markRitual('codex');
    $('#main')?.focus({ preventScroll: true });
    saveState();
  }

  function navigate(route) {
    if (location.hash.replace(/^#/, '') !== route) location.hash = route;
    showRoute(route);
  }

  function init() {
    document.body.dataset.skin = state.skin;
    applySettings();
    renderStats();
    renderChapters();
    renderReaderIndex();
    renderLore();
    renderSymbols();
    renderRituals();
    renderSkins();
    renderChapter(state.chapterId);
    updateProgressUI();
    attachEvents();
    registerServiceWorker();
    markRitual('first-open');
    showRoute(routeFromHash());
  }

  function firstReadableChapterId() {
    return data.chapters[0]?.id || '';
  }

  function readableChapters() {
    return data.chapters;
  }

  function getReadStats() {
    const chapters = readableChapters();
    return {
      read: chapters.filter(chapter => state.read?.[chapter.id]).length,
      total: chapters.length
    };
  }

  function normalizeText(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }

  function renderStats() {
    const row = $('#statsRow');
    if (!row) return;
    row.innerHTML = '';
    const stats = [
      ['Secciones', data.stats.chapters],
      ['Palabras', formatNumber(data.stats.words) + ' palabras'],
      ['Archivo', data.publicEdition ? 'Muestra pública' : 'Grimorio completo'],
      ['Lectura', `${Math.max(1, Math.round(data.stats.words / 210 / 60))} h`]
    ];
    for (const [label, value] of stats) {
      const wrap = document.createElement('div');
      const dt = document.createElement('dt');
      const dd = document.createElement('dd');
      dt.textContent = label;
      dd.textContent = value;
      wrap.append(dt, dd);
      row.append(wrap);
    }
  }

  function renderChapters() {
    const grid = $('#chapterGrid');
    if (!grid) return;
    const filter = $('#chapterFilter')?.value || 'all';
    const sort = $('#chapterSort')?.value || 'original';
    let chapters = data.chapters.slice();
    if (filter !== 'all') chapters = chapters.filter(ch => ch.kind === filter);
    if (sort === 'short') chapters.sort((a, b) => a.wordCount - b.wordCount);
    if (sort === 'long') chapters.sort((a, b) => b.wordCount - a.wordCount);
    grid.innerHTML = '';
    for (const ch of chapters) {
      const card = document.createElement('article');
      card.className = 'chapter-card';
      card.dataset.roman = ch.roman || '∅';
      card.classList.toggle('read', Boolean(state.read[ch.id]));
            const title = document.createElement('h3');
      title.textContent = ch.heading;
      const excerpt = document.createElement('p');
      excerpt.textContent = firstText(ch).slice(0, 155) + (firstText(ch).length > 155 ? '…' : '');
      const meta = document.createElement('div');
      meta.className = 'card-meta';
      meta.append(pill(ch.kind), pill(`${ch.readingMinutes} min`), pill(`${formatNumber(ch.wordCount)} palabras`));
      const actions = document.createElement('div');
      actions.className = 'card-actions';
      const open = document.createElement('button');
      open.className = 'primary small';
      open.textContent = 'Leer';
      open.addEventListener('click', () => openChapter(ch.id));
      const dot = document.createElement('span');
      dot.className = 'progress-dot';
      dot.textContent = state.read[ch.id] ? '✓' : ch.order;
      actions.append(open, dot);
      card.append(title, excerpt, meta, actions);
      grid.append(card);
    }
  }

  function renderReaderIndex() {
    const list = $('#readerChapterList');
    if (!list) return;
    const stats = getReadStats();
    $('#readerCount').textContent = `${stats.read}/${stats.total}`;
    list.innerHTML = '';
    data.chapters.forEach(ch => {
      const btn = document.createElement('button');
      btn.className = 'reader-link';
      btn.dataset.chapterId = ch.id;
      btn.innerHTML = '';
      const small = document.createElement('span');
      small.textContent = `${ch.roman || '∅'} · ${ch.readingMinutes} min ${state.read[ch.id] ? '· leído' : ''}`;
      const strong = document.createElement('strong');
      strong.textContent = ch.title || ch.heading;
      btn.append(small, strong);
      btn.addEventListener('click', () => openChapter(ch.id));
      list.append(btn);
    });
  }

  function renderChapter(id) {
    const ch = data.chapters.find(item => item.id === id) || data.chapters[0];
    state.chapterId = ch.id;
    $('#chapterMeta').textContent = `${ch.kind.toUpperCase()} · ${ch.readingMinutes} min · ${formatNumber(ch.wordCount)} palabras`;
    $('#chapterTitle').textContent = ch.heading;
    $('#chapterSub').textContent = ch.tags?.length ? `Ecos: ${ch.tags.slice(0, 5).join(' · ')}` : data.subtitle;
    const content = $('#chapterContent');
    content.innerHTML = '';
    ch.paragraphs.forEach(text => content.append(renderParagraph(text)));
    $$('.reader-link').forEach(btn => btn.classList.toggle('active', btn.dataset.chapterId === ch.id));
    const idx = data.chapters.findIndex(item => item.id === ch.id);
    $('#prevChapter').disabled = idx <= 0;
    $('#nextChapter').disabled = idx >= data.chapters.length - 1;
    $('#nextFromFooter').hidden = idx >= data.chapters.length - 1;
    const markButton = $('#markDone');
    if (markButton) {
      markButton.disabled = false;
      markButton.textContent = state.read[ch.id] ? 'Leído' : 'Marcar leído';
    }
    const percent = Math.round(((idx + 1) / data.chapters.length) * 100);
    $('#readerProgress').style.width = `${percent}%`;
    saveState();
  }

  function renderParagraph(text) {
    const p = document.createElement('p');
    const trimmed = text.trim();
    if (trimmed.startsWith('«') || /^—Libro del Hueso/.test(trimmed)) p.classList.add('epigraph');
    if (/^\[.+\]$/.test(trimmed) || /Glosa|Nota al pie|Advertencia|Epígrafe/i.test(trimmed)) p.classList.add('glosa');
    if (/^(?:[IVXLCDM]+|\d+)\.\s+/.test(trimmed)) p.classList.add('section-heading');
    if (/^\(.+\)$/.test(trimmed)) p.classList.add('ritual-line');
    if (/^FIN$|^Silencio\.?$|^Ahora sí\.?$/i.test(trimmed)) p.classList.add('final-line');
    const lines = text.split('\n');
    lines.forEach((line, i) => {
      if (i) p.append(document.createElement('br'));
      p.append(document.createTextNode(line));
    });
    return p;
  }


  function renderLore() {
    const grid = $('#loreGrid');
    if (!grid) return;
    grid.innerHTML = '';
    data.lore.forEach(entry => {
      const card = document.createElement('article');
      card.className = 'lore-card';
      const title = document.createElement('h3');
      title.textContent = entry.term;
      const desc = document.createElement('p');
      desc.textContent = entry.description;
      const meta = document.createElement('div');
      meta.className = 'card-meta';
      meta.append(pill(`${entry.count} apariciones`));
      const button = document.createElement('button');
      button.className = 'secondary small';
      button.textContent = 'Buscar menciones';
      button.addEventListener('click', () => {
        openSidebar();
        $('#globalSearch').value = entry.term;
        runSearch(entry.term);
      });
      card.append(title, desc, meta, button);
      grid.append(card);
    });
  }

  function renderSymbols() {
    const grid = $('#symbolGrid');
    if (!grid) return;
    grid.innerHTML = '';
    data.symbols.forEach(item => {
      const card = document.createElement('article');
      card.className = 'symbol-card';
      const glyph = document.createElement('div');
      glyph.className = 'symbol-glyph';
      glyph.textContent = item.symbol;
      const title = document.createElement('h3');
      title.textContent = item.name;
      const desc = document.createElement('p');
      desc.textContent = item.meaning;
      card.append(glyph, title, desc);
      grid.append(card);
    });
  }

  function renderRituals() {
    const grid = $('#ritualGrid');
    if (!grid) return;
    grid.innerHTML = '';
    const readCount = getReadStats().read;
    rituals.forEach(item => {
      const done = isRitualDone(item.id, readCount);
      const card = document.createElement('article');
      card.className = `ritual-card achievement${done ? ' done' : ''}`;
      const title = document.createElement('h3');
      title.textContent = `${done ? '✓ ' : '○ '}${item.title}`;
      const desc = document.createElement('p');
      desc.textContent = item.description;
      card.append(title, desc);
      grid.append(card);
    });
  }

  function isRitualDone(id, readCount = Object.keys(state.read).length) {
    if (id === 'first-read') return readCount >= 1;
    if (id === 'five-read') return readCount >= 5;
    if (id === 'ten-read') return readCount >= 10;
    if (id === 'complete') return readCount >= getReadStats().total;
    if (id === 'bookmark') return Object.keys(state.bookmarks).length > 0;
    return Boolean(state[`ritual_${id}`]);
  }

  function renderSkins() {
    const grid = $('#skinGrid');
    if (!grid) return;
    grid.innerHTML = '';
    skins.forEach(([id, label]) => {
      const btn = document.createElement('button');
      btn.className = 'skin-button';
      btn.dataset.skin = id;
      btn.innerHTML = '';
      const span = document.createElement('span');
      span.textContent = label;
      btn.append(span);
      btn.classList.toggle('active', state.skin === id);
      btn.addEventListener('click', () => {
        state.skin = id;
        document.body.dataset.skin = id;
        markRitual('skin');
        renderSkins();
        saveState();
        if (state.audio && !startAudio()) {
          state.audio = false;
          applySettings();
          saveState();
        }
        toast(`Skin activado: ${label}`);
      });
      grid.append(btn);
    });
  }

  function attachEvents() {
    window.addEventListener('hashchange', () => showRoute(routeFromHash()));
    document.addEventListener('click', event => {
      const routeEl = event.target.closest('[data-route]');
      if (routeEl) {
        event.preventDefault();
        navigate(routeEl.dataset.route);
      }
    });
    $('#startReading')?.addEventListener('click', () => openChapter(firstReadableChapterId()));
    $('#continueReading')?.addEventListener('click', () => openChapter(state.chapterId));
    $('#prevChapter')?.addEventListener('click', () => shiftChapter(-1));
    $('#nextChapter')?.addEventListener('click', () => shiftChapter(1));
    $('#nextFromFooter')?.addEventListener('click', () => shiftChapter(1));
    $('#markDone')?.addEventListener('click', () => markCurrentRead());
    $('#bookmarkButton')?.addEventListener('click', () => bookmarkCurrent());
    $('#chapterFilter')?.addEventListener('change', renderChapters);
    $('#chapterSort')?.addEventListener('change', renderChapters);
    $('#menuButton')?.addEventListener('click', openSidebar);
    $('#closeSidebar')?.addEventListener('click', closeSidebar);
    $('#scrim')?.addEventListener('click', closeSidebar);
    $('#globalSearch')?.addEventListener('input', event => runSearch(event.target.value));
    $('#audioButton')?.addEventListener('click', toggleAudio);
    $('#fontScale')?.addEventListener('input', event => { state.fontScale = Number(event.target.value); applySettings(); saveState(); });
    $('#readerWidth')?.addEventListener('input', event => { state.readerWidth = Number(event.target.value); applySettings(); saveState(); });
    $('#effectsToggle')?.addEventListener('change', event => { state.effects = event.target.checked; applySettings(); saveState(); });
    $('#dyslexiaToggle')?.addEventListener('change', event => { state.readability = event.target.checked; applySettings(); saveState(); });
    $('#exportProgress')?.addEventListener('click', exportProgress);
    $('#resetProgress')?.addEventListener('click', resetProgress);
    $('#backToTop')?.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
    window.addEventListener('scroll', () => $('#backToTop')?.classList.toggle('show', window.scrollY > 500), { passive: true });
    window.addEventListener('keydown', event => {
      if (event.key === 'Escape') closeSidebar();
    });
    $$('#mapBoard .map-node').forEach(btn => btn.addEventListener('click', () => showMapTerm(btn.dataset.term)));

    window.addEventListener('beforeinstallprompt', event => {
      event.preventDefault();
      deferredInstallPrompt = event;
      const install = $('#installButton');
      install.hidden = false;
      install.addEventListener('click', promptInstall, { once: true });
    });
  }

  function openChapter(id) {
    state.chapterId = id;
    saveState();
    navigate('lector');
    setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 30);
  }

  function shiftChapter(delta) {
    const idx = data.chapters.findIndex(item => item.id === state.chapterId);
    const next = data.chapters[idx + delta];
    if (next) openChapter(next.id);
  }

  function markCurrentRead() {
    state.read[state.chapterId] = Date.now();
    markRitual('first-read');
    renderChapters();
    renderReaderIndex();
    renderRituals();
    saveState();
    toast('Versículo marcado como leído.');
  }

  function bookmarkCurrent() {
    state.bookmarks[state.chapterId] = Date.now();
    markRitual('bookmark');
    renderRituals();
    saveState();
    toast('Marca guardada en el margen.');
  }

  function markRitual(id) {
    state[`ritual_${id}`] = true;
    renderRituals();
    saveState();
  }

  function updateProgressUI() {
    const { read, total } = getReadStats();
    const percent = total ? Math.round((read / total) * 100) : 0;
    const bar = $('#miniProgress');
    if (bar) bar.style.width = `${percent}%`;
    const text = $('#miniProgressText');
    if (text) text.textContent = `${percent}% leído · ${read}/${total}`;
  }

  function runSearch(query) {
    const container = $('#searchResults');
    if (!container) return;
    const q = normalizeText(query.trim());
    container.innerHTML = '';
    if (q.length < 2) return;
    const results = [];
    for (const ch of data.chapters) {
      const source = `${ch.heading}\n${ch.paragraphs.join('\n')}`;
      const hay = normalizeText(source);
      if (hay.includes(q)) {
        const fragment = [ch.heading, ...ch.paragraphs].find(part => normalizeText(part).includes(q)) || source;
        const excerpt = fragment.replace(/\s+/g, ' ').slice(0, 240);
        results.push({ ch, excerpt: excerpt + (fragment.length > 240 ? '…' : '') });
      }
      if (results.length >= 12) break;
    }
    if (!results.length) {
      const empty = document.createElement('p');
      empty.className = 'muted';
      empty.textContent = 'No hay coincidencias.';
      container.append(empty);
      return;
    }
    results.forEach(({ ch, excerpt }) => {
      const item = document.createElement('button');
      item.className = 'search-result';
      item.innerHTML = '';
      const title = document.createElement('strong');
      title.textContent = ch.heading;
      const small = document.createElement('small');
      small.textContent = excerpt;
      item.append(title, small);
      item.addEventListener('click', () => openChapter(ch.id));
      container.append(item);
    });
  }

  function showMapTerm(term) {
    const normalizedTerm = normalizeText(term);
    const entry = data.lore.find(item => normalizeText(item.term) === normalizedTerm) || data.lore.find(item => normalizeText(item.term).includes(normalizedTerm));
    const info = $('#mapInfo');
    if (!entry) {
      info.textContent = `${term}: entrada preparada para ampliar el mapa.`;
      return;
    }
    info.textContent = `${entry.term}: ${entry.description} Aparece en ${entry.count} secciones.`;
  }

  function applySettings() {
    document.body.dataset.skin = state.skin;
    document.body.classList.toggle('no-effects', !state.effects);
    document.body.classList.toggle('readability', state.readability);
    document.documentElement.style.setProperty('--reader-font-size', `${(1.13 * state.fontScale / 100).toFixed(3)}rem`);
    document.documentElement.style.setProperty('--reader-width', `${state.readerWidth}ch`);
    $('#fontScale') && ($('#fontScale').value = state.fontScale);
    $('#readerWidth') && ($('#readerWidth').value = state.readerWidth);
    $('#effectsToggle') && ($('#effectsToggle').checked = state.effects);
    $('#dyslexiaToggle') && ($('#dyslexiaToggle').checked = state.readability);
    $('#audioButton')?.setAttribute('aria-pressed', String(state.audio));
  }

  function openSidebar() {
    $('#sidebar')?.classList.add('open');
    const scrim = $('#scrim');
    if (scrim) scrim.hidden = false;
    document.body.classList.add('menu-open');
    $('#menuButton')?.setAttribute('aria-expanded', 'true');
    setTimeout(() => $('#globalSearch')?.focus(), 60);
  }

  function closeSidebar() {
    $('#sidebar')?.classList.remove('open');
    const scrim = $('#scrim');
    if (scrim) scrim.hidden = true;
    document.body.classList.remove('menu-open');
    $('#menuButton')?.setAttribute('aria-expanded', 'false');
  }

  function toggleAudio() {
    if (state.audio) {
      stopAudio();
      state.audio = false;
      toast('Ambiente detenido.');
    } else {
      state.audio = startAudio();
      if (!state.audio) toast('No se pudo activar el ambiente sonoro en este navegador.');
    }
    applySettings();
    saveState();
  }

  function startAudio() {
    stopAudio();
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) return false;

    try {
      audioContext = new AudioCtor();
    } catch (error) {
      console.warn('No se pudo crear AudioContext.', error);
      audioContext = null;
      return false;
    }
    if (audioContext.state === 'suspended') {
      audioContext.resume().catch(() => {});
    }
    const profile = ambienceProfiles[state.skin] || ambienceProfiles.grimorio;
    audioMaster = audioContext.createGain();
    audioMaster.gain.setValueAtTime(0.0001, audioContext.currentTime);
    audioMaster.gain.exponentialRampToValueAtTime(profile.master, audioContext.currentTime + 1.7);
    audioMaster.connect(audioContext.destination);

    createDroneLayer(profile);
    createBreathLayer(profile);
    createNoiseLayer(profile);
    createPulseLayer(profile);
    createEventLayer(profile);

    toast(`Ambiente activado: ${profile.name}.`);
    return true;
  }

  function createDroneLayer(profile) {
    profile.base.forEach((freq, i) => {
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      const lfo = audioContext.createOscillator();
      const lfoGain = audioContext.createGain();
      osc.type = i === 0 ? 'sine' : i === 1 ? 'triangle' : 'sawtooth';
      osc.frequency.value = freq;
      lfo.frequency.value = 0.035 + (i * 0.011);
      lfoGain.gain.value = 0.9 + i * 0.35;
      lfo.connect(lfoGain).connect(osc.frequency);
      gain.gain.value = i === 0 ? 0.55 : 0.16;
      osc.connect(gain).connect(audioMaster);
      osc.start();
      lfo.start();
      droneNodes.push(osc, gain, lfo, lfoGain);
    });
  }

  function createBreathLayer(profile) {
    const breath = audioContext.createOscillator();
    const breathGain = audioContext.createGain();
    breath.type = 'sine';
    breath.frequency.value = state.skin === 'vhs' || state.skin === 'cuatrocero' ? 0.18 : 0.085;
    breathGain.gain.value = profile.whisper;
    breath.connect(breathGain).connect(audioMaster);
    breath.start();
    droneNodes.push(breath, breathGain);
  }

  function createNoiseLayer(profile) {
    const seconds = 3;
    const buffer = audioContext.createBuffer(1, audioContext.sampleRate * seconds, audioContext.sampleRate);
    const channel = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < channel.length; i += 1) {
      const white = Math.random() * 2 - 1;
      last = (last + (0.02 * white)) / 1.02;
      channel[i] = last * 3.5;
    }
    const source = audioContext.createBufferSource();
    const filter = audioContext.createBiquadFilter();
    const gain = audioContext.createGain();
    source.buffer = buffer;
    source.loop = true;
    filter.type = profile.noise;
    filter.frequency.value = profile.cutoff;
    filter.Q.value = state.skin === 'cuatrocero' ? 8 : 0.85;
    gain.gain.value = state.skin === 'biblioteca' ? 0.065 : 0.038;
    source.connect(filter).connect(gain).connect(audioMaster);
    source.start();
    droneNodes.push(source, filter, gain);
  }

  function createPulseLayer(profile) {
    if (!profile.pulse) return;
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.type = 'sine';
    osc.frequency.value = state.skin === 'sangre' ? 1.18 : 0.62;
    gain.gain.value = state.skin === 'sangre' ? 0.055 : 0.020;
    osc.connect(gain).connect(audioMaster);
    osc.start();
    droneNodes.push(osc, gain);
  }

  function createEventLayer(profile) {
    const schedule = () => {
      if (!audioContext || !audioMaster) return;
      const delay = 6500 + Math.random() * 11000;
      const timer = window.setTimeout(() => {
        playRitualEvent(profile);
        schedule();
      }, delay);
      ambienceTimers.push(timer);
    };
    schedule();
  }

  function playRitualEvent(profile) {
    if (!audioContext || !audioMaster) return;
    const now = audioContext.currentTime;
    const osc = audioContext.createOscillator();
    const filter = audioContext.createBiquadFilter();
    const gain = audioContext.createGain();
    const base = state.skin === 'vhs' || state.skin === 'cuatrocero' ? 880 : 196;
    osc.type = state.skin === 'vhs' || state.skin === 'cuatrocero' ? 'square' : 'sine';
    osc.frequency.setValueAtTime(base * (0.75 + Math.random() * 0.6), now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(40, base * 0.18), now + 2.8);
    filter.type = 'lowpass';
    filter.frequency.value = state.skin === 'vhs' || state.skin === 'cuatrocero' ? 1800 : 620;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(profile.chime, now + 0.12);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 3.4);
    osc.connect(filter).connect(gain).connect(audioMaster);
    osc.start(now);
    osc.stop(now + 3.6);
    droneNodes.push(osc, filter, gain);
  }

  function stopAudio() {
    ambienceTimers.forEach(timer => window.clearTimeout(timer));
    ambienceTimers = [];
    if (audioMaster && audioContext) {
      try { audioMaster.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.4); } catch (_) {}
    }
    droneNodes.forEach(node => {
      try { if (node.stop) node.stop(audioContext ? audioContext.currentTime + 0.45 : undefined); } catch (_) {}
      try { if (node.disconnect) window.setTimeout(() => node.disconnect(), 520); } catch (_) {}
    });
    droneNodes = [];
    if (audioContext) {
      const ctx = audioContext;
      window.setTimeout(() => ctx.close().catch(() => {}), 620);
      audioContext = null;
    }
    audioMaster = null;
  }

  function exportProgress() {
    const payload = JSON.stringify({ exportedAt: new Date().toISOString(), state }, null, 2);
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'progreso-evangelio-nombre-devorado.json';
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('Progreso exportado.');
  }

  function resetProgress() {
    if (!confirm('¿Borrar progreso, marcas y ajustes guardados en este navegador?')) return;
    localStorage.removeItem(storageKey);
    state = { ...defaultState };
    applySettings();
    renderChapters();
    renderReaderIndex();
    renderRituals();
    renderSkins();
    renderChapter(state.chapterId);
    toast('Progreso borrado.');
  }

  function promptInstall() {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    deferredInstallPrompt.userChoice.finally(() => {
      deferredInstallPrompt = null;
      $('#installButton').hidden = true;
    });
  }

  function registerServiceWorker() {
    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      navigator.serviceWorker.register('./service-worker.js').catch(error => console.warn('Service worker no registrado:', error));
    }
  }

  function pill(text) {
    const el = document.createElement('span');
    el.className = 'pill';
    el.textContent = text;
    return el;
  }

  function firstText(ch) {
    return ch.paragraphs.find(p => p && !/^«/.test(p.trim())) || ch.paragraphs[0] || ch.heading;
  }

  function formatNumber(n) {
    return new Intl.NumberFormat('es-ES').format(n);
  }

  function toast(message) {
    const el = $('#toast');
    if (!el) return;
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => el.classList.remove('show'), 2800);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
