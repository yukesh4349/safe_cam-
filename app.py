from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import google.generativeai as genai
import os
import json
import base64
from datetime import datetime
from PIL import Image
import io
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

app = Flask(__name__, static_folder='.')
CORS(app)

import time

# Configure Gemini API (fallback)
GEMINI_API_KEY = os.getenv('GEMINI_API_KEY', '')
GEMINI_API_KEY_1 = os.getenv('GEMINI_API_KEY_1', '')
GEMINI_API_KEY_2 = os.getenv('GEMINI_API_KEY_2', '')

if GEMINI_API_KEY and not GEMINI_API_KEY.startswith('your_'):
    try:
        genai.configure(api_key=GEMINI_API_KEY)
        model = genai.GenerativeModel('gemini-1.5-flash')
    except Exception as e:
        print(f"⚠️ Gemini configuration warning: {e}")
        model = None
else:
    model = None

last_violation_time = 0

# Initialize PyTorch detector
# Note: PyTorch YOLOv8 is trained on REAL safety helmets and vests
# It will NOT detect caps/lanyards - only actual safety equipment
try:
    from detector import initialize_detector, analyze_image
    pytorch_detector = initialize_detector()
    USE_PYTORCH = True
    print("✅ PyTorch detector initialized successfully")
    print("⚠️ Note: PyTorch detects REAL safety helmets/vests only")
except Exception as e:
    print(f"⚠️ PyTorch detector not available: {e}")
    print("📡 Falling back to Gemini API")
    USE_PYTORCH = False
    pytorch_detector = None

# Initialize Voice Alert System
try:
    from voice_alerts import initialize_voice_system, announce_violation
    voice_system = initialize_voice_system(GEMINI_API_KEY_1, GEMINI_API_KEY_2)
    print("✅ Voice alert system initialized")
except Exception as e:
    print(f"⚠️ Voice system not available: {e}")
    voice_system = None
    announce_violation = None

# Import Worker Management
try:
    import worker_manager
    print("✅ Worker management system loaded")
except Exception as e:
    print(f"⚠️ Worker management not available: {e}")
    worker_manager = None

# Violations storage
VIOLATIONS_FILE = 'violations.json'

def load_violations():
    """Load violations from JSON file"""
    if os.path.exists(VIOLATIONS_FILE):
        try:
            with open(VIOLATIONS_FILE, 'r') as f:
                return json.load(f)
        except:
            return []
    return []

def save_violations(violations):
    """Save violations to JSON file"""
    with open(VIOLATIONS_FILE, 'w') as f:
        json.dump(violations, f, indent=2)

@app.route('/')
def index():
    """Serve the main dashboard"""
    return send_from_directory('.', 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    """Serve static files"""
    return send_from_directory('.', path)

@app.route('/api/analyze-frame', methods=['POST'])
def analyze_frame():
    """Analyze a video frame for safety violations"""
    try:
        data = request.json
        image_data = data.get('image', '')
        
        if not image_data:
            return jsonify({'error': 'No image data provided'}), 400

        # Remove data URL prefix if present
        if ',' in image_data:
            image_data = image_data.split(',')[1]

        # Decode base64 image
        image_bytes = base64.b64decode(image_data)
        image = Image.open(io.BytesIO(image_bytes))
        
        # Periodic garbage collection to maintain lean memory
        global frame_counter
        if 'frame_counter' not in globals():
            frame_counter = 0
        frame_counter += 1
        if frame_counter % 30 == 0:
            import gc
            gc.collect()

        # Try PyTorch detector first
        if USE_PYTORCH and pytorch_detector:
            try:
                # Convert PIL to numpy array for PyTorch
                import cv2
                import numpy as np
                image_np = np.array(image)
                image_bgr = cv2.cvtColor(image_np, cv2.COLOR_RGB2BGR)
                
                # Analyze with PyTorch
                result = analyze_image(image_bgr)
                print(f"🔥 PyTorch Detection: {result}")
                
                del image_np, image_bgr
            except Exception as e:
                print(f"PyTorch detection failed: {e}, falling back to Gemini")
                result = None
        else:
            result = None
        
        # Fallback to Gemini if PyTorch failed or not available
        if result is None:
            if not model:
                return jsonify({
                    'error': 'No detection method available (PyTorch failed, Gemini not configured)',
                    'status': 'error'
                }), 500

            # Optimized prompt for fast, accurate detection (TESTING MODE)
            prompt = """You are a safety compliance detector. Analyze this image CAREFULLY.

YOUR TASK:
Look at the PERSON in the image and check if they are wearing BOTH items:
1. A CAP/HAT on their HEAD
2. A LANYARD/ID CARD around their NECK

STRICT DETECTION RULES:

✅ CAP/HAT Detection:
- Look at the person's HEAD
- Is there a cap, hat, or head covering VISIBLE on their head?
- If YES → Helmet present
- If NO or UNCLEAR → Missing helmet (VIOLATION)

✅ LANYARD/ID CARD Detection:
- Look at the person's NECK and CHEST area
- Is there a lanyard, ID card strap, or neck strap VISIBLE?
- If YES → Vest present  
- If NO or UNCLEAR → Missing vest (VIOLATION)

IMPORTANT RULES:
- Both items MUST be clearly visible to be compliant
- If you cannot see the cap on the head → VIOLATION
- If you cannot see the lanyard around neck → VIOLATION
- Ignore objects on desks, tables, or background
- Only items WORN by the person count

RESPONSE FORMAT (JSON only, no markdown):
{
  "workers_detected": <number>,
  "violations": [{"type": "missing_helmet", "confidence": 95}, {"type": "missing_vest", "confidence": 95}],
  "compliance_status": "violation or compliant",
  "summary": "Describe what you see on the person"
}

EXAMPLES:
- Person with cap on head + lanyard around neck = {"violations": [], "compliance_status": "compliant"}
- Person WITHOUT cap on head = {"violations": [{"type": "missing_helmet", "confidence": 95}], "compliance_status": "violation"}
- Person WITHOUT lanyard around neck = {"violations": [{"type": "missing_vest", "confidence": 95}], "compliance_status": "violation"}
- Person with NEITHER = {"violations": [{"type": "missing_helmet", "confidence": 95}, {"type": "missing_vest", "confidence": 95}], "compliance_status": "violation"}

BE STRICT: If you don't clearly see both items worn by the person, report violations."""

            # Load reference images if available
            reference_images = []
            reference_dir = 'reference_images'
            
            if os.path.exists(reference_dir):
                # Try to load lanyard reference
                lanyard_path = os.path.join(reference_dir, 'lanyard.jpg')
                if os.path.exists(lanyard_path):
                    try:
                        ref_lanyard = Image.open(lanyard_path)
                        reference_images.append(ref_lanyard)
                        prompt += "\n\nREFERENCE: The first reference image shows the EXACT lanyard/ID card to look for."
                    except:
                        pass
                
                # Try to load cap reference
                cap_path = os.path.join(reference_dir, 'cap.jpg')
                if os.path.exists(cap_path):
                    try:
                        ref_cap = Image.open(cap_path)
                        reference_images.append(ref_cap)
                        prompt += "\n\nREFERENCE: The second reference image shows the EXACT cap to look for."
                    except:
                        pass

            # Generate response using Gemini Vision with reference images
            if reference_images:
                # Include reference images in the analysis
                content_parts = [prompt] + reference_images + [image]
                response = model.generate_content(content_parts)
            else:
                # No reference images, use standard detection
                response = model.generate_content([prompt, image])
            response_text = response.text.strip()
            
            # Clean response - remove markdown code blocks if present
            if response_text.startswith('```'):
                response_text = response_text.split('\n', 1)[1]
                response_text = response_text.rsplit('```', 1)[0]
            
            response_text = response_text.strip()
            
            # Parse JSON response
            try:
                result = json.loads(response_text)
                print(f"📡 Gemini Detection: {result}")
            except json.JSONDecodeError:
                # Fallback parsing if JSON is malformed
                result = {
                    'workers_detected': 0,
                    'violations': [],
                    'compliance_status': 'error',
                    'summary': 'Unable to parse AI response'
                }

        # Log violations if detected (with a 3-second cooldown to prevent log flooding)
        global last_violation_time
        now_ts = time.time()
        if result.get('compliance_status') == 'violation' and result.get('violations'):
            if (now_ts - last_violation_time) >= 3.0:
                last_violation_time = now_ts
                violations = load_violations()
                
                # Get worker name from request (if provided)
                worker_id = data.get('worker_id', None)
                worker_name = 'Unknown Worker'
                
                if worker_id and worker_manager:
                    worker = worker_manager.get_worker_by_id(worker_id)
                    if worker:
                        worker_name = worker['name']
                        worker_manager.update_worker_violation(worker_id)
                
                violation_entry = {
                    'timestamp': datetime.now().isoformat(),
                    'violations': result['violations'],
                    'workers_detected': result.get('workers_detected', 0),
                    'summary': result.get('summary', ''),
                    'worker_name': worker_name,
                    'worker_id': worker_id,
                    'image': f"data:image/jpeg;base64,{image_data[:1000]}"  # Store thumbnail
                }
                violations.append(violation_entry)
                
                # Keep only last 100 violations
                if len(violations) > 100:
                    violations = violations[-100:]
                
                save_violations(violations)
                
                # Trigger voice alert
                if announce_violation:
                    announce_violation(worker_name, result['violations'])

        return jsonify({
            'status': 'success',
            'result': result,
            'detector': 'pytorch' if USE_PYTORCH else 'gemini',
            'timestamp': datetime.now().isoformat()
        })

    except Exception as e:
        print(f"Error analyzing frame: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'error': str(e),
            'status': 'error'
        }), 500

@app.route('/api/violations', methods=['GET'])
def get_violations():
    """Get violation history"""
    try:
        violations = load_violations()
        return jsonify({
            'status': 'success',
            'violations': violations,
            'total': len(violations)
        })
    except Exception as e:
        return jsonify({
            'error': str(e),
            'status': 'error'
        }), 500

@app.route('/api/stats', methods=['GET'])
def get_stats():
    """Get real-time statistics"""
    try:
        violations = load_violations()
        
        total_violations = len(violations)
        helmet_violations = sum(1 for v in violations if any(viol['type'] == 'missing_helmet' for viol in v.get('violations', [])))
        vest_violations = sum(1 for v in violations if any(viol['type'] == 'missing_vest' for viol in v.get('violations', [])))
        
        # Calculate compliance rate (assuming 1 scan per violation for simplicity)
        total_scans = total_violations + max(total_violations // 2, 10)  # Estimate
        compliance_rate = ((total_scans - total_violations) / total_scans * 100) if total_scans > 0 else 100
        
        return jsonify({
            'status': 'success',
            'stats': {
                'total_violations': total_violations,
                'helmet_violations': helmet_violations,
                'vest_violations': vest_violations,
                'compliance_rate': round(compliance_rate, 1),
                'total_scans': total_scans
            }
        })
    except Exception as e:
        return jsonify({
            'error': str(e),
            'status': 'error'
        }), 500

@app.route('/api/clear-violations', methods=['POST'])
def clear_violations():
    """Clear all violation logs"""
    try:
        save_violations([])
        return jsonify({
            'status': 'success',
            'message': 'Violations cleared'
        })
    except Exception as e:
        return jsonify({
            'error': str(e),
            'status': 'error'
        }), 500

@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'detector': 'pytorch' if USE_PYTORCH else 'gemini',
        'pytorch_available': USE_PYTORCH,
        'gemini_configured': bool(GEMINI_API_KEY),
        'voice_enabled': voice_system is not None,
        'timestamp': datetime.now().isoformat()
    })

# Worker Management Endpoints
@app.route('/api/workers', methods=['GET'])
def get_workers():
    """Get all workers"""
    if not worker_manager:
        return jsonify({'error': 'Worker management not available'}), 500
    
    try:
        workers = worker_manager.get_all_workers()
        stats = worker_manager.get_worker_stats()
        return jsonify({
            'status': 'success',
            'workers': workers,
            'stats': stats
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/workers', methods=['POST'])
def add_worker_endpoint():
    """Add a new worker with rich details"""
    if not worker_manager:
        return jsonify({'error': 'Worker management not available'}), 500
    
    try:
        data = request.json
        name = data.get('name')
        employee_id = data.get('employee_id')
        role = data.get('role', 'General Worker')
        zone = data.get('zone', 'Zone A - Structural Framework')
        phone = data.get('phone', '')
        clearance = data.get('clearance', 'Certified')
        
        if not name or not employee_id:
            return jsonify({'error': 'Name and employee_id required'}), 400
        
        worker = worker_manager.add_worker(
            name=name,
            employee_id=employee_id,
            role=role,
            zone=zone,
            phone=phone,
            clearance=clearance
        )
        
        if worker is None:
            return jsonify({'error': 'Worker already exists'}), 409
        
        return jsonify({
            'status': 'success',
            'worker': worker
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/workers/<employee_id>', methods=['DELETE'])
def delete_worker_endpoint(employee_id):
    """Delete a worker"""
    if not worker_manager:
        return jsonify({'error': 'Worker management not available'}), 500
    
    try:
        worker_manager.delete_worker(employee_id)
        return jsonify({
            'status': 'success',
            'message': 'Worker deleted'
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/broadcast-alert', methods=['POST'])
def broadcast_alert():
    """Broadcast manager safety announcement / siren via TTS"""
    try:
        data = request.json or {}
        message = data.get('message', 'Attention all personnel on site! Safety inspection in progress. Ensure full PPE compliance immediately.')
        
        if voice_system and hasattr(voice_system, 'speak'):
            voice_system.speak(message)
            
        return jsonify({
            'status': 'success',
            'message': 'Broadcast sent successfully',
            'timestamp': datetime.now().isoformat()
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# --- ZONE MANAGEMENT ENDPOINTS ---
@app.route('/api/zones', methods=['GET'])
def get_zones_endpoint():
    """Get all safety zones"""
    if not worker_manager:
        return jsonify({'error': 'Worker/Zone manager not available'}), 500
    try:
        zones = worker_manager.load_zones()
        return jsonify({
            'status': 'success',
            'zones': zones
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/zones', methods=['POST'])
def save_zone_endpoint():
    """Add or update a safety zone"""
    if not worker_manager:
        return jsonify({'error': 'Worker/Zone manager not available'}), 500
    try:
        data = request.json
        if not data or not data.get('name'):
            return jsonify({'error': 'Zone name is required'}), 400
        saved_zone = worker_manager.add_or_update_zone(data)
        return jsonify({
            'status': 'success',
            'zone': saved_zone
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/zones/<zone_id>', methods=['DELETE'])
def delete_zone_endpoint(zone_id):
    """Delete a safety zone"""
    if not worker_manager:
        return jsonify({'error': 'Worker/Zone manager not available'}), 500
    try:
        worker_manager.delete_zone(zone_id)
        return jsonify({
            'status': 'success',
            'message': 'Zone deleted'
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# --- SITE MAP & BLUEPRINT ENDPOINTS ---
@app.route('/api/site-map', methods=['GET'])
def get_site_map_endpoint():
    """Get site map data and camera pin positions"""
    if not worker_manager:
        return jsonify({'error': 'Site map manager not available'}), 500
    try:
        site_map = worker_manager.load_site_map()
        return jsonify({
            'status': 'success',
            'site_map': site_map
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/site-map', methods=['POST'])
def save_site_map_endpoint():
    """Save site map data (pins and/or uploaded floorplan map)"""
    if not worker_manager:
        return jsonify({'error': 'Site map manager not available'}), 500
    try:
        data = request.json or {}
        worker_manager.save_site_map(data)
        return jsonify({
            'status': 'success',
            'message': 'Site map updated successfully'
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# --- COMPLIANCE REPORT EXPORT ---
@app.route('/api/export-report', methods=['GET'])
def export_report_endpoint():
    """Export complete site compliance report data"""
    try:
        violations = load_violations()
        workers = worker_manager.get_all_workers() if worker_manager else []
        zones = worker_manager.load_zones() if worker_manager else []
        stats = worker_manager.get_worker_stats() if worker_manager else {}
        
        return jsonify({
            'status': 'success',
            'generated_at': datetime.now().isoformat(),
            'site_summary': {
                'total_workers': len(workers),
                'total_zones': len(zones),
                'total_violations_recorded': len(violations)
            },
            'zones': zones,
            'workers': workers,
            'violations': violations
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/manager')
def manager_dashboard():
    """Serve manager dashboard"""
    return send_from_directory('.', 'manager.html')

if __name__ == '__main__':
    print("🚀 SafCam Server Starting...")
    print(f"📊 Dashboard: http://localhost:5000")
    print(f"🛡️ Manager Portal: http://localhost:5000/manager")
    print(f"🔥 Detector: {'PyTorch (YOLOv8)' if USE_PYTORCH else 'Gemini API'}")
    print(f"🔑 Gemini Fallback: {'Available' if GEMINI_API_KEY else 'Not configured'}")
    app.run(debug=True, host='0.0.0.0', port=5000)
