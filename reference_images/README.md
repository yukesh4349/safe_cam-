# Reference Images for Detection

This directory contains reference images of the safety equipment used in testing mode:

1. **lanyard.jpg** - Red lanyard/ID card holder (represents safety vest)
2. **cap.jpg** - Black cap (represents safety helmet)

These images are used by the AI to better recognize the specific items being worn by workers.

## How to Update Reference Images

1. Take a clear photo of the item
2. Save it in this directory with the appropriate name:
   - `lanyard.jpg` for the ID card lanyard
   - `cap.jpg` for the cap/hat
3. Restart the server to load the new reference images

## Usage

The detection system uses these reference images to:
- Better identify the specific cap and lanyard you're using
- Improve detection accuracy
- Reduce false positives/negatives
