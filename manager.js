// SafCam Enterprise Manager Command Center Controller
const API_URL = window.location.origin || 'http://localhost:5000';

// Global Application State
let allWorkers = [];
let allZones = [];
let siteMapData = { map_image: null, pins: {} };
let cam1Stream = null;
let cam1Monitoring = false;
let cam1Interval = null;
let simCamerasActive = { 2: true, 3: true, 4: true, 5: true, 6: true };
let simAnimationIds = {};
let selectedVideoDeviceId = '';

// DOM Elements Cache
const liveClockEl = document.getElementById('liveClock');
const totalWorkersEl = document.getElementById('totalWorkers');
const totalWorkerViolationsEl = document.getElementById('totalWorkerViolations');
const activeCamerasCountEl = document.getElementById('activeCamerasCount');
const activeZonesCountEl = document.getElementById('activeZonesCount');

// Tab Navigation Elements
const navTabBtns = document.querySelectorAll('.nav-tab-btn');
const tabPanels = document.querySelectorAll('.tab-panel');

// CCTV Matrix Elements
const cameraDeviceSelect = document.getElementById('cameraDeviceSelect');
const cameraZoneFilter = document.getElementById('cameraZoneFilter');
const startAllCamerasBtn = document.getElementById('startAllCamerasBtn');
const stopAllCamerasBtn = document.getElementById('stopAllCamerasBtn');
const videoElementManager = document.getElementById('videoElementManager');
const canvasElementManager = document.getElementById('canvasElementManager');
const cam1ToggleBtn = document.getElementById('cam1ToggleBtn');
const cam1RecBadge = document.getElementById('cam1RecBadge');
const cam1StatusBadge = document.getElementById('cam1StatusBadge');
const camCard1 = document.getElementById('camCard1');

// Blueprint Elements
const blueprintStage = document.getElementById('blueprintStage');
const blueprintMapImg = document.getElementById('blueprintMapImg');
const blueprintDefaultGrid = document.getElementById('blueprintDefaultGrid');
const mapUploadDropzone = document.getElementById('mapUploadDropzone');
const mapFileInput = document.getElementById('mapFileInput');
const saveMapPinsBtn = document.getElementById('saveMapPinsBtn');
const resetMapPinsBtn = document.getElementById('resetMapPinsBtn');
const clearCustomMapBtn = document.getElementById('clearCustomMapBtn');

// Zone Elements
const zonesGridContainer = document.getElementById('zonesGridContainer');
const openAddZoneModalBtn = document.getElementById('openAddZoneModalBtn');
const zoneConfigModal = document.getElementById('zoneConfigModal');
const closeZoneModal = document.getElementById('closeZoneModal');
const cancelZoneBtn = document.getElementById('cancelZoneBtn');
const zoneConfigForm = document.getElementById('zoneConfigForm');
const zoneModalTitle = document.getElementById('zoneModalTitle');
const zoneConfigId = document.getElementById('zoneConfigId');
const zoneConfigName = document.getElementById('zoneConfigName');
const zoneConfigCode = document.getElementById('zoneConfigCode');
const zoneConfigDesc = document.getElementById('zoneConfigDesc');
const zoneConfigRisk = document.getElementById('zoneConfigRisk');

// Workforce Elements
const addWorkerForm = document.getElementById('addWorkerForm');
const workersTableBody = document.getElementById('workersTableBody');
const tableSearchInput = document.getElementById('tableSearchInput');
const roleFilterSelect = document.getElementById('roleFilterSelect');
const zoneFilterSelect = document.getElementById('zoneFilterSelect');
const workerZoneSelect = document.getElementById('workerZone');
const refreshWorkersBtn = document.getElementById('refreshWorkersBtn');
const exportWorkersCsvBtn = document.getElementById('exportWorkersCsvBtn');

// Analytics & Broadcast Elements
const managerLogContainer = document.getElementById('managerLogContainer');
const downloadReportJsonBtn = document.getElementById('downloadReportJsonBtn');
const openBroadcastModalBtn = document.getElementById('openBroadcastModalBtn');
const broadcastModal = document.getElementById('broadcastModal');
const closeBroadcastModal = document.getElementById('closeBroadcastModal');
const cancelBroadcastBtn = document.getElementById('cancelBroadcastBtn');
const broadcastForm = document.getElementById('broadcastForm');
const broadcastPreset = document.getElementById('broadcastPreset');
const broadcastMessage = document.getElementById('broadcastMessage');

// Default Pin Coordinates
const DEFAULT_PINS = {
    cam1: { left: 18.5, top: 82.0 },
    cam2: { left: 35.0, top: 28.0 },
    cam3: { left: 68.0, top: 32.0 },
    cam4: { left: 78.0, top: 72.0 },
    cam5: { left: 42.0, top: 75.0 },
    cam6: { left: 22.0, top: 45.0 }
};

// ==========================================
// 1. Initialization
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    initClock();
    initTabNavigation();
    initCameraDevices();
    initSimulatedCCTVs();
    initBlueprintDraggablePins();
    initEventListeners();

    // Initial Data Sync
    loadWorkers();
    loadZones();
    loadSiteMap();
    loadViolations();

    // Periodic Background Sync (every 10s)
    setInterval(() => {
        loadWorkers(true);
        loadViolations(true);
    }, 10000);
});

/**
 * High-precision Real-time Digital Clock
 */
function initClock() {
    function updateClock() {
        const now = new Date();
        if (liveClockEl) {
            liveClockEl.textContent = now.toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false
            }) + ' SITE TIME';
        }
    }
    updateClock();
    setInterval(updateClock, 1000);
}

/**
 * Tab Navigation Controller
 */
function initTabNavigation() {
    navTabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetTabId = btn.getAttribute('data-tab');
            
            navTabBtns.forEach(b => b.classList.remove('active'));
            tabPanels.forEach(p => p.classList.remove('active'));

            btn.classList.add('active');
            const targetPanel = document.getElementById(targetTabId);
            if (targetPanel) {
                targetPanel.classList.add('active');
            }
        });
    });
}

/**
 * Event Listeners Controller
 */
function initEventListeners() {
    // CCTV Controls
    if (cameraDeviceSelect) {
        cameraDeviceSelect.addEventListener('change', (e) => {
            selectedVideoDeviceId = e.target.value;
            if (cam1Monitoring) {
                startCam1(); // restart with new device
            }
        });
    }
    if (cameraZoneFilter) cameraZoneFilter.addEventListener('change', handleCameraZoneFilter);
    if (startAllCamerasBtn) startAllCamerasBtn.addEventListener('click', startAllCameras);
    if (stopAllCamerasBtn) stopAllCamerasBtn.addEventListener('click', stopAllCameras);

    // Blueprint Studio
    if (saveMapPinsBtn) saveMapPinsBtn.addEventListener('click', saveBlueprintPinPositions);
    if (resetMapPinsBtn) resetMapPinsBtn.addEventListener('click', resetBlueprintPins);
    if (clearCustomMapBtn) clearCustomMapBtn.addEventListener('click', clearCustomBlueprintImage);
    if (mapUploadDropzone && mapFileInput) {
        mapUploadDropzone.addEventListener('click', () => mapFileInput.click());
        mapFileInput.addEventListener('change', handleMapFileUpload);

        // Drag & drop file support
        mapUploadDropzone.addEventListener('dragover', (e) => {
            e.preventDefault();
            mapUploadDropzone.style.borderColor = 'var(--cyan)';
            mapUploadDropzone.style.background = 'rgba(0, 240, 255, 0.08)';
        });
        mapUploadDropzone.addEventListener('dragleave', () => {
            mapUploadDropzone.style.borderColor = 'rgba(255, 255, 255, 0.15)';
            mapUploadDropzone.style.background = 'rgba(255, 255, 255, 0.03)';
        });
        mapUploadDropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            mapUploadDropzone.style.borderColor = 'rgba(255, 255, 255, 0.15)';
            mapUploadDropzone.style.background = 'rgba(255, 255, 255, 0.03)';
            if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                handleMapFile(e.dataTransfer.files[0]);
            }
        });
    }

    // Zone Modal Controls
    if (openAddZoneModalBtn) openAddZoneModalBtn.addEventListener('click', () => openZoneModal());
    if (closeZoneModal) closeZoneModal.addEventListener('click', closeZoneModalHandler);
    if (cancelZoneBtn) cancelZoneBtn.addEventListener('click', closeZoneModalHandler);
    if (zoneConfigForm) zoneConfigForm.addEventListener('submit', handleSaveZone);

    // Workforce Controls
    if (addWorkerForm) addWorkerForm.addEventListener('submit', handleAddWorker);
    if (tableSearchInput) tableSearchInput.addEventListener('input', filterAndRenderWorkers);
    if (roleFilterSelect) roleFilterSelect.addEventListener('change', filterAndRenderWorkers);
    if (zoneFilterSelect) zoneFilterSelect.addEventListener('change', filterAndRenderWorkers);
    if (refreshWorkersBtn) refreshWorkersBtn.addEventListener('click', () => loadWorkers());
    if (exportWorkersCsvBtn) exportWorkersCsvBtn.addEventListener('click', exportWorkersToCsv);

    // Analytics & PA Broadcast Controls
    if (downloadReportJsonBtn) downloadReportJsonBtn.addEventListener('click', downloadAuditReportJson);
    if (openBroadcastModalBtn) {
        openBroadcastModalBtn.addEventListener('click', () => {
            broadcastModal.classList.add('active');
        });
    }
    if (closeBroadcastModal) {
        closeBroadcastModal.addEventListener('click', () => {
            broadcastModal.classList.remove('active');
        });
    }
    if (cancelBroadcastBtn) {
        cancelBroadcastBtn.addEventListener('click', () => {
            broadcastModal.classList.remove('active');
        });
    }
    if (broadcastPreset) {
        broadcastPreset.addEventListener('change', (e) => {
            if (e.target.value !== 'custom') {
                broadcastMessage.value = e.target.value;
            }
        });
    }
    if (broadcastForm) broadcastForm.addEventListener('submit', handleBroadcastSubmit);
}

// ==========================================
// 2. Multi-Camera CCTV Stream Management
// ==========================================

/**
 * Enumerate connected video input devices
 */
async function initCameraDevices() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
        console.warn('Media devices enumeration not supported in this browser.');
        return;
    }
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoInputs = devices.filter(d => d.kind === 'videoinput');
        
        if (cameraDeviceSelect) {
            cameraDeviceSelect.innerHTML = '<option value="">Default Video Camera</option>';
            videoInputs.forEach((device, index) => {
                const opt = document.createElement('option');
                opt.value = device.deviceId;
                opt.textContent = device.label || `Camera Device ${index + 1}`;
                cameraDeviceSelect.appendChild(opt);
            });
        }
    } catch (e) {
        console.error('Error enumerating cameras:', e);
    }
}

/**
 * Toggle Primary WebRTC Live Camera 1
 */
function toggleCam1Stream() {
    if (cam1Monitoring) {
        stopCam1();
    } else {
        startCam1();
    }
}

async function startCam1() {
    try {
        if (cam1Stream) {
            cam1Stream.getTracks().forEach(t => t.stop());
        }

        const constraints = {
            video: {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                deviceId: selectedVideoDeviceId ? { exact: selectedVideoDeviceId } : undefined,
                facingMode: selectedVideoDeviceId ? undefined : 'user'
            }
        };

        cam1Stream = await navigator.mediaDevices.getUserMedia(constraints);
        videoElementManager.srcObject = cam1Stream;
        cam1Monitoring = true;
        
        if (cam1ToggleBtn) {
            cam1ToggleBtn.textContent = 'Pause Stream';
            cam1ToggleBtn.className = 'cctv-controls-btn cctv-stop-btn';
        }
        if (cam1RecBadge) cam1RecBadge.className = 'rec-badge';
        if (cam1StatusBadge) {
            cam1StatusBadge.textContent = 'Scanning...';
            cam1StatusBadge.className = 'cctv-status-badge status-compliant-badge';
        }
        if (camCard1) camCard1.classList.add('active-monitoring');

        // Start real-time analysis loop
        if (cam1Interval) clearInterval(cam1Interval);
        cam1Interval = setInterval(analyzeCam1Frame, 650);
        updateActiveCamerasKPI();
    } catch (e) {
        console.error('Camera 1 error:', e);
        alert('Unable to access video camera. Please verify camera permissions in your browser.');
    }
}

function stopCam1() {
    cam1Monitoring = false;
    if (cam1Interval) {
        clearInterval(cam1Interval);
        cam1Interval = null;
    }
    if (cam1Stream) {
        cam1Stream.getTracks().forEach(t => t.stop());
        videoElementManager.srcObject = null;
        cam1Stream = null;
    }
    if (cam1ToggleBtn) {
        cam1ToggleBtn.textContent = 'Start Camera';
        cam1ToggleBtn.className = 'cctv-controls-btn cctv-start-btn';
    }
    if (cam1RecBadge) cam1RecBadge.className = 'rec-badge idle-rec';
    if (cam1StatusBadge) {
        cam1StatusBadge.textContent = 'Paused';
        cam1StatusBadge.className = 'cctv-status-badge status-idle-badge';
    }
    if (camCard1) camCard1.classList.remove('active-monitoring', 'violation-alert');
    updateActiveCamerasKPI();
}

async function analyzeCam1Frame() {
    if (!cam1Monitoring || !videoElementManager || !videoElementManager.videoWidth) return;

    try {
        const canvas = canvasElementManager;
        canvas.width = videoElementManager.videoWidth;
        canvas.height = videoElementManager.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(videoElementManager, 0, 0);
        const imgData = canvas.toDataURL('image/jpeg', 0.8);

        const res = await fetch(`${API_URL}/api/analyze-frame`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: imgData })
        });

        const data = await res.json();
        if (data.status === 'success' && data.result) {
            const r = data.result;
            if (r.compliance_status === 'violation') {
                if (cam1StatusBadge) {
                    cam1StatusBadge.textContent = '⚠️ PPE Violation';
                    cam1StatusBadge.className = 'cctv-status-badge status-violation-badge';
                }
                if (camCard1) camCard1.classList.add('violation-alert');
            } else {
                if (cam1StatusBadge) {
                    cam1StatusBadge.textContent = '✅ All Gear Compliant';
                    cam1StatusBadge.className = 'cctv-status-badge status-compliant-badge';
                }
                if (camCard1) camCard1.classList.remove('violation-alert');
            }
        }
    } catch (e) {
        console.error('Analysis error:', e);
    }
}

/**
 * Simulated High-Tech CCTV Streams for CAM 02 to CAM 06
 */
function initSimulatedCCTVs() {
    const configs = [
        { id: 2, zone: 'ZONE A', name: 'SCAFFOLDING-NW', color: '#ff6b35', workerCount: 2 },
        { id: 3, zone: 'ZONE B', name: 'CRANE-BAY-03', color: '#ffd23f', workerCount: 3 },
        { id: 4, zone: 'ZONE C', name: 'PIT-TRENCH-01', color: '#ef476f', workerCount: 1 },
        { id: 5, zone: 'ZONE D', name: 'LOGISTICS-DOCK', color: '#4ea8de', workerCount: 2 },
        { id: 6, zone: 'ZONE E', name: 'WELDING-FAB-02', color: '#06d6a0', workerCount: 2 }
    ];

    configs.forEach(cfg => {
        renderCCTVSimulation(cfg);
    });
}

function renderCCTVSimulation(cfg) {
    const canvas = document.getElementById(`camCanvas${cfg.id}`);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width = 480;
    canvas.height = 270;

    let tick = 0;

    function drawFrame() {
        if (!simCamerasActive[cfg.id]) {
            ctx.fillStyle = '#06060c';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#666';
            ctx.font = '14px Inter, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(`CAM-0${cfg.id} PAUSED`, canvas.width / 2, canvas.height / 2);
            return;
        }

        tick += 0.03;
        ctx.fillStyle = '#0d0f1a';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Perspective grid lines
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
        ctx.lineWidth = 1;
        for (let x = 0; x < canvas.width; x += 40) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, canvas.height);
            ctx.stroke();
        }
        for (let y = 0; y < canvas.height; y += 30) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(canvas.width, y);
            ctx.stroke();
        }

        // Draw animated personnel with AI bounding boxes
        for (let i = 0; i < cfg.workerCount; i++) {
            const baseX = 80 + i * 150 + Math.sin(tick + i) * 18;
            const baseY = 80 + Math.cos(tick * 0.8 + i) * 8;
            const boxW = 65;
            const boxH = 120;

            // Worker Head
            ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
            ctx.beginPath();
            ctx.arc(baseX + boxW / 2, baseY + 18, 12, 0, Math.PI * 2);
            ctx.fill();
            
            // Hard Hat
            ctx.fillStyle = cfg.color;
            ctx.beginPath();
            ctx.arc(baseX + boxW / 2, baseY + 14, 13, Math.PI, 0);
            ctx.fill();

            // Torso & Hi-Vis Vest
            ctx.fillRect(baseX + 15, baseY + 32, boxW - 30, 48);
            ctx.fillStyle = '#fff';
            ctx.fillRect(baseX + 15, baseY + 45, boxW - 30, 4);
            ctx.fillRect(baseX + 15, baseY + 60, boxW - 30, 4);

            // Legs
            ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
            ctx.fillRect(baseX + 18, baseY + 80, 10, 35);
            ctx.fillRect(baseX + boxW - 28, baseY + 80, 10, 35);

            // Bounding Box
            ctx.strokeStyle = '#06d6a0';
            ctx.lineWidth = 1.5;
            ctx.strokeRect(baseX, baseY, boxW, boxH);

            // Label
            ctx.fillStyle = '#06d6a0';
            ctx.fillRect(baseX, baseY - 16, boxW, 14);
            ctx.fillStyle = '#000';
            ctx.font = 'bold 9px monospace';
            ctx.textAlign = 'left';
            ctx.fillText(`PPE OK 98%`, baseX + 3, baseY - 5);
        }

        // Crosshairs Overlay
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
        ctx.beginPath();
        ctx.moveTo(canvas.width / 2 - 15, canvas.height / 2);
        ctx.lineTo(canvas.width / 2 + 15, canvas.height / 2);
        ctx.moveTo(canvas.width / 2, canvas.height / 2 - 15);
        ctx.lineTo(canvas.width / 2, canvas.height / 2 + 15);
        ctx.stroke();

        // Scanline sweep
        const scanY = (Math.sin(tick * 2) * 0.5 + 0.5) * canvas.height;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
        ctx.fillRect(0, scanY, canvas.width, 14);

        simAnimationIds[cfg.id] = requestAnimationFrame(drawFrame);
    }

    drawFrame();
}

function toggleSimCamera(camId) {
    simCamerasActive[camId] = !simCamerasActive[camId];
    const btn = document.getElementById(`cam${camId}ToggleBtn`);
    const badge = document.getElementById(`cam${camId}StatusBadge`);
    const rec = document.getElementById(`cam${camId}RecBadge`);

    if (simCamerasActive[camId]) {
        if (btn) {
            btn.textContent = 'Pause';
            btn.className = 'cctv-controls-btn cctv-stop-btn';
        }
        if (badge) {
            badge.textContent = 'Monitoring';
            badge.className = 'cctv-status-badge status-compliant-badge';
        }
        if (rec) rec.className = 'rec-badge';
        initSimulatedCCTVs();
    } else {
        if (btn) {
            btn.textContent = 'Resume';
            btn.className = 'cctv-controls-btn cctv-start-btn';
        }
        if (badge) {
            badge.textContent = 'Paused';
            badge.className = 'cctv-status-badge status-idle-badge';
        }
        if (rec) rec.className = 'rec-badge idle-rec';
    }
    updateActiveCamerasKPI();
}

function startAllCameras() {
    startCam1();
    for (let i = 2; i <= 6; i++) {
        simCamerasActive[i] = true;
        const btn = document.getElementById(`cam${i}ToggleBtn`);
        const badge = document.getElementById(`cam${i}StatusBadge`);
        const rec = document.getElementById(`cam${i}RecBadge`);
        if (btn) { btn.textContent = 'Pause'; btn.className = 'cctv-controls-btn cctv-stop-btn'; }
        if (badge) { badge.textContent = 'Monitoring'; badge.className = 'cctv-status-badge status-compliant-badge'; }
        if (rec) rec.className = 'rec-badge';
    }
    initSimulatedCCTVs();
    updateActiveCamerasKPI();
}

function stopAllCameras() {
    stopCam1();
    for (let i = 2; i <= 6; i++) {
        simCamerasActive[i] = false;
        const btn = document.getElementById(`cam${i}ToggleBtn`);
        const badge = document.getElementById(`cam${i}StatusBadge`);
        const rec = document.getElementById(`cam${i}RecBadge`);
        if (btn) { btn.textContent = 'Resume'; btn.className = 'cctv-controls-btn cctv-start-btn'; }
        if (badge) { badge.textContent = 'Paused'; badge.className = 'cctv-status-badge status-idle-badge'; }
        if (rec) rec.className = 'rec-badge idle-rec';
    }
    updateActiveCamerasKPI();
}

function updateActiveCamerasKPI() {
    if (!activeCamerasCountEl) return;
    let active = cam1Monitoring ? 1 : 0;
    for (let i = 2; i <= 6; i++) {
        if (simCamerasActive[i]) active++;
    }
    activeCamerasCountEl.textContent = `${active}/6`;
}

function handleCameraZoneFilter(e) {
    const val = e.target.value;
    const cards = document.querySelectorAll('.cctv-card');
    cards.forEach(card => {
        const cardZone = card.getAttribute('data-zone');
        if (val === 'all' || cardZone === val) {
            card.style.display = 'flex';
        } else {
            card.style.display = 'none';
        }
    });
}

// ==========================================
// 3. Site Blueprint & Camera Pin Studio
// ==========================================

/**
 * Load Site Map & Camera Pins from Backend
 */
async function loadSiteMap() {
    try {
        const res = await fetch(`${API_URL}/api/site-map`);
        const data = await res.json();
        if (data.status === 'success' && data.site_map) {
            siteMapData = data.site_map;
            renderBlueprintMap();
        }
    } catch (e) {
        console.error('Error loading site map:', e);
    }
}

function renderBlueprintMap() {
    // 1. Render Map Image or Vector Grid
    if (siteMapData.map_image) {
        blueprintMapImg.src = siteMapData.map_image;
        blueprintMapImg.style.display = 'block';
        if (blueprintDefaultGrid) blueprintDefaultGrid.style.display = 'none';
    } else {
        blueprintMapImg.style.display = 'none';
        if (blueprintDefaultGrid) blueprintDefaultGrid.style.display = 'block';
    }

    // 2. Render Pin Positions
    const pins = siteMapData.pins || DEFAULT_PINS;
    for (let i = 1; i <= 6; i++) {
        const pinKey = `cam${i}`;
        const pinEl = document.getElementById(`pin-${pinKey}`);
        if (pinEl && pins[pinKey]) {
            pinEl.style.left = `${pins[pinKey].left}%`;
            pinEl.style.top = `${pins[pinKey].top}%`;
        }
    }
}

/**
 * Make Camera Pins Draggable across Blueprint Stage
 */
function initBlueprintDraggablePins() {
    const pins = document.querySelectorAll('.camera-map-pin');

    pins.forEach(pin => {
        let isDragging = false;
        let startX, startY;

        pin.addEventListener('mousedown', (e) => {
            isDragging = true;
            pin.classList.add('dragging');
            e.preventDefault();
        });

        window.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            const stageRect = blueprintStage.getBoundingClientRect();
            let newX = e.clientX - stageRect.left;
            let newY = e.clientY - stageRect.top;

            // Constrain within bounds
            newX = Math.max(15, Math.min(newX, stageRect.width - 15));
            newY = Math.max(15, Math.min(newY, stageRect.height - 15));

            const leftPercent = ((newX / stageRect.width) * 100).toFixed(1);
            const topPercent = ((newY / stageRect.height) * 100).toFixed(1);

            pin.style.left = `${leftPercent}%`;
            pin.style.top = `${topPercent}%`;
        });

        window.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                pin.classList.remove('dragging');
            }
        });

        // Touch support for tablets/mobile
        pin.addEventListener('touchstart', (e) => {
            isDragging = true;
            pin.classList.add('dragging');
        }, { passive: true });

        window.addEventListener('touchmove', (e) => {
            if (!isDragging || !e.touches[0]) return;
            const touch = e.touches[0];
            const stageRect = blueprintStage.getBoundingClientRect();
            let newX = touch.clientX - stageRect.left;
            let newY = touch.clientY - stageRect.top;

            newX = Math.max(15, Math.min(newX, stageRect.width - 15));
            newY = Math.max(15, Math.min(newY, stageRect.height - 15));

            pin.style.left = `${((newX / stageRect.width) * 100).toFixed(1)}%`;
            pin.style.top = `${((newY / stageRect.height) * 100).toFixed(1)}%`;
        }, { passive: true });

        window.addEventListener('touchend', () => {
            if (isDragging) {
                isDragging = false;
                pin.classList.remove('dragging');
            }
        });
    });
}

function handleMapFileUpload(e) {
    if (e.target.files && e.target.files[0]) {
        handleMapFile(e.target.files[0]);
    }
}

function handleMapFile(file) {
    if (!file.type.startsWith('image/')) {
        alert('Please upload a valid image file (PNG, JPG, SVG).');
        return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
        siteMapData.map_image = event.target.result;
        renderBlueprintMap();
        await saveBlueprintPinPositions(false);
        alert('📐 Site Blueprint uploaded and synced successfully!');
    };
    reader.readAsDataURL(file);
}

function clearCustomBlueprintImage() {
    siteMapData.map_image = null;
    renderBlueprintMap();
    saveBlueprintPinPositions(false);
}

function resetBlueprintPins() {
    siteMapData.pins = JSON.parse(JSON.stringify(DEFAULT_PINS));
    renderBlueprintMap();
}

async function saveBlueprintPinPositions(showAlert = true) {
    const pins = {};
    for (let i = 1; i <= 6; i++) {
        const pinEl = document.getElementById(`pin-cam${i}`);
        if (pinEl) {
            pins[`cam${i}`] = {
                left: parseFloat(pinEl.style.left) || DEFAULT_PINS[`cam${i}`].left,
                top: parseFloat(pinEl.style.top) || DEFAULT_PINS[`cam${i}`].top
            };
        }
    }

    siteMapData.pins = pins;

    try {
        const res = await fetch(`${API_URL}/api/site-map`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(siteMapData)
        });
        const data = await res.json();
        if (showAlert) {
            if (res.ok && data.status === 'success') {
                alert('💾 Camera Pin Coordinates and Blueprint Saved Successfully!');
            } else {
                alert('Failed to save blueprint positions.');
            }
        }
    } catch (e) {
        console.error('Error saving site map:', e);
        if (showAlert) alert('Network error saving map positions.');
    }
}

// ==========================================
// 4. Dynamic Zone Safety Protocols
// ==========================================

/**
 * Fetch and display all configurable safety zones
 */
async function loadZones() {
    try {
        const res = await fetch(`${API_URL}/api/zones`);
        const data = await res.json();
        if (data.status === 'success' && data.zones) {
            allZones = data.zones;
            renderZonesList();
            updateZoneSelectDropdowns();
            if (activeZonesCountEl) activeZonesCountEl.textContent = allZones.length;
        }
    } catch (e) {
        console.error('Error loading zones:', e);
    }
}

function renderZonesList() {
    if (!zonesGridContainer) return;

    if (allZones.length === 0) {
        zonesGridContainer.innerHTML = `<div class="empty-state" style="grid-column: 1 / -1;">No zones configured. Create a new zone above.</div>`;
        return;
    }

    zonesGridContainer.innerHTML = allZones.map(zone => {
        const risk = zone.risk || 'Medium';
        let riskClass = 'risk-medium';
        if (risk === 'Critical') riskClass = 'risk-critical';
        else if (risk === 'High') riskClass = 'risk-high';
        else if (risk === 'Low') riskClass = 'risk-low';

        // PPE tags
        const ppe = zone.ppe || [];
        const ppeBadges = ppe.map(item => `<span class="zone-ppe-tag">✓ ${escapeHtml(item)}</span>`).join('');

        // Find how many workers assigned to this zone
        const assignedWorkersCount = allWorkers.filter(w => w.zone && w.zone.includes(zone.code || zone.id)).length;

        return `
            <div class="zone-card">
                <div class="zone-card-header">
                    <div>
                        <div class="zone-code-badge">${escapeHtml(zone.code || zone.id)}</div>
                        <h3 class="zone-title">${escapeHtml(zone.name)}</h3>
                    </div>
                    <span class="risk-badge ${riskClass}">${escapeHtml(risk)} Risk</span>
                </div>
                <div class="zone-desc">${escapeHtml(zone.description || 'General operational zone.')}</div>
                <div class="zone-ppe-section">
                    <div style="font-size: 0.75rem; font-weight: 700; color: var(--muted); margin-bottom: 6px; text-transform: uppercase;">Required PPE Gear:</div>
                    <div class="zone-ppe-tags">${ppeBadges || '<span style="color:var(--muted); font-size:0.8rem;">No mandatory PPE defined</span>'}</div>
                </div>
                <div class="zone-footer">
                    <div style="font-size: 0.82rem; color: var(--muted);">
                        Assigned Personnel: <strong style="color: var(--light);">${assignedWorkersCount}</strong>
                    </div>
                    <div style="display: flex; gap: 8px;">
                        <button class="btn btn-secondary btn-small" onclick="openZoneModal('${escapeHtml(zone.id)}')">Edit</button>
                        <button class="btn-delete" style="padding: 4px 8px; font-size: 0.75rem;" onclick="deleteZone('${escapeHtml(zone.id)}')">Delete</button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function updateZoneSelectDropdowns() {
    // 1. Worker registration dropdown
    if (workerZoneSelect) {
        const curVal = workerZoneSelect.value;
        workerZoneSelect.innerHTML = allZones.map(z => `<option value="${escapeHtml(z.name)}">${escapeHtml(z.name)}</option>`).join('');
        if (curVal && allZones.some(z => z.name === curVal)) {
            workerZoneSelect.value = curVal;
        }
    }

    // 2. Table Zone Filter dropdown
    if (zoneFilterSelect) {
        const curFilter = zoneFilterSelect.value;
        let opts = '<option value="all">All Zones</option>';
        allZones.forEach(z => {
            const shortName = z.name.split(' - ')[0] || z.name;
            opts += `<option value="${escapeHtml(shortName)}">${escapeHtml(shortName)}</option>`;
        });
        zoneFilterSelect.innerHTML = opts;
        zoneFilterSelect.value = curFilter || 'all';
    }
}

function openZoneModal(zoneId = null) {
    if (zoneId) {
        const zone = allZones.find(z => z.id === zoneId);
        if (!zone) return;
        zoneModalTitle.textContent = '✏️ Edit Safety Sector';
        zoneConfigId.value = zone.id;
        zoneConfigName.value = zone.name;
        zoneConfigCode.value = zone.code || '';
        zoneConfigDesc.value = zone.description || '';
        zoneConfigRisk.value = zone.risk || 'Medium';

        const ppe = zone.ppe || [];
        document.getElementById('ppeHelmet').checked = ppe.includes('Helmet');
        document.getElementById('ppeVest').checked = ppe.includes('Safety Vest');
        document.getElementById('ppeBoots').checked = ppe.includes('Safety Boots');
        document.getElementById('ppeHarness').checked = ppe.includes('Safety Harness');
        document.getElementById('ppeGoggles').checked = ppe.includes('Eye Protection');
        document.getElementById('ppeGloves').checked = ppe.includes('Work Gloves');
        document.getElementById('ppeEar').checked = ppe.includes('Ear Protection');
    } else {
        zoneModalTitle.textContent = '➕ Create Custom Zone';
        zoneConfigForm.reset();
        zoneConfigId.value = '';
        document.getElementById('ppeHelmet').checked = true;
        document.getElementById('ppeVest').checked = true;
        document.getElementById('ppeBoots').checked = true;
    }
    zoneConfigModal.classList.add('active');
}

function closeZoneModalHandler() {
    zoneConfigModal.classList.remove('active');
}

async function handleSaveZone(e) {
    e.preventDefault();

    const id = zoneConfigId.value || `zone_${Date.now()}`;
    const name = zoneConfigName.value.trim();
    const code = zoneConfigCode.value.trim().toUpperCase();
    const description = zoneConfigDesc.value.trim();
    const risk = zoneConfigRisk.value;

    const ppe = [];
    if (document.getElementById('ppeHelmet').checked) ppe.push('Helmet');
    if (document.getElementById('ppeVest').checked) ppe.push('Safety Vest');
    if (document.getElementById('ppeBoots').checked) ppe.push('Safety Boots');
    if (document.getElementById('ppeHarness').checked) ppe.push('Safety Harness');
    if (document.getElementById('ppeGoggles').checked) ppe.push('Eye Protection');
    if (document.getElementById('ppeGloves').checked) ppe.push('Work Gloves');
    if (document.getElementById('ppeEar').checked) ppe.push('Ear Protection');

    try {
        const res = await fetch(`${API_URL}/api/zones`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, name, code, risk, ppe, description })
        });
        const data = await res.json();
        if (res.ok && data.status === 'success') {
            closeZoneModalHandler();
            await loadZones();
        } else {
            alert(`Failed to save zone: ${data.error || 'Server error'}`);
        }
    } catch (e) {
        console.error('Error saving zone:', e);
        alert('Network error saving zone configuration.');
    }
}

async function deleteZone(zoneId) {
    if (!confirm('Are you sure you want to delete this safety zone protocol?')) return;
    try {
        const res = await fetch(`${API_URL}/api/zones/${encodeURIComponent(zoneId)}`, {
            method: 'DELETE'
        });
        if (res.ok) {
            await loadZones();
        } else {
            alert('Failed to delete zone.');
        }
    } catch (e) {
        console.error('Error deleting zone:', e);
    }
}

// ==========================================
// 5. Workforce Management
// ==========================================

async function loadWorkers(isBackground = false) {
    try {
        const res = await fetch(`${API_URL}/api/workers`);
        const data = await res.json();
        if (data.status === 'success') {
            allWorkers = data.workers || [];
            updateStatsOverview(data.stats);
            filterAndRenderWorkers();
            if (!isBackground) {
                renderZonesList(); // update counts
            }
        }
    } catch (e) {
        console.error('Error fetching workers:', e);
    }
}

function updateStatsOverview(stats) {
    if (!stats) return;
    if (totalWorkersEl) totalWorkersEl.textContent = stats.total_workers || 0;
    if (totalWorkerViolationsEl) totalWorkerViolationsEl.textContent = stats.total_violations || 0;
}

function filterAndRenderWorkers() {
    if (!workersTableBody) return;
    
    const query = (tableSearchInput?.value || '').toLowerCase().trim();
    const roleFilter = roleFilterSelect?.value || 'all';
    const zoneFilter = zoneFilterSelect?.value || 'all';
    
    const filtered = allWorkers.filter(worker => {
        const matchesQuery = !query || 
            (worker.name && worker.name.toLowerCase().includes(query)) ||
            (worker.employee_id && worker.employee_id.toLowerCase().includes(query));
            
        const matchesRole = roleFilter === 'all' || worker.role === roleFilter;
        const matchesZone = zoneFilter === 'all' || (worker.zone && worker.zone.includes(zoneFilter));
        
        return matchesQuery && matchesRole && matchesZone;
    });

    if (filtered.length === 0) {
        workersTableBody.innerHTML = `
            <tr>
                <td colspan="8" class="empty-state">No matching personnel found</td>
            </tr>
        `;
        return;
    }

    workersTableBody.innerHTML = filtered.map(worker => {
        const lastSeen = worker.last_seen
            ? new Date(worker.last_seen).toLocaleString('en-US', {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              })
            : 'Never Active';

        const roleLower = (worker.role || 'general worker').toLowerCase();
        let roleClass = 'role-badge';
        if (roleLower.includes('supervisor')) roleClass += ' supervisor';
        else if (roleLower.includes('engineer')) roleClass += ' engineer';
        else if (roleLower.includes('operator')) roleClass += ' operator';

        const clearance = worker.clearance || 'Certified';
        let clearanceClass = 'clearance-badge clearance-certified';
        if (clearance === 'Flagged') clearanceClass = 'clearance-badge clearance-flagged';
        else if (clearance === 'Pending Inspection') clearanceClass = 'clearance-badge clearance-pending';

        const violCount = worker.total_violations || 0;
        const violPill = violCount > 0
            ? `<span class="violation-pill has-violations">⚠️ ${violCount}</span>`
            : `<span class="violation-pill clean">0</span>`;

        const zoneDisplay = worker.zone ? worker.zone.split(' - ')[0] : 'Zone A';

        return `
            <tr>
                <td><strong>${escapeHtml(worker.name)}</strong></td>
                <td><code>${escapeHtml(worker.employee_id)}</code></td>
                <td><span class="${roleClass}">${escapeHtml(worker.role || 'General Worker')}</span></td>
                <td><strong>${escapeHtml(zoneDisplay)}</strong></td>
                <td><span class="${clearanceClass}">${escapeHtml(clearance)}</span></td>
                <td>${violPill}</td>
                <td style="font-size: 0.85rem; opacity: 0.8;">${lastSeen}</td>
                <td>
                    <button class="btn-delete" onclick="deleteWorker('${escapeHtml(worker.employee_id)}')">
                        Delete
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

async function handleAddWorker(e) {
    e.preventDefault();

    const name = document.getElementById('workerName').value.trim();
    const employee_id = document.getElementById('employeeId').value.trim();
    const role = document.getElementById('workerRole').value;
    const zone = document.getElementById('workerZone').value;
    const phone = document.getElementById('workerPhone').value.trim();
    const clearance = document.getElementById('workerClearance').value;

    if (!name || !employee_id) {
        alert('Please fill in required fields');
        return;
    }

    try {
        const response = await fetch(`${API_URL}/api/workers`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, employee_id, role, zone, phone, clearance })
        });

        const data = await response.json();

        if (response.ok && data.status === 'success') {
            addWorkerForm.reset();
            await loadWorkers();
            alert(`✅ Worker ${name} (${employee_id}) successfully registered.`);
        } else if (response.status === 409) {
            alert(`Employee with ID "${employee_id}" already exists.`);
        } else {
            alert(`Error: ${data.error || 'Failed to add personnel'}`);
        }
    } catch (error) {
        console.error('Error adding worker:', error);
        alert('Network error while registering employee');
    }
}

async function deleteWorker(employeeId) {
    if (!confirm(`Delete record for employee ID: ${employeeId}?`)) return;

    try {
        const response = await fetch(`${API_URL}/api/workers/${encodeURIComponent(employeeId)}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            loadWorkers();
        }
    } catch (error) {
        console.error('Error deleting worker:', error);
    }
}

function exportWorkersToCsv() {
    if (!allWorkers || allWorkers.length === 0) {
        alert('No worker records available to export.');
        return;
    }

    const headers = ['Employee ID', 'Name', 'Role', 'Zone', 'Clearance', 'Total Violations', 'Phone', 'Last Active'];
    const rows = allWorkers.map(w => [
        `"${w.employee_id || ''}"`,
        `"${w.name || ''}"`,
        `"${w.role || ''}"`,
        `"${w.zone || ''}"`,
        `"${w.clearance || ''}"`,
        w.total_violations || 0,
        `"${w.phone || ''}"`,
        `"${w.last_seen || ''}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `SafCam_Workforce_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// ==========================================
// 6. Safety Analytics & Reports
// ==========================================

async function loadViolations(isBackground = false) {
    try {
        const res = await fetch(`${API_URL}/api/violations`);
        const data = await res.json();
        if (data.status === 'success' && data.violations) {
            renderViolationTimeline(data.violations);
        }
    } catch (e) {
        console.error('Error loading violations:', e);
    }
}

function renderViolationTimeline(violations) {
    if (!managerLogContainer) return;

    if (!violations || violations.length === 0) {
        managerLogContainer.innerHTML = '<div class="log-empty">No violation incidents recorded yet. All sectors compliant.</div>';
        return;
    }

    managerLogContainer.innerHTML = violations.slice().reverse().map(v => {
        const timeStr = v.timestamp
            ? new Date(v.timestamp).toLocaleString('en-US', {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
              })
            : 'Recent';

        const violationsList = v.violations || [];
        const missingBadges = violationsList.map(item => {
            const type = typeof item === 'string' ? item : (item.type || 'safety_gear');
            const conf = (typeof item === 'object' && item.confidence) ? ` (${item.confidence}%)` : '';
            const label = type === 'missing_helmet' ? '⛑️ No Helmet' : (type === 'missing_vest' ? '🦺 No Vest' : type);
            return `<span class="violation-tag">${escapeHtml(label)}${conf}</span>`;
        }).join(' ');

        const workerName = v.worker_name && v.worker_name !== 'Unknown Worker'
            ? `<span style="color: var(--primary); font-weight: 700; margin-left: 8px;">👷 ${escapeHtml(v.worker_name)}</span>`
            : '';

        const summary = v.summary || 'Safety violation detected - Required PPE missing.';

        return `
            <div class="log-item">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                    <div style="display: flex; align-items: center;">
                        <span class="log-time">${escapeHtml(timeStr)}</span>
                        ${workerName}
                    </div>
                    <span class="cctv-zone-tag">${escapeHtml(v.zone || 'Zone A')}</span>
                </div>
                <div style="font-size: 0.88rem; font-weight: 600; color: var(--light); margin-bottom: 6px;">
                    ${escapeHtml(summary)}
                </div>
                <div class="log-violations">${missingBadges}</div>
            </div>
        `;
    }).join('');
}

async function downloadAuditReportJson() {
    try {
        const res = await fetch(`${API_URL}/api/export-report`);
        const data = await res.json();
        const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(data, null, 2));
        const dlAnchor = document.createElement('a');
        dlAnchor.setAttribute('href', dataStr);
        dlAnchor.setAttribute('download', `SafCam_Site_Compliance_Audit_${new Date().toISOString().slice(0, 10)}.json`);
        document.body.appendChild(dlAnchor);
        dlAnchor.click();
        dlAnchor.remove();
    } catch (e) {
        console.error('Error downloading audit report:', e);
        alert('Failed to generate audit report.');
    }
}

// ==========================================
// 7. Site-Wide PA Voice Broadcast
// ==========================================

async function handleBroadcastSubmit(event) {
    event.preventDefault();
    const message = broadcastMessage.value.trim();
    if (!message) return;

    try {
        // 1. Send to server for backend TTS logging
        await fetch(`${API_URL}/api/broadcast-alert`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message })
        });

        // 2. Speak immediately through browser Web Speech API
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(message);
            utterance.rate = 0.95;
            utterance.pitch = 1.0;
            utterance.volume = 1.0;
            window.speechSynthesis.speak(utterance);
        }

        broadcastModal.classList.remove('active');
        broadcastForm.reset();
        alert('📢 Voice Announcement Broadcasted Successfully!');
    } catch (e) {
        console.error('Broadcast error:', e);
        alert('Broadcast failed. Please check network connection.');
    }
}

/**
 * Utility HTML sanitizer
 */
function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
