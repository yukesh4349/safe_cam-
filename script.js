// Configuration
const API_URL = window.location.origin || 'http://localhost:5000';
const SCAN_INTERVAL = 600; // Optimal 600ms interval for stable AI throughput
const ALERT_SOUND = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuBzvLZiTYIGWi77eefTRAMUKfj8LZjHAY4ktfzzHksBSR3x/DdkEAKFF606+uoVRQKRp/g8r5sIQUrgs7y2Ik2CBlou+3nn00QDFCn4/C2YxwGOJLX88x5LAUkd8fw3ZBBChRetevrqFUUCkaf4PK+bCEFK4LO8tmJNggZaLvt559NEAxQp+PwtmMcBjiS1/PMeSwFJHfH8N2QQQoUXrXr66hVFApGn+DyvmwhBSuCzvLZiTYIGWi77eefTRAMUKfj8LZjHAY4ktfzzHksBSR3x/DdkEEKFF616+uoVRQKRp/g8r5sIQUrgs7y2Yk2CBlou+3nn00QDFCn4/C2YxwGOJLX88x5LAUkd8fw3ZBBChRetevrqFUUCkaf4PK+bCEFK4LO8tmJNggZaLvt559NEAxQp+PwtmMcBjiS1/PMeSwFJHfH8N2QQQoUXrXr66hVFApGn+DyvmwhBSuCzvLZiTYIGWi77eefTRAMUKfj8LZjHAY4ktfzzHksBSR3x/DdkEEKFF616+uoVRQKRp/g8rIQU=');

// State
let stream = null;
let isMonitoring = false;
let isAnalyzing = false; // Lock to prevent request queue buildup
let scanCount = 0;
let violationCount = 0;
let intervalId = null;
let lastLogRefreshTime = 0;

// DOM Elements
const videoElement = document.getElementById('videoElement');
const canvasElement = document.getElementById('canvasElement');
const overlayCanvas = document.getElementById('overlayCanvas');
const cameraPlaceholder = document.getElementById('cameraPlaceholder');
const feedBadge = document.getElementById('feedBadge');
const feedStatusText = document.getElementById('feedStatusText');
const feedHudBanner = document.getElementById('feedHudBanner');
const feedHudBannerText = document.getElementById('feedHudBannerText');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const alertPanel = document.getElementById('alertPanel');
const alertMessage = document.getElementById('alertMessage');
const statusIndicator = document.getElementById('statusIndicator');
const logContainer = document.getElementById('logContainer');
const clearBtn = document.getElementById('clearBtn');
const totalScansEl = document.getElementById('totalScans');
const totalViolationsEl = document.getElementById('totalViolations');
const complianceRateEl = document.getElementById('complianceRate');

// Initialize
async function init() {
    updateStatus('System Ready', 'success');
    loadViolations();
    updateStats();

    // Check which detector is active
    try {
        const response = await fetch(`${API_URL}/api/health`);
        const data = await response.json();
        if (data.detector) {
            const detectorName = data.detector === 'pytorch' ? '🔥 PyTorch (YOLOv8)' : '📡 Gemini API';
            console.log(`Active Detector: ${detectorName}`);
            const scanBadge = document.querySelector('.scan-interval span');
            if (scanBadge) {
                scanBadge.textContent = `Scan: 0.6s | ${detectorName}`;
            }
        }
    } catch (e) {
        console.error('Failed to check detector health:', e);
    }

    // Request notification permission
    if ('Notification' in window) {
        Notification.requestPermission();
    }
}

// Camera Management
async function startCamera() {
    try {
        stream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                facingMode: 'user'
            }
        });

        videoElement.srcObject = stream;

        // Hide standby placeholder and show live indicators
        if (cameraPlaceholder) cameraPlaceholder.style.display = 'none';
        if (feedBadge) feedBadge.classList.add('monitoring');
        if (feedStatusText) feedStatusText.textContent = 'OPTICAL SCANNING';

        return true;
    } catch (error) {
        console.error('Camera error:', error);
        alert('Unable to access camera. Please grant camera permissions in your browser.');
        return false;
    }
}

function stopCamera() {
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
        videoElement.srcObject = null;
        stream = null;
    }

    // Restore standby placeholder
    if (cameraPlaceholder) cameraPlaceholder.style.display = 'flex';
    if (feedBadge) feedBadge.classList.remove('monitoring');
    if (feedStatusText) feedStatusText.textContent = 'STANDBY';
    if (feedHudBanner) feedHudBanner.classList.remove('active');

    // Clear overlay canvas
    clearHUD();
}

// Frame Capture & Analysis
function captureFrame() {
    const canvas = canvasElement;
    const video = videoElement;

    if (!video || !video.videoWidth || !video.videoHeight) {
        return null;
    }

    // Capture at efficient 640x360 or native aspect ratio for lightning fast AI processing
    const targetW = 640;
    const targetH = Math.round((video.videoHeight / video.videoWidth) * targetW);

    canvas.width = targetW;
    canvas.height = targetH;

    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, targetW, targetH);

    return canvas.toDataURL('image/jpeg', 0.82);
}

async function analyzeFrame() {
    // Prevent overlapping concurrent requests
    if (!isMonitoring || isAnalyzing) return;
    isAnalyzing = true;

    try {
        const imageData = captureFrame();
        if (!imageData) {
            isAnalyzing = false;
            return;
        }

        scanCount++;
        updateScanCount();

        const response = await fetch(`${API_URL}/api/analyze-frame`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ image: imageData })
        });

        if (!response.ok) {
            console.warn(`Analysis HTTP error: ${response.status}`);
            isAnalyzing = false;
            return;
        }

        const data = await response.json();

        if (data.status === 'success' && data.result) {
            handleDetectionResult(data.result);
        } else if (data.status === 'error') {
            console.error('API Error:', data.error);
        }
    } catch (error) {
        console.error('Analysis error:', error);
    } finally {
        isAnalyzing = false;
    }
}

function handleDetectionResult(result) {
    // Draw real-time HUD bounding boxes on the overlay canvas
    drawHUD(result.workers || []);

    if (result.compliance_status === 'violation') {
        showAlert(result);
        playAlertSound();
        speakVoiceAlert(result);
        showNotification(result);

        const now = Date.now();
        // Refresh violations log & stats at most once every 3 seconds to prevent UI jitter
        if (now - lastLogRefreshTime >= 3000) {
            lastLogRefreshTime = now;
            loadViolations();
            updateStats();
        }
    } else {
        hideAlert();
        if (feedStatusText) {
            feedStatusText.textContent = result.workers_detected > 0
                ? `COMPLIANT (${result.workers_detected} WORKER${result.workers_detected > 1 ? 'S' : ''})`
                : 'MONITORING // CLEAR';
        }
    }
}

// Real-Time HUD Bounding Box Rendering
function drawHUD(workers) {
    if (!overlayCanvas) return;

    // Match overlay canvas size to container's display dimensions
    const container = overlayCanvas.parentElement;
    const rect = container.getBoundingClientRect();

    if (overlayCanvas.width !== rect.width || overlayCanvas.height !== rect.height) {
        overlayCanvas.width = rect.width;
        overlayCanvas.height = rect.height;
    }

    const ctx = overlayCanvas.getContext('2d');
    ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

    if (!workers || workers.length === 0) {
        return;
    }

    const canvasW = overlayCanvas.width;
    const canvasH = overlayCanvas.height;

    workers.forEach(w => {
        if (!w.box) return;

        // Bounding box in display coordinates
        const x1 = w.box[0] * canvasW;
        const y1 = w.box[1] * canvasH;
        const x2 = w.box[2] * canvasW;
        const y2 = w.box[3] * canvasH;
        const bw = x2 - x1;
        const bh = y2 - y1;

        const isCompliant = w.status === 'compliant';
        const color = isCompliant ? '#10b981' : '#ef233c'; // Emerald or Bright Red
        const glowColor = isCompliant ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 35, 60, 0.5)';

        ctx.save();

        // Box border with glow
        ctx.strokeStyle = color;
        ctx.lineWidth = 2.5;
        ctx.shadowColor = glowColor;
        ctx.shadowBlur = 10;
        ctx.strokeRect(x1, y1, bw, bh);

        // Cyber corner brackets for premium sci-fi aesthetic
        const cornerLen = Math.min(18, bw / 4, bh / 4);
        ctx.lineWidth = 4;
        ctx.beginPath();
        // Top Left
        ctx.moveTo(x1, y1 + cornerLen);
        ctx.lineTo(x1, y1);
        ctx.lineTo(x1 + cornerLen, y1);
        // Top Right
        ctx.moveTo(x2 - cornerLen, y1);
        ctx.lineTo(x2, y1);
        ctx.lineTo(x2, y1 + cornerLen);
        // Bottom Left
        ctx.moveTo(x1, y2 - cornerLen);
        ctx.lineTo(x1, y2);
        ctx.lineTo(x1 + cornerLen, y2);
        // Bottom Right
        ctx.moveTo(x2 - cornerLen, y2);
        ctx.lineTo(x2, y2);
        ctx.lineTo(x2, y2 - cornerLen);
        ctx.stroke();

        // Worker Label Tag
        const labelText = isCompliant
            ? `✓ WORKER #${w.id} [COMPLIANT]`
            : `⚠️ WORKER #${w.id} [VIOLATION]`;

        const detailsText = isCompliant
            ? `⛑️ HELMET: OK  🦺 VEST: OK`
            : `${!w.has_helmet ? '❌ NO HELMET  ' : '⛑️ HELMET OK  '}${!w.has_vest ? '❌ NO VEST' : '🦺 VEST OK'}`;

        ctx.font = 'bold 11px "JetBrains Mono", monospace';
        const textWidth = Math.max(ctx.measureText(labelText).width, ctx.measureText(detailsText).width) + 16;
        const tagH = 34;
        const tagY = Math.max(0, y1 - tagH - 4);

        // Tag background
        ctx.fillStyle = isCompliant ? 'rgba(6, 78, 59, 0.92)' : 'rgba(127, 29, 29, 0.92)';
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.shadowBlur = 4;
        ctx.fillRect(x1, tagY, textWidth, tagH);
        ctx.strokeRect(x1, tagY, textWidth, tagH);

        // Tag text
        ctx.fillStyle = '#ffffff';
        ctx.shadowBlur = 0;
        ctx.fillText(labelText, x1 + 8, tagY + 14);

        ctx.font = '10px "Inter", sans-serif';
        ctx.fillStyle = isCompliant ? '#a7f3d0' : '#fecdd3';
        ctx.fillText(detailsText, x1 + 8, tagY + 28);

        ctx.restore();
    });
}

function clearHUD() {
    if (!overlayCanvas) return;
    const ctx = overlayCanvas.getContext('2d');
    ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
}

// Alert System
function showAlert(result) {
    if (alertPanel) alertPanel.classList.add('active');

    const violations = result.violations || [];
    const messages = [];

    const hasNoHelmet = violations.some(v => v.type === 'missing_helmet');
    const hasNoVest = violations.some(v => v.type === 'missing_vest');

    if (hasNoHelmet) messages.push('⛑️ MISSING SAFETY HELMET');
    if (hasNoVest) messages.push('🦺 MISSING SAFETY VEST');

    const alertText = messages.length > 0
        ? messages.join(' | ') + ' - MUST WEAR SAFETY EQUIPMENT!'
        : result.summary || 'Safety violation detected!';

    if (alertMessage) alertMessage.textContent = alertText;

    // Show floating in-feed HUD ribbon
    if (feedHudBanner) {
        feedHudBanner.classList.add('active');
        if (feedHudBannerText) {
            feedHudBannerText.textContent = messages.length > 0
                ? `VIOLATION: ${messages.join(' & ')}`
                : 'SAFETY VIOLATION DETECTED';
        }
    }

    if (feedStatusText) {
        feedStatusText.textContent = `⚠️ VIOLATION DETECTED (${violations.length})`;
    }
}

function hideAlert() {
    if (alertPanel) alertPanel.classList.remove('active');
    if (feedHudBanner) feedHudBanner.classList.remove('active');
}

let lastChimeTime = 0;
function playAlertSound() {
    const now = Date.now();
    // 3 second sound cooldown to prevent ear fatigue
    if (now - lastChimeTime < 3000) return;
    lastChimeTime = now;

    try {
        ALERT_SOUND.currentTime = 0;
        ALERT_SOUND.play().catch(() => { });
    } catch (e) { }
}

let lastVoiceTime = 0;
function speakVoiceAlert(result) {
    if (!('speechSynthesis' in window)) return;

    const now = Date.now();
    // 5-second cooldown between voice warnings to avoid spam
    if (now - lastVoiceTime < 5000) {
        return;
    }
    lastVoiceTime = now;

    const violations = result.violations || [];
    const missing = [];
    if (violations.some(v => v.type === 'missing_helmet')) missing.push('safety helmet');
    if (violations.some(v => v.type === 'missing_vest')) missing.push('safety vest');

    if (missing.length === 0) return;

    const workerName = result.worker_name && result.worker_name !== 'Unknown Worker' ? result.worker_name : 'Worker';
    const text = `Attention ${workerName}! You are not wearing ${missing.join(' and ')}. Please wear proper safety gear immediately.`;

    try {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 1.02;
        utterance.pitch = 1.0;
        utterance.volume = 1.0;
        window.speechSynthesis.speak(utterance);
    } catch (e) {
        console.error('Speech synthesis error:', e);
    }
}

function showNotification(result) {
    if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('⚠️ Safety Violation Detected', {
            body: result.summary || 'Safety gear missing',
            icon: '🏗️',
            requireInteraction: false
        });
    }
}

// Monitoring Control
async function startMonitoring() {
    const cameraStarted = await startCamera();
    if (!cameraStarted) return;

    isMonitoring = true;
    startBtn.disabled = true;
    stopBtn.disabled = false;
    updateStatus('Monitoring Active', 'success');

    // Start scanning interval
    intervalId = setInterval(analyzeFrame, SCAN_INTERVAL);
}

function stopMonitoring() {
    isMonitoring = false;
    isAnalyzing = false;
    startBtn.disabled = false;
    stopBtn.disabled = true;
    updateStatus('Monitoring Stopped', 'warning');

    if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
    }

    stopCamera();
    hideAlert();
}

// UI Updates
function updateStatus(text, type) {
    const statusText = statusIndicator.querySelector('.status-text');
    const statusDot = statusIndicator.querySelector('.status-dot');

    if (statusText) statusText.textContent = text;
    if (statusDot) {
        statusDot.style.background =
            type === 'success' ? 'var(--success)' :
                type === 'warning' ? 'var(--warning)' :
                    'var(--danger)';
    }
}

function updateScanCount() {
    if (totalScansEl) totalScansEl.textContent = scanCount;
}

async function loadViolations() {
    try {
        const response = await fetch(`${API_URL}/api/violations`);
        const data = await response.json();

        if (data.status === 'success') {
            displayViolations(data.violations);
        }
    } catch (error) {
        console.error('Error loading violations:', error);
    }
}

function displayViolations(violations) {
    if (!logContainer) return;

    if (!violations || violations.length === 0) {
        logContainer.innerHTML = '<div class="log-empty">No violations detected</div>';
        return;
    }

    logContainer.innerHTML = violations.slice().reverse().slice(0, 30).map(v => {
        const date = v.timestamp ? new Date(v.timestamp) : new Date();
        const time = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

        const violationTags = (v.violations || []).map(viol => {
            const type = typeof viol === 'string' ? viol : (viol.type || 'safety_gear');
            const label = type === 'missing_helmet' ? '⛑️ No Helmet' : (type === 'missing_vest' ? '🦺 No Vest' : type);
            const confidence = (typeof viol === 'object' && viol.confidence) ? ` (${viol.confidence}%)` : '';
            return `<span class="violation-tag">${label}${confidence}</span>`;
        }).join('');

        const summary = v.summary || 'Safety violation detected';
        const workerInfo = v.workers_detected ? `${v.workers_detected} worker(s) in frame` : '';
        const workerName = v.worker_name && v.worker_name !== 'Unknown Worker'
            ? `<div style="font-weight: 700; color: var(--primary); margin: 3px 0;">👷 ${v.worker_name}</div>`
            : '';

        return `
            <div class="log-item">
                <div class="log-time">${dateStr} at ${time}</div>
                ${workerName}
                <div style="font-weight: 600; margin: 4px 0; color: var(--light); font-size: 0.88rem;">${summary}</div>
                ${workerInfo ? `<div style="font-size: 0.78rem; opacity: 0.8; margin-bottom: 4px;">${workerInfo}</div>` : ''}
                <div class="log-violations">${violationTags}</div>
            </div>
        `;
    }).join('');
}

async function updateStats() {
    try {
        const response = await fetch(`${API_URL}/api/stats`);
        const data = await response.json();

        if (data.status === 'success') {
            const stats = data.stats;
            if (totalViolationsEl) totalViolationsEl.textContent = stats.total_violations;
            if (complianceRateEl) complianceRateEl.textContent = stats.compliance_rate + '%';
        }
    } catch (error) {
        console.error('Error updating stats:', error);
    }
}

async function clearViolations() {
    if (!confirm('Clear all violation logs?')) return;

    try {
        await fetch(`${API_URL}/api/clear-violations`, { method: 'POST' });
        scanCount = 0;
        violationCount = 0;
        loadViolations();
        updateStats();
        updateScanCount();
    } catch (error) {
        console.error('Error clearing violations:', error);
    }
}

// Window resize handler to keep overlay canvas in exact sync
window.addEventListener('resize', () => {
    if (overlayCanvas) {
        const container = overlayCanvas.parentElement;
        const rect = container.getBoundingClientRect();
        overlayCanvas.width = rect.width;
        overlayCanvas.height = rect.height;
    }
});

// Event Listeners
startBtn.addEventListener('click', startMonitoring);
stopBtn.addEventListener('click', stopMonitoring);
clearBtn.addEventListener('click', clearViolations);

// Initialize on load
init();
