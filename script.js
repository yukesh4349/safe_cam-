// Configuration
const API_URL = window.location.origin || 'http://localhost:5000';
const SCAN_INTERVAL = 500; // 0.5 seconds for real-time accuracy
const ALERT_SOUND = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuBzvLZiTYIGWi77eefTRAMUKfj8LZjHAY4ktfzzHksBSR3x/DdkEAKFF606+uoVRQKRp/g8r5sIQUrgs7y2Ik2CBlou+3nn00QDFCn4/C2YxwGOJLX88x5LAUkd8fw3ZBBChRetevrqFUUCkaf4PK+bCEFK4LO8tmJNggZaLvt559NEAxQp+PwtmMcBjiS1/PMeSwFJHfH8N2QQQoUXrXr66hVFApGn+DyvmwhBSuCzvLZiTYIGWi77eefTRAMUKfj8LZjHAY4ktfzzHksBSR3x/DdkEEKFF616+uoVRQKRp/g8r5sIQUrgs7y2Yk2CBlou+3nn00QDFCn4/C2YxwGOJLX88x5LAUkd8fw3ZBBChRetevrqFUUCkaf4PK+bCEFK4LO8tmJNggZaLvt559NEAxQp+PwtmMcBjiS1/PMeSwFJHfH8N2QQQoUXrXr66hVFApGn+DyvmwhBSuCzvLZiTYIGWi77eefTRAMUKfj8LZjHAY4ktfzzHksBSR3x/DdkEEKFF616+uoVRQKRp/g8rIQU=');

// State
let stream = null;
let isMonitoring = false;
let scanCount = 0;
let violationCount = 0;
let intervalId = null;

// DOM Elements
const videoElement = document.getElementById('videoElement');
const canvasElement = document.getElementById('canvasElement');
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
    updateStatus('Ready', 'success');
    loadViolations();
    updateStats();

    // Check which detector is active
    try {
        const response = await fetch(`${API_URL}/api/health`);
        const data = await response.json();
        if (data.detector) {
            const detectorName = data.detector === 'pytorch' ? '🔥 PyTorch (YOLOv8)' : '📡 Gemini API';
            console.log(`Detector: ${detectorName}`);
            const scanBadge = document.querySelector('.scan-interval span');
            if (scanBadge) {
                scanBadge.textContent = `Scan: 0.5s | ${detectorName}`;
            }
        }
    } catch (e) {
        console.error('Failed to check detector:', e);
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
        return true;
    } catch (error) {
        console.error('Camera error:', error);
        alert('Unable to access camera. Please grant camera permissions.');
        return false;
    }
}

function stopCamera() {
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
        videoElement.srcObject = null;
        stream = null;
    }
}

// Frame Capture & Analysis
function captureFrame() {
    const canvas = canvasElement;
    const video = videoElement;

    if (!video || !video.videoWidth || !video.videoHeight) {
        return null;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);

    return canvas.toDataURL('image/jpeg', 0.8);
}

async function analyzeFrame() {
    if (!isMonitoring) return;

    try {
        const imageData = captureFrame();
        if (!imageData) return;

        console.log('📸 Capturing frame...');
        scanCount++;
        updateScanCount();

        console.log(`🔍 Analyzing frame #${scanCount}...`);

        const response = await fetch(`${API_URL}/api/analyze-frame`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ image: imageData })
        });

        console.log('📡 Response status:', response.status);

        const data = await response.json();
        console.log('📊 Analysis result:', data);

        if (data.status === 'success' && data.result) {
            handleDetectionResult(data.result);
        } else if (data.status === 'error') {
            console.error('❌ API Error:', data.error);
        }
    } catch (error) {
        console.error('❌ Analysis error:', error);
    }
}

function handleDetectionResult(result) {
    console.log('🎯 Detection result:', result);
    console.log('👷 Workers detected:', result.workers_detected);
    console.log('⚠️ Compliance status:', result.compliance_status);

    if (result.compliance_status === 'violation') {
        console.log('🚨 VIOLATION DETECTED!', result.violations);
        showAlert(result);
        playAlertSound();
        speakVoiceAlert(result);
        showNotification(result);
        violationCount++;
        loadViolations();
        updateStats();
    } else {
        console.log('✅ Compliant - All safety gear detected');
        hideAlert();
    }
}

// Alert System
function showAlert(result) {
    alertPanel.classList.add('active');

    const violations = result.violations || [];
    const messages = violations.map(v => {
        if (v.type === 'missing_helmet') return '⛑️ MISSING SAFETY HELMET';
        if (v.type === 'missing_vest') return '🦺 MISSING SAFETY VEST';
        return v.type;
    });

    const alertText = messages.length > 0
        ? messages.join(' | ') + ' - PLEASE WEAR SAFETY GEAR BEFORE STARTING WORK!'
        : result.summary || 'Safety violation detected - Please wear proper safety equipment!';

    alertMessage.textContent = alertText;
}

function hideAlert() {
    alertPanel.classList.remove('active');
}

function playAlertSound() {
    try {
        ALERT_SOUND.currentTime = 0;
        ALERT_SOUND.play().catch(() => { });
    } catch (e) { }
}

let lastVoiceTime = 0;
function speakVoiceAlert(result) {
    if (!('speechSynthesis' in window)) return;
    
    const now = Date.now();
    // 5 second cooldown between voice warnings to avoid spam
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
    const text = `Attention ${workerName}! You are not wearing ${missing.join(' and ')}. Please wear proper safety equipment before starting work.`;
    
    try {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 1.0;
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

    // Start scanning every 0.5 seconds
    intervalId = setInterval(analyzeFrame, SCAN_INTERVAL);
}

function stopMonitoring() {
    isMonitoring = false;
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

    statusText.textContent = text;

    statusDot.style.background =
        type === 'success' ? 'var(--success)' :
            type === 'warning' ? 'var(--warning)' :
                'var(--danger)';
}

function updateScanCount() {
    totalScansEl.textContent = scanCount;
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
    if (violations.length === 0) {
        logContainer.innerHTML = '<div class="log-empty">No violations detected</div>';
        return;
    }

    logContainer.innerHTML = violations.reverse().slice(0, 20).map(v => {
        const date = new Date(v.timestamp);
        const time = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

        const violationTags = v.violations.map(viol => {
            const label = viol.type === 'missing_helmet' ? '⛑️ No Helmet' : '🦺 No Vest';
            const confidence = viol.confidence ? ` (${viol.confidence}%)` : '';
            return `<span class="violation-tag">${label}${confidence}</span>`;
        }).join('');

        const summary = v.summary || 'Safety violation detected';
        const workerInfo = v.workers_detected ? `${v.workers_detected} worker(s) detected` : '';
        const workerName = v.worker_name && v.worker_name !== 'Unknown Worker'
            ? `<div style="font-weight: 700; color: var(--warning); margin: 5px 0;">👷 ${v.worker_name}</div>`
            : '';

        return `
            <div class="log-item">
                <div class="log-time">${dateStr} at ${time}</div>
                ${workerName}
                <div style="font-weight: 600; margin: 5px 0;">${summary}</div>
                ${workerInfo ? `<div style="font-size: 0.9rem; opacity: 0.8;">${workerInfo}</div>` : ''}
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
            totalViolationsEl.textContent = stats.total_violations;
            complianceRateEl.textContent = stats.compliance_rate + '%';
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

// Event Listeners
startBtn.addEventListener('click', startMonitoring);
stopBtn.addEventListener('click', stopMonitoring);
clearBtn.addEventListener('click', clearViolations);

// Initialize on load
init();
