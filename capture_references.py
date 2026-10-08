"""
Reference Image Capture Tool

This script helps you capture reference images of your cap and lanyard
for improved detection accuracy.
"""

import cv2
import os

def capture_reference_image(item_name, output_filename):
    """
    Capture a reference image from webcam
    
    Args:
        item_name: Name of item (e.g., "lanyard", "cap")
        output_filename: Output file path
    """
    print(f"\n{'='*60}")
    print(f"CAPTURING REFERENCE IMAGE: {item_name.upper()}")
    print(f"{'='*60}")
    print(f"\nInstructions:")
    print(f"1. Hold the {item_name} in front of the camera")
    print(f"2. Make sure it's well-lit and clearly visible")
    print(f"3. Press SPACE to capture")
    print(f"4. Press ESC to cancel")
    print(f"\nStarting camera...")
    
    # Open webcam
    cap = cv2.VideoCapture(0)
    
    if not cap.isOpened():
        print("❌ Error: Could not open camera")
        return False
    
    print("✅ Camera ready! Position the item and press SPACE to capture")
    
    while True:
        ret, frame = cap.read()
        
        if not ret:
            print("❌ Error: Could not read frame")
            break
        
        # Display the frame
        cv2.imshow(f'Capture {item_name} - Press SPACE to capture, ESC to cancel', frame)
        
        key = cv2.waitKey(1) & 0xFF
        
        # Space key to capture
        if key == 32:
            cv2.imwrite(output_filename, frame)
            print(f"\n✅ Image saved: {output_filename}")
            break
        
        # ESC key to cancel
        elif key == 27:
            print(f"\n❌ Capture cancelled")
            cap.release()
            cv2.destroyAllWindows()
            return False
    
    cap.release()
    cv2.destroyAllWindows()
    return True

def main():
    """Main function to capture both reference images"""
    
    # Create reference_images directory if it doesn't exist
    ref_dir = 'reference_images'
    if not os.path.exists(ref_dir):
        os.makedirs(ref_dir)
        print(f"✅ Created directory: {ref_dir}")
    
    print("\n" + "="*60)
    print("REFERENCE IMAGE CAPTURE TOOL")
    print("="*60)
    print("\nThis tool will help you capture reference images of:")
    print("1. Your lanyard/ID card")
    print("2. Your cap")
    print("\nThese images will be used to improve detection accuracy.")
    
    input("\nPress ENTER to start...")
    
    # Capture lanyard
    lanyard_path = os.path.join(ref_dir, 'lanyard.jpg')
    if capture_reference_image("lanyard", lanyard_path):
        print(f"✅ Lanyard reference saved!")
    
    input("\nPress ENTER to capture cap...")
    
    # Capture cap
    cap_path = os.path.join(ref_dir, 'cap.jpg')
    if capture_reference_image("cap", cap_path):
        print(f"✅ Cap reference saved!")
    
    print("\n" + "="*60)
    print("✅ REFERENCE IMAGES CAPTURED!")
    print("="*60)
    print(f"\nSaved images:")
    print(f"  - {lanyard_path}")
    print(f"  - {cap_path}")
    print(f"\nNext steps:")
    print(f"1. Restart the server: python app.py")
    print(f"2. The system will automatically use these reference images")
    print(f"3. Detection accuracy should be much better!")
    print("\n")

if __name__ == "__main__":
    main()
