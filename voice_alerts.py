# Voice Alert System with Beep and Text-to-Speech
import pyttsx3
import threading
import winsound
import time

class VoiceAlertSystem:
    """
    Text-to-speech voice alert system with beep sound
    """
    
    def __init__(self):
        """Initialize the voice engine"""
        self.engine = None
        self.enabled = False
        self.last_announcement_time = 0  # Track last announcement time
        self.cooldown_seconds = 5  # Minimum seconds between announcements (5-6 seconds)
        self.beep_volume = 0.5  # Beep volume (50%)
        self._initialize_engine()
        
    def _initialize_engine(self):
        """Initialize pyttsx3 engine"""
        try:
            self.engine = pyttsx3.init()
            
            # Configure voice properties
            self.engine.setProperty('rate', 160)  # Speed of speech
            self.engine.setProperty('volume', 1.0)  # Volume at maximum (100%)
            
            # Try to set a clear voice
            voices = self.engine.getProperty('voices')
            if voices:
                # Prefer female voice if available (usually clearer)
                for voice in voices:
                    if 'female' in voice.name.lower() or 'zira' in voice.name.lower():
                        self.engine.setProperty('voice', voice.id)
                        break
            
            self.enabled = True
            print("✅ Voice alert system initialized")
            
        except Exception as e:
            print(f"⚠️ Voice system initialization failed: {e}")
            self.engine = None
            self.enabled = False
    
    def _play_beep(self):
        """Play a short beep sound before voice alert"""
        try:
            winsound.Beep(900, 300)  # 900 Hz for 300ms
        except Exception as e:
            print(f"Beep error: {e}")
    
    def speak(self, text):
        """
        Speak the given text with beep sound
        
        Args:
            text: Text to speak
        """
        if not self.enabled or not self.engine:
            print(f"🔊 Voice (disabled): {text}")
            return
        
        # Check cooldown to prevent announcement spam
        current_time = time.time()
        if current_time - self.last_announcement_time < self.cooldown_seconds:
            print(f"⏳ Voice cooldown active, skipping announcement")
            return
        
        # Update last announcement time
        self.last_announcement_time = current_time
        
        try:
            # Run in separate thread to avoid blocking
            thread = threading.Thread(target=self._speak_thread, args=(text,))
            thread.daemon = True
            thread.start()
        except Exception as e:
            print(f"Voice error: {e}")
    
    def _speak_thread(self, text):
        """Thread function to play beep and speak text with thread-safe COM init"""
        try:
            # Print the alert message
            print("=" * 80)
            print(f"🔊 VOICE ALERT: {text}")
            print("=" * 80)
            
            # Play short beep first
            self._play_beep()
            time.sleep(0.1)
            
            # Initialize COM for this thread on Windows
            try:
                import pythoncom
                pythoncom.CoInitialize()
            except Exception:
                pass
            
            # Initialize pyttsx3 engine safely inside worker thread
            try:
                engine = pyttsx3.init()
                engine.setProperty('rate', 155)
                engine.setProperty('volume', 1.0)
                
                # Try setting clear voice
                try:
                    voices = engine.getProperty('voices')
                    if voices:
                        for v in voices:
                            if 'female' in v.name.lower() or 'zira' in v.name.lower():
                                engine.setProperty('voice', v.id)
                                break
                except Exception:
                    pass
                
                engine.say(text)
                engine.runAndWait()
                engine.stop()
                del engine
            except Exception as e:
                print(f"⚠️ pyttsx3 speak error: {e}")
            finally:
                try:
                    import pythoncom
                    pythoncom.CoUninitialize()
                except Exception:
                    pass
            
        except Exception as e:
            print(f"Speech thread error: {e}")
    
    def alert_violation(self, worker_name, violations):
        """
        Announce safety violation with worker name
        
        Args:
            worker_name: Name of the worker
            violations: List of violation dicts
        """
        if not violations:
            return
        
        # Build violation message (use proper safety equipment names)
        violation_types = []
        for v in violations:
            if v['type'] == 'missing_helmet':
                violation_types.append('safety helmet')
            elif v['type'] == 'missing_vest':
                violation_types.append('safety vest')
        
        if not violation_types:
            return
        
        # Create personalized message
        if worker_name and worker_name != 'Unknown Worker':
            message = f"Attention {worker_name}! You are not wearing {' and '.join(violation_types)}. Please wear proper safety equipment before starting work."
        else:
            message = f"Attention! Worker not wearing {' and '.join(violation_types)}. Please wear proper safety equipment before starting work."
        
        self.speak(message)
    
    def alert_compliance(self, worker_name):
        """
        Announce compliance (optional, can be disabled to reduce noise)
        
        Args:
            worker_name: Name of the worker
        """
        if worker_name and worker_name != 'Unknown Worker':
            message = f"Thank you {worker_name}. All safety equipment detected. You may proceed."
        else:
            message = "All safety equipment detected. Worker may proceed."
        
        print(f"🔊 Voice Alert: {message}")
        # Uncomment to enable compliance announcements
        # self.speak(message)

# Global voice system instance
voice_system = None

def initialize_voice_system(api_key_1=None, api_key_2=None):
    """
    Initialize the global voice system
    
    Args:
        api_key_1: Not used (kept for compatibility)
        api_key_2: Not used (kept for compatibility)
    """
    global voice_system
    if voice_system is None:
        voice_system = VoiceAlertSystem()
    return voice_system

def announce_violation(worker_name, violations):
    """
    Announce violation via voice
    
    Args:
        worker_name: Name of worker
        violations: List of violations
    """
    global voice_system
    if voice_system is None:
        # Initialize if not already initialized
        voice_system = VoiceAlertSystem()
    
    if voice_system:
        voice_system.alert_violation(worker_name, violations)
