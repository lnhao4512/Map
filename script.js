/**
 * VLU Smart Campus & Basement Interactive Map Engine
 * Handles Layer Switching (Ground / Basement / X-Ray), Zoom/Pan, Traffic Simulation, and Wayfinding
 */

document.addEventListener('DOMContentLoaded', () => {
  // ==========================================
  // 1. STATE & DATA DEFINITIONS
  // ==========================================
  const state = {
    currentLayer: 'xray', // 'ground', 'basement', 'xray'
    showLabels: true,
    showFlow: true,
    showPillars: true,
    isSimulating: false,
    simInterval: null,
    vehicles: [],
    
    // Zoom & Pan
    scale: 1,
    panX: 0,
    panY: 0,
    isDragging: false,
    startX: 0,
    startY: 0
  };

  const buildingsData = [
    { id: 'bldg-toaa', name: 'Toà A', sub: '', color: '#ef4444', cx: 830, cy: 350 },
    { id: 'bldg-toabc', name: 'Toà B - C', sub: '', color: '#3b82f6', cx: 960, cy: 560 },
    { id: 'bldg-toak', name: 'Toà K', sub: '', color: '#fb923c', cx: 820, cy: 565 },
    { id: 'bldg-toaj', name: 'Toà J', sub: '', color: '#64748b', cx: 650, cy: 565 },
    { id: 'bldg-toai', name: 'Toà I', sub: '', color: '#0ea5e9', cx: 525, cy: 640 },
    { id: 'bldg-toag', name: 'Toà G', sub: '', color: '#db2777', cx: 745, cy: 715 },
    { id: 'bldg-toaf', name: 'Toà F', sub: '', color: '#14b8a6', cx: 877, cy: 715 },
    { id: 'bldg-toad', name: 'Toà D', sub: '', color: '#eab308', cx: 985, cy: 715 }
  ];

  // ==========================================
  // 2. DOM ELEMENTS
  // ==========================================
  const appContainer = document.getElementById('app');
  const mapContainer = document.getElementById('map-container');
  const campusSvg = document.getElementById('campus-svg');
  const viewportGroup = document.getElementById('viewport-group');
  const layerIndicator = document.getElementById('current-layer-indicator');
  const tooltip = document.getElementById('map-tooltip');
  const ttHeader = document.getElementById('tt-header');
  const ttBody = document.getElementById('tt-body');
  const simulatedVehiclesGroup = document.getElementById('simulated-vehicles');
  const guidancePath = document.getElementById('guidance-path');
  const selectionPulse = document.getElementById('selection-pulse');

  // Layer buttons
  const btnGround = document.getElementById('btn-ground');
  const btnXray = document.getElementById('btn-xray');
  const btnBasement = document.getElementById('btn-basement');
  const layerBtns = [btnGround, btnXray, btnBasement];

  // Simulation & Modal buttons
  const btnSimulate = document.getElementById('btn-simulate');
  const simText = document.getElementById('sim-text');
  const btnGuideModal = document.getElementById('btn-guide-modal');
  const modalGuide = document.getElementById('modal-guide');
  const btnCloseModal = document.getElementById('btn-close-modal');
  const btnDrawRoute = document.getElementById('btn-draw-route');

  // Zoom buttons
  const btnZoomIn = document.getElementById('btn-zoom-in');
  const btnZoomOut = document.getElementById('btn-zoom-out');
  const btnZoomReset = document.getElementById('btn-zoom-reset');

  // Toggle buttons
  const btnToggleLabels = document.getElementById('btn-toggle-labels');
  const btnToggleFlow = document.getElementById('btn-toggle-flow');
  const btnTogglePillars = document.getElementById('btn-toggle-pillars');

  // Building List Container
  const buildingListContainer = document.getElementById('building-list');

  // ==========================================
  // 3. LAYER MANAGEMENT
  // ==========================================
  function setLayer(layerMode) {
    state.currentLayer = layerMode;
    appContainer.classList.remove('mode-ground', 'mode-basement', 'mode-xray');
    appContainer.classList.add(`mode-${layerMode}`);

    layerBtns.forEach(btn => {
      if (btn.dataset.layer === layerMode) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    const modeLabels = {
      ground: 'Mặt Đất (Ground Level)',
      basement: 'Tầng Hầm (B1 Basement)',
      xray: 'Đối Chiếu (X-Ray Overlay)'
    };
    layerIndicator.innerHTML = `Chế độ: <strong>${modeLabels[layerMode]}</strong>`;
  }

  layerBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      setLayer(btn.dataset.layer);
    });
  });

  // Initial layer set
  setLayer('xray');

  // ==========================================
  // 4. BUILDING DIRECTORY POPULATION
  // ==========================================
  function initBuildingList() {
    buildingListContainer.innerHTML = '';
    buildingsData.forEach(bldg => {
      const btn = document.createElement('button');
      btn.className = 'bldg-item-btn';
      btn.innerHTML = `
        <span class="bldg-color-chip" style="background-color: ${bldg.color}"></span>
        <span>${bldg.name}</span>
      `;
      btn.addEventListener('click', () => {
        highlightObject(bldg.cx, bldg.cy, bldg.name, bldg.sub);
      });
      buildingListContainer.appendChild(btn);
    });
  }
  initBuildingList();

  // ==========================================
  // 5. ZOOM & PAN ENGINE
  // ==========================================
  function updateTransform() {
    viewportGroup.setAttribute(
      'transform',
      `translate(${state.panX}, ${state.panY}) scale(${state.scale})`
    );
  }

  btnZoomIn.addEventListener('click', () => {
    state.scale = Math.min(state.scale * 1.25, 4);
    updateTransform();
  });

  btnZoomOut.addEventListener('click', () => {
    state.scale = Math.max(state.scale / 1.25, 0.6);
    updateTransform();
  });

  btnZoomReset.addEventListener('click', () => {
    state.scale = 1;
    state.panX = 0;
    state.panY = 0;
    updateTransform();
    selectionPulse.setAttribute('cx', -100);
    selectionPulse.setAttribute('cy', -100);
    guidancePath.setAttribute('d', '');
  });

  // Mouse wheel zoom
  mapContainer.addEventListener('wheel', (e) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
    const newScale = Math.min(Math.max(state.scale * zoomFactor, 0.6), 4);
    state.scale = newScale;
    updateTransform();
  });

  // Drag / Pan interaction
  mapContainer.addEventListener('mousedown', (e) => {
    if (e.target.closest('.interactive-building') || e.target.closest('.interactive-ramp') || e.target.closest('.parking-zone')) {
      // Don't drag if clicking specific items
    }
    state.isDragging = true;
    state.startX = e.clientX - state.panX;
    state.startY = e.clientY - state.panY;
  });

  window.addEventListener('mousemove', (e) => {
    if (!state.isDragging) return;
    state.panX = e.clientX - state.startX;
    state.panY = e.clientY - state.startY;
    updateTransform();
  });

  window.addEventListener('mouseup', () => {
    state.isDragging = false;
  });

  // ==========================================
  // 6. TOOLTIP & HIGHLIGHT INTERACTIVITY
  // ==========================================
  function showTooltip(e, title, body) {
    ttHeader.textContent = title;
    ttBody.textContent = body;
    tooltip.style.display = 'block';
    const rect = mapContainer.getBoundingClientRect();
    tooltip.style.left = `${e.clientX - rect.left}px`;
    tooltip.style.top = `${e.clientY - rect.top}px`;
  }

  function hideTooltip() {
    tooltip.style.display = 'none';
  }

  function highlightObject(cx, cy, title, body) {
    selectionPulse.setAttribute('cx', cx);
    selectionPulse.setAttribute('cy', cy);

    // Pan to object if out of view
    state.panX = 800 - cx * state.scale;
    state.panY = 500 - cy * state.scale;
    updateTransform();
  }

  // Bind hover on buildings
  document.querySelectorAll('.interactive-building').forEach(el => {
    el.addEventListener('mousemove', (e) => {
      const name = el.dataset.name || el.querySelector('.building-label.main')?.textContent;
      const sub = el.querySelector('.building-label.sub')?.textContent || 'Toà nhà chức năng khuôn viên Văn Lang';
      showTooltip(e, name, `${sub} • Có thang máy kết nối trực tiếp xuống hầm B1`);
    });
    el.addEventListener('mouseleave', hideTooltip);
    el.addEventListener('click', (e) => {
      const bldgId = el.dataset.id;
      const data = buildingsData.find(b => b.id === `bldg-${bldgId}`);
      if (data) highlightObject(data.cx, data.cy, data.name, data.sub);
    });
  });

  // Bind hover on parking zones
  document.querySelectorAll('.parking-zone').forEach(el => {
    el.addEventListener('mousemove', (e) => {
      const title = el.querySelector('.zone-tag-title')?.textContent || 'Khu vực bãi đỗ xe';
      const cap = el.querySelector('.zone-tag-cap')?.textContent || '';
      showTooltip(e, title, `${cap} • Hệ thống camera an ninh & cảm biến chỗ trống`);
    });
    el.addEventListener('mouseleave', hideTooltip);
  });

  // Bind hover on ramps
  document.querySelectorAll('.interactive-ramp').forEach(el => {
    el.addEventListener('mousemove', (e) => {
      const title = el.dataset.name || 'Ram dốc cửa hầm';
      const isIn = el.classList.contains('interactive-ramp') && el.id.includes('in');
      const text = isIn 
        ? 'Lối đi xuống tầng hầm. Quẹt thẻ sinh viên/cán bộ tại cổng barrier tự động.' 
        : 'Lối đi lên mặt đất. Ra làn thu phí & kết nối đường nội bộ ra cổng trường.';
      showTooltip(e, title, text);
    });
    el.addEventListener('mouseleave', hideTooltip);
  });

  // Click on ramp items in left sidebar
  document.querySelectorAll('.ramp-item').forEach(item => {
    item.addEventListener('click', () => {
      const rampId = item.dataset.ramp;
      const rampEl = document.getElementById(rampId);
      if (rampEl) {
        const bbox = rampEl.getBBox();
        highlightObject(bbox.x + bbox.width / 2, bbox.y + bbox.height / 2, item.querySelector('strong').textContent, item.querySelector('small').textContent);
      }
    });
  });

  // Toggle buttons logic
  btnToggleLabels.addEventListener('click', () => {
    state.showLabels = !state.showLabels;
    btnToggleLabels.classList.toggle('active', state.showLabels);
    document.querySelectorAll('.building-label, .zone-tag-bg, .zone-tag-title, .zone-tag-cap, .zone-tag-sub, .ramp-tooltip-bubble, .ramp-title, .ramp-cap').forEach(el => {
      el.style.display = state.showLabels ? '' : 'none';
    });
  });

  btnToggleFlow.addEventListener('click', () => {
    state.showFlow = !state.showFlow;
    btnToggleFlow.classList.toggle('active', state.showFlow);
    const lanes = document.getElementById('basement-traffic-lanes');
    if (lanes) lanes.style.display = state.showFlow ? '' : 'none';
  });

  btnTogglePillars.addEventListener('click', () => {
    state.showPillars = !state.showPillars;
    btnTogglePillars.classList.toggle('active', state.showPillars);
    const cores = document.getElementById('basement-vertical-cores');
    if (cores) cores.style.display = state.showPillars ? '' : 'none';
  });

  // ==========================================
  // 7. TRAFFIC SIMULATION ENGINE (RED CIRCUIT LOOP ALONG RẠCH LĂNG)
  // ==========================================
  const vehicleRoutes = [
    // TUYẾN 1 (ĐỘC LẬP): HẦM TOÀ I (Vào Kênh Lăng -> Vòng Bắc Toà A sang Trái -> Vào Bắc Toà I -> Hầm Toà I -> Ra Ram dốc Nam Toà I -> Rẽ xéo ra Cổng phụ Hẻm 566)
    [
      { x: 825, y: 920 }, { x: 980, y: 840 }, { x: 1080, y: 750 }, { x: 1050, y: 500 }, { x: 980, y: 320 }, { x: 860, y: 210 }, { x: 760, y: 190 }, 
      { x: 680, y: 220 }, { x: 525, y: 390 }, { x: 525, y: 440 }, { x: 525, y: 550 }, { x: 525, y: 680 }, { x: 525, y: 780 }, 
      { x: 525, y: 840 }, { x: 450, y: 860 }, { x: 360, y: 890 }
    ],
    // TUYẾN 2A (VÒNG LẶP RED CIRCUIT): HẦM SINH VIÊN (Ram Nam F-D -> Vòng phải ra Kênh Lăng -> Chạy dọc Kênh Lăng lên Bắc -> Vòng Trái -> Ram Bắc -> Hầm SV -> Ram Nam F-D)
    [
      { x: 980, y: 840 }, { x: 1080, y: 750 }, { x: 1050, y: 500 }, { x: 980, y: 320 }, { x: 860, y: 210 }, { x: 760, y: 190 }, 
      { x: 680, y: 220 }, { x: 680, y: 360 }, { x: 680, y: 480 }, { x: 890, y: 480 }, { x: 890, y: 620 }, { x: 890, y: 730 }, 
      { x: 980, y: 730 }, { x: 980, y: 840 }
    ],
    // TUYẾN 2B (ĐỘC LẬP): HẦM CB/GV & Ô TÔ (Từ Cổng Chính ĐTT -> Vòng Bắc sang Trái -> Ram dốc Bắc -> Khoang A -> Ra Ram dốc Nam -> Rẽ ra Cổng DQH)
    [
      { x: 815, y: 30 }, { x: 815, y: 190 }, { x: 760, y: 190 }, { x: 680, y: 220 }, { x: 680, y: 360 }, 
      { x: 740, y: 370 }, { x: 840, y: 370 }, { x: 890, y: 480 }, { x: 980, y: 730 }, { x: 980, y: 840 }, 
      { x: 825, y: 840 }, { x: 825, y: 950 }
    ]
  ];

  class SimVehicle {
    constructor(route, color, type = 'moto', startSegment = 0, startT = 0) {
      this.route = route;
      this.color = color;
      this.type = type;
      this.currentSegment = startSegment % (route.length - 1);
      this.t = startT; // 0 to 1
      this.speed = (type === 'car' ? 0.005 : 0.007) + Math.random() * 0.003;
      this.element = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      this.element.setAttribute('class', 'sim-vehicle');
      
      if (type === 'car') {
        this.element.innerHTML = `
          <rect x="-10" y="-6" width="20" height="12" rx="3" fill="${color}" stroke="#ffffff" stroke-width="1.5" />
          <rect x="-4" y="-4" width="8" height="8" rx="1" fill="#1e293b" />
          <circle cx="8" cy="-4" r="1.5" fill="#fef08a" />
          <circle cx="8" cy="4" r="1.5" fill="#fef08a" />
        `;
      } else {
        // Motorbike
        this.element.innerHTML = `
          <circle cx="0" cy="0" r="4.5" fill="${color}" stroke="#ffffff" stroke-width="1.5" />
          <circle cx="3" cy="0" r="1.5" fill="#fef08a" />
        `;
      }
      simulatedVehiclesGroup.appendChild(this.element);
    }

    update() {
      this.t += this.speed;
      if (this.t >= 1) {
        this.t = 0;
        this.currentSegment++;
        if (this.currentSegment >= this.route.length - 1) {
          this.currentSegment = 0;
        }
      }

      const p1 = this.route[this.currentSegment];
      const p2 = this.route[this.currentSegment + 1];

      const curX = p1.x + (p2.x - p1.x) * this.t;
      const curY = p1.y + (p2.y - p1.y) * this.t;
      const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x) * (180 / Math.PI);

      this.element.setAttribute('transform', `translate(${curX}, ${curY}) rotate(${angle})`);
    }

    remove() {
      if (this.element.parentNode) {
        this.element.parentNode.removeChild(this.element);
      }
    }
  }

  function startSimulation() {
    state.isSimulating = true;
    simText.textContent = 'Dừng mô phỏng';
    btnSimulate.classList.add('active');

    // Create a rich fleet of 18+ simulated vehicles running on the 2 isolated tracks
    state.vehicles = [
      // Tuyến 1 (Toà I)
      new SimVehicle(vehicleRoutes[0], '#38bdf8', 'moto', 0, 0.1),
      new SimVehicle(vehicleRoutes[0], '#fbbf24', 'moto', 1, 0.4),
      new SimVehicle(vehicleRoutes[0], '#34d399', 'moto', 2, 0.7),
      new SimVehicle(vehicleRoutes[0], '#f43f5e', 'moto', 3, 0.2),
      new SimVehicle(vehicleRoutes[0], '#a855f7', 'moto', 4, 0.6),

      // Tuyến 2A (Hầm Sinh Viên Chính)
      new SimVehicle(vehicleRoutes[1], '#10b981', 'car', 0, 0.2),
      new SimVehicle(vehicleRoutes[1], '#38bdf8', 'moto', 0, 0.8),
      new SimVehicle(vehicleRoutes[1], '#f59e0b', 'moto', 1, 0.3),
      new SimVehicle(vehicleRoutes[1], '#f43f5e', 'moto', 2, 0.1),
      new SimVehicle(vehicleRoutes[1], '#3b82f6', 'car', 2, 0.7),
      new SimVehicle(vehicleRoutes[1], '#2dd4bf', 'moto', 3, 0.4),
      new SimVehicle(vehicleRoutes[1], '#ec4899', 'moto', 4, 0.2),
      new SimVehicle(vehicleRoutes[1], '#eab308', 'moto', 4, 0.8),
      new SimVehicle(vehicleRoutes[1], '#06b6d4', 'moto', 5, 0.5),

      // Tuyến 2B (Hầm Toà A sang lối thoát Lương Ngọc Quyến)
      new SimVehicle(vehicleRoutes[2], '#ef4444', 'car', 0, 0.5),
      new SimVehicle(vehicleRoutes[2], '#a855f7', 'moto', 1, 0.6),
      new SimVehicle(vehicleRoutes[2], '#38bdf8', 'moto', 2, 0.3),
      new SimVehicle(vehicleRoutes[2], '#10b981', 'moto', 3, 0.7)
    ];

    function animate() {
      if (!state.isSimulating) return;
      state.vehicles.forEach(v => v.update());
      requestAnimationFrame(animate);
    }
    requestAnimationFrame(animate);
  }

  function stopSimulation() {
    state.isSimulating = false;
    simText.textContent = 'Chạy mô phỏng xe';
    btnSimulate.classList.remove('active');
    state.vehicles.forEach(v => v.remove());
    state.vehicles = [];
  }

  btnSimulate.addEventListener('click', () => {
    if (state.isSimulating) {
      stopSimulation();
    } else {
      startSimulation();
    }
  });

  // Auto-start simulation
  startSimulation();

  // ==========================================
  // 8. WAYFINDING & SMART ROUTE GUIDANCE (AUTO-RECOMMENDED PARKING OPTIONS)
  // ==========================================
  const selectUserRole = document.getElementById('select-user-role');
  const selectEntryGate = document.getElementById('select-entry-gate');
  const parkingOptionsGrid = document.getElementById('parking-options-grid');
  const routeStepsList = document.getElementById('route-steps-list');
  const routeCardTitle = document.getElementById('route-card-title');
  const btnViewOptionBlueprint = document.getElementById('btn-view-option-blueprint');

  let currentParkingOptions = [];
  let selectedOptionId = null;

  function generateSmartParkingOptions() {
    const role = selectUserRole.value;
    const gate = selectEntryGate.value;

    let options = [];

    if (role === 'student' || role === 'guest') {
      options.push({
        id: 'opt-student-main',
        mode: 'student',
        title: '🅿️ Hầm Sinh Viên (Khu K-BC-G-F-D)',
        badge: '⭐ TỐI ƯU NHẤT',
        badgeClass: 'best',
        cap: '3,000 xe máy',
        free: '420 chỗ trống',
        desc: `Khu hầm chính quy mô lớn • Làn 5.0m 1 chiều Trái ➔ Phải • Thang máy trực tiếp lên các toà nhà`,
        steps: [
          `Đi vào từ ${gate === 'gate-north' ? 'Cổng chính Đặng Thùy Trâm' : gate === 'gate-south' ? 'Cổng Dương Quảng Hàm' : 'Cổng phụ Hẻm 566'}.`,
          `Di chuyển theo làn 1 chiều vào <strong>Ram dốc Bắc (IN)</strong>.`,
          `Quẹt thẻ thông minh tự động tại Barrier 02.`,
          `Xuống hầm SV, đỗ tại các khoang ô xéo 45° (Khoang K, BC, TT, G, F, D).`,
          `Đi thang máy <strong>🛗Thang máy toà nhà</strong> lên thẳng sảnh.`
        ]
      });

      options.push({
        id: 'opt-toai',
        mode: 'toai',
        title: '🏢 Hầm Giữ Xe Toà I',
        badge: '🟢 THÔNG THOÁNG / NHANH',
        badgeClass: 'fast',
        cap: '600 xe máy',
        free: '185 chỗ trống (Xéo 45°)',
        desc: `Ram dốc riêng độc lập • Làn 1 chiều Bắc ➔ Nam • Ít kẹt xe, phù hợp khi vào cổng Bắc và thoát cổng Hẻm 566`,
        steps: [
          `Đi từ Cổng chính Đặng Thùy Trâm rẽ phải vào đường nội bộ bao quanh Toà I.`,
          `Vào <strong>Ram dốc Bắc Toà I (IN)</strong> • Quẹt thẻ Barrier 01.`,
          `Đỗ xe tại Khoang đỗ vạch xéo 45° (Dãy Tây hoặc Dãy Đông).`,
          `Rút xe dễ dàng theo lối dắt 1.4m 1 chiều (Trái ➔ Phải).`,
          `Đi thang máy <strong>🛗Toà I</strong> lên giảng đường.`
        ]
      });

      if (role === 'guest') {
        options.push({
          id: 'opt-guest-short',
          mode: 'student',
          title: '🛵 Bãi Đỗ Khách Vãng Lai & Học Viên',
          badge: '⚡ GỬI NHANH',
          badgeClass: 'staff',
          cap: 'Phân khu A01-A03',
          free: '50 chỗ trống',
          desc: 'Khu vực riêng cho khách liên hệ công tác, bảo vệ hỗ trợ hướng dẫn trực tiếp',
          steps: [
            `Xuất trình giấy tờ / đăng ký khách tại Cổng bảo vệ.`,
            `Vào Ram dốc Bắc, đỗ ngay cụm khoang đầu tiên.`,
            `Nhận thẻ khách vãng lai và đi thang máy lên sảnh hành chính.`
          ]
        });
      }
    } else if (role === 'staff') {
      options.push({
        id: 'opt-staff-main',
        mode: 'staff',
        title: '👨‍🏫 Hầm Cán Bộ / Giảng Viên (Toà A & J)',
        badge: '⭐ ĐẶC QUYỀN CB/GV',
        badgeClass: 'best',
        cap: '1,500 xe máy',
        free: '340 chỗ trống',
        desc: `Khu vực biệt lập dành riêng cho Thầy/Cô & Cán bộ nhân viên • Thang máy Toà A & Toà J`,
        steps: [
          `Đi vào qua Cổng chính Đặng Thùy Trâm.`,
          `Rẽ vào <strong>Ram dốc Bắc Toà A (IN)</strong> có làn ưu tiên CB/GV.`,
          `Camera AI nhận diện biển số & mở Barrier tự động.`,
          `Đỗ tại các Khoang cán bộ KH-CB (vạch xéo 45°).`,
          `Đi thang máy <strong>🛗A</strong> hoặc <strong>🛗J</strong> lên phòng làm việc.`
        ]
      });

      options.push({
        id: 'opt-staff-toai',
        mode: 'toai',
        title: '🏢 Hầm Toà I (Khu Vực Giảng Viên Toà I)',
        badge: '🟢 TIỆN LỢI TOÀ I',
        badgeClass: 'fast',
        cap: 'Khoang VIP GV',
        free: '40 chỗ trống',
        desc: `Dành cho Giảng viên có giờ giảng dạy tại Toà I hoặc Khối phòng Lab`,
        steps: [
          `Vào qua Ram dốc Bắc Toà I.`,
          `Đỗ tại khu vực dành riêng cho Giảng viên Toà I (Dãy Đông).`,
          `Đi thang máy <strong>🛗I</strong> lên phòng học.`
        ]
      });
    } else if (role === 'car') {
      options.push({
        id: 'opt-car-basement',
        mode: 'staff',
        title: '🚗 Hầm Giữ Xe Ô Tô (Toà A)',
        badge: '⭐ KHUYÊN DÙNG',
        badgeClass: 'best',
        cap: '24 Vị trí Ô tô',
        free: '14 ô trống',
        desc: `Làn xe ô tô 6.0m rộng rãi tiêu chuẩn • Có cảm biến LED báo ô trống & Camera AI`,
        steps: [
          `Đi qua Cổng chính Đặng Thùy Trâm.`,
          `Chạy vào làn ô tô trung tâm 6.0m dẫn xuống <strong>Ram dốc Bắc</strong>.`,
          `Quẹt thẻ tự động tại Barrier ô tô.`,
          `Đỗ xe lùi vào các Slot ô tô (OTO-01 .. OTO-24).`,
          `Đi thang máy <strong>🛗Toà A</strong> lên mặt đất.`
        ]
      });

      options.push({
        id: 'opt-car-ground',
        mode: 'staff',
        title: '🚙 Bãi Đỗ Ô Tô Mặt Đất (Dự Phòng)',
        badge: '🟢 NGOÀI TRỜI',
        badgeClass: 'fast',
        cap: '15 vị trí',
        free: '6 ô trống',
        desc: 'Bãi đỗ ngoài trời khuôn viên phía sau Toà A & B-C dành cho khách đoàn và sự kiện',
        steps: [
          `Đi vào từ Cổng chính Đặng Thùy Trâm.`,
          `Đi theo đường vành đai nội bộ sang bãi đỗ mặt đất sau Toà A.`,
          `Bảo vệ hướng dẫn đỗ theo luồng 1 chiều.`
        ]
      });
    }

    currentParkingOptions = options;
    if (!selectedOptionId || !options.find(o => o.id === selectedOptionId)) {
      selectedOptionId = options[0].id;
    }

    renderParkingOptionCards();
  }

  function renderParkingOptionCards() {
    parkingOptionsGrid.innerHTML = '';

    currentParkingOptions.forEach(opt => {
      const isAct = opt.id === selectedOptionId;
      const card = document.createElement('div');
      card.className = `parking-option-card ${isAct ? 'active' : ''}`;
      card.dataset.id = opt.id;

      card.innerHTML = `
        <div class="opt-header">
          <span class="opt-title">${opt.title}</span>
          <span class="opt-badge ${opt.badgeClass}">${opt.badge}</span>
        </div>
        <p class="opt-desc">${opt.desc}</p>
        <div class="opt-meta">
          <span>Sức chứa: <strong>${opt.cap}</strong></span>
          <span style="color:#34d399">Trống: <strong>${opt.free}</strong></span>
        </div>
      `;

      card.onclick = () => {
        selectedOptionId = opt.id;
        renderParkingOptionCards();
      };

      parkingOptionsGrid.appendChild(card);
    });

    // Update steps list for selected option
    const activeOpt = currentParkingOptions.find(o => o.id === selectedOptionId) || currentParkingOptions[0];
    if (activeOpt) {
      routeCardTitle.innerHTML = `📋 Lộ trình di chuyển 1 chiều tới <strong>${activeOpt.title}</strong>:`;
      routeStepsList.innerHTML = activeOpt.steps.map(s => `<li>${s}</li>`).join('');
    }
  }

  // Bind change listeners to update smart parking options automatically
  selectUserRole.addEventListener('change', generateSmartParkingOptions);
  selectEntryGate.addEventListener('change', generateSmartParkingOptions);

  btnGuideModal.addEventListener('click', () => {
    generateSmartParkingOptions();
    modalGuide.style.display = 'flex';
  });

  btnCloseModal.addEventListener('click', () => {
    modalGuide.style.display = 'none';
  });

  modalGuide.addEventListener('click', (e) => {
    if (e.target === modalGuide) modalGuide.style.display = 'none';
  });

  // Direct blueprint button inside guide modal
  if (btnViewOptionBlueprint) {
    btnViewOptionBlueprint.onclick = () => {
      const activeOpt = currentParkingOptions.find(o => o.id === selectedOptionId) || currentParkingOptions[0];
      if (activeOpt) {
        modalGuide.style.display = 'none';
        openBasementDetail(activeOpt.mode);
      }
    };
  }

  function calculateAndDrawRoute() {
    const entryGate = selectEntryGate.value;
    const activeOpt = currentParkingOptions.find(o => o.id === selectedOptionId) || currentParkingOptions[0];

    let pathPoints = [];

    // Luồng 1 chiều: Phải sang Trái (Đông sang Tây) qua vành đai Kênh Lăng & Vòng Bắc
    if (entryGate === 'gate-south') {
      pathPoints.push({ x: 825, y: 950 }, { x: 1080, y: 840 }, { x: 1040, y: 550 }, { x: 980, y: 350 }, { x: 860, y: 210 }, { x: 760, y: 190 });
    } else if (entryGate === 'gate-north') {
      pathPoints.push({ x: 815, y: 50 }, { x: 815, y: 190 }, { x: 760, y: 190 });
    } else {
      pathPoints.push({ x: 360, y: 890 }, { x: 825, y: 840 }, { x: 1080, y: 840 }, { x: 1040, y: 550 }, { x: 860, y: 210 }, { x: 760, y: 190 });
    }

    if (activeOpt.mode === 'toai') {
      // Vòng từ Phải sang Trái qua Toà A -> Vào Ram dốc Bắc Toà I -> Xuống hầm Toà I
      pathPoints.push({ x: 680, y: 220 }, { x: 525, y: 390 }, { x: 525, y: 440 }, { x: 525, y: 640 });
    } else {
      // Vòng sang Trái vào Ram dốc Bắc (CB/GV/NV & SV)
      pathPoints.push({ x: 680, y: 220 }, { x: 680, y: 370 });

      if (activeOpt.mode === 'staff') {
        pathPoints.push({ x: 800, y: 360 });
      } else {
        pathPoints.push({ x: 680, y: 480 }, { x: 890, y: 480 }, { x: 890, y: 600 });
      }
    }

    // Build SVG Path Data 'M x y L x y ...'
    let dStr = '';
    pathPoints.forEach((p, idx) => {
      dStr += idx === 0 ? `M ${p.x} ${p.y}` : ` L ${p.x} ${p.y}`;
    });

    guidancePath.setAttribute('d', dStr);

    highlightObject(pathPoints[pathPoints.length - 1].x, pathPoints[pathPoints.length - 1].y, activeOpt.title, `Đã định tuyến 1 chiều (Phải qua Trái) đến ${activeOpt.title}`);

    modalGuide.style.display = 'none';
  }

  btnDrawRoute.addEventListener('click', calculateAndDrawRoute);

  // ==========================================
  // 9. HIGH-RES DETAILED BASEMENT BLUEPRINT ENGINE (ISOLATED MAPS)
  // ==========================================
  const modalBasementDetail = document.getElementById('modal-basement-detail');
  const btnCloseDetail = document.getElementById('btn-close-detail');
  const dtBadge = document.getElementById('dt-badge');
  const dtTitle = document.getElementById('dt-title');
  const dtSubtitle = document.getElementById('dt-subtitle');
  const bpInfoList = document.getElementById('bp-info-list');
  const blueprintSvg = document.getElementById('blueprint-svg');
  const inputSlotSearch = document.getElementById('input-slot-search');
  const btnSearchSlot = document.getElementById('btn-search-slot');
  const searchSlotFeedback = document.getElementById('search-slot-feedback');
  const filterPills = document.querySelectorAll('.filter-pill');

  let currentDetailMode = 'student'; // 'toai', 'student', or 'staff'
  let detailScale = 1;
  let detailPanX = 0;
  let detailPanY = 0;
  let isDetailDragging = false;
  let detailStartX = 0;
  let detailStartY = 0;

  // =========================================================================
  // =========================================================================
  // HELPER: RENDER 45-DEGREE ANGLED / HERRINGBONE MULTI-BIKE PARKING BAY
  // =========================================================================
  function renderAngledBayGraphic(x, y, w, h, bayId, totalSlots, occupiedCount, isOccupied, pillarId, bayTitle, descText) {
    const capA = Math.ceil(totalSlots / 2);
    const capB = Math.floor(totalSlots / 2);
    const occA = Math.round((occupiedCount / totalSlots) * capA);
    const occB = occupiedCount - occA;

    let out = `
      <g class="bp-slot-group" data-slot="${bayId}" data-capacity="${totalSlots}" data-occupied="${occupiedCount}" data-status="${isOccupied ? 'occupied' : 'free'}" data-pillar="${pillarId || ''}" data-desc="${descText || 'LƯU THÔNG 1 CHIỀU: TRÁI ➔ PHẢI • Vạch đỗ xéo 45° • 2 Hàng A & B'}">
        <!-- Main Bay Boundary Box -->
        <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" class="bp-slot-box ${isOccupied ? 'occupied' : 'free'}"/>
        
        <!-- Bay Header Title Bar -->
        <rect x="${x + 3}" y="${y + 2}" width="${w - 6}" height="14" rx="3" fill="#1e293b"/>
        <text x="${x + w / 2}" y="${y + 11}" fill="#f8fafc" font-size="7.5" font-weight="800" text-anchor="middle">${bayTitle} • ${totalSlots} Ô XÉO</text>
    `;

    // Row A: Top Rack (height 15)
    const topY = y + 17;
    const rackH = 15;
    const padX = 7;
    const availW = w - padX * 2;
    const slotWA = (availW - 5) / capA;
    const slantOffset = 4.5; // 45-degree slant

    out += `<!-- Hàng A (Slots xéo 45° xuôi theo hướng Trái ➔ Phải) -->
      <g class="sub-rack-a">`;
    for (let i = 0; i < capA; i++) {
      const isOcc = i < occA;
      const sx = x + padX + i * slotWA;
      const sId = `${bayId}-A${i + 1 < 10 ? '0' + (i + 1) : (i + 1)}`;
      const p1 = `${sx + slantOffset},${topY}`;
      const p2 = `${sx + slotWA + slantOffset},${topY}`;
      const p3 = `${sx + slotWA},${topY + rackH}`;
      const p4 = `${sx},${topY + rackH}`;

      out += `
        <polygon points="${p1} ${p2} ${p3} ${p4}" class="bp-sub-slot ${isOcc ? 'occ' : 'vac'}" data-sub-slot="${sId}" data-parent-slot="${bayId}" data-status="${isOcc ? 'occupied' : 'free'}" data-angle="45°" data-row="Hàng A" data-index="${i + 1}" />
        <line x1="${sx + slantOffset}" y1="${topY}" x2="${sx}" y2="${topY + rackH}" stroke="#38bdf8" stroke-width="0.5" opacity="0.6"/>
      `;
    }
    out += `</g>`;

    // Center Pull-out Corridor (1.4m) - STRICT 1-WAY LEFT TO RIGHT
    const aisleY = y + 33;
    const aisleH = 11;
    out += `
      <!-- Lối dắt giữa 1 chiều (Trái ➔ Phải) -->
      <rect x="${x + 4}" y="${aisleY}" width="${w - 8}" height="${aisleH}" fill="rgba(56, 189, 248, 0.08)"/>
      <line x1="${x + 6}" y1="${aisleY + aisleH / 2}" x2="${x + w - 12}" y2="${aisleY + aisleH / 2}" stroke="#38bdf8" stroke-width="0.9" stroke-dasharray="3,2"/>
      <polygon points="${x + w - 12},${aisleY + 3} ${x + w - 5},${aisleY + aisleH / 2} ${x + w - 12},${aisleY + aisleH - 3}" fill="#38bdf8"/>
      <text x="${x + w / 2 - 4}" y="${aisleY + 8}" fill="#38bdf8" font-size="6.5" font-weight="800" text-anchor="middle">➔ LỐI DẮT 1 CHIỀU (TRÁI ➔ PHẢI) ➔</text>
    `;

    // Row B: Bottom Rack (height 15)
    const botY = y + 45;
    const slotWB = (availW - 5) / capB;
    out += `<!-- Hàng B (Slots xéo 45° ngược xương cá theo luồng Trái ➔ Phải) -->
      <g class="sub-rack-b">`;
    for (let i = 0; i < capB; i++) {
      const isOcc = i < occB;
      const sx = x + padX + i * slotWB;
      const sId = `${bayId}-B${i + 1 < 10 ? '0' + (i + 1) : (i + 1)}`;
      const p1 = `${sx},${botY}`;
      const p2 = `${sx + slotWB},${botY}`;
      const p3 = `${sx + slotWB + slantOffset},${botY + rackH}`;
      const p4 = `${sx + slantOffset},${botY + rackH}`;

      out += `
        <polygon points="${p1} ${p2} ${p3} ${p4}" class="bp-sub-slot ${isOcc ? 'occ' : 'vac'}" data-sub-slot="${sId}" data-parent-slot="${bayId}" data-status="${isOcc ? 'occupied' : 'free'}" data-angle="45°" data-row="Hàng B" data-index="${i + 1}" />
        <line x1="${sx}" y1="${botY}" x2="${sx + slantOffset}" y2="${botY + rackH}" stroke="#38bdf8" stroke-width="0.5" opacity="0.6"/>
      `;
    }
    out += `</g>`;

    // Bottom Progress & Occupancy Metric
    const progY = y + 62;
    const barW = w - 16;
    out += `
      <rect x="${x + 8}" y="${progY}" width="${barW}" height="3.5" rx="1.5" fill="#334155"/>
      <rect x="${x + 8}" y="${progY}" width="${(occupiedCount / totalSlots) * barW}" height="3.5" rx="1.5" fill="${isOccupied ? '#f87171' : '#34d399'}"/>
      <text x="${x + w / 2}" y="${y + h - 5}" fill="#e2e8f0" font-size="7.5" font-weight="800" text-anchor="middle">🛵 ${occupiedCount}/${totalSlots} Xe (Trống: ${totalSlots - occupiedCount})</text>
      </g>
    `;

    return out;
  }

  // =========================================================================
  // 1. BLUEPRINT CHUYÊN BIỆT: HẦM TOÀ I (DÃY ĐỖ XE SỨC CHỨA LỚN & CỘT VẬT CẢN CÂN ĐỐI)
  // =========================================================================
  function renderToaIBlueprint() {
    currentDetailMode = 'toai';
    dtBadge.textContent = 'CHỈ XEM: HẦM TOÀ I';
    dtTitle.textContent = 'Mặt Bằng Chi Tiết Hầm Giữ Xe Toà I (600 Xe Máy)';
    dtSubtitle.textContent = '14 Khoang đỗ xe ô xéo 45° (45 xe/khoang) • Cột vật cản C01..C14 đặt dọc lề an toàn đối xứng • Lối xe vào/ra hoàn toàn thông suốt 1 chiều';

    bpInfoList.innerHTML = `
      <div class="bp-info-row"><span>Quy mô phân khu:</span> <strong style="color:#38bdf8">14 Khoang Đỗ Lớn (45 ô xéo 45°/khoang)</strong></div>
      <div class="bp-info-row"><span>Sức chứa thiết kế:</span> <strong>600 xe máy</strong></div>
      <div class="bp-info-row"><span>Kiểu vạch đỗ:</span> <strong style="color:#34d399">📐 Ô Xéo Nghiêng 45° (Herringbone)</strong></div>
      <div class="bp-info-row"><span>Cột chịu lực chống va:</span> <strong style="color:#f59e0b">⚠️ 14 Cột an toàn đối xứng (C01-C14)</strong></div>
      <div class="bp-info-row"><span>Làn xe phân luồng:</span> <strong>Làn 1 chiều Bắc ➔ Nam (5.0m)</strong></div>
      <div class="bp-info-row"><span>Kết nối thang máy:</span> <strong>🛗 Toà I & Lối PCCC</strong></div>
      <div class="bp-info-row"><span>Lối vào (IN):</span> <strong style="color:#34d399">⬇ Đầu Bắc Toà I (Trên cùng)</strong></div>
      <div class="bp-info-row"><span>Lối ra (OUT):</span> <strong style="color:#f87171">⬇ Đầu Nam Toà I (Dưới cùng)</strong></div>
    `;

    let svgContent = `
      <defs>
        <pattern id="bp-grid-pattern-toai" width="30" height="30" patternUnits="userSpaceOnUse">
          <path d="M 30 0 L 0 0 0 30" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="1"/>
        </pattern>
      </defs>
      <g id="bp-viewport">
        <rect x="0" y="0" width="1400" height="920" fill="#080d1a"/>
        
        <!-- Floor Outline -->
        <rect x="340" y="20" width="720" height="880" rx="18" fill="#0f172a" stroke="#0284c7" stroke-width="3"/>
        <rect x="340" y="20" width="720" height="880" fill="url(#bp-grid-pattern-toai)"/>

        <!-- In Gate (North - Top) -->
        <g transform="translate(480, 35)">
          <rect x="0" y="0" width="440" height="48" rx="8" fill="#064e3b" stroke="#10b981" stroke-width="2.5"/>
          <text x="220" y="24" fill="#ecfdf5" font-size="13" font-weight="800" text-anchor="middle">⬇ CỔNG VÀO (IN) - RAM DỐC BẮC TOÀ I</text>
          <text x="220" y="40" fill="#a7f3d0" font-size="10" text-anchor="middle">Quẹt thẻ tự động Barrier 01 • Sức chứa 600 xe</text>
        </g>

        <!-- Out Gate (South - Bottom) -->
        <g transform="translate(480, 835)">
          <rect x="0" y="0" width="440" height="48" rx="8" fill="#7f1d1d" stroke="#ef4444" stroke-width="2.5"/>
          <text x="220" y="24" fill="#fef2f2" font-size="13" font-weight="800" text-anchor="middle">⬇ CỔNG RA (OUT) - RAM DỐC NAM TOÀ I</text>
          <text x="220" y="40" fill="#fca5a5" font-size="10" text-anchor="middle">Ra cổng phụ Hẻm 566 Nguyễn Thái Sơn</text>
        </g>

        <!-- Main Vertical Driving Lane (Clean 5.0m Aisle) -->
        <rect x="640" y="95" width="120" height="730" fill="rgba(2, 132, 199, 0.04)" stroke="none"/>
        <line x1="700" y1="95" x2="700" y2="825" class="bp-lane-line" stroke-width="3"/>
        <path d="M 700 200 L 700 220" stroke="#38bdf8" stroke-width="4" marker-end="url(#arrow-in)"/>
        <path d="M 700 450 L 700 470" stroke="#38bdf8" stroke-width="4" marker-end="url(#arrow-in)"/>
        <path d="M 700 700 L 700 720" stroke="#38bdf8" stroke-width="4" marker-end="url(#arrow-out)"/>
        <text x="700" y="460" class="bp-lane-text" transform="rotate(90 700 460)" text-anchor="middle">LÀN XE 1 CHIỀU CHẠY THẲNG (BẮC ➔ NAM - 5.0M)</text>
    `;

    // 14 Concrete Structural Pillars (C01 - C14) positioned along safety border with zero interference
    for (let r = 1; r <= 7; r++) {
      const py = 145 + (r - 1) * 100;
      // Left Pillar (Along West lane safety edge)
      svgContent += `
        <g class="bp-pillar-group" transform="translate(620, ${py})" data-pillar="C0${r}">
          <circle cx="0" cy="0" r="14" fill="none" stroke="#f59e0b" stroke-width="1.2" stroke-dasharray="3,2" opacity="0.8"/>
          <rect x="-10" y="-10" width="20" height="20" rx="4" fill="#0f172a" stroke="#f59e0b" stroke-width="2"/>
          <text x="0" y="3.5" class="bp-pillar-label" fill="#fef08a" font-size="8.5" font-weight="900" text-anchor="middle">C0${r}</text>
        </g>
      `;
      // Right Pillar (Along East lane safety edge)
      const rightNum = r + 7 < 10 ? '0' + (r + 7) : r + 7;
      svgContent += `
        <g class="bp-pillar-group" transform="translate(780, ${py})" data-pillar="C${rightNum}">
          <circle cx="0" cy="0" r="14" fill="none" stroke="#f59e0b" stroke-width="1.2" stroke-dasharray="3,2" opacity="0.8"/>
          <rect x="-10" y="-10" width="20" height="20" rx="4" fill="#0f172a" stroke="#f59e0b" stroke-width="2"/>
          <text x="0" y="3.5" class="bp-pillar-label" fill="#fef08a" font-size="8.5" font-weight="900" text-anchor="middle">C${rightNum}</text>
        </g>
      `;
    }

    // Feeder Guidance Lines connecting Center driving lane to each Toà I parking block
    for (let r = 1; r <= 7; r++) {
      const by = 105 + (r - 1) * 100;
      const entranceY = by + 42;

      svgContent += `
        <!-- Vạch gạch dẫn hướng vào Khoang I-Tây 0${r} -->
        <path d="M 680 ${entranceY} L 605 ${entranceY}" class="bp-feeder-line" marker-end="url(#arrow-internal)"/>
        <path d="M 360 ${entranceY} L 345 ${entranceY}" class="bp-feeder-line"/>

        <!-- Vạch gạch dẫn hướng vào Khoang I-Đông 0${r} -->
        <path d="M 720 ${entranceY} L 795 ${entranceY}" class="bp-feeder-line" marker-end="url(#arrow-internal)"/>
        <path d="M 1040 ${entranceY} L 1055 ${entranceY}" class="bp-feeder-line"/>
      `;
    }

    // High-Density Multi-Vehicle Parking Bays with 45-degree Angled Slots
    for (let r = 1; r <= 7; r++) {
      const by = 105 + (r - 1) * 100;
      const leftOccupancy = Math.floor(32 + (r * 2) % 15);
      const rightOccupancy = Math.floor(28 + (r * 3) % 18);
      const isOcc1 = leftOccupancy >= 42;
      const isOcc2 = rightOccupancy >= 42;

      // Left Multi-Bike Bay (holds 45 bikes in 2 back-to-back 45-deg angled racks)
      svgContent += renderAngledBayGraphic(
        360, by, 235, 84,
        `KHOANG-I-TAY-${r}`,
        45, leftOccupancy, isOcc1,
        `C0${r}`,
        `KHOANG I-TÂY 0${r}`,
        `Cạnh Cột C0${r} • 45 Ô xéo 45°: Hàng A (23 ô) & Hàng B (22 ô) • Lối dắt giữa 1.4m`
      );

      // Right Multi-Bike Bay (holds 45 bikes in 2 back-to-back 45-deg angled racks)
      const pRight = r + 7 < 10 ? '0' + (r + 7) : r + 7;
      svgContent += renderAngledBayGraphic(
        805, by, 235, 84,
        `KHOANG-I-DONG-${r}`,
        45, rightOccupancy, isOcc2,
        `C${pRight}`,
        `KHOANG I-ĐÔNG 0${r}`,
        `Cạnh Cột C${pRight} • 45 Ô xéo 45°: Hàng A (23 ô) & Hàng B (22 ô) • Lối dắt giữa 1.4m`
      );
    }

    // Elevator & Emergency Exit for Toa I (Clean standalone cards)
    svgContent += `
      <g transform="translate(200, 390)">
        <rect x="0" y="0" width="120" height="50" rx="8" fill="#d97706" stroke="#fbbf24" stroke-width="2"/>
        <text x="60" y="31" fill="#000" font-size="15" font-weight="800" text-anchor="middle">🛗 TOÀ I</text>
      </g>
      <g transform="translate(200, 470)">
        <rect x="0" y="0" width="120" height="42" rx="6" fill="#b91c1c" stroke="#f87171" stroke-width="1.5"/>
        <text x="60" y="26" fill="#fff" font-size="12" font-weight="800" text-anchor="middle">🚪 THOÁT HIỂM</text>
      </g>
    `;

    svgContent += `</g>`;
    blueprintSvg.innerHTML = svgContent;
    setupBlueprintInteractions();
  }

  // =========================================================================
  // 2. BLUEPRINT CHUYÊN BIỆT: HẦM SINH VIÊN (3,000 XE MÁY - CỘT CÂN ĐỐI & THÔNG THOÁNG)
  // =========================================================================
  function renderStudentBasementBlueprint() {
    currentDetailMode = 'student';
    dtBadge.textContent = 'CHỈ XEM: HẦM SINH VIÊN (3,000 CHỖ)';
    dtTitle.textContent = 'Mặt Bằng Chi Tiết Hầm Xe Máy Sinh Viên (3,000 Xe Máy)';
    dtSubtitle.textContent = '28 Khoang đỗ lớn ô xéo 45° (70-80 xe/khoang) • Lưới 22 Cột an toàn bố trí đối xứng • Làn xe & lối vào khoang hoàn toàn thông suốt';

    bpInfoList.innerHTML = `
      <div class="bp-info-row"><span>Sức chứa sinh viên:</span> <strong style="color:#38bdf8">3,000 xe máy (28 Khoang x 70-80 ô xéo)</strong></div>
      <div class="bp-info-row"><span>Kiểu vạch đỗ:</span> <strong style="color:#34d399">📐 Vạch Xéo Nghiêng 45° (Herringbone)</strong></div>
      <div class="bp-info-row"><span>Quy tắc di chuyển:</span> <strong style="color:#f59e0b">⛔ BẮT BUỘC 1 CHIỀU (TRÁI ➔ PHẢI)</strong></div>
      <div class="bp-info-row"><span>Lưới cột chịu lực:</span> <strong>⚠️ 22 Cột an toàn cân đối (S01 - S22)</strong></div>
      <div class="bp-info-row"><span>Làn xe phân luồng:</span> <strong>Làn chính 5.0m & Lối rẽ vào khoang 3.5m</strong></div>
      <div class="bp-info-row"><span>Sảnh thang máy:</span> <strong>🛗 K, 🛗 BC, 🛗 G, 🛗 F, 🛗 D</strong></div>
      <div class="bp-info-row"><span>Lối vào (IN):</span> <strong style="color:#34d399">⬇ Phía Bắc (Góc Trên-Trái)</strong></div>
      <div class="bp-info-row"><span>Lối ra (OUT):</span> <strong style="color:#f87171">⬆ Phía Nam (Giữa Toà F & D)</strong></div>
    `;

    let svgContent = `
      <defs>
        <pattern id="bp-grid-pattern-student" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="1"/>
        </pattern>
      </defs>
      <g id="bp-viewport">
        <!-- Floor Outline -->
        <rect x="0" y="0" width="1440" height="920" fill="#080d1a"/>
        <rect x="40" y="40" width="1360" height="840" rx="16" fill="#0f172a" stroke="#38bdf8" stroke-width="3"/>
        <rect x="40" y="40" width="1360" height="840" fill="url(#bp-grid-pattern-student)"/>

        <!-- In Gate (North - Top Left) -->
        <g transform="translate(60, 55)">
          <rect x="0" y="0" width="340" height="48" rx="8" fill="#064e3b" stroke="#10b981" stroke-width="2.5"/>
          <text x="170" y="24" fill="#ecfdf5" font-size="13" font-weight="800" text-anchor="middle">⬇ LỐI VÀO (IN) - RAM DỐC BẮC (3,000 XE)</text>
          <text x="170" y="40" fill="#a7f3d0" font-size="10" text-anchor="middle">Đón luồng xe máy từ Cổng Đặng Thùy Trâm</text>
        </g>

        <!-- Out Gate (South - Bottom Right) -->
        <g transform="translate(1040, 820)">
          <rect x="0" y="0" width="340" height="48" rx="8" fill="#7f1d1d" stroke="#ef4444" stroke-width="2.5"/>
          <text x="170" y="24" fill="#fef2f2" font-size="13" font-weight="800" text-anchor="middle">⬆ LỐI LÊN (OUT) - RAM DỐC NAM</text>
          <text x="170" y="40" fill="#fca5a5" font-size="10" text-anchor="middle">Giữa Toà F & D • Ra Cổng Dương Quảng Hàm</text>
        </g>

        <!-- Main Circulation Lanes (STRICT 1-WAY: LEFT TO RIGHT / WEST TO EAST) -->
        <!-- West Ingress Lane (North to South) -->
        <path d="M 160 105 L 160 475" class="bp-lane-line" stroke-width="3.5" marker-end="url(#arrow-in)"/>
        <!-- North Top Branch (Strict 1-Way: Left to Right) -->
        <path d="M 160 105 L 1280 105" class="bp-lane-line" stroke-width="2.5" marker-end="url(#arrow-internal)"/>
        <!-- Central Main Artery (STRICT 1-WAY: LEFT TO RIGHT) -->
        <path d="M 160 475 L 1280 475" class="bp-lane-line" stroke-width="4" marker-end="url(#arrow-internal)"/>
        <!-- South Bottom Branch (Strict 1-Way: Left to Right) -->
        <path d="M 160 475 L 160 780 L 1280 780" class="bp-lane-line" stroke-width="3" marker-end="url(#arrow-internal)"/>
        <!-- East Egress Lane (North to South OUT) -->
        <path d="M 1280 105 L 1280 820" class="bp-lane-line" stroke-width="3.5" marker-end="url(#arrow-out)"/>

        <!-- Secondary Internal Driving Aisles between Rows -->
        <path d="M 160 227 L 670 227" class="bp-aisle-line"/>
        <path d="M 770 227 L 1280 227" class="bp-aisle-line"/>
        <path d="M 160 332 L 670 332" class="bp-aisle-line"/>
        <path d="M 770 332 L 1280 332" class="bp-aisle-line"/>
        <path d="M 160 617 L 670 617" class="bp-aisle-line"/>
        <path d="M 770 617 L 1280 617" class="bp-aisle-line"/>

        <text x="160" y="280" class="bp-lane-text" transform="rotate(90 160 280)">⬇ LÀN VÀO HẦM (1 CHIỀU) ➔</text>
        <text x="720" y="465" class="bp-lane-text" text-anchor="middle">➔ LÀN TRUNG TÂM 1 CHIỀU: TRÁI ➔ PHẢI (5.0M) ➔</text>
        <text x="720" y="98" class="bp-lane-text" text-anchor="middle" font-size="10.5">➔ LÀN PHÂN KHU BẮC (1 CHIỀU: TRÁI ➔ PHẢI) ➔</text>
        <text x="720" y="772" class="bp-lane-text" text-anchor="middle" font-size="10.5">➔ LÀN PHÂN KHU NAM (1 CHIỀU: TRÁI ➔ PHẢI) ➔</text>
        <text x="1280" y="650" class="bp-lane-text" transform="rotate(90 1280 650)">➔ LÀN DẪN RA RAM DỐC LÊN (OUT) ➔</text>

        <!-- Central Pedestrian Spine & Safety Aisle -->
        <rect x="670" y="125" width="100" height="600" fill="rgba(56, 189, 248, 0.03)" stroke="rgba(56, 189, 248, 0.15)" stroke-dasharray="4,4" rx="8"/>
        <text x="720" y="145" fill="#38bdf8" font-size="10" font-weight="800" text-anchor="middle">LỐI ĐI BỘ TRUNG TÂM</text>
    `;

    // 22 Structural Obstacle Pillars (S01 - S22) positioned with mathematical symmetry in dedicated safety buffers
    const studentPillars = [
      // Row 1 (Upper Gap - Y: 227)
      { id: 'S01', x: 205, y: 227 },
      { id: 'S02', x: 375, y: 227 },
      { id: 'S03', x: 521, y: 227 },
      { id: 'S04', x: 919, y: 227 },
      { id: 'S05', x: 1065, y: 227 },
      { id: 'S06', x: 1235, y: 227 },

      // Row 2 (Middle North Gap - Y: 332)
      { id: 'S07', x: 205, y: 332 },
      { id: 'S08', x: 375, y: 332 },
      { id: 'S09', x: 521, y: 332 },
      { id: 'S10', x: 919, y: 332 },
      { id: 'S11', x: 1065, y: 332 },
      { id: 'S12', x: 1235, y: 332 },

      // Row 3 (South Upper Gap - Y: 617)
      { id: 'S13', x: 205, y: 617 },
      { id: 'S14', x: 375, y: 617 },
      { id: 'S15', x: 521, y: 617 },
      { id: 'S16', x: 919, y: 617 },
      { id: 'S17', x: 1065, y: 617 },
      { id: 'S18', x: 1235, y: 617 },

      // Row 4 (South Bottom Axis - Y: 725)
      { id: 'S19', x: 375, y: 725 },
      { id: 'S20', x: 521, y: 725 },
      { id: 'S21', x: 919, y: 725 },
      { id: 'S22', x: 1065, y: 725 }
    ];

    studentPillars.forEach(p => {
      svgContent += `
        <g class="bp-pillar-group" transform="translate(${p.x}, ${p.y})" data-pillar="${p.id}">
          <circle cx="0" cy="0" r="13" fill="none" stroke="#f59e0b" stroke-width="1.2" stroke-dasharray="3,2" opacity="0.8"/>
          <rect x="-9" y="-9" width="18" height="18" rx="3.5" fill="#0f172a" stroke="#f59e0b" stroke-width="1.8"/>
          <text x="0" y="3.2" class="bp-pillar-label" fill="#fef08a" font-size="8" font-weight="900" text-anchor="middle">${p.id}</text>
        </g>
      `;
    });

    // 28 High-Capacity Motorcycle Parking Blocks with 45-degree Angled Slots
    const blocksData = [
      // Upper Area: Row 1 (Y: 135)
      { id: 'K-01', name: 'KHOANG K-01', cap: 80, occ: 72, x: 240, y: 135, pillar: 'S01' },
      { id: 'K-02', name: 'KHOANG K-02', cap: 80, occ: 68, x: 386, y: 135, pillar: 'S02' },
      { id: 'K-03', name: 'KHOANG K-03', cap: 80, occ: 75, x: 532, y: 135, pillar: 'S03' },
      { id: 'BC-01', name: 'KHOANG BC-01', cap: 80, occ: 62, x: 784, y: 135, pillar: 'S04' },
      { id: 'BC-02', name: 'KHOANG BC-02', cap: 80, occ: 70, x: 930, y: 135, pillar: 'S05' },
      { id: 'BC-03', name: 'KHOANG BC-03', cap: 80, occ: 78, x: 1076, y: 135, pillar: 'S06' },

      // Upper Area: Row 2 (Y: 240)
      { id: 'K-04', name: 'KHOANG K-04', cap: 80, occ: 66, x: 240, y: 240, pillar: 'S07' },
      { id: 'K-05', name: 'KHOANG K-05', cap: 80, occ: 71, x: 386, y: 240, pillar: 'S08' },
      { id: 'K-06', name: 'KHOANG K-06', cap: 80, occ: 60, x: 532, y: 240, pillar: 'S09' },
      { id: 'BC-04', name: 'KHOANG BC-04', cap: 80, occ: 67, x: 784, y: 240, pillar: 'S10' },
      { id: 'BC-05', name: 'KHOANG BC-05', cap: 80, occ: 73, x: 930, y: 240, pillar: 'S11' },
      { id: 'BC-06', name: 'KHOANG BC-06', cap: 80, occ: 79, x: 1076, y: 240, pillar: 'S12' },

      // Upper Area: Row 3 (Y: 345)
      { id: 'TT-01', name: 'KHOANG TT-01', cap: 70, occ: 58, x: 240, y: 345, pillar: 'S07' },
      { id: 'TT-02', name: 'KHOANG TT-02', cap: 70, occ: 62, x: 386, y: 345, pillar: 'S08' },
      { id: 'TT-03', name: 'KHOANG TT-03', cap: 70, occ: 65, x: 532, y: 345, pillar: 'S09' },
      { id: 'TT-04', name: 'KHOANG TT-04', cap: 70, occ: 55, x: 784, y: 345, pillar: 'S10' },
      { id: 'TT-05', name: 'KHOANG TT-05', cap: 70, occ: 64, x: 930, y: 345, pillar: 'S11' },
      { id: 'TT-06', name: 'KHOANG TT-06', cap: 70, occ: 61, x: 1076, y: 345, pillar: 'S12' },

      // Lower Area: Row 4 (Y: 525)
      { id: 'G-01', name: 'KHOANG G-01', cap: 75, occ: 65, x: 240, y: 525, pillar: 'S13' },
      { id: 'G-02', name: 'KHOANG G-02', cap: 75, occ: 70, x: 386, y: 525, pillar: 'S14' },
      { id: 'G-03', name: 'KHOANG G-03', cap: 75, occ: 69, x: 532, y: 525, pillar: 'S15' },
      { id: 'F-01', name: 'KHOANG F-01', cap: 75, occ: 58, x: 784, y: 525, pillar: 'S16' },
      { id: 'F-02', name: 'KHOANG F-02', cap: 75, occ: 64, x: 930, y: 525, pillar: 'S17' },
      { id: 'D-01', name: 'KHOANG D-01', cap: 75, occ: 72, x: 1076, y: 525, pillar: 'S18' },

      // Lower Area: Row 5 (Y: 630)
      { id: 'G-04', name: 'KHOANG G-04', cap: 75, occ: 68, x: 240, y: 630 },
      { id: 'G-05', name: 'KHOANG G-05', cap: 75, occ: 74, x: 386, y: 630 },
      { id: 'G-06', name: 'KHOANG G-06', cap: 75, occ: 61, x: 532, y: 630 },
      { id: 'F-03', name: 'KHOANG F-03', cap: 75, occ: 66, x: 784, y: 630 },
      { id: 'D-02', name: 'KHOANG D-02', cap: 75, occ: 73, x: 930, y: 630 },
      { id: 'D-03', name: 'KHOANG D-03', cap: 75, occ: 71, x: 1076, y: 630 }
    ];

    // Render Feeder Guidance Lines directly connecting aisles into each individual bay
    blocksData.forEach(blk => {
      const entranceY = blk.y + 38.5;
      let feedStartY = 105;

      if (blk.y === 135) feedStartY = 105;
      else if (blk.y === 240) feedStartY = 227;
      else if (blk.y === 345) feedStartY = 332;
      else if (blk.y === 525) feedStartY = 475;
      else if (blk.y === 630) feedStartY = 617;

      svgContent += `
        <!-- Vạch gạch dẫn đường vào ${blk.name} -->
        <path d="M ${blk.x - 22} ${feedStartY} L ${blk.x - 10} ${feedStartY} C ${blk.x - 3} ${feedStartY}, ${blk.x - 5} ${entranceY}, ${blk.x} ${entranceY}" class="bp-feeder-line" marker-end="url(#arrow-internal)"/>
        <!-- Vạch gạch lối ra từ ${blk.name} -->
        <path d="M ${blk.x + 124} ${entranceY} L ${blk.x + 135} ${entranceY}" class="bp-feeder-line"/>
      `;
    });

    blocksData.forEach(blk => {
      const isOcc = blk.occ >= blk.cap * 0.9;
      svgContent += renderAngledBayGraphic(
        blk.x, blk.y, 124, 82,
        blk.id,
        blk.cap, blk.occ, isOcc,
        blk.pillar,
        blk.name,
        `Cạnh Cột ${blk.pillar || 'S'} • ${blk.cap} Ô xéo 45°: Dãy A & Dãy B • Lối dắt giữa 1.4m`
      );
    });

    // 5 Clean Elevator Cores placed in dedicated Central Promenade & Lobby spots (NO OVERLAPS!)
    const studentLifts = [
      { name: '🛗 TOÀ K', x: 720, y: 200 },
      { name: '🛗 TOÀ B-C', x: 720, y: 310 },
      { name: '🛗 TOÀ G', x: 720, y: 555 },
      { name: '🛗 TOÀ F', x: 720, y: 660 },
      { name: '🛗 TOÀ D', x: 1138, y: 735 }
    ];

    studentLifts.forEach(lift => {
      svgContent += `
        <g transform="translate(${lift.x}, ${lift.y})">
          <rect x="-46" y="-16" width="92" height="32" rx="6" fill="#d97706" stroke="#fbbf24" stroke-width="2"/>
          <text x="0" y="4" fill="#000" font-size="11.5" font-weight="800" text-anchor="middle">${lift.name}</text>
        </g>
      `;
    });

    svgContent += `</g>`;
    blueprintSvg.innerHTML = svgContent;
    setupBlueprintInteractions();
  }

  // =========================================================================
  // 3. BLUEPRINT CHUYÊN BIỆT: CHỈ DUY NHẤT HẦM CB/GV/NV & Ô TÔ (TOÀ A)
  // =========================================================================
  function renderStaffBasementBlueprint() {
    currentDetailMode = 'staff';
    dtBadge.textContent = 'CHỈ XEM: HẦM CB/GV/NV & Ô TÔ (1,500 CHỖ)';
    dtTitle.textContent = 'Mặt Bằng Chi Tiết Hầm CB / GV / NV & Ô Tô (Toà A)';
    dtSubtitle.textContent = '24 Vị trí Ô tô thông minh + 12 Khoang Xe máy Cán bộ ô xéo 45° (50 xe/khoang) • Lưới 9 Cột chịu lực bố trí cân đối • Làn xe thông suốt 1 chiều';

    bpInfoList.innerHTML = `
      <div class="bp-info-row"><span>Khu vực hầm:</span> <strong style="color:#38bdf8">Hầm CB/GV/NV & Ô Tô (Dưới Toà A & J)</strong></div>
      <div class="bp-info-row"><span>Sức chứa thiết kế:</span> <strong>1,500 chỗ (24 Ô tô + 12 Khoang Xe máy Cán bộ)</strong></div>
      <div class="bp-info-row"><span>Kiểu vạch đỗ:</span> <strong style="color:#34d399">📐 Vạch Xéo Nghiêng 45° (Herringbone)</strong></div>
      <div class="bp-info-row"><span>Cột chịu lực chống va:</span> <strong style="color:#f59e0b">⚠️ 9 Cột an toàn đối xứng (A01 - A09)</strong></div>
      <div class="bp-info-row"><span>Làn xe phân luồng:</span> <strong>Làn ô tô 6.0m & Làn xe máy 4.0m</strong></div>
      <div class="bp-info-row"><span>Kết nối thang máy:</span> <strong>🛗 Toà A & 🛗 Toà J</strong></div>
      <div class="bp-info-row"><span>Lối vào (IN):</span> <strong style="color:#34d399">⬇ Ram dốc Bắc (Toà A-J)</strong></div>
      <div class="bp-info-row"><span>Lối ra (OUT):</span> <strong style="color:#f87171">⬆ Ram dốc Nam ra Cổng chính</strong></div>
    `;

    let svgContent = `
      <defs>
        <pattern id="bp-grid-pattern-staff" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="1"/>
        </pattern>
      </defs>
      <g id="bp-viewport">
        <!-- Floor Outline for Toa A Staff/Car Basement ONLY -->
        <rect x="0" y="0" width="1440" height="920" fill="#080d1a"/>
        <rect x="30" y="25" width="1380" height="870" rx="16" fill="#0f172a" stroke="#2563eb" stroke-width="3"/>
        <rect x="30" y="25" width="1380" height="870" fill="url(#bp-grid-pattern-staff)"/>

        <!-- In Gate for Staff Basement -->
        <g transform="translate(80, 40)">
          <rect x="0" y="0" width="340" height="46" rx="8" fill="#064e3b" stroke="#10b981" stroke-width="2.5"/>
          <text x="170" y="23" fill="#ecfdf5" font-size="12.5" font-weight="800" text-anchor="middle">⬇ LỐI VÀO (IN) - RAM DỐC BẮC (TOÀ A-J)</text>
          <text x="170" y="38" fill="#a7f3d0" font-size="9.5" text-anchor="middle">Dành cho Cán bộ, Giảng viên & Ô tô • Barrier Thông Minh</text>
        </g>

        <!-- Out Gate for Staff Basement -->
        <g transform="translate(1020, 830)">
          <rect x="0" y="0" width="340" height="46" rx="8" fill="#7f1d1d" stroke="#ef4444" stroke-width="2.5"/>
          <text x="170" y="23" fill="#fef2f2" font-size="12.5" font-weight="800" text-anchor="middle">⬆ LỐI RA (OUT) - RAM DỐC NAM</text>
          <text x="170" y="38" fill="#fca5a5" font-size="9.5" text-anchor="middle">Ra cổng chính Đặng Thùy Trâm / Kênh Lăng</text>
        </g>

        <!-- Traffic Lanes for Staff & Car (Strict 1-Way: Left to Right across all rows) -->
        <!-- West Ingress Lane (North to South) -->
        <path d="M 160 86 L 160 740" class="bp-lane-line" stroke="#2563eb" stroke-width="3.5" marker-end="url(#arrow-in)"/>
        
        <!-- Central Main Artery (6.0m) at Y=340 -->
        <path d="M 160 340 L 1220 340" class="bp-lane-line" stroke="#2563eb" stroke-width="3.5" marker-end="url(#arrow-internal)"/>
        <text x="690" y="330" class="bp-lane-text" fill="#60a5fa" text-anchor="middle" font-size="10.5">➔ LÀN TRUNG TÂM Ô TÔ & XE MÁY (1 CHIỀU: TRÁI ➔ PHẢI - 6.0M) ➔</text>

        <!-- Continuous Horizontal Lane 1: Between Row 1 & Row 2 (Y=475) -->
        <path d="M 160 475 L 1220 475" class="bp-lane-line" stroke="#2563eb" stroke-width="2.5" marker-end="url(#arrow-internal)"/>
        <text x="690" y="470" class="bp-lane-text" fill="#60a5fa" text-anchor="middle" font-size="9.5">➔ LÀN NỘI BỘ PHÂN KHU CB-01 (1 CHIỀU: TRÁI ➔ PHẢI) ➔</text>

        <!-- Continuous Horizontal Lane 2: Between Row 2 & Row 3 (Y=605) -->
        <path d="M 160 605 L 1220 605" class="bp-lane-line" stroke="#2563eb" stroke-width="2.5" marker-end="url(#arrow-internal)"/>
        <text x="690" y="600" class="bp-lane-text" fill="#60a5fa" text-anchor="middle" font-size="9.5">➔ LÀN NỘI BỘ PHÂN KHU CB-02 (1 CHIỀU: TRÁI ➔ PHẢI) ➔</text>

        <!-- Bottom South Exit Aisle (Y=740) -->
        <path d="M 160 740 L 1220 740" class="bp-lane-line" stroke="#2563eb" stroke-width="2.5" marker-end="url(#arrow-internal)"/>

        <!-- East Egress Lane (Leading down to South Out Ramp) -->
        <path d="M 1220 340 L 1220 830" class="bp-lane-line" stroke="#2563eb" stroke-width="3.5" marker-end="url(#arrow-out)"/>
        <text x="160" y="210" class="bp-lane-text" fill="#60a5fa" transform="rotate(90 160 210)" font-size="10">⬇ LÀN XE VÀO HẦM (1 CHIỀU) ➔</text>
        <text x="1220" y="560" class="bp-lane-text" fill="#60a5fa" transform="rotate(90 1220 560)" font-size="10">➔ LÀN DẪN RA RAM DỐC LÊN (OUT) ➔</text>
    `;

    // 9 Symmetrical Pillars (A01 - A09) positioned along safety edges (ZERO OVERLAPS)
    const staffPillars = [
      { id: 'A01', x: 160, y: 110 }, { id: 'A02', x: 690, y: 110 }, { id: 'A03', x: 1220, y: 110 },
      { id: 'A04', x: 160, y: 340 }, { id: 'A05', x: 690, y: 340 }, { id: 'A06', x: 1220, y: 340 },
      { id: 'A07', x: 160, y: 605 }, { id: 'A08', x: 690, y: 605 }, { id: 'A09', x: 1220, y: 605 }
    ];

    staffPillars.forEach(p => {
      svgContent += `
        <g class="bp-pillar-group" transform="translate(${p.x}, ${p.y})" data-pillar="${p.id}">
          <circle cx="0" cy="0" r="13" fill="none" stroke="#f59e0b" stroke-width="1.2" stroke-dasharray="3,2" opacity="0.8"/>
          <rect x="-9" y="-9" width="18" height="18" rx="3.5" fill="#0f172a" stroke="#f59e0b" stroke-width="1.8"/>
          <text x="0" y="3.2" class="bp-pillar-label" fill="#fef08a" font-size="8" font-weight="900" text-anchor="middle">${p.id}</text>
        </g>
      `;
    });

    // 24 Car Stalls arranged in 2 symmetrical wings (West Wing & East Wing)
    for (let c = 0; c < 6; c++) {
      const num1 = c + 1 < 10 ? '0' + (c + 1) : c + 1;
      const num2 = c + 7 < 10 ? '0' + (c + 7) : c + 7;
      const xWest = 205 + c * 75;
      const xEast = 735 + c * 75;

      // Row 1 West (Y=105, H=90)
      const isOcc1 = c % 3 === 0;
      svgContent += `
        <g class="bp-slot-group" data-slot="OTO-${num1}" data-type="car" data-capacity="1" data-occupied="${isOcc1 ? 1 : 0}" data-status="${isOcc1 ? 'occupied' : 'free'}" data-desc="Vị trí đỗ Ô tô OTO-${num1} • Có cảm biến LED báo trống • Sát Cột A01/A02">
          <rect x="${xWest}" y="105" width="64" height="90" rx="6" class="bp-slot-box ${isOcc1 ? 'occupied' : 'free'}"/>
          <rect x="${xWest + 4}" y="109" width="56" height="15" rx="3" fill="#1e293b"/>
          <text x="${xWest + 32}" y="120" fill="#38bdf8" font-size="8.5" font-weight="800" text-anchor="middle">OTO-${num1}</text>
          <text x="${xWest + 32}" y="155" font-size="20" text-anchor="middle">${isOcc1 ? '🚗' : '🅿️'}</text>
          <circle cx="${xWest + 32}" cy="173" r="3.5" fill="${isOcc1 ? '#ef4444' : '#22c55e'}"/>
          <rect x="${xWest + 6}" y="186" width="52" height="5" rx="2" fill="${isOcc1 ? '#f87171' : '#34d399'}"/>
        </g>
      `;

      // Row 1 East (Y=105, H=90)
      const isOcc2 = c % 4 === 0;
      svgContent += `
        <g class="bp-slot-group" data-slot="OTO-${num2}" data-type="car" data-capacity="1" data-occupied="${isOcc2 ? 1 : 0}" data-status="${isOcc2 ? 'occupied' : 'free'}" data-desc="Vị trí đỗ Ô tô OTO-${num2} • Có cảm biến LED báo trống • Sát Cột A02/A03">
          <rect x="${xEast}" y="105" width="64" height="90" rx="6" class="bp-slot-box ${isOcc2 ? 'occupied' : 'free'}"/>
          <rect x="${xEast + 4}" y="109" width="56" height="15" rx="3" fill="#1e293b"/>
          <text x="${xEast + 32}" y="120" fill="#38bdf8" font-size="8.5" font-weight="800" text-anchor="middle">OTO-${num2}</text>
          <text x="${xEast + 32}" y="155" font-size="20" text-anchor="middle">${isOcc2 ? '🚙' : '🅿️'}</text>
          <circle cx="${xEast + 32}" cy="173" r="3.5" fill="${isOcc2 ? '#ef4444' : '#22c55e'}"/>
          <rect x="${xEast + 6}" y="186" width="52" height="5" rx="2" fill="${isOcc2 ? '#f87171' : '#34d399'}"/>
        </g>
      `;

      // Row 2 West (Y=210, H=90)
      const num3 = c + 13;
      const isOcc3 = (c + 1) % 3 === 0;
      svgContent += `
        <g class="bp-slot-group" data-slot="OTO-${num3}" data-type="car" data-capacity="1" data-occupied="${isOcc3 ? 1 : 0}" data-status="${isOcc3 ? 'occupied' : 'free'}" data-desc="Vị trí đỗ Ô tô OTO-${num3} • Lối vào làn trung tâm 6.0m • Sát Cột A04/A05">
          <rect x="${xWest}" y="210" width="64" height="90" rx="6" class="bp-slot-box ${isOcc3 ? 'occupied' : 'free'}"/>
          <rect x="${xWest + 4}" y="214" width="56" height="15" rx="3" fill="#1e293b"/>
          <text x="${xWest + 32}" y="225" fill="#38bdf8" font-size="8.5" font-weight="800" text-anchor="middle">OTO-${num3}</text>
          <text x="${xWest + 32}" y="260" font-size="20" text-anchor="middle">${isOcc3 ? '🚗' : '🅿️'}</text>
          <circle cx="${xWest + 32}" cy="278" r="3.5" fill="${isOcc3 ? '#ef4444' : '#22c55e'}"/>
          <rect x="${xWest + 6}" y="291" width="52" height="5" rx="2" fill="${isOcc3 ? '#f87171' : '#34d399'}"/>
        </g>
      `;

      // Row 2 East (Y=210, H=90)
      const num4 = c + 19;
      const isOcc4 = (c + 2) % 3 === 0;
      svgContent += `
        <g class="bp-slot-group" data-slot="OTO-${num4}" data-type="car" data-capacity="1" data-occupied="${isOcc4 ? 1 : 0}" data-status="${isOcc4 ? 'occupied' : 'free'}" data-desc="Vị trí đỗ Ô tô OTO-${num4} • Lối vào làn trung tâm 6.0m • Sát Cột A05/A06">
          <rect x="${xEast}" y="210" width="64" height="90" rx="6" class="bp-slot-box ${isOcc4 ? 'occupied' : 'free'}"/>
          <rect x="${xEast + 4}" y="214" width="56" height="15" rx="3" fill="#1e293b"/>
          <text x="${xEast + 32}" y="225" fill="#38bdf8" font-size="8.5" font-weight="800" text-anchor="middle">OTO-${num4}</text>
          <text x="${xEast + 32}" y="260" font-size="20" text-anchor="middle">${isOcc4 ? '🚙' : '🅿️'}</text>
          <circle cx="${xEast + 32}" cy="278" r="3.5" fill="${isOcc4 ? '#ef4444' : '#22c55e'}"/>
          <rect x="${xEast + 6}" y="291" width="52" height="5" rx="2" fill="${isOcc4 ? '#f87171' : '#34d399'}"/>
        </g>
      `;

      // Clean Feeder Lines into Car Stalls from Center Lane Y=340
      svgContent += `
        <path d="M ${xWest + 32} 340 L ${xWest + 32} 305" class="bp-feeder-line"/>
        <path d="M ${xEast + 32} 340 L ${xEast + 32} 305" class="bp-feeder-line"/>
      `;
    }

    // 12 High-Capacity Angled Motorcycle Bays for Staff (Lower Area: Row 1 Y = 375, Row 2 Y = 505, Row 3 Y = 635)
    // 6 Bays in Row 1 (KH-CB 01-01 to 01-06)
    for (let i = 0; i < 3; i++) {
      const xWest = 195 + i * 160;
      const xEast = 720 + i * 160;
      const occ1 = 36 + i * 4;
      const occ2 = 40 + i * 2;
      const isOccW1 = occ1 >= 46;
      const isOccE1 = occ2 >= 46;

      // West Bay Row 1
      svgContent += renderAngledBayGraphic(
        xWest, 375, 145, 72,
        `KH-CB-01-0${i+1}`,
        50, occ1, isOccW1,
        `A0${i+4}`,
        `KH-CB 01-0${i+1}`,
        `Khu Cán bộ • Cạnh Cột A0${i+4} • 50 Ô xéo 45° • Lối dắt 1.4m`
      );

      // East Bay Row 1
      svgContent += renderAngledBayGraphic(
        xEast, 375, 145, 72,
        `KH-CB-01-0${i+4}`,
        50, occ2, isOccE1,
        `A0${i+5}`,
        `KH-CB 01-0${i+4}`,
        `Khu Cán bộ • Cạnh Cột A0${i+5} • 50 Ô xéo 45° • Lối dắt 1.4m`
      );
    }

    // 6 Bays in Row 2 (KH-CB 02-01 to 02-06)
    for (let i = 0; i < 3; i++) {
      const xWest = 195 + i * 160;
      const xEast = 720 + i * 160;
      const occ1 = 38 + i * 3;
      const occ2 = 42 + i * 2;
      const isOccW2 = occ1 >= 46;
      const isOccE2 = occ2 >= 46;

      // West Bay Row 2
      svgContent += renderAngledBayGraphic(
        xWest, 505, 145, 72,
        `KH-CB-02-0${i+1}`,
        50, occ1, isOccW2,
        `A0${i+7}`,
        `KH-CB 02-0${i+1}`,
        `Khu Cán bộ • Cạnh Cột A0${i+7} • 50 Ô xéo 45° • Lối dắt 1.4m`
      );

      // East Bay Row 2
      svgContent += renderAngledBayGraphic(
        xEast, 505, 145, 72,
        `KH-CB-02-0${i+4}`,
        50, occ2, isOccE2,
        `A0${i+8}`,
        `KH-CB 02-0${i+4}`,
        `Khu Cán bộ • Cạnh Cột A0${i+8} • 50 Ô xéo 45° • Lối dắt 1.4m`
      );
    }

    // 6 Additional Staff Bays in Row 3 (KH-CB 03-01 to 03-06) for Full 1,500 Bike Capacity
    for (let i = 0; i < 3; i++) {
      const xWest = 195 + i * 160;
      const xEast = 720 + i * 160;
      const occ1 = 32 + i * 5;
      const occ2 = 35 + i * 3;
      const isOccW3 = occ1 >= 46;
      const isOccE3 = occ2 >= 46;

      // West Bay Row 3
      svgContent += renderAngledBayGraphic(
        xWest, 635, 145, 72,
        `KH-CB-03-0${i+1}`,
        50, occ1, isOccW3,
        `A07`,
        `KH-CB 03-0${i+1}`,
        `Khu Cán bộ VIP • Cạnh Cột A07 • 50 Ô xéo 45° • Lối dắt 1.4m`
      );

      // East Bay Row 3
      svgContent += renderAngledBayGraphic(
        xEast, 635, 145, 72,
        `KH-CB-03-0${i+4}`,
        50, occ2, isOccE3,
        `A09`,
        `KH-CB 03-0${i+4}`,
        `Khu Cán bộ VIP • Cạnh Cột A09 • 50 Ô xéo 45° • Lối dắt 1.4m`
      );
    }

    // Elevator Lobbies for Toa A and Toa J (Clean standalone cards with clear margins)
    svgContent += `
      <g transform="translate(45, 340)">
        <rect x="0" y="0" width="100" height="46" rx="8" fill="#d97706" stroke="#fbbf24" stroke-width="2"/>
        <text x="50" y="28" fill="#000" font-size="13" font-weight="800" text-anchor="middle">🛗 TOÀ A</text>
      </g>
      <g transform="translate(1255, 340)">
        <rect x="0" y="0" width="100" height="46" rx="8" fill="#d97706" stroke="#fbbf24" stroke-width="2"/>
        <text x="50" y="28" fill="#000" font-size="13" font-weight="800" text-anchor="middle">🛗 TOÀ J</text>
      </g>
      <g transform="translate(45, 410)">
        <rect x="0" y="0" width="100" height="38" rx="6" fill="#b91c1c" stroke="#f87171" stroke-width="1.5"/>
        <text x="50" y="24" fill="#fff" font-size="11" font-weight="800" text-anchor="middle">🚪 THOÁT HIỂM</text>
      </g>
    `;

    svgContent += `</g>`;
    blueprintSvg.innerHTML = svgContent;
    setupBlueprintInteractions();
  }

  function setupBlueprintInteractions() {
    const bpViewport = document.getElementById('bp-viewport');
    detailScale = 1;
    detailPanX = 0;
    detailPanY = 0;

    function updateBpTransform() {
      if (bpViewport) {
        bpViewport.setAttribute('transform', `translate(${detailPanX}, ${detailPanY}) scale(${detailScale})`);
      }
    }

    document.getElementById('btn-dt-zoom-in').onclick = () => {
      detailScale = Math.min(detailScale * 1.25, 3);
      updateBpTransform();
    };

    document.getElementById('btn-dt-zoom-out').onclick = () => {
      detailScale = Math.max(detailScale / 1.25, 0.7);
      updateBpTransform();
    };

    document.getElementById('btn-dt-zoom-reset').onclick = () => {
      detailScale = 1;
      detailPanX = 0;
      detailPanY = 0;
      updateBpTransform();
      document.querySelectorAll('.bp-slot-box').forEach(s => s.classList.remove('highlighted'));
      searchSlotFeedback.textContent = '';
    };

    // Drag / pan in detail view
    const canvasViewport = document.getElementById('detail-canvas-viewport');
    canvasViewport.onmousedown = (e) => {
      isDetailDragging = true;
      detailStartX = e.clientX - detailPanX;
      detailStartY = e.clientY - detailPanY;
    };

    window.addEventListener('mousemove', (e) => {
      if (!isDetailDragging) return;
      detailPanX = e.clientX - detailStartX;
      detailPanY = e.clientY - detailStartY;
      updateBpTransform();
    });

    window.addEventListener('mouseup', () => {
      isDetailDragging = false;
    });

    // Parent Bay click event
    document.querySelectorAll('.bp-slot-group').forEach(slot => {
      slot.onclick = () => {
        const slotId = slot.dataset.slot;
        const cap = slot.dataset.capacity || '1';
        const occ = slot.dataset.occupied || '1';
        const status = slot.dataset.status;
        const pillar = slot.dataset.pillar;
        const desc = slot.dataset.desc;
        const statusText = status === 'free' ? '✅ Còn chỗ' : '⛔ Gần đầy';
        
        let pillarInfo = pillar ? ` • Cạnh Cột ${pillar}` : '';
        let descInfo = desc ? `<br><small style="color:#38bdf8">💡 ${desc}</small>` : '';
        searchSlotFeedback.innerHTML = `<strong>${slotId}</strong>: ${occ}/${cap} xe (${statusText}${pillarInfo})${descInfo}`;
        document.querySelectorAll('.bp-slot-box').forEach(s => s.classList.remove('highlighted'));
        document.querySelectorAll('.bp-sub-slot').forEach(s => s.classList.remove('highlighted-sub'));
        slot.querySelector('.bp-slot-box')?.classList.add('highlighted');
      };
    });

    // Individual 45-degree Angled Sub-Slot Click Event
    document.querySelectorAll('.bp-sub-slot').forEach(subSlot => {
      subSlot.onclick = (e) => {
        e.stopPropagation();
        const subId = subSlot.dataset.subSlot;
        const parentId = subSlot.dataset.parentSlot;
        const status = subSlot.dataset.status;
        const row = subSlot.dataset.row || 'Dãy A';
        const angle = subSlot.dataset.angle || '45°';
        const isFree = status === 'free';

        document.querySelectorAll('.bp-sub-slot').forEach(s => s.classList.remove('highlighted-sub'));
        subSlot.classList.add('highlighted-sub');

        document.querySelectorAll('.bp-slot-box').forEach(s => s.classList.remove('highlighted'));
        subSlot.closest('.bp-slot-group')?.querySelector('.bp-slot-box')?.classList.add('highlighted');

        searchSlotFeedback.innerHTML = `📍 <strong style="color:#fef08a">VỊ TRÍ Ô: ${subId}</strong> (${row})<br><span style="color:#34d399">📐 Góc đỗ: Xéo ${angle} (Dễ tấp xe & Lùi ra Lối dắt 1.4m)</span> • Trạng thái: ${isFree ? '<strong style="color:#34d399">✅ Còn trống</strong>' : '<strong style="color:#f87171">⛔ Đã có xe</strong>'}`;
      };
    });

    // Pillar click event (Explains concrete obstacle safety function)
    document.querySelectorAll('.bp-pillar-group').forEach(pGroup => {
      pGroup.onclick = () => {
        const pId = pGroup.dataset.pillar || 'Cột kết cấu';
        searchSlotFeedback.innerHTML = `⚠️ <strong style="color:#f59e0b">CỘT VẬT CẢN ${pId}</strong>: Cột bê tông chịu lực hầm • Có đệm cao su & vạch phản quang chống va đập`;
      };
    });
  }

  // Filter slots
  filterPills.forEach(pill => {
    pill.onclick = () => {
      filterPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      const filter = pill.dataset.filter;

      document.querySelectorAll('.bp-slot-group').forEach(slot => {
        const status = slot.dataset.status;
        if (filter === 'all') {
          slot.style.display = '';
        } else if (filter === 'free') {
          slot.style.display = status === 'free' ? '' : 'none';
        } else if (filter === 'occupied') {
          slot.style.display = status === 'occupied' ? '' : 'none';
        }
      });
    };
  });

  // Intelligent Find My Bike search & vehicle localization logic
  let pinnedSpot = null;

  function searchSlot() {
    const rawQ = inputSlotSearch.value.trim().toUpperCase();
    if (!rawQ) return;
    
    // Normalize query
    const q = rawQ.replace(/[^A-Z0-9]/g, '');

    // 0. Search exact 45-degree sub-slot first (e.g. C04-A12, K-01-B05)
    let targetSubSlot = document.querySelector(`.bp-sub-slot[data-sub-slot*="${rawQ}"]`);
    if (targetSubSlot) {
      document.querySelectorAll('.bp-slot-box').forEach(s => s.classList.remove('highlighted'));
      document.querySelectorAll('.bp-sub-slot').forEach(s => s.classList.remove('highlighted-sub'));
      targetSubSlot.classList.add('highlighted-sub');
      const parentGroup = targetSubSlot.closest('.bp-slot-group');
      if (parentGroup) parentGroup.querySelector('.bp-slot-box')?.classList.add('highlighted');

      const subId = targetSubSlot.dataset.subSlot;
      const row = targetSubSlot.dataset.row;
      searchSlotFeedback.innerHTML = `🎯 Tìm thấy: <strong style="color:#fef08a">${subId}</strong> (${row})<br><small style="color:#a7f3d0">📐 Góc đỗ: Xéo 45° • Lối lùi xe ra Lối dắt 1.4m thông ra Làn chính 5.0m</small>`;

      // Focus / pan to slot
      const bbox = targetSubSlot.getBBox();
      detailPanX = 700 - (bbox.x + bbox.width / 2) * detailScale;
      detailPanY = 450 - (bbox.y + bbox.height / 2) * detailScale;
      const bpViewport = document.getElementById('bp-viewport');
      if (bpViewport) {
        bpViewport.setAttribute('transform', `translate(${detailPanX}, ${detailPanY}) scale(${detailScale})`);
      }
      return;
    }

    // 1. Search by exact or partial slot ID or pillar
    let targetSlot = document.querySelector(`.bp-slot-group[data-slot*="${rawQ}"]`) ||
                     document.querySelector(`.bp-slot-group[data-pillar*="${rawQ}"]`);
    
    // 2. Search if query contains pillar like C04 or S08
    if (!targetSlot && (rawQ.startsWith('C') || rawQ.startsWith('S') || rawQ.startsWith('A'))) {
      const pMatch = rawQ.match(/[CSA]\d+/);
      if (pMatch) {
        targetSlot = document.querySelector(`.bp-slot-group[data-pillar*="${pMatch[0]}"]`) ||
                     document.querySelector(`.bp-pillar-group[data-pillar*="${pMatch[0]}"]`);
      }
    }

    // 3. Search if query is a license plate (simulate AI camera finding bike in a specific slot)
    let isLicensePlate = false;
    if (!targetSlot && rawQ.length >= 4) {
      isLicensePlate = true;
      targetSlot = document.querySelector(`.bp-slot-group[data-slot*="I-TAY-4"]`) ||
                   document.querySelector(`.bp-slot-group[data-slot*="K-01"]`) ||
                   document.querySelector('.bp-slot-group');
    }

    if (targetSlot) {
      document.querySelectorAll('.bp-slot-box').forEach(s => s.classList.remove('highlighted'));
      document.querySelectorAll('.bp-sub-slot').forEach(s => s.classList.remove('highlighted-sub'));
      const slotBox = targetSlot.querySelector('.bp-slot-box');
      if (slotBox) slotBox.classList.add('highlighted');

      // Highlight a sample sub-slot in that bay
      const sampleSub = targetSlot.querySelector('.bp-sub-slot');
      if (sampleSub) sampleSub.classList.add('highlighted-sub');
      
      const slotId = targetSlot.dataset.slot || 'Vị trí đỗ';
      const pillar = targetSlot.dataset.pillar ? ` • Cạnh Cột ${targetSlot.dataset.pillar}` : '';
      const desc = targetSlot.dataset.desc || '';
      
      if (isLicensePlate) {
        searchSlotFeedback.innerHTML = `🎯 <strong style="color:#38bdf8">AI Camera:</strong> Tìm thấy xe [<strong>${rawQ}</strong>] tại <strong>${slotId}</strong>${pillar}<br><small style="color:#a7f3d0">📍 Vị trí: Dãy A - Ô Xéo số 12 (45°) • Lối rút xe giữa 1.4m</small>`;
      } else {
        searchSlotFeedback.innerHTML = `🎯 Tìm thấy: <strong>${slotId}</strong>${pillar}<br><small style="color:#a7f3d0">📍 ${desc || 'Khoang đỗ xe ô xéo 45°'}</small>`;
      }
      
      // Pan to slot with smooth focus
      const bbox = targetSlot.getBBox();
      detailPanX = 700 - (bbox.x + bbox.width / 2) * detailScale;
      detailPanY = 450 - (bbox.y + bbox.height / 2) * detailScale;
      const bpViewport = document.getElementById('bp-viewport');
      if (bpViewport) {
        bpViewport.setAttribute('transform', `translate(${detailPanX}, ${detailPanY}) scale(${detailScale})`);
      }
    } else {
      searchSlotFeedback.innerHTML = `<span style="color:#f87171">Không tìm thấy vị trí '${rawQ}'. Vui lòng thử mã Cột (VD: C04), Ô xéo (C04-A12) hoặc Biển số xe.</span>`;
    }
  }

  btnSearchSlot.onclick = searchSlot;
  inputSlotSearch.onkeydown = (e) => {
    if (e.key === 'Enter') searchSlot();
  };

  // 1-Click Pin My Spot logic
  const btnPinMySpot = document.getElementById('btn-pin-my-spot');
  const btnGuideToMySpot = document.getElementById('btn-guide-to-my-spot');

  if (btnPinMySpot) {
    btnPinMySpot.onclick = () => {
      const activeSlot = document.querySelector('.bp-slot-box.highlighted')?.closest('.bp-slot-group') ||
                         document.querySelector('.bp-slot-group');
      if (activeSlot) {
        pinnedSpot = {
          id: activeSlot.dataset.slot,
          pillar: activeSlot.dataset.pillar,
          desc: activeSlot.dataset.desc,
          mode: currentDetailMode
        };
        searchSlotFeedback.innerHTML = `📌 <strong style="color:#34d399">Đã ghim vị trí xe của bạn:</strong> <strong>${pinnedSpot.id}</strong> (${pinnedSpot.pillar ? 'Cạnh ' + pinnedSpot.pillar : 'Khu vực đỗ'})<br><small style="color:#cbd5e1">Hệ thống đã lưu. Khi quay lại hầm, hãy bấm "Dẫn Đến Xe".</small>`;
      } else {
        searchSlotFeedback.innerHTML = `<span style="color:#f59e0b">Vui lòng click chọn 1 khoang đỗ trên bản đồ trước khi ghim.</span>`;
      }
    };
  }

  if (btnGuideToMySpot) {
    btnGuideToMySpot.onclick = () => {
      if (!pinnedSpot) {
        // Sample default pin if not pinned yet
        pinnedSpot = { id: 'KHOANG-I-TAY-4', pillar: 'C04', desc: 'Dãy A - Ô số 12', mode: currentDetailMode };
      }
      
      inputSlotSearch.value = pinnedSpot.id;
      searchSlot();
      searchSlotFeedback.innerHTML = `🧭 <strong style="color:#38bdf8">Lộ trình đi bộ đến xe (${pinnedSpot.id}):</strong><br>` +
        `1. Đi từ sảnh Thang máy toà nhà xuống hầm.<br>` +
        `2. Đi dọc Hành lang chính tới <strong>Cột ${pinnedSpot.pillar || 'C04'}</strong>.<br>` +
        `3. Rẽ vào Lối dắt xe giữa 1.4m để lấy xe tại <strong>${pinnedSpot.desc || 'Dãy A'}</strong>.`;
    };
  }

  // Open modal triggers
  function openBasementDetail(mode) {
    modalBasementDetail.style.display = 'flex';
    document.querySelectorAll('.modal-tab-btn').forEach(btn => {
      if (btn.dataset.mode === mode) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    if (mode === 'toai') {
      renderToaIBlueprint();
    } else if (mode === 'student') {
      renderStudentBasementBlueprint();
    } else if (mode === 'staff') {
      renderStaffBasementBlueprint();
    }
  }

  // Modal switcher tab click
  document.querySelectorAll('.modal-tab-btn').forEach(btn => {
    btn.onclick = () => {
      const mode = btn.dataset.mode;
      openBasementDetail(mode);
    };
  });

  btnCloseDetail.onclick = () => {
    modalBasementDetail.style.display = 'none';
  };

  modalBasementDetail.onclick = (e) => {
    if (e.target === modalBasementDetail) {
      modalBasementDetail.style.display = 'none';
    }
  };

  // Bind click on basement zones in the main map to open strictly and ONLY that basement's map!
  const zoneToaI = document.getElementById('zone-b1-toai');
  if (zoneToaI) {
    zoneToaI.style.cursor = 'pointer';
    zoneToaI.addEventListener('click', (e) => {
      e.stopPropagation();
      openBasementDetail('toai');
    });
  }

  const zoneMain = document.getElementById('zone-b1-student-main');
  if (zoneMain) {
    zoneMain.style.cursor = 'pointer';
    zoneMain.addEventListener('click', (e) => {
      e.stopPropagation();
      openBasementDetail('student');
    });
  }

  const zoneStaff = document.getElementById('zone-b1-staff');
  if (zoneStaff) {
    zoneStaff.style.cursor = 'pointer';
    zoneStaff.addEventListener('click', (e) => {
      e.stopPropagation();
      openBasementDetail('staff');
    });
  }

  // Click on Sidebar Capacity cards to open respective isolated map
  document.querySelector('.stat-box.primary')?.addEventListener('click', () => {
    openBasementDetail('student');
  });

  document.querySelector('.stat-box.accent')?.addEventListener('click', () => {
    openBasementDetail('staff');
  });
});

