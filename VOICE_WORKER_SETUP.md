# 🔊 Voice Alerts & Worker Management Setup

## New Features Added

### 1. 🔊 Voice Alert System (pyttsx3)
- **Personalized announcements** with worker names
- **Real-time voice warnings** when violations detected
- **Clear instructions** to wear safety equipment

### 2. 👷 Worker Management Dashboard
- **Register workers** with names and employee IDs
- **Track violations** per worker
- **Manager dashboard** at http://localhost:5000/manager
- **Voice alerts** use worker names when available

---

## Installation

### Step 1: Install pyttsx3

```bash
pip install pyttsx3
```

**OR** install all requirements:

```bash
pip install -r requirements.txt
```

### Step 2: Restart Server

Stop the current server (Ctrl+C) and restart:

```bash
python app.py
```

You should see:
```
✅ PyTorch detector initialized successfully
✅ Voice alert system initialized
✅ Worker management system loaded
```

---

## How It Works

### Voice Alerts

When a violation is detected:

**With Registered Worker:**
> "Attention John Smith! You are not wearing safety helmet and safety vest. Please wear proper safety equipment before starting work."

**Without Worker Registration:**
> "Attention! Worker not wearing safety helmet and safety vest. Please wear proper safety equipment before starting work."

### Worker Management

1. **Register Workers** at http://localhost:5000/manager
2. **Add worker details**: Name, Employee ID, Role
3. **Track violations** automatically
4. **View statistics**: Total workers, active today, violations

---

## Usage

### Register a Worker

1. Open **Manager Dashboard**: http://localhost:5000/manager
2. Fill in the form:
   - **Full Name**: e.g., "John Smith"
   - **Employee ID**: e.g., "EMP001"
   - **Role**: Worker, Supervisor, Engineer, or Operator
3. Click **"Add Worker"**

### Monitor with Worker Names

Currently, violations are logged with "Unknown Worker" since we don't have face recognition yet.

**Future Enhancement**: Integrate face recognition to automatically identify workers and use their registered names in voice alerts.

---

## Testing Voice Alerts

### Test 1: Violation Without Worker
1. Start monitoring on main dashboard
2. Trigger a violation (no helmet/vest)
3. **Hear**: "Attention! Worker not wearing safety helmet..."

### Test 2: Check Voice System
Open browser console and check for:
```
✅ Voice alert system initialized
🔊 Voice Alert: Attention! Worker not wearing...
```

---

## Manager Dashboard Features

### Worker Statistics
- **Total Workers**: Number of registered workers
- **Active Today**: Workers detected today
- **Total Violations**: Sum of all worker violations

### Worker Table
- View all registered workers
- See violation counts per worker
- Last seen timestamp
- Delete workers

---

## API Endpoints

### Worker Management

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/workers` | GET | Get all workers |
| `/api/workers` | POST | Add new worker |
| `/api/workers/<id>` | DELETE | Delete worker |
| `/manager` | GET | Manager dashboard |

### Example: Add Worker via API

```bash
curl -X POST http://localhost:5000/api/workers \
  -H "Content-Type: application/json" \
  -d '{"name":"John Smith","employee_id":"EMP001","role":"Worker"}'
```

---

## Troubleshooting

### Issue: No voice alerts

**Check 1**: Verify voice system initialized
```
✅ Voice alert system initialized
```

**Check 2**: Check system audio
- Ensure speakers/headphones connected
- Volume not muted

**Check 3**: Windows specific
```bash
pip install pywin32
```

### Issue: Voice too fast/slow

Edit `voice_alerts.py` line 21:
```python
self.engine.setProperty('rate', 150)  # Adjust speed (100-200)
```

### Issue: Worker not found in alerts

Workers are currently logged as "Unknown Worker" because:
- No face recognition integrated yet
- Manual worker ID assignment not implemented in live monitoring

**Solution**: Future enhancement to add face recognition or manual worker selection.

---

## File Structure

```
safcam/
├── voice_alerts.py        # Voice alert system
├── worker_manager.py      # Worker CRUD operations
├── workers.json           # Worker database
├── manager.html           # Manager dashboard UI
├── manager.js             # Manager dashboard logic
└── app.py                 # Updated with voice & worker APIs
```

---

## Next Steps

1. ✅ Install pyttsx3
2. ✅ Restart server
3. ✅ Register workers at /manager
4. ✅ Test voice alerts
5. 🚀 Optional: Add face recognition for automatic worker identification

---

**Voice alerts are now active!** The system will announce violations in real-time 🔊
