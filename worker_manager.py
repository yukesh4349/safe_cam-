# Worker Management System
import json
import os
from datetime import datetime

WORKERS_FILE = 'workers.json'

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
    """
    Add a new worker with role, zone assignment, and clearance status
    
    Args:
        name: Worker's full name
        employee_id: Unique employee ID
        role: Job role (e.g., General Worker, Site Supervisor, Safety Engineer, etc.)
        zone: Assigned safety zone
        phone: Emergency contact number
        clearance: Safety clearance level
        
    Returns:
        dict: Worker object or None if already exists
    """
    workers = load_workers()
    
    # Check if worker already exists
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
    
    # Zone counts
    zone_counts = {}
    for w in workers:
        z = w.get('zone', 'Zone A - Structural Framework')
        zone_counts[z] = zone_counts.get(z, 0) + 1
        
    return {
        'total_workers': len(workers),
        'active_today': sum(1 for w in workers if w.get('last_seen')),
        'total_violations': sum(w.get('total_violations', 0) for w in workers),
        'zone_distribution': zone_counts
    }
