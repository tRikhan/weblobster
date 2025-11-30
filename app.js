  // Aerator bubbles
  const bubbles = [];
  let bubbleImg = null;
// WebLobster Aquarium — HTML/CSS/JS murni
// Komentar singkat di area utama: movement, rendering, modal handling

(function () {
  const canvas = document.getElementById('aquariumCanvas');
  const ctx = canvas.getContext('2d');
  const devicesLayer = document.getElementById('devicesLayer');
  const dashboardGrid = document.getElementById('dashboardGrid');
  let devicesData = [];

  // Responsive: scale canvas logical size to match displayed size
  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1));
    canvas.width = Math.floor(rect.width);
    canvas.height = Math.floor(rect.height);
  }
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  // Simple PRNG helper for random intervals
  const randRange = (min, max) => Math.random() * (max - min) + min;

  // Load-first-available helper for assets from assets/web ---------------------
  async function loadFirstAvailable(srcList) {
    for (const src of srcList) {
      try {
        const img = await loadImage(src);
        return img;
      } catch (e) { /* try next */ }
    }
    return null;
  }
  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.decoding = 'async';
      img.loading = 'eager';
      img.onload = () => resolve(img);
      img.onerror = reject;
      // Ensure pixelated look on draw via canvas imageSmoothingEnabled=false
      img.src = src;
    });
  }

  // Background image from assets/web/aquarium_bg.*
  let bgImage = null;
  loadFirstAvailable([
    'assets/web/aquarium_bg.webp',
    'assets/web/aquarium_bg.png',
    'assets/web/aquarium_bg.jpg',
    'assets/web/aquarium_bg.jpeg'
  ]).then(img => { bgImage = img; });

  // Aquarium background rendering using image (fallback to solid color) --------
  function drawBackground() {
    const w = canvas.width, h = canvas.height;
    ctx.imageSmoothingEnabled = false;
    if (bgImage) {
      // Cover the canvas while preserving pixel look
      ctx.drawImage(bgImage, 0, 0, w, h);
    } else {
      // Fallback color while image loads
      ctx.fillStyle = '#10324e';
      ctx.fillRect(0, 0, w, h);
    }
  }

  // Lobsters (static PNG, no animation frames) --------------------------------
  // Spawn 4 lobsters that wander independently.
  const LOBSTER_COUNT = 12;
  let lobsterImg = null;
  loadFirstAvailable([
    'assets/web/lobster_pixel.png',
    'assets/web/lobster_pixel.webp'
  ]).then(img => { lobsterImg = img; });

  function makeLobster(ix) {
    return {
      x: 0.15 + 0.12 * (ix % 6),
      y: 0.50 + 0.05 * (ix % 3),
      dir: 1,
      speed: 0.035,
      targetVX: 0,
      targetVY: 0,
      vx: 0,
      vy: 0,
      changeDirTimer: 0,
      size: 44,
    };
  }
  const lobsters = Array.from({ length: LOBSTER_COUNT }, (_, i) => makeLobster(i));

  function drawLobster(l) {
    const px = Math.floor(l.x * canvas.width);
    const py = Math.floor(l.y * canvas.height);
    const s = l.size;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.translate(px, py);
    ctx.scale(l.dir, 1);
    ctx.translate(-s / 2, -s / 2);
    if (lobsterImg) {
      ctx.drawImage(lobsterImg, 0, 0, lobsterImg.width, lobsterImg.height, 0, 0, s, s);
    } else {
      ctx.fillStyle = '#b0413e';
      ctx.fillRect(0, 0, s, s);
    }
    ctx.restore();
  }

  // Movement & wander logic ----------------------------------------------------
  let lastTS = performance.now();
  function update(dt) {
    // Update all lobsters: random dir change every 2–6s, smooth movement, bounds.
    const lerp = (a, b, t) => a + (b - a) * t;
    const lerpFactor = 0.04;
    lobsters.forEach((l) => {
      l.changeDirTimer -= dt;
      if (l.changeDirTimer <= 0) {
        l.changeDirTimer = randRange(2000, 6000);
        const angle = randRange(-Math.PI, Math.PI);
        l.targetVX = Math.cos(angle);
        l.targetVY = Math.sin(angle) * 0.3;
        l.dir = l.targetVX >= 0 ? 1 : -1;
      }
      l.vx = lerp(l.vx, l.targetVX, lerpFactor);
      l.vy = lerp(l.vy, l.targetVY, lerpFactor);
      const pxPerSec = l.speed * canvas.width;
      const dx = l.vx * pxPerSec * (dt / 1000);
      const dy = l.vy * pxPerSec * (dt / 1000);
      l.x += dx / canvas.width;
      l.y += dy / canvas.height;
      l.x = Math.max(0.05, Math.min(0.95, l.x));
      l.y = Math.max(0.35, Math.min(0.85, l.y));
    });
    // Bubbles
    emitBubbles(dt);
    updateBubbles(dt);
    // Feed particles
    updateFeedParticles(dt);
  }

  // Render loop ----------------------------------------------------------------
  function render() {
    drawBackground();
    lobsters.forEach(drawLobster);
    drawBubbles();
    drawFeedParticles();
  }

  function loop(ts) {
    let dt = ts - lastTS;
    // Cap dt to avoid large jumps after tab inactivity
    dt = Math.max(0, Math.min(32, dt));
    lastTS = ts;
    // Pause updates when tab is hidden to avoid particle bursts
    if (!document.hidden) {
      update(dt);
      render();
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  // Devices JSON loading + UI --------------------------------------------------
  async function loadDevices() {
    try {
      const res = await fetch('data/devices.json');
      const devices = await res.json();
      devicesData = devices;
      renderDevices(devices);
      renderDashboard(devices);
    } catch (e) {
      console.error('Gagal memuat devices.json', e);
    }
  }

  // session-only position overrides (not persisted), shared across features
  const devicePosOverride = new Map();

  function renderDevices(devices) {
    devicesLayer.innerHTML = '';
    devices.forEach((d) => {
      // wrapper button for accessibility and tooltips
      const btn = document.createElement('button');
      btn.className = 'device-icon';
      btn.type = 'button';
      btn.setAttribute('aria-label', d.name);
      btn.dataset.id = d.id;
      const initX = d.x * 100;
      const initY = d.y * 100;
      btn.style.left = `${initX}%`;
      btn.style.top = `${initY}%`;
      btn.style.transform = 'translate(-50%, -50%)';

      // icon image: use provided pixel icons from assets/web/*_pixel.png
      const img = document.createElement('img');
      img.alt = d.name;
      img.decoding = 'async';
      img.loading = 'eager';
      img.src = iconPathForType(d.type);
      btn.appendChild(img);

      // tooltip
      const tip = document.createElement('div');
      tip.className = 'tooltip';
      tip.textContent = d.name;
      tip.hidden = true;
      btn.appendChild(tip);

      btn.addEventListener('mouseenter', () => (tip.hidden = false));
      btn.addEventListener('mouseleave', () => (tip.hidden = true));
      btn.addEventListener('focus', () => (tip.hidden = false));
      btn.addEventListener('blur', () => (tip.hidden = true));

      // Click opens modal only if no dragging occurred
      let didDrag = false;
      btn.addEventListener('click', (e) => {
        if (didDrag) {
          e.preventDefault();
          return; // suppress modal after drag
        }
        openModal(d);
      });

      // Dragging (mouse) — hold left click to drag, session only
      let dragging = false;
      let dragStart = null; // {mx,my, xPct, yPct}
      btn.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return; // left click only
        e.preventDefault();
        const rect = devicesLayer.getBoundingClientRect();
        const current = devicePosOverride.get(d.id) || { x: d.x * 100, y: d.y * 100 };
        dragStart = { mx: e.clientX, my: e.clientY, xPct: current.x, yPct: current.y, rect };
        dragging = true;
        // disable tooltip while dragging
        tip.hidden = true;
      });
      window.addEventListener('mousemove', (e) => {
        if (!dragging || !dragStart) return;
        const dx = e.clientX - dragStart.mx;
        const dy = e.clientY - dragStart.my;
        // mark as dragged once movement exceeds small threshold
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) didDrag = true;
        const w = dragStart.rect.width;
        const h = dragStart.rect.height;
        let xPct = dragStart.xPct + (dx / w) * 100;
        let yPct = dragStart.yPct + (dy / h) * 100;
        // bounds: feeder can go outside a bit, others clamped inside
        if (d.type === 'feeder') {
          xPct = Math.max(-20, Math.min(120, xPct));
          yPct = Math.max(-30, Math.min(120, yPct));
        } else {
          xPct = Math.max(2, Math.min(98, xPct));
          yPct = Math.max(2, Math.min(98, yPct));
        }
        btn.style.left = `${xPct}%`;
        btn.style.top = `${yPct}%`;
        devicePosOverride.set(d.id, { x: xPct, y: yPct });
      });
      window.addEventListener('mouseup', () => {
        dragging = false;
        dragStart = null;
        // reset didDrag after mouseup so next click can work
        setTimeout(() => { didDrag = false; }, 0);
      });

      devicesLayer.appendChild(btn);
    });
  }

  // Helper to get current device position in pixels, considering overrides
  function getDevicePixelPosition(id) {
    const dev = devicesData.find(d => d.id === id);
    if (!dev) return null;
    const ov = devicePosOverride.get(id);
    const xPct = ov ? ov.x : dev.x * 100;
    const yPct = ov ? ov.y : dev.y * 100;
    return {
      x: (xPct / 100) * canvas.width,
      y: (yPct / 100) * canvas.height,
    };
  }

  // Dashboard rendering --------------------------------------------------------
  const dashboardState = [];
  let aeratorMode = 'auto'; // 'on' | 'off' | 'auto'
  let feederRemainingMins = 60; // logical countdown for feeder
  function renderDashboard(devices) {
    dashboardGrid.innerHTML = '';
    dashboardState.length = 0;
    // Reorder: feeder first, then aerator, others, and pump last
    const orderPriority = (type) => {
      if (type === 'feeder') return 0;
      if (type === 'aerator') return 1;
      if (type === 'pump') return 99; // bottom
      return 10; // default middle group
    };
    const sorted = [...devices].sort((a, b) => {
      const pa = orderPriority(a.type);
      const pb = orderPriority(b.type);
      if (pa !== pb) return pa - pb;
      // stable fallback by name
      return (a.name || '').localeCompare(b.name || '');
    });
    sorted.forEach((d) => {
      const card = document.createElement('div');
      card.className = 'card';

      const header = document.createElement('div');
      header.className = 'card-header';
      const icon = document.createElement('img');
      icon.className = 'icon';
      icon.src = iconPathForType(d.type);
      icon.alt = d.name;
      const title = document.createElement('div');
      title.className = 'card-title';
      title.textContent = d.name;
      header.appendChild(icon);
      header.appendChild(title);
      card.appendChild(header);

      const metricRow = document.createElement('div');
      metricRow.className = 'metric-row';
      const label = document.createElement('div');
      label.className = 'metric-label';
      label.textContent = metricLabel(d.type);
      const value = document.createElement('div');
      value.className = 'metric-value';
      value.textContent = '--';
      metricRow.appendChild(label);
      metricRow.appendChild(value);
      card.appendChild(metricRow);

      const bar = document.createElement('div');
      bar.className = 'bar';
      const fill = document.createElement('div');
      fill.className = 'fill';
      bar.appendChild(fill);
      // Skip adding bar for feeder and pump (status only)
      if (d.type !== 'feeder' && d.type !== 'pump') {
        card.appendChild(bar);
      }

      // Aerator controls (ON/OFF/AUTO) under its bar
      let ctrl = null;
      if (d.type === 'aerator') {
        ctrl = document.createElement('div');
        ctrl.className = 'controls';
        const btnOn = document.createElement('button');
        btnOn.type = 'button'; btnOn.textContent = 'ON';
        const btnOff = document.createElement('button');
        btnOff.type = 'button'; btnOff.textContent = 'OFF';
        const btnAuto = document.createElement('button');
        btnAuto.type = 'button'; btnAuto.textContent = 'AUTO';
        [btnOn, btnOff, btnAuto].forEach(b => { b.style.marginRight = '6px'; b.style.padding = '4px 8px'; b.style.borderRadius = '6px'; b.style.border = '1px solid #2a5585'; b.style.background = '#143a5a'; b.style.color = '#e6edf6'; });
        ctrl.appendChild(btnOn); ctrl.appendChild(btnOff); ctrl.appendChild(btnAuto);
        card.appendChild(ctrl);
        // Handlers
        btnOn.addEventListener('click', () => { aeratorMode = 'on'; updateAeratorStatusUI(btnOn, btnOff, btnAuto); });
        btnOff.addEventListener('click', () => { aeratorMode = 'off'; updateAeratorStatusUI(btnOn, btnOff, btnAuto); });
        btnAuto.addEventListener('click', () => { aeratorMode = 'auto'; updateAeratorStatusUI(btnOn, btnOff, btnAuto); });
        // initial highlight
        updateAeratorStatusUI(btnOn, btnOff, btnAuto);
      }
      // Feeder control: Feed Now button to reset timer
      if (d.type === 'feeder') {
        const feedCtrl = document.createElement('div');
        feedCtrl.className = 'controls';
        const btnFeed = document.createElement('button');
        btnFeed.type = 'button';
        btnFeed.textContent = 'Feed Now';
        btnFeed.className = 'btn btn-feed';
        feedCtrl.appendChild(btnFeed);
        card.appendChild(feedCtrl);
        btnFeed.addEventListener('click', () => {
          feederRemainingMins = 60; // reset timer
          // click animation pulse
          btnFeed.classList.add('pulse');
          setTimeout(() => btnFeed.classList.remove('pulse'), 400);
          // Emit feed particles on manual feeding
          emitFeedParticles(22);
          // Immediately reflect in dashboard
          const s = dashboardState.find(x => x.type === 'feeder');
          if (s) {
            s.valueEl.textContent = 'Next: ' + feederRemainingMins + 'm';
          }
        });
      }

      dashboardGrid.appendChild(card);

      const state = {
        type: d.type,
        valueEl: value,
        fillEl: fill,
        history: [],
        ctrl,
      };
      dashboardState.push(state);
    });
    startDashboardLoop();
  }

  function metricLabel(type) {
    switch (type) {
      case 'temp': return 'Suhu';
      case 'ph': return 'pH';
      case 'do': return 'DO';
      case 'level': return 'Level Air';
      case 'aerator': return 'Aerasi';
      case 'pump': return 'Sirkulasi';
      case 'feeder': return 'Feeding';
      default: return 'Status';
    }
  }

  function startDashboardLoop() {
    let lastDashTs = Date.now();
    function nextForType(t, state, elapsedMs) {
      let val, pct, numeric;
      switch (t) {
        case 'temp': {
          numeric = +(randRange(25.0, 28.5)).toFixed(1);
          val = numeric.toFixed(1) + '°C';
          pct = ((numeric - 20) / 15) * 100;
          break;
        }
        case 'ph': {
          numeric = +(randRange(7.4, 8.2)).toFixed(2);
          val = numeric.toFixed(2);
          pct = ((numeric - 6) / 3) * 100;
          break;
        }
        case 'do': {
          numeric = +(randRange(5.5, 8.0)).toFixed(1);
          val = numeric.toFixed(1) + ' mg/L';
          pct = ((numeric - 3) / 6) * 100;
          break;
        }
        case 'level': {
          numeric = +(randRange(88, 98)).toFixed(0);
          val = numeric.toFixed(0) + '%';
          pct = numeric;
          break;
        }
        case 'pump': {
          // Pump runs continuously in normal operation
          val = 'ON';
          pct = undefined; // no bar shown for pump
          break;
        }
        case 'aerator': {
          let on;
          if (aeratorMode === 'on') {
            on = true;
          } else if (aeratorMode === 'off') {
            on = false;
          } else {
            // auto: follow DO card's latest numeric (find in state)
            const doState = dashboardState.find(s => s.type === 'do');
            const doText = doState?.valueEl.textContent || '7.0 mg/L';
            const doVal = parseFloat(doText);
            on = doVal < 6.0; // turn on if DO drops below threshold
          }
          val = on ? 'ON' : 'OFF';
          pct = on ? 100 : 0;
          aeratorOn = on;
          break;
        }
        case 'feeder': {
          // Reduce based on real elapsed time to avoid burst after tab inactivity
          const ticksMissed = Math.floor((elapsedMs || 0) / 4000);
          const minsDelta = ticksMissed > 0 ? ticksMissed * 10 : 10; // default 10 per normal tick
          const before = feederRemainingMins;
          feederRemainingMins = Math.max(0, feederRemainingMins - minsDelta);
          // Emit exactly once when crossing to 0 or hitting 0
          if (before > 0 && feederRemainingMins === 0) {
            emitFeedParticles(18);
            feederRemainingMins = 60;
          }
          val = 'Next: ' + feederRemainingMins + 'm';
          pct = undefined; // no bar for feeder
          break;
        }
        default: {
          val = 'OK'; pct = 50;
        }
      }
      state.valueEl.textContent = val;
      if (typeof pct === 'number' && state.fillEl && state.fillEl.parentElement && state.fillEl.parentElement.classList.contains('bar')) {
        state.fillEl.style.width = Math.max(0, Math.min(100, pct)) + '%';
      }
    }
    // initial
    dashboardState.forEach(s => nextForType(s.type, s, 0));
    // update every 4 seconds, skip when tab hidden; adjust by elapsed to avoid bursts
    setInterval(() => {
      const now = Date.now();
      const elapsed = now - lastDashTs;
      lastDashTs = now;
      if (document.hidden) return; // skip updates while backgrounded
      dashboardState.forEach(s => nextForType(s.type, s, elapsed));
    }, 4000);
  }

  function updateAeratorStatusUI(btnOn, btnOff, btnAuto) {
    const setActive = (btn, active) => {
      btn.style.background = active ? '#2a5585' : '#143a5a';
      btn.style.borderColor = active ? '#5c9bff' : '#2a5585';
    };
    setActive(btnOn, aeratorMode === 'on');
    setActive(btnOff, aeratorMode === 'off');
    setActive(btnAuto, aeratorMode === 'auto');
  }

  // Graph removed per request; dashboard shows bars only.

  // Simple pixel icon via data URI (tiny SVG) ----------------------------------
  function iconPathForType(type) {
    const map = {
      feeder: 'assets/web/feeder_pixel.png',
      pump: 'assets/web/pump_pixel.png',
      aerator: 'assets/web/aerator_pixel.png',
      temp: 'assets/web/temp_pixel.png',
      ph: 'assets/web/ph_pixel.png',
      do: 'assets/web/do_pixel.png',
      level: 'assets/web/level_pixel.png',
    };
    return map[type] || 'assets/web/device_pixel.png';
  }

  // Modal handling -------------------------------------------------------------
  const modalOverlay = document.getElementById('modalOverlay');
  const modalCloseBtn = document.getElementById('modalCloseBtn');
  const modalTitle = document.getElementById('modalTitle');
  const modalPhoto = document.getElementById('modalPhoto');
  const modalDesc = document.getElementById('modalDesc');
  const howBtn = document.getElementById('howBtn');

  let lastFocusedBtn = null;

  function openModal(device) {
    // cancel any Cara Kerja reveal timer to avoid overlap
    if (typeof howTimer !== 'undefined' && howTimer) { clearTimeout(howTimer); howTimer = null; }
    // ensure typing timer is reset before starting new typing
    if (typingTimer) { clearTimeout(typingTimer); typingTimer = null; modalDesc.classList.remove('typing'); }
    lastFocusedBtn = document.querySelector(`.device-icon[data-id="${device.id}"]`);
    modalTitle.textContent = device.name;
    // typing effect for description
    typeText(modalDesc, device.description);
    // Lazy-load photo (set src only when opening)
    modalPhoto.src = device.photo;
    // ensure default layout (with photo) for device modal
    modalOverlay.querySelector('.modal-body').classList.remove('modal-body--text-only');
    modalOverlay.setAttribute('aria-hidden', 'false');
    // focus the modal container for Esc capture
    const modal = modalOverlay.querySelector('.modal');
    modal.focus();

    // Close handlers
    function onEsc(e) {
      if (e.key === 'Escape') closeModal();
    }
    function onClickOverlay(e) {
      if (e.target === modalOverlay) closeModal();
    }
    modalOverlay.addEventListener('keydown', onEsc, { once: true });
    modalOverlay.addEventListener('click', onClickOverlay, { once: true });
  }

  function closeModal() {
    modalOverlay.setAttribute('aria-hidden', 'true');
    modalPhoto.removeAttribute('src'); // free memory
    // cancel any active timers
    if (typingTimer) { clearTimeout(typingTimer); typingTimer = null; modalDesc.classList.remove('typing'); }
    if (typeof howTimer !== 'undefined' && howTimer) { clearTimeout(howTimer); howTimer = null; }
    // restore default modal layout for next open
    const bodyEl = modalOverlay.querySelector('.modal-body');
    if (bodyEl) bodyEl.classList.remove('modal-body--text-only');
    if (lastFocusedBtn) lastFocusedBtn.focus();
  }

  modalCloseBtn.addEventListener('click', closeModal);

  // Cara Kerja popup with line-by-line reveal and centered arrows
  function openHowItWorks() {
    // cancel any ongoing typing to prevent overwrite
    if (typingTimer) { clearTimeout(typingTimer); typingTimer = null; modalDesc.classList.remove('typing'); }
    const lines = [
      '1. Sensor mengukur kondisi air kolam',
      'Suhu, pH, oksigen (DO), dan level air dikumpulkan secara berkala.',
      'arrow',
      '2. Data masuk ke gateway (ESP32 / NodeMCU)',
      'Gateway membaca data, memeriksa batas ambang, dan menjalankan kontrol dasar.',
      'arrow',
      '3. Gateway mengirim data ke Broker MQTT',
      'Data dikirim menggunakan protokol MQTT yang ringan dan efisien.',
      'arrow',
      '4. Cloud IoT memproses dan menyimpan data',
      'Cloud melakukan penyimpanan, analisis tren, visualisasi grafik, dan notifikasi.',
      'arrow',
      '5. Dashboard menampilkan kondisi secara real-time',
      'Operator dapat memantau kualitas air dan menerima peringatan dari perangkat apa pun.',
      'arrow',
      '6. Aktuator menjalankan tindakan otomatis',
      'Aerator, pompa, dan feeder bekerja sesuai kondisi yang terdeteksi oleh sistem.'
    ];

    modalTitle.textContent = 'Cara Kerja Sistem';
    modalPhoto.removeAttribute('src');
    // switch to text-only layout: hide photo and use 1 column
    modalOverlay.querySelector('.modal-body').classList.add('modal-body--text-only');
    modalDesc.innerHTML = '';

    // Build DOM nodes for each line (arrows centered)
    const nodes = lines.map((ln) => {
      const el = document.createElement('div');
      if (ln === 'arrow') {
        el.className = 'arrow';
        el.textContent = '↓';
      } else {
        el.textContent = ln;
      }
      el.style.opacity = '0';
      return el;
    });
    nodes.forEach(n => modalDesc.appendChild(n));

    // Reveal animation: line-by-line fade in (simulates writing)
    let idx = 0;
    const reveal = () => {
      if (idx >= nodes.length) return;
      const n = nodes[idx];
      n.style.transition = 'opacity 160ms ease-out';
      n.style.opacity = '1';
      idx++;
      if (idx < nodes.length) { howTimer = setTimeout(reveal, 140); } else { howTimer = null; }
    };

    // Open modal and start animation
    const modal = modalOverlay.querySelector('.modal');
    modalOverlay.setAttribute('aria-hidden', 'false');
    modal.focus();
    reveal();

    // Close handlers (same as device modal)
    function onEsc(e) { if (e.key === 'Escape') closeModal(); }
    function onClickOverlay(e) { if (e.target === modalOverlay) closeModal(); }
    modalOverlay.addEventListener('keydown', onEsc, { once: true });
    modalOverlay.addEventListener('click', onClickOverlay, { once: true });
  }

  if (howBtn) {
    howBtn.addEventListener('click', openHowItWorks);
  }

  // Init
  loadDevices();
    // Feeder particles -----------------------------------------------------------
    // Emit brown feed particles that fall down and fade out, on schedule and on Feed Now.
    const feedParticles = [];
    let feedImg = null;
    loadFirstAvailable([
      'assets/web/feed_pixel.png',
      'assets/web/feed_pixel.webp'
    ]).then(img => { feedImg = img; });

    function emitFeedParticles(count = 10) {
      const feeder = findDeviceByType('feeder');
      if (!feeder) return;
      const pos = getDevicePixelPosition(feeder.id);
      if (!pos) return;
      const sx = pos.x;
      const sy = pos.y;
      for (let i = 0; i < count; i++) {
        feedParticles.push({
          x: sx + randRange(-6, 6),
          y: sy + randRange(-4, 4),
          vx: randRange(-0.3, 0.3),
          vy: randRange(0.6, 1.2), // downward
          alpha: 1,
          size: randRange(6, 10),
          color: '#8b5a2b', // fallback color if image not loaded
        });
      }
    }

    function updateFeedParticles(dt) {
      for (let i = feedParticles.length - 1; i >= 0; i--) {
        const p = feedParticles[i];
        p.x += p.vx * (dt / 16);
        p.y += p.vy * (dt / 16);
        // slower fade so feed particles linger longer
        p.alpha -= 0.004 * (dt / 16);
        if (p.y > canvas.height || p.alpha <= 0) {
          feedParticles.splice(i, 1);
        }
      }
    }

    function drawFeedParticles() {
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      for (const p of feedParticles) {
        ctx.globalAlpha = Math.max(0, Math.min(1, p.alpha));
        if (feedImg) {
          ctx.drawImage(feedImg, 0, 0, feedImg.width, feedImg.height, Math.floor(p.x), Math.floor(p.y), Math.floor(p.size), Math.floor(p.size));
        } else {
          ctx.fillStyle = p.color;
          ctx.fillRect(Math.floor(p.x), Math.floor(p.y), Math.floor(p.size), Math.floor(p.size));
        }
      }
      ctx.globalAlpha = 1;
      ctx.restore();
    }
  // Aerator bubbles ------------------------------------------------------------
  // When aerator status is ON in dashboard, emit bubbles from its position.
  let aeratorOn = false;
  const bubbles = [];
  let bubbleImg = null;
  loadFirstAvailable([
    'assets/web/bubble_pixel.png',
    'assets/web/bubble_pixel.webp'
  ]).then(img => { bubbleImg = img; });

  function findDeviceByType(type) {
    return devicesData.find(d => d.type === type);
  }

  function emitBubbles(dt) {
    if (!aeratorOn) return;
    const aer = findDeviceByType('aerator');
    if (!aer) return;
    const pos = getDevicePixelPosition(aer.id);
    if (!pos) return;
    const cx = pos.x;
    const cy = pos.y;
    // emit fewer, larger bubbles with probabilistic spawn
    if (Math.random() < 0.35) {
      const count = 1; // single bubble most frames
      for (let i = 0; i < count; i++) {
        bubbles.push({
          x: cx + randRange(-5, 5),
          y: cy + randRange(-2, 2),
          vx: randRange(-0.25, 0.25),
          vy: randRange(-0.7, -0.35),
          alpha: 1,
          size: randRange(16, 24),
        });
      }
    }
  }

  function updateBubbles(dt) {
    for (let i = bubbles.length - 1; i >= 0; i--) {
      const b = bubbles[i];
      b.x += b.vx * (dt / 16);
      b.y += b.vy * (dt / 16);
      // slower fade so bubbles linger more naturally
      b.alpha -= 0.005 * (dt / 16);
      if (b.y < 0 || b.alpha <= 0) {
        bubbles.splice(i, 1);
      }
    }
  }

  function drawBubbles() {
    if (!bubbleImg) return;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    for (const b of bubbles) {
      ctx.globalAlpha = Math.max(0, Math.min(1, b.alpha));
      ctx.drawImage(bubbleImg, 0, 0, bubbleImg.width, bubbleImg.height, Math.floor(b.x), Math.floor(b.y), Math.floor(b.size), Math.floor(b.size));
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // Typewriter effect ----------------------------------------------------------
  let typingTimer = null;
  let howTimer = null; // current timer for Cara Kerja reveal
  function typeText(el, text) {
    // cancel previous typing if any
    if (typingTimer) { clearTimeout(typingTimer); typingTimer = null; }
    el.classList.add('typing');
    el.textContent = '';
    let i = 0;
    const step = () => {
      el.textContent = text.slice(0, i);
      i++;
      if (i <= text.length) {
        const delay = 14; // ms per char; allows wrapping
        typingTimer = setTimeout(step, delay);
      } else {
        // keep final text and remove cursor
        el.textContent = text;
        el.classList.remove('typing');
        typingTimer = null;
      }
    };
    step();
  }
})();
