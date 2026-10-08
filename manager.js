// SafCam Manager Portal Controller
const API_URL = window.location.origin || 'http://localhost:5000';

// Global State
let allWorkers = [];
let cam1Stream = null;
let cam1Monitoring = false;
let cam1Interval = null;
let simCamerasActive = { 2: true, 3: true, 4: true, 5: true, 6: true };
let simAnimationIds = {};

// DOM Elements
const liveClockEl = document.getElementById('liveClock');
const totalWorkersEl = document.getElementById('totalWorkers');
const totalWorkerViolationsEl = document.getElementById('totalWorkerViolations');
const addWorkerForm = document.getElementById('addWorkerForm');
const workersTableBody = document.getElementById('workersTableBody');
const refreshBtn = document.getElementById('refreshBtn');
const tableSearchInput = document.getElementById('tableSearchInput');
const roleFilterSelect = document.getElementById('roleFilterSelect');
const zoneFilterSelect = document.getElementById('zoneFilterSelect');
const cameraZoneFilter = document.getElementById('cameraZoneFilter');
const startAllCamerasBtn = document.getElementById('startAllCamerasBtn');
const stopAllCamerasBtn = document.getElementById('stopAllCamerasBtn');

// Broadcast Modal Elements
const broadcastModalBtn = document.getElementById('broadcastModalBtn');
const broadcastModal = document.getElementById('broadcastModal');
const closeBroadcastModal = document.getElementById('closeBroadcastModal');
const cancelBroadcastBtn = document.getElementById('cancelBroadcastBtn');
const broadcastForm = document.getElementById('broadcastForm');
const broadcastPreset = document.getElementById('broadcastPreset');
const broadcastMessage = document.getElementById('broadcastMessage');

// Camera 1 Elements
const videoElementManager = document.getElementById('videoElementManager');
const canvasElementManager = document.getElementById('canvasElementManager');
const cam1ToggleBtn = document.getElementById('cam1ToggleBtn');
const cam1RecBadge = document.getElementById('cam1RecBadge');
const cam1StatusBadge = document.getElementById('cam1StatusBadge');
const camCard1 = document.getElementById('camCard1');

// Initialize on Load
document.addEventListener('DOMContentLoaded', () => {
    initClock();
    loadWorkers();
    initSimulatedCCTVs();
    initEventListeners();
});

/**
 * Real-time Digital Clock
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
 * Event Listeners Initialization
 */
function initEventListeners() {
    if (refreshBtn) refreshBtn.addEventListener('click', loadWorkers);
    if (addWorkerForm) addWorkerForm.addEventListener('submit', handleAddWorker);
    
    if (tableSearchInput) tableSearchInput.addEventListener('input', filterAndRenderWorkers);
    if (roleFilterSelect) roleFilterSelect.addEventListener('change', filterAndRenderWorkers);
    if (zoneFilterSelect) zoneFilterSelect.addEventListener('change', filterAndRenderWorkers);
    
    if (cameraZoneFilter) cameraZoneFilter.addEventListener('change', handleCameraZoneFilter);
    if (startAllCamerasBtn) startAllCamerasBtn.addEventListener('click', startAllCameras);
    if (stopAllCamerasBtn) stopAllCamerasBtn.addEventListener('click', stopAllCameras);
    
    // Broadcast Modal
    if (broadcastModalBtn) {
        broadcastModalBtn.addEventListener('click', () => {
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
    if (broadcastForm) {
        broadcastForm.addEventListener('submit', handleBroadcastSubmit);
    }
}

/**
 * Fetch and display all registered workers & statistics
 */
async function loadWorkers() {
    try {
        const response = await fetch(`${API_URL}/api/workers`);
        const data = await response.json();

        if (data.status === 'success') {
            allWorkers = data.workers || [];
            updateStatsOverview(data.stats);
            filterAndRenderWorkers();
        }
    } catch (error) {
        console.error('Error fetching workers:', error);
    }
}

/**
 * Update stats and zone distribution
 */
function updateStatsOverview(stats) {
    if (!stats) return;
    if (totalWorkersEl) totalWorkersEl.textContent = stats.total_workers || 0;
    if (totalWorkerViolationsEl) totalWorkerViolationsEl.textContent = stats.total_violations || 0;
    
    // Zone workers distribution
    const zoneDist = stats.zone_distribution || {};
    const za = document.getElementById('zoneAWorkers');
    const zb = document.getElementById('zoneBWorkers');
    const zc = document.getElementById('zoneCWorkers');
    const zd = document.getElementById('zoneDWorkers');
    const ze = document.getElementById('zoneEWorkers');
    
    if (za) za.innerHTML = `Workers: <strong>${zoneDist['Zone A - Structural Framework'] || 0}</strong>`;
    if (zb) zb.innerHTML = `Workers: <strong>${zoneDist['Zone B - Heavy Machinery Bay'] || 0}</strong>`;
    if (zc) zc.innerHTML = `Workers: <strong>${zoneDist['Zone C - Excavation Pit'] || 0}</strong>`;
    if (zd) zd.innerHTML = `Workers: <strong>${zoneDist['Zone D - Logistics & Storage'] || 0}</strong>`;
    if (ze) ze.innerHTML = `Workers: <strong>${zoneDist['Zone E - Workshop & Fabrication'] || 0}</strong>`;
}

/**
 * Filter & Render Workforce Table
 */
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

/**
 * Handle Employee Registration
 */
async function handleAddWorker(event) {
    event.preventDefault();

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
            body: JSON.stringify({
                name,
                employee_id,
                role,
                zone,
                phone,
                clearance
            })
        });

        const data = await response.json();

        if (response.ok && data.status === 'success') {
            addWorkerForm.reset();
            loadWorkers();
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

/**
 * Delete Worker
 */
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

/**
 * Emergency Broadcast Submit Handler
 */
async function handleBroadcastSubmit(event) {
    event.preventDefault();
    const message = broadcastMessage.value.trim();
    if (!message) return;

    try {
        // 1. Send to server for backend TTS
        await fetch(`${API_URL}/api/broadcast-alert`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message })
        });

        // 2. Speak directly in browser
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(message);
            utterance.rate = 1.0;
            utterance.pitch = 1.0;
            utterance.volume = 1.0;
            window.speechSynthesis.speak(utterance);
        }

        broadcastModal.classList.remove('active');
        broadcastForm.reset();
        alert('📢 Voice Announcement Broadcasted Successfully!');
    } catch (e) {
        console.error('Broadcast error:', e);
    }
}

/**
 * Camera 1 (WebRTC Live Stream) Controls
 */
async function toggleCamera(camId) {
    if (cam1Monitoring) {
        stopCam1();
    } else {
        await startCam1();
    }
}

async function startCam1() {
    try {
        cam1Stream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }
        });
        videoElementManager.srcObject = cam1Stream;
        cam1Monitoring = true;
        
        cam1ToggleBtn.textContent = 'Pause Stream';
        cam1ToggleBtn.className = 'cctv-controls-btn cctv-stop-btn';
        cam1RecBadge.className = 'rec-badge';
        cam1StatusBadge.textContent = 'Scanning...';
        cam1StatusBadge.className = 'cctv-status-badge status-compliant-badge';
        camCard1.classList.add('active-monitoring');

        // Start real-time analysis loop
        cam1Interval = setInterval(analyzeCam1Frame, 600);
    } catch (e) {
        console.error('Camera 1 error:', e);
        alert('Unable to access webcam. Please check browser permissions.');
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
    cam1ToggleBtn.textContent = 'Start Stream';
    cam1ToggleBtn.className = 'cctv-controls-btn cctv-start-btn';
    cam1RecBadge.className = 'rec-badge idle-rec';
    cam1StatusBadge.textContent = 'Paused';
    cam1StatusBadge.className = 'cctv-status-badge status-idle-badge';
    camCard1.classList.remove('active-monitoring', 'violation-alert');
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
                cam1StatusBadge.textContent = '⚠️ PPE Violation';
                cam1StatusBadge.className = 'cctv-status-badge status-violation-badge';
                camCard1.classList.add('violation-alert');
            } else {
                cam1StatusBadge.textContent = '✅ All Gear Compliant';
                cam1StatusBadge.className = 'cctv-status-badge status-compliant-badge';
                camCard1.classList.remove('violation-alert');
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
            // Draw paused screen
            ctx.fillStyle = '#06060c';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#555';
            ctx.font = '14px Inter, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(`CAM-0${cfg.id} PAUSED`, canvas.width / 2, canvas.height / 2);
            return;
        }

        tick += 0.03;
        ctx.fillStyle = '#0d0f1a';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Grid lines (CCTV perspective)
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

        // Draw animated workers with bounding boxes
        for (let i = 0; i < cfg.workerCount; i++) {
            const baseX = 80 + i * 150 + Math.sin(tick + i) * 20;
            const baseY = 80 + Math.cos(tick * 0.8 + i) * 10;
            const boxW = 65;
            const boxH = 120;

            // Worker silhouette
            ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
            ctx.beginPath();
            ctx.arc(baseX + boxW / 2, baseY + 18, 12, 0, Math.PI * 2); // head
            ctx.fill();
            
            // Hard hat on silhouette
            ctx.fillStyle = cfg.color;
            ctx.beginPath();
            ctx.arc(baseX + boxW / 2, baseY + 14, 13, Math.PI, 0);
            ctx.fill();

            // Torso
            ctx.fillRect(baseX + 15, baseY + 32, boxW - 30, 48);
            // High-vis stripes
            ctx.fillStyle = '#fff';
            ctx.fillRect(baseX + 15, baseY + 45, boxW - 30, 4);
            ctx.fillRect(baseX + 15, baseY + 60, boxW - 30, 4);

            // Legs
            ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
            ctx.fillRect(baseX + 18, baseY + 80, 10, 35);
            ctx.fillRect(baseX + boxW - 28, baseY + 80, 10, 35);

            // AI Bounding Box
            ctx.strokeStyle = '#06d6a0';
            ctx.lineWidth = 1.5;
            ctx.strokeRect(baseX, baseY, boxW, boxH);

            // AI Tag
            ctx.fillStyle = '#06d6a0';
            ctx.fillRect(baseX, baseY - 16, boxW, 14);
            ctx.fillStyle = '#000';
            ctx.font = 'bold 9px monospace';
            ctx.textAlign = 'left';
            ctx.fillText(`PPE OK 98%`, baseX + 3, baseY - 5);
        }

        // Crosshairs overlay
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.beginPath();
        ctx.moveTo(canvas.width / 2 - 15, canvas.height / 2);
        ctx.lineTo(canvas.width / 2 + 15, canvas.height / 2);
        ctx.moveTo(canvas.width / 2, canvas.height / 2 - 15);
        ctx.lineTo(canvas.width / 2, canvas.height / 2 + 15);
        ctx.stroke();

        // Scanline bar animation
        const scanY = (Math.sin(tick * 2) * 0.5 + 0.5) * canvas.height;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
        ctx.fillRect(0, scanY, canvas.width, 15);

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
}

/**
 * Master Camera Controls
 */
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
}

/**
 * Filter CCTV Grid by Zone
 */
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

/**
 * Helper to escape HTML strings
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
