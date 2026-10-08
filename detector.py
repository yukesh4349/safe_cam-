# PyTorch-based Safety Detection Module
import torch
import cv2
import numpy as np
import logging

# Ensure compatibility with PyTorch 2.6+ weights_only default change
try:
    _orig_torch_load = torch.load
    def _patched_torch_load(*args, **kwargs):
        if 'weights_only' not in kwargs:
            kwargs['weights_only'] = False
        return _orig_torch_load(*args, **kwargs)
    torch.load = _patched_torch_load
except Exception:
    pass

from ultralytics import YOLO

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class SafetyDetector:
    """
    PyTorch-based safety equipment detector using YOLOv8 + OpenCV Computer Vision
    Accurately detects: person, safety helmet/hard hat, safety high-visibility vest
    """
    
    def __init__(self, model_path='yolov8n.pt', confidence_threshold=0.25):
        """
        Initialize the safety detector
        
        Args:
            model_path: Path to YOLOv8 model weights
            confidence_threshold: Minimum confidence for YOLO person detection
        """
        self.confidence_threshold = confidence_threshold
        
        # Load YOLOv8 model
        try:
            logger.info(f"Loading YOLOv8 model: {model_path}")
            self.model = YOLO(model_path)
            logger.info("Model loaded successfully")
        except Exception as e:
            logger.error(f"Failed to load model: {e}")
            raise
            
        # Load Face Cascade as fallback for close-up webcam framing
        try:
            cascade_path = cv2.data.haarcascades + 'haarcascade_frontalface_default.xml'
            self.face_cascade = cv2.CascadeClassifier(cascade_path)
            logger.info("Face Cascade initialized for webcam upper-body tracking")
        except Exception as e:
            logger.warning(f"Face cascade not loaded: {e}")
            self.face_cascade = None
    
    def detect_safety_equipment(self, image):
        """
        Detect person and analyze safety equipment in image
        
        Args:
            image: numpy array (BGR format from OpenCV)
            
        Returns:
            dict: Detection results with violations and worker details
        """
        try:
            if image is None or image.size == 0:
                return {
                    'workers_detected': 0,
                    'violations': [],
                    'compliance_status': 'compliant',
                    'summary': 'Empty frame received'
                }
                
            img_h, img_w = image.shape[:2]
            persons_boxes = []
            
            # 1. Primary: Run YOLOv8 detection for person class (class 0)
            try:
                results = self.model(image, conf=self.confidence_threshold, verbose=False)
                if len(results) > 0 and results[0].boxes is not None and len(results[0].boxes) > 0:
                    detections = results[0].boxes.data.cpu().numpy()
                    for d in detections:
                        if int(d[5]) == 0:  # class 0 is person
                            x1 = int(max(0, d[0]))
                            y1 = int(max(0, d[1]))
                            x2 = int(min(img_w, d[2]))
                            y2 = int(min(img_h, d[3]))
                            conf = float(d[4])
                            if (x2 - x1) > 30 and (y2 - y1) > 40:
                                persons_boxes.append((x1, y1, x2, y2, conf))
            except Exception as e:
                logger.warning(f"YOLO detection exception: {e}")

            # 2. Secondary: Fallback to Haar Face Cascade if YOLO found 0 persons (e.g. seated close-up at webcam)
            if len(persons_boxes) == 0 and self.face_cascade is not None:
                gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
                faces = self.face_cascade.detectMultiScale(gray, scaleFactor=1.15, minNeighbors=4, minSize=(50, 50))
                for (fx, fy, fw, fh) in faces:
                    # Estimate full upper-body box from face
                    px1 = max(0, int(fx - fw * 0.6))
                    py1 = max(0, int(fy - fh * 0.6))  # Include top of head for helmet
                    px2 = min(img_w, int(fx + fw * 1.6))
                    py2 = min(img_h, int(fy + fh * 3.2))  # Include chest & torso
                    persons_boxes.append((px1, py1, px2, py2, 0.90))

            num_persons = len(persons_boxes)
            
            if num_persons == 0:
                return {
                    'workers_detected': 0,
                    'violations': [],
                    'compliance_status': 'compliant',
                    'summary': 'No workers detected in frame'
                }
            
            # 3. Analyze each detected person for safety equipment
            violations = []
            
            for (x1, y1, x2, y2, conf) in persons_boxes:
                person_region = image[y1:y2, x1:x2]
                
                if person_region.size == 0 or person_region.shape[0] < 20 or person_region.shape[1] < 20:
                    continue
                
                # Check for helmet / hard hat
                has_helmet, helmet_pct = self._detect_helmet(person_region)
                
                # Check for safety vest
                has_vest, vest_pct = self._detect_vest(person_region)
                
                confidence_score = max(80, int(conf * 100))
                
                if not has_helmet:
                    violations.append({
                        'type': 'missing_helmet',
                        'confidence': confidence_score
                    })
                
                if not has_vest:
                    violations.append({
                        'type': 'missing_vest',
                        'confidence': confidence_score
                    })
            
            # Determine compliance status
            compliance_status = 'compliant' if len(violations) == 0 else 'violation'
            
            # Generate summary
            if compliance_status == 'compliant':
                summary = f"All {num_persons} worker(s) wearing safety helmet & safety vest"
            else:
                missing_items = []
                helmet_missing = sum(1 for v in violations if v['type'] == 'missing_helmet')
                vest_missing = sum(1 for v in violations if v['type'] == 'missing_vest')
                if helmet_missing > 0:
                    missing_items.append(f"{helmet_missing} missing helmet(s)")
                if vest_missing > 0:
                    missing_items.append(f"{vest_missing} missing vest(s)")
                summary = f"Safety violation detected: {', '.join(missing_items)}"
            
            return {
                'workers_detected': num_persons,
                'violations': violations,
                'compliance_status': compliance_status,
                'summary': summary
            }
            
        except Exception as e:
            logger.error(f"Detection error: {e}")
            import traceback
            traceback.print_exc()
            return {
                'workers_detected': 0,
                'violations': [],
                'compliance_status': 'error',
                'summary': f'Detection error: {str(e)}'
            }
    
    def _detect_helmet(self, person_region):
        """
        Detect industrial safety helmet / hard hat (Yellow, Orange, Blue, Red, Lime Green).
        Accurately distinguishes bare hair/skin from helmets and ignores white wall backgrounds.
        """
        if person_region.size == 0:
            return False, 0
        
        height, width = person_region.shape[:2]
        # Focus strictly on the central scalp / crown region (avoiding background edges)
        y_start = 0
        y_end = max(10, int(height * 0.35))
        x_start = int(width * 0.20)
        x_end = int(width * 0.80)
        
        head_region = person_region[y_start:y_end, x_start:x_end]
        
        if head_region.size == 0 or head_region.shape[0] < 5 or head_region.shape[1] < 5:
            return False, 0
        
        hsv = cv2.cvtColor(head_region, cv2.COLOR_BGR2HSV)
        total_pixels = head_region.shape[0] * head_region.shape[1]
        
        # 1. Check for natural human hair (black, dark brown) and scalp skin
        dark_hair_mask = cv2.inRange(hsv, np.array([0, 0, 0]), np.array([180, 255, 75]))
        brown_hair_mask = cv2.inRange(hsv, np.array([8, 40, 20]), np.array([25, 180, 100]))
        skin_mask = cv2.inRange(hsv, np.array([0, 30, 50]), np.array([25, 170, 220]))
        
        hair_skin_pixels = np.sum(cv2.bitwise_or(cv2.bitwise_or(dark_hair_mask, brown_hair_mask), skin_mask) > 0)
        hair_skin_pct = (hair_skin_pixels / total_pixels) * 100
        
        # 2. Check for vivid Industrial Safety Hard Hat colors
        # Yellow Hard Hat
        yellow_mask = cv2.inRange(hsv, np.array([18, 80, 80]), np.array([38, 255, 255]))
        # Fluorescent Orange Hard Hat
        orange_mask = cv2.inRange(hsv, np.array([8, 90, 90]), np.array([18, 255, 255]))
        # Safety Blue Hard Hat
        blue_mask = cv2.inRange(hsv, np.array([90, 80, 80]), np.array([130, 255, 255]))
        # Bright Red Hard Hat
        red_mask1 = cv2.inRange(hsv, np.array([0, 90, 90]), np.array([8, 255, 255]))
        red_mask2 = cv2.inRange(hsv, np.array([170, 90, 90]), np.array([180, 255, 255]))
        # Lime / Neon Green Hard Hat
        lime_mask = cv2.inRange(hsv, np.array([38, 80, 80]), np.array([85, 255, 255]))
        
        helmet_mask = cv2.bitwise_or(yellow_mask, orange_mask)
        helmet_mask = cv2.bitwise_or(helmet_mask, blue_mask)
        helmet_mask = cv2.bitwise_or(helmet_mask, red_mask1)
        helmet_mask = cv2.bitwise_or(helmet_mask, red_mask2)
        helmet_mask = cv2.bitwise_or(helmet_mask, lime_mask)
        
        helmet_pixels = np.sum(helmet_mask > 0)
        helmet_pct = (helmet_pixels / total_pixels) * 100
        
        # If head has visible bare hair or skin and low helmet colors -> NO HELMET
        if hair_skin_pct > 18.0 and helmet_pct < 15.0:
            return False, helmet_pct
            
        # Hard hat detected if vivid helmet color covers significant portion of crown
        has_helmet = bool(helmet_pct > 15.0)
        return has_helmet, helmet_pct
    
    def _detect_vest(self, person_region):
        """
        Detect high-visibility safety vest (Neon Yellow/Lime, Safety Orange, Bright Red)
        with reflective strips on the chest/torso.
        Normal casual shirts (black, gray, navy, plain white, dark colors) trigger violation.
        """
        if person_region.size == 0:
            return False, 0
        
        height, width = person_region.shape[:2]
        # Focus on the chest/torso area (middle 60% width)
        y_start = int(height * 0.28)
        y_end = int(height * 0.85)
        x_start = int(width * 0.20)
        x_end = int(width * 0.80)
        
        torso_region = person_region[y_start:y_end, x_start:x_end]
        
        if torso_region.size == 0 or torso_region.shape[0] < 5 or torso_region.shape[1] < 5:
            return False, 0
        
        hsv = cv2.cvtColor(torso_region, cv2.COLOR_BGR2HSV)
        total_pixels = torso_region.shape[0] * torso_region.shape[1]
        
        # Fluorescent Safety Orange Vest
        orange_mask = cv2.inRange(hsv, np.array([9, 85, 85]), np.array([25, 255, 255]))
        # High-Vis Neon Yellow / Lime Green Vest
        lime_yellow_mask = cv2.inRange(hsv, np.array([26, 75, 75]), np.array([85, 255, 255]))
        # High-Vis Bright Red Vest / Lanyard
        red_mask1 = cv2.inRange(hsv, np.array([0, 95, 85]), np.array([9, 255, 255]))
        red_mask2 = cv2.inRange(hsv, np.array([170, 95, 85]), np.array([180, 255, 255]))
        
        # Combine vest masks
        vest_mask = cv2.bitwise_or(orange_mask, lime_yellow_mask)
        vest_mask = cv2.bitwise_or(vest_mask, red_mask1)
        vest_mask = cv2.bitwise_or(vest_mask, red_mask2)
        
        # Calculate percentage of high-visibility vest color in torso region
        vest_pixels = np.sum(vest_mask > 0)
        vest_percentage = (vest_pixels / total_pixels) * 100
        
        # Safety vest must occupy at least 12% of the chest/torso area
        has_vest = bool(vest_percentage > 12.0)
        return has_vest, vest_percentage

# Global detector instance
detector = None

def initialize_detector():
    """Initialize the global detector instance"""
    global detector
    if detector is None:
        detector = SafetyDetector(confidence_threshold=0.25)
    return detector

def analyze_image(image_array):
    """
    Analyze image for safety equipment
    
    Args:
        image_array: numpy array (BGR format)
        
    Returns:
        dict: Detection results
    """
    global detector
    if detector is None:
        detector = initialize_detector()
    
    return detector.detect_safety_equipment(image_array)
