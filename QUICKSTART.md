# 🚀 SafCam Quick Start Guide

## Prerequisites

Before starting, make sure you have:
- ✅ Python 3.8+ installed
- ✅ Webcam/camera available
- ✅ 2 Gemini API keys (get free keys at https://makersuite.google.com/app/apikey)

---

## Step 1: Install Dependencies

Open terminal in the project folder and run:

```bash
pip install -r requirements.txt
```

This installs:
- Flask (web server)
- Google Generative AI (Gemini API)
- Pygame (audio playback)
- OpenCV, Pillow (image processing)
- Other required packages

---

## Step 2: Configure API Keys

1. **Copy the example environment file:**
   ```bash
   cp .env.example .env
   ```

2. **Edit `.env` file and add your API keys:**
   ```bash
   # For vision detection
   GEMINI_API_KEY=your_gemini_api_key_here
   
   # For voice alerts (TTS rotation)
   GEMINI_API_KEY_1=your_first_gemini_api_key
   GEMINI_API_KEY_2=your_second_gemini_api_key
   ```

   > **Note:** You can use the same API key for all three if you only have one key. The rotation will still work.

---

## Step 3: Start the Server

Run the Flask server:

```bash
python app.py
```

You should see:
```
🚀 SafCam Server Starting...
📊 Dashboard: http://localhost:5000
✅ Gemini Voice alert system initialized with 2 API key(s)
```

---

## Step 4: Open the Dashboard

Open your browser and navigate to:
- **Main Dashboard:** http://localhost:5000
- **Manager Portal:** http://localhost:5000/manager.html (optional - for worker management)

---

## Step 5: Start Monitoring

1. Click **"Start Monitoring"** button
2. **Allow camera access** when prompted by browser
3. System will start analyzing frames every 0.5 seconds

---

## 🧪 Testing Mode

The system is configured in **TESTING MODE** for easy demonstration:

| What It Detects | What You Need |
|----------------|---------------|
| Safety Helmet | **Normal cap or hat** |
| Safety Vest | **ID card tag (lanyard)** |

### Test Scenarios:

#### ✅ Compliant (No Violation)
- Wear a **cap/hat** on your head
- Wear an **ID card tag** around your neck
- Result: No alerts, green status

#### ⚠️ Violation Detected
- Remove your **cap** or **ID card**
- Result: 
  - Red alert panel appears
  - Voice announcement: "Attention! Worker not wearing safety helmet/safety vest"
  - Violation logged with timestamp
  - Statistics updated

---

## What Happens During Detection

### When Violation Detected:

1. **Visual Alert:** Red panel with violation message
2. **Voice Alert:** Announces "Worker not wearing safety helmet/safety vest"
3. **Console Logs:** Shows API key rotation
   ```
   🔑 Using API key 1/2 for TTS
   ================================================================================
   🔊 VOICE ALERT: Attention! Worker not wearing safety helmet...
   ================================================================================
   ```
4. **Violation Log:** Saved with timestamp, confidence scores, and worker info
5. **Statistics Update:** Total violations and compliance rate updated

---

## Dashboard Features

### Main Dashboard (/)
- **Live camera feed** with real-time analysis
- **Violation alerts** with sound and visual warnings
- **Statistics cards:** Total scans, violations, compliance rate
- **Violation log:** Recent violations with timestamps and details

### Manager Portal (/manager.html)
- **Register workers** with name, employee ID, and role
- **Track violations** per worker
- **View worker statistics**
- **Manage worker database**

---

## Monitoring the System

### Browser Console (F12)
Watch for these logs:
- `📸 Capturing frame...` - Frame captured
- `🔍 Analyzing frame...` - Sending to AI
- `📊 Analysis result:` - AI detection response
- `🚨 VIOLATION DETECTED!` - When safety gear missing
- `✅ Compliant` - When all gear present

### Terminal/Server Logs
Watch for:
- `🔑 Using API key 1/2 for TTS` - API rotation working
- `🔊 VOICE ALERT: ...` - Voice announcements
- `📡 Gemini Detection: ...` - Vision API results
- API request logs

---

## Troubleshooting

### Issue: "No Gemini API keys provided for TTS"
- **Fix:** Add `GEMINI_API_KEY_1` and `GEMINI_API_KEY_2` to `.env` file
- Restart the server

### Issue: Camera not working
- Grant camera permissions in browser
- Check if another app is using the camera
- Try Chrome browser (recommended)

### Issue: No voice alerts
- Check that pygame is installed: `pip install pygame`
- Check terminal for voice system initialization message
- Verify API keys are configured in `.env`

### Issue: Detection not accurate
- Ensure good lighting
- Position cap/ID card clearly in camera view
- Wait 0.5 seconds between frames for analysis

### Issue: Slow analysis
- Normal: 1-2 seconds per frame (Gemini API processing)
- Check internet connection
- Reduce scan interval if needed (edit `SCAN_INTERVAL` in `script.js`)

---

## API Key Rotation

The system automatically rotates between 2 API keys for voice alerts:

```
Violation 1 → API Key 1
Violation 2 → API Key 2
Violation 3 → API Key 1
Violation 4 → API Key 2
...continues rotating
```

This helps:
- Distribute API load
- Avoid rate limits
- Ensure continuous operation

---

## Important Notes

- ⏱️ System scans every **0.5 seconds** for real-time monitoring
- 💾 Violations saved to `violations.json` (last 100 kept)
- 🔊 Voice alerts use **Gemini API** with key rotation
- 🎯 Detection uses **Gemini Vision API** for image analysis
- 🧪 **Testing mode:** Detects caps and ID cards instead of actual safety gear
- 📢 Voice announces **"safety helmet"** and **"safety vest"** (professional terminology)

---

## Next Steps

1. ✅ Test with different scenarios (with/without cap and ID card)
2. ✅ Register workers in Manager Portal
3. ✅ Monitor violation logs and statistics
4. ✅ Adjust settings as needed
5. ✅ When ready, switch to production mode (update detection prompt for real helmets/vests)

---

**Ready to start!** 🚀

1. Make sure API keys are in `.env`
2. Run `python app.py`
3. Open http://localhost:5000
4. Click "Start Monitoring"
5. Test with cap and ID card!
