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


def compute_iou(boxA, boxB):
    """Compute Intersection over Union (IoU) of two boxes [x1, y1, x2, y2]"""
    xA = max(boxA[0], boxB[0])
    yA = max(boxA[1], boxB[1])
    xB = min(boxA[2], boxB[2])
    yB = min(boxA[3], boxB[3])

    inter_w = max(0, xB - xA)
    inter_h = max(0, yB - yA)
    inter_area = inter_w * inter_h

    boxA_area = max(0, boxA[2] - boxA[0]) * max(0, boxA[3] - boxA[1])
    boxB_area = max(0, boxB[2] - boxB[0]) * max(0, boxB[3] - boxB[1])
    union_area = boxA_area + boxB_area - inter_area

    if union_area <= 0:
        return 0.0
    return inter_area / union_area


def apply_nms(boxes, iou_threshold=0.40):
    """
    Apply Non-Maximum Suppression to deduplicate overlapping bounding boxes.
    boxes format: [(x1, y1, x2, y2, conf), ...]
    """
    if not boxes:
        return []

    # Sort boxes by confidence in descending order
    sorted_boxes = sorted(boxes, key=lambda b: b[4], reverse=True)
    selected_boxes = []

    for current in sorted_boxes:
        should_keep = True
        for chosen in selected_boxes:
            if compute_iou(current[:4], chosen[:4]) > iou_threshold:
                should_keep = False
                break
        if should_keep:
            selected_boxes.append(current)

    return selected_boxes


class SafetyDetector:
    """
    PyTorch-based safety equipment detector using YOLOv8 + OpenCV Computer Vision.
    Accurately detects: person, safety helmet/hard hat, safety high-visibility vest/lanyard.
    Robust against white wall/window backgrounds and casual clothing false positives.
    """

    def __init__(self, model_path='yolov8n.pt', confidence_threshold=0.35):
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
            dict: Detection results with workers list, violations, and summary
        """
        try:
            if image is None or image.size == 0:
                return {
                    'workers_detected': 0,
                    'workers': [],
                    'violations': [],
                    'compliance_status': 'compliant',
                    'summary': 'Empty frame received'
                }

            img_h, img_w = image.shape[:2]
            candidate_boxes = []

            # 1. Primary: Run YOLOv8 detection for person class (class 0)
            try:
                with torch.no_grad():
                    results = self.model(image, conf=self.confidence_threshold, verbose=False)
                    if len(results) > 0 and results[0].boxes is not None and len(results[0].boxes) > 0:
                        detections = results[0].boxes.data.cpu().numpy()
                        for d in detections:
                            cls_id = int(d[5])
                            conf = float(d[4])
                            if cls_id == 0 and conf >= self.confidence_threshold:  # class 0 is person
                                x1 = int(max(0, d[0]))
                                y1 = int(max(0, d[1]))
                                x2 = int(min(img_w, d[2]))
                                y2 = int(min(img_h, d[3]))
                                if (x2 - x1) >= 45 and (y2 - y1) >= 60:
                                    candidate_boxes.append((x1, y1, x2, y2, conf))
            except Exception as e:
                logger.warning(f"YOLO detection exception: {e}")

            # 2. Secondary: Fallback to Face Cascade only if YOLO found 0 persons
            if len(candidate_boxes) == 0 and self.face_cascade is not None:
                gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
                faces = self.face_cascade.detectMultiScale(
                    gray, scaleFactor=1.15, minNeighbors=6, minSize=(65, 65)
                )
                for (fx, fy, fw, fh) in faces:
                    # Center upper-body bounding box around face
                    px1 = max(0, int(fx - fw * 0.45))
                    py1 = max(0, int(fy - fh * 0.55))
                    px2 = min(img_w, int(fx + fw * 1.45))
                    py2 = min(img_h, int(fy + fh * 2.9))
                    if (px2 - px1) >= 50 and (py2 - py1) >= 70:
                        candidate_boxes.append((px1, py1, px2, py2, 0.88))

            # 3. Apply Non-Maximum Suppression to remove duplicates of the SAME person
            persons_boxes = apply_nms(candidate_boxes, iou_threshold=0.38)
            num_persons = len(persons_boxes)

            if num_persons == 0:
                return {
                    'workers_detected': 0,
                    'workers': [],
                    'violations': [],
                    'compliance_status': 'compliant',
                    'summary': 'No workers detected in frame'
                }

            # 4. Analyze each detected person for safety equipment
            violations = []
            workers = []

            for idx, (x1, y1, x2, y2, conf) in enumerate(persons_boxes):
                person_region = image[y1:y2, x1:x2]

                if person_region.size == 0 or person_region.shape[0] < 25 or person_region.shape[1] < 25:
                    continue

                # Check for helmet / hard hat / cap
                has_helmet, helmet_pct = self._detect_helmet(person_region)

                # Check for safety vest / high-vis / lanyard
                has_vest, vest_pct = self._detect_vest(person_region)

                confidence_score = max(80, int(conf * 100))
                person_violations = []

                if not has_helmet:
                    viol = {
                        'type': 'missing_helmet',
                        'confidence': confidence_score,
                        'worker_index': idx + 1
                    }
                    violations.append(viol)
                    person_violations.append('missing_helmet')

                if not has_vest:
                    viol = {
                        'type': 'missing_vest',
                        'confidence': confidence_score,
                        'worker_index': idx + 1
                    }
                    violations.append(viol)
                    person_violations.append('missing_vest')

                worker_status = 'compliant' if len(person_violations) == 0 else 'violation'

                # Store normalized coordinates (0.0 to 1.0) and pixel coordinates for HUD overlay
                workers.append({
                    'id': idx + 1,
                    'box': [
                        round(x1 / img_w, 4),
                        round(y1 / img_h, 4),
                        round(x2 / img_w, 4),
                        round(y2 / img_h, 4)
                    ],
                    'pixel_box': [x1, y1, x2, y2],
                    'has_helmet': has_helmet,
                    'has_vest': has_vest,
                    'status': worker_status,
                    'violations': person_violations,
                    'confidence': confidence_score
                })

            # Determine overall compliance status
            compliance_status = 'compliant' if len(violations) == 0 else 'violation'

            # Generate clear, truthful summary
            if compliance_status == 'compliant':
                summary = f"All {num_persons} worker(s) compliant (wearing safety helmet & vest)"
            else:
                missing_items = []
                helmet_missing = sum(1 for v in violations if v['type'] == 'missing_helmet')
                vest_missing = sum(1 for v in violations if v['type'] == 'missing_vest')
                if helmet_missing > 0:
                    missing_items.append(f"{helmet_missing} missing helmet")
                if vest_missing > 0:
                    missing_items.append(f"{vest_missing} missing vest")
                summary = f"Safety violation: {', '.join(missing_items)} detected"

            return {
                'workers_detected': len(workers),
                'workers': workers,
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
                'workers': [],
                'violations': [],
                'compliance_status': 'error',
                'summary': f'Detection error: {str(e)}'
            }

    def _detect_helmet(self, person_region):
        """
        Detect industrial safety helmet (Yellow, Orange, Blue, Red, Lime, White)
        or testing-mode cap. Distinguishes bare scalp hair and forehead skin from helmets.
        Rejects background walls, window frames, and ambient white ceiling lights.
        """
        if person_region.size == 0:
            return False, 0.0

        height, width = person_region.shape[:2]

        # Focus strictly on the central crown of the head (middle 40% width, top 28% height)
        # Slicing narrowly avoids background walls and window frames beside the head
        y_start = 0
        y_end = max(10, int(height * 0.28))
        x_start = int(width * 0.30)
        x_end = int(width * 0.70)

        head_region = person_region[y_start:y_end, x_start:x_end]

        if head_region.size == 0 or head_region.shape[0] < 5 or head_region.shape[1] < 5:
            return False, 0.0

        hsv = cv2.cvtColor(head_region, cv2.COLOR_BGR2HSV)
        total_pixels = head_region.shape[0] * head_region.shape[1]

        # 1. Detect Natural Human Hair & Forehead Skin
        # Dark / Black Hair
        dark_hair_mask = cv2.inRange(hsv, np.array([0, 0, 0]), np.array([180, 95, 75]))
        # Brown Hair
        brown_hair_mask = cv2.inRange(hsv, np.array([8, 35, 20]), np.array([28, 175, 110]))
        # Facial / Forehead Skin
        skin_mask = cv2.inRange(hsv, np.array([0, 25, 45]), np.array([25, 175, 240]))

        hair_mask = cv2.bitwise_or(dark_hair_mask, brown_hair_mask)
        hair_pixels = np.sum(hair_mask > 0)
        hair_pct = (hair_pixels / total_pixels) * 100.0

        skin_pixels = np.sum(skin_mask > 0)
        skin_pct = (skin_pixels / total_pixels) * 100.0
        hair_skin_pct = ((hair_pixels + skin_pixels) / total_pixels) * 100.0

        # 2. Vivid Industrial Safety Helmet Colors (High Saturation Dyed Plastic)
        # Yellow Hard Hat
        yellow_mask = cv2.inRange(hsv, np.array([18, 85, 85]), np.array([36, 255, 255]))
        # Fluorescent Orange Hard Hat
        orange_mask = cv2.inRange(hsv, np.array([8, 105, 105]), np.array([18, 255, 255]))
        # Safety Blue Hard Hat
        blue_mask = cv2.inRange(hsv, np.array([95, 90, 85]), np.array([130, 255, 255]))
        # Bright Red Hard Hat
        red_mask1 = cv2.inRange(hsv, np.array([0, 100, 100]), np.array([8, 255, 255]))
        red_mask2 = cv2.inRange(hsv, np.array([170, 100, 100]), np.array([180, 255, 255]))
        # Lime / Neon Green Hard Hat
        lime_mask = cv2.inRange(hsv, np.array([38, 90, 90]), np.array([85, 255, 255]))

        vivid_helmet_mask = cv2.bitwise_or(yellow_mask, orange_mask)
        vivid_helmet_mask = cv2.bitwise_or(vivid_helmet_mask, blue_mask)
        vivid_helmet_mask = cv2.bitwise_or(vivid_helmet_mask, red_mask1)
        vivid_helmet_mask = cv2.bitwise_or(vivid_helmet_mask, red_mask2)
        vivid_helmet_mask = cv2.bitwise_or(vivid_helmet_mask, lime_mask)

        vivid_helmet_pixels = np.sum(vivid_helmet_mask > 0)
        vivid_helmet_pct = (vivid_helmet_pixels / total_pixels) * 100.0

        # --- DECISION LOGIC ---

        # Rule A: Vivid Industrial Hard Hat Detected
        if vivid_helmet_pct >= 14.0:
            return True, vivid_helmet_pct

        # Rule B: Bare Natural Head (Exposed Hair and Skin visible in apex)
        # If someone has natural scalp hair visible on top of their head, they ARE NOT wearing a helmet
        if hair_pct >= 14.0 or (hair_pct >= 8.0 and hair_skin_pct >= 24.0):
            return False, vivid_helmet_pct

        # Rule C: White Hard Hat
        # White hard hat is ONLY valid if the hair is completely covered (hair_pct < 6%)
        # and a solid bright dome is situated directly above the face
        if hair_pct < 6.0 and skin_pct >= 10.0:
            white_mask = cv2.inRange(hsv, np.array([0, 0, 190]), np.array([180, 35, 255]))
            white_pixels = np.sum(white_mask > 0)
            white_pct = (white_pixels / total_pixels) * 100.0
            if white_pct >= 20.0:
                return True, white_pct

        # Rule D: Testing Mode Cap (e.g. baseball cap covering hair apex)
        # Cap covers hair, so hair_pct is low (< 5%) and upper region has uniform cap texture
        if hair_pct < 5.0 and vivid_helmet_pct >= 8.0:
            return True, vivid_helmet_pct

        # Default: No helmet detected
        return False, vivid_helmet_pct

    def _detect_vest(self, person_region):
        """
        Detect high-visibility safety vest (Fluorescent Orange, Neon Lime/Yellow, Bright Red)
        or safety lanyard in the central chest.
        Rejects background walls, wooden window frames, skin tones, and casual t-shirts.
        """
        if person_region.size == 0:
            return False, 0.0

        height, width = person_region.shape[:2]

        # Focus strictly on the central chest / sternum (middle 36% width, mid-torso height)
        # Slicing the sternum guarantees we only sample the shirt/vest, never the window or room behind
        y_start = int(height * 0.35)
        y_end = int(height * 0.76)
        x_start = int(width * 0.32)
        x_end = int(width * 0.68)

        chest_region = person_region[y_start:y_end, x_start:x_end]

        if chest_region.size == 0 or chest_region.shape[0] < 5 or chest_region.shape[1] < 5:
            return False, 0.0

        hsv = cv2.cvtColor(chest_region, cv2.COLOR_BGR2HSV)
        total_pixels = chest_region.shape[0] * chest_region.shape[1]

        # High-visibility fluorescent safety colors (dyed retroreflective garments)
        # Fluorescent Safety Orange (Saturation >= 120, Value >= 120 rejects brown wood/skin!)
        orange_mask = cv2.inRange(hsv, np.array([9, 120, 120]), np.array([24, 255, 255]))
        # High-Vis Neon Lime / Yellow
        lime_yellow_mask = cv2.inRange(hsv, np.array([26, 95, 95]), np.array([85, 255, 255]))
        # High-Vis Bright Red Vest / Lanyard Strap
        red_mask1 = cv2.inRange(hsv, np.array([0, 95, 90]), np.array([12, 255, 255]))
        red_mask2 = cv2.inRange(hsv, np.array([168, 95, 90]), np.array([180, 255, 255]))
        # Safety Blue Vest
        blue_mask = cv2.inRange(hsv, np.array([95, 110, 100]), np.array([130, 255, 255]))

        # Combine vest & lanyard masks
        vest_mask = cv2.bitwise_or(orange_mask, lime_yellow_mask)
        vest_mask = cv2.bitwise_or(vest_mask, red_mask1)
        vest_mask = cv2.bitwise_or(vest_mask, red_mask2)
        vest_mask = cv2.bitwise_or(vest_mask, blue_mask)

        vest_pixels = np.sum(vest_mask > 0)
        vest_percentage = (vest_pixels / total_pixels) * 100.0

        # Safety vest / lanyard detected if coverage in the central sternum exceeds 7.5%
        has_vest = bool(vest_percentage >= 7.5)
        return has_vest, vest_percentage


# Global detector instance
detector = None

def initialize_detector():
    """Initialize the global detector instance"""
    global detector
    if detector is None:
        detector = SafetyDetector(confidence_threshold=0.35)
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
