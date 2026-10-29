# Worker, Zone, and Site Map Management System
import json
import os
from datetime import datetime

WORKERS_FILE = 'workers.json'
ZONES_FILE = 'zones.json'
SITE_MAP_FILE = 'site_map.json'

DEFAULT_ZONES = [
    {
        "id": "zone-a",
        "name": "Zone A - Structural Framework",
        "code": "SEC-A1",
        "description": "Main Tower, Core Columns & Scaffolding",
        "risk_level": "High",
        "required_ppe": ["Safety Helmet", "High-Vis Vest", "Safety Boots"],
        "assigned_cameras": ["CAM-01", "CAM-02"],
        "max_capacity": 30,
        "created_at": "2026-01-01T00:00:00"
    },
    {
        "id": "zone-b",
        "name": "Zone B - Heavy Machinery Bay",
        "code": "SEC-B2",
        "description": "Tower Crane, Excavator Lane & Concrete Pump",
        "risk_level": "Critical",
        "required_ppe": ["Safety Helmet", "High-Vis Vest", "Ear Protection"],
        "assigned_cameras": ["CAM-03"],
        "max_capacity": 15,
        "created_at": "2026-01-01T00:00:00"
    },
    {
        "id": "zone-c",
        "name": "Zone C - Excavation Pit",
        "code": "SEC-C3",
        "description": "Deep Basement Trench & Shoring Wall",
        "risk_level": "High",
        "required_ppe": ["Safety Helmet", "High-Vis Vest", "Full Body Harness"],
        "assigned_cameras": ["CAM-04"],
        "max_capacity": 20,
        "created_at": "2026-01-01T00:00:00"
    },
    {
        "id": "zone-d",
        "name": "Zone D - Logistics & Storage",
        "code": "SEC-D4",
        "description": "Rebar, Steel Stockpile & Unloading Depot",
        "risk_level": "Medium",
        "required_ppe": ["Safety Helmet", "High-Vis Vest", "Work Gloves"],
        "assigned_cameras": ["CAM-05"],
        "max_capacity": 40,
        "created_at": "2026-01-01T00:00:00"
    },
    {
        "id": "zone-e",
        "name": "Zone E - Workshop & Fabrication",
        "code": "SEC-E5",
        "description": "Welding Bays, Cutting Station & Assembly",
        "risk_level": "Medium",
        "required_ppe": ["Eye Goggles", "Safety Helmet", "Heat Gloves"],
        "assigned_cameras": ["CAM-06"],
        "max_capacity": 25,
        "created_at": "2026-01-01T00:00:00"
    }
]

# --- WORKER FUNCTIONS ---

def load_workers():
    """Load workers from JSON file"""
    if os.path.exists(WORKERS_FILE):
        try:
            with open(WORKERS_FILE, 'r') as f:
                return json.load(f)
        except:
            return []
    return []

def save_workers(workers):
    """Save workers to JSON file"""
    with open(WORKERS_FILE, 'w') as f:
        json.dump(workers, f, indent=2)

def add_worker(name, employee_id, role='General Worker', zone='Zone A - Structural Framework', phone='', clearance='Certified'):
    """Add or update a worker with full details"""
    workers = load_workers()
    
    for worker in workers:
        if str(worker.get('employee_id')) == str(employee_id):
            return None
    
    new_worker = {
        'id': len(workers) + 1,
        'name': str(name),
        'employee_id': str(employee_id),
        'role': str(role),
        'zone': str(zone),
        'phone': str(phone),
        'clearance': str(clearance),
        'registered_at': datetime.now().isoformat(),
        'total_violations': 0,
        'last_seen': None
    }
    
    workers.append(new_worker)
    save_workers(workers)
    return new_worker

def get_worker_by_id(employee_id):
    """Get worker by employee ID"""
    workers = load_workers()
    for worker in workers:
        if str(worker.get('employee_id')) == str(employee_id):
            return worker
    return None

def get_all_workers():
    """Get all registered workers"""
    return load_workers()

def update_worker_violation(employee_id):
    """Increment worker's violation count"""
    workers = load_workers()
    for worker in workers:
        if str(worker.get('employee_id')) == str(employee_id):
            worker['total_violations'] = worker.get('total_violations', 0) + 1
            worker['last_seen'] = datetime.now().isoformat()
            save_workers(workers)
            return worker
    return None

def delete_worker(employee_id):
    """Delete a worker"""
    workers = load_workers()
    workers = [w for w in workers if str(w.get('employee_id')) != str(employee_id)]
    save_workers(workers)
    return True

def get_worker_stats():
    """Get aggregate and zone-based worker statistics"""
    workers = load_workers()
    zones = load_zones()
    
    zone_counts = {}
    for z in zones:
        zone_counts[z['name']] = 0
        
    for w in workers:
        z = w.get('zone', 'Zone A - Structural Framework')
        zone_counts[z] = zone_counts.get(z, 0) + 1
        
    return {
        'total_workers': len(workers),
        'active_today': sum(1 for w in workers if w.get('last_seen')),
        'total_violations': sum(w.get('total_violations', 0) for w in workers),
        'zone_distribution': zone_counts
    }

# --- ZONE MANAGEMENT FUNCTIONS ---

def load_zones():
    """Load zones from JSON file or initialize with defaults"""
    if os.path.exists(ZONES_FILE):
        try:
            with open(ZONES_FILE, 'r') as f:
                zones = json.load(f)
                if zones and len(zones) > 0:
                    return zones
        except:
            pass
    save_zones(DEFAULT_ZONES)
    return DEFAULT_ZONES

def save_zones(zones):
    """Save zones to JSON file"""
    with open(ZONES_FILE, 'w') as f:
        json.dump(zones, f, indent=2)

def add_or_update_zone(zone_data):
    """Add a new zone or update existing one"""
    zones = load_zones()
    zone_id = zone_data.get('id')
    
    if not zone_id:
        zone_id = f"zone-{len(zones) + 1}"
        zone_data['id'] = zone_id
        
    updated = False
    for i, z in enumerate(zones):
        if z.get('id') == zone_id:
            zones[i] = {**z, **zone_data, 'updated_at': datetime.now().isoformat()}
            updated = True
            break
            
    if not updated:
        zone_data['created_at'] = datetime.now().isoformat()
        zones.append(zone_data)
        
    save_zones(zones)
    return zone_data

def delete_zone(zone_id):
    """Delete a zone by ID"""
    zones = load_zones()
    zones = [z for z in zones if str(z.get('id')) != str(zone_id)]
    save_zones(zones)
    return True

# --- SITE MAP & BLUEPRINT FUNCTIONS ---

DEFAULT_MAP_PINS = [
    {"id": "cam1", "name": "CAM-01 (Main Gate)", "zone": "Zone A", "x": 18.5, "y": 82.0, "status": "active"},
    {"id": "cam2", "name": "CAM-02 (Tower Scaffolding)", "zone": "Zone A", "x": 35.0, "y": 28.0, "status": "active"},
    {"id": "cam3", "name": "CAM-03 (Machinery Bay)", "zone": "Zone B", "x": 68.0, "y": 32.0, "status": "active"},
    {"id": "cam4", "name": "CAM-04 (Excavation Pit)", "zone": "Zone C", "x": 78.0, "y": 72.0, "status": "active"},
    {"id": "cam5", "name": "CAM-05 (Logistics Depot)", "zone": "Zone D", "x": 42.0, "y": 75.0, "status": "active"},
    {"id": "cam6", "name": "CAM-06 (Fabrication Bay)", "zone": "Zone E", "x": 22.0, "y": 45.0, "status": "active"}
]

def load_site_map():
    """Load site map metadata and camera pin positions"""
    if os.path.exists(SITE_MAP_FILE):
        try:
            with open(SITE_MAP_FILE, 'r') as f:
                return json.load(f)
        except:
            pass
    default_data = {
        "map_image": None,
        "pins": DEFAULT_MAP_PINS,
        "updated_at": datetime.now().isoformat()
    }
    save_site_map(default_data)
    return default_data

def save_site_map(data):
    """Save site map metadata and camera pins"""
    with open(SITE_MAP_FILE, 'w') as f:
        json.dump(data, f, indent=2)
