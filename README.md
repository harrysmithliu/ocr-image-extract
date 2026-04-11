# Ontario Plate Recognition (OpenCV.js, GitHub Pages Ready)

This is a pure frontend demo that does not use the camera.  
The page generates a random Ontario-style plate (`LLDDDDD`), runs OpenCV-based processing, and prints both the recognition trace and final prediction.

## Implementation Path

1. Render a synthetic Ontario-style plate with `canvas`.
2. Preprocess the image with grayscale conversion and thresholding.
3. Crop the character band and run morphology to stabilize segmentation.
4. Detect character contours and sort candidates from left to right.
5. Match each character against `A-Z0-9` templates using pixel difference.
6. Show step-by-step logs, a debug view, and final match status.
7. Run a 20-sample benchmark for quick quality checks.
8. Run a 100-sample quality gate (ground truth vs prediction) as a unit-test loop after changes.

## Project Structure

```text
.
├── index.html
├── styles.css
├── app.js
├── .gitignore
└── README.md
```

## Local Run

A static server is recommended:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

## GitHub Pages Deployment

1. Push this folder (`image-extract`) to a GitHub repository.
2. In repository settings, open **Pages**.
3. Set source to the target branch (for example `main`) and root folder (`/root`).
4. Wait for the deployment to finish, then open the generated Pages URL.

## Current Status and Next Iterations

- Current pipeline is tuned for synthetic plates rendered by this demo.
- Built-in validation loop:
  - `Run 20-Sample Benchmark`: quick metric snapshot.
  - `Run Quality Gate (100)`: pass/fail gate using exact accuracy, char accuracy, length validity, and pattern validity.
- Useful next upgrades:
  - Add perspective warp and random noise for harder samples.
  - Add fallback OCR (for example Tesseract.js) as a second recognizer.
  - Add confusion-matrix export for benchmark diagnostics.
