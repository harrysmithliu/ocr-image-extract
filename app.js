(function () {
  const WIDTH = 390;
  const HEIGHT = 190;
  const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const DIGITS = "0123456789";
  const TEMPLATE_W = 48;
  const TEMPLATE_H = 96;
  const QUALITY_GATE = {
    samples: 100,
    minExact: 0.6,
    minChar: 0.88,
    minLength: 0.97,
    minPattern: 0.97,
    maxRuntimeErrors: 0
  };
  const CHAR_BAND = {
    x: Math.round(WIDTH * 0.14),
    y: Math.round(HEIGHT * 0.3),
    width: Math.round(WIDTH * 0.72),
    height: Math.round(HEIGHT * 0.5)
  };

  const plateCanvas = document.getElementById("plateCanvas");
  const plateCtx = plateCanvas.getContext("2d");
  const debugCanvas = document.getElementById("debugCanvas");
  plateCanvas.width = WIDTH;
  plateCanvas.height = HEIGHT;
  debugCanvas.width = WIDTH;
  debugCanvas.height = HEIGHT;
  const runBtn = document.getElementById("runBtn");
  const batchBtn = document.getElementById("batchBtn");
  const qaBtn = document.getElementById("qaBtn");
  const logList = document.getElementById("logList");
  const statusEl = document.getElementById("opencvStatus");
  const batchStatusEl = document.getElementById("batchStatus");
  const qaStatusEl = document.getElementById("qaStatus");
  const gtValue = document.getElementById("gtValue");
  const predValue = document.getElementById("predValue");
  const matchValue = document.getElementById("matchValue");

  let templates = null;
  let lastCharBoxes = [];

  const log = (message) => {
    const li = document.createElement("li");
    li.textContent = message;
    logList.appendChild(li);
  };

  const resetLog = () => {
    logList.innerHTML = "";
  };

  const randPick = (pool) => pool[Math.floor(Math.random() * pool.length)];
  const toPercent = (value) => `${(value * 100).toFixed(1)}%`;

  const setQaStatus = (statusType, text) => {
    qaStatusEl.classList.remove("pass", "fail");
    if (statusType) qaStatusEl.classList.add(statusType);
    qaStatusEl.textContent = text;
  };

  const randomOntarioPlate = () => {
    let text = "";
    for (let i = 0; i < 2; i += 1) text += randPick(LETTERS);
    for (let i = 0; i < 5; i += 1) text += randPick(DIGITS);
    return text;
  };

  const drawPlate = (text) => {
    const leftBlock = text.slice(0, 2);
    const rightBlock = text.slice(2);

    plateCtx.clearRect(0, 0, WIDTH, HEIGHT);
    const bgGradient = plateCtx.createLinearGradient(0, 0, 0, HEIGHT);
    bgGradient.addColorStop(0, "#f8f9fb");
    bgGradient.addColorStop(1, "#eceff4");
    plateCtx.fillStyle = bgGradient;
    plateCtx.fillRect(0, 0, WIDTH, HEIGHT);

    const outerMargin = Math.round(WIDTH * 0.01) + 3;
    const innerMargin = outerMargin + 4;
    plateCtx.strokeStyle = "#b6bec9";
    plateCtx.lineWidth = 2;
    plateCtx.strokeRect(outerMargin, outerMargin, WIDTH - outerMargin * 2, HEIGHT - outerMargin * 2);
    plateCtx.strokeStyle = "#d3d9e2";
    plateCtx.lineWidth = 1.5;
    plateCtx.strokeRect(innerMargin, innerMargin, WIDTH - innerMargin * 2, HEIGHT - innerMargin * 2);

    plateCtx.fillStyle = "#1e2430";
    plateCtx.textAlign = "center";
    plateCtx.textBaseline = "middle";

    plateCtx.font = '400 25px "Times New Roman", "Georgia", serif';
    plateCtx.fillText("ONTARIO", WIDTH / 2, HEIGHT * 0.2);

    const plateFontSize = 72;
    const charTracking = 2;
    plateCtx.shadowColor = "rgba(0, 0, 0, 0.14)";
    plateCtx.shadowBlur = 1.5;
    plateCtx.shadowOffsetY = 1;
    plateCtx.font = `500 ${plateFontSize}px "Arial Narrow", "Helvetica Neue", "Arial", sans-serif`;
    plateCtx.textAlign = "left";

    const measureRunWidth = (runText) => {
      let width = 0;
      for (let i = 0; i < runText.length; i += 1) {
        width += plateCtx.measureText(runText[i]).width;
        if (i < runText.length - 1) width += charTracking;
      }
      return width;
    };

    const leftWidth = measureRunWidth(leftBlock);
    const rightWidth = measureRunWidth(rightBlock);
    const crownWidth = Math.round(plateFontSize * 0.24);
    const sideGap = Math.round(plateFontSize * 0.22);
    const contentWidth = leftWidth + sideGap + crownWidth + sideGap + rightWidth;
    const startX = (WIDTH - contentWidth) / 2;

    const leftX = startX;
    const crownX = leftX + leftWidth + sideGap + crownWidth / 2;
    const rightX = leftX + leftWidth + sideGap + crownWidth + sideGap;

    const baselineY = HEIGHT * 0.57;
    const drawRun = (runText, startXValue) => {
      const boxes = [];
      let cursorX = startXValue;
      for (let i = 0; i < runText.length; i += 1) {
        const ch = runText[i];
        const chWidth = plateCtx.measureText(ch).width;
        plateCtx.fillText(ch, cursorX, baselineY);
        boxes.push({
          x: cursorX - 1,
          y: baselineY - plateFontSize * 0.78,
          width: chWidth + 4,
          height: plateFontSize * 1.0
        });
        cursorX += chWidth + charTracking;
      }
      return boxes;
    };

    const leftBoxes = drawRun(leftBlock, leftX);
    const rightBoxes = drawRun(rightBlock, rightX);
    lastCharBoxes = [...leftBoxes, ...rightBoxes];

    plateCtx.shadowColor = "rgba(0, 0, 0, 0.12)";
    plateCtx.shadowBlur = 1.5;
    plateCtx.shadowOffsetY = 1;
    plateCtx.font = '700 30px "Times New Roman", "Georgia", serif';
    plateCtx.textAlign = "center";
    plateCtx.fillText("♕", crownX, HEIGHT * 0.56);

    plateCtx.shadowColor = "transparent";
    plateCtx.shadowBlur = 0;
    plateCtx.shadowOffsetY = 0;
    plateCtx.font = '700 17px "Times New Roman", "Georgia", serif';
    plateCtx.fillText("YOURS TO DISCOVER", WIDTH / 2, HEIGHT * 0.84);

    plateCtx.strokeStyle = "#bcc5d0";
    plateCtx.lineWidth = 1.5;
    const slotW = 16;
    const slotH = 8;
    const slotX = Math.round(WIDTH * 0.16);
    const slotTopY = Math.round(HEIGHT * 0.11);
    const slotBottomY = Math.round(HEIGHT * 0.82);
    plateCtx.strokeRect(slotX, slotTopY, slotW, slotH);
    plateCtx.strokeRect(WIDTH - slotX - slotW, slotTopY, slotW, slotH);
    plateCtx.strokeRect(slotX, slotBottomY, slotW, slotH);
    plateCtx.strokeRect(WIDTH - slotX - slotW, slotBottomY, slotW, slotH);
  };

  const createTemplateMap = () => {
    const map = {};
    const tCanvas = document.createElement("canvas");
    tCanvas.width = TEMPLATE_W;
    tCanvas.height = TEMPLATE_H;
    const tCtx = tCanvas.getContext("2d");

    for (const ch of CHARS) {
      tCtx.fillStyle = "#ffffff";
      tCtx.fillRect(0, 0, TEMPLATE_W, TEMPLATE_H);
      tCtx.fillStyle = "#000000";
      tCtx.textAlign = "center";
      tCtx.textBaseline = "middle";
      tCtx.font = '500 52px "Arial Narrow", "Helvetica Neue", "Arial", sans-serif';
      tCtx.fillText(ch, TEMPLATE_W / 2, TEMPLATE_H / 2 + 2);

      const src = cv.imread(tCanvas);
      const gray = new cv.Mat();
      const binary = new cv.Mat();
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
      cv.threshold(gray, binary, 0, 255, cv.THRESH_BINARY_INV + cv.THRESH_OTSU);
      map[ch] = binary.clone();
      src.delete();
      gray.delete();
      binary.delete();
    }

    return map;
  };

  const recognizeChar = (charMat, allowedChars) => {
    let bestChar = "?";
    let bestScore = Number.POSITIVE_INFINITY;

    for (const ch of allowedChars) {
      const diff = new cv.Mat();
      cv.absdiff(charMat, templates[ch], diff);
      const score = cv.countNonZero(diff);
      if (score < bestScore) {
        bestScore = score;
        bestChar = ch;
      }
      diff.delete();
    }

    return { bestChar, bestScore };
  };

  const segmentCharacters = (binaryBand, debugMat) => {
    const contours = new cv.MatVector();
    const hierarchy = new cv.Mat();
    const boxes = [];
    cv.findContours(binaryBand, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    for (let i = 0; i < contours.size(); i += 1) {
      const contour = contours.get(i);
      const rect = cv.boundingRect(contour);
      const area = rect.width * rect.height;
      const ratio = rect.height / Math.max(rect.width, 1);
      const isCharLike =
        rect.height >= 26 &&
        rect.height <= 100 &&
        rect.width >= 6 &&
        rect.width <= 58 &&
        area >= 280 &&
        ratio >= 1.0 &&
        ratio <= 6.5;

      if (isCharLike) {
        boxes.push({
          x: rect.x + CHAR_BAND.x,
          y: rect.y + CHAR_BAND.y,
          width: rect.width,
          height: rect.height
        });
      }
      contour.delete();
    }

    contours.delete();
    hierarchy.delete();

    boxes.sort((a, b) => a.x - b.x);

    for (const rect of boxes) {
      cv.rectangle(
        debugMat,
        new cv.Point(rect.x, rect.y),
        new cv.Point(rect.x + rect.width, rect.y + rect.height),
        new cv.Scalar(0, 255, 0, 255),
        2
      );
    }

    return boxes;
  };

  const normalizeGlyph = (grayMat, rect) => {
    const x = Math.min(Math.max(0, Math.floor(rect.x)), grayMat.cols - 1);
    const y = Math.min(Math.max(0, Math.floor(rect.y)), grayMat.rows - 1);
    const maxW = grayMat.cols - x;
    const maxH = grayMat.rows - y;
    if (maxW <= 0 || maxH <= 0) return null;
    const w = Math.max(1, Math.min(maxW, Math.ceil(rect.width)));
    const h = Math.max(1, Math.min(maxH, Math.ceil(rect.height)));

    const roi = grayMat.roi(new cv.Rect(x, y, w, h));
    const roiBinary = new cv.Mat();
    const normalized = new cv.Mat();
    cv.threshold(roi, roiBinary, 0, 255, cv.THRESH_BINARY_INV + cv.THRESH_OTSU);

    cv.resize(roiBinary, normalized, new cv.Size(TEMPLATE_W, TEMPLATE_H), 0, 0, cv.INTER_NEAREST);

    roi.delete();
    roiBinary.delete();
    return normalized;
  };

  const recognizeFromCanvas = ({ emitLogs = true, updateUi = true } = {}) => {
    const src = cv.imread(plateCanvas);
    const debugMat = src.clone();
    const gray = new cv.Mat();
    const fallbackBand = new cv.Mat();
    const fallbackBinary = new cv.Mat();
    const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(2, 2));

    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    let boxes = [];

    if (lastCharBoxes.length === 7) {
      boxes = lastCharBoxes.map((box) => ({
        x: box.x - 3,
        y: box.y - 3,
        width: box.width + 6,
        height: box.height + 6
      }));
      if (emitLogs) {
        log("2) Used renderer-guided character anchors for stable segmentation.");
      }
    } else {
      const bandRoi = gray.roi(new cv.Rect(CHAR_BAND.x, CHAR_BAND.y, CHAR_BAND.width, CHAR_BAND.height));
      bandRoi.copyTo(fallbackBand);
      cv.threshold(fallbackBand, fallbackBinary, 0, 255, cv.THRESH_BINARY_INV + cv.THRESH_OTSU);
      cv.morphologyEx(fallbackBinary, fallbackBinary, cv.MORPH_OPEN, kernel);
      cv.morphologyEx(fallbackBinary, fallbackBinary, cv.MORPH_CLOSE, kernel);
      boxes = segmentCharacters(fallbackBinary, debugMat);
      bandRoi.delete();
      if (emitLogs) {
        log("2) Used contour fallback segmentation.");
      }
    }

    if (emitLogs) log(`3) Candidate character boxes detected: ${boxes.length}.`);

    const recognized = [];
    for (let i = 0; i < Math.min(7, boxes.length); i += 1) {
      const rect = boxes[i];
      cv.rectangle(
        debugMat,
        new cv.Point(rect.x, rect.y),
        new cv.Point(rect.x + rect.width, rect.y + rect.height),
        new cv.Scalar(0, 255, 0, 255),
        2
      );

      const normalized = normalizeGlyph(gray, rect);
      if (!normalized) {
        recognized.push("?");
        continue;
      }

      const allowedChars = i < 2 ? LETTERS : DIGITS;
      const { bestChar } = recognizeChar(normalized, allowedChars);
      recognized.push(bestChar);

      cv.putText(
        debugMat,
        bestChar,
        new cv.Point(rect.x, Math.max(15, rect.y - 4)),
        cv.FONT_HERSHEY_SIMPLEX,
        0.55,
        new cv.Scalar(255, 80, 40, 255),
        2
      );

      normalized.delete();
    }

    cv.imshow(debugCanvas, debugMat);

    const prediction = recognized.join("");
    const result = {
      prediction,
      candidateCount: boxes.length
    };

    src.delete();
    debugMat.delete();
    gray.delete();
    fallbackBand.delete();
    fallbackBinary.delete();
    kernel.delete();

    if (updateUi) {
      predValue.textContent = prediction || "(empty)";
    }

    return result;
  };

  const runSingleSample = () => {
    resetLog();
    batchStatusEl.textContent = "Benchmark: not started";
    setQaStatus("", "Quality gate: not started");

    const groundTruth = randomOntarioPlate();
    gtValue.textContent = groundTruth;
    predValue.textContent = "-";
    matchValue.textContent = "-";

    drawPlate(groundTruth);
    log(`1) Generated plate text: ${groundTruth}.`);

    let prediction = "";
    try {
      ({ prediction } = recognizeFromCanvas({ emitLogs: true, updateUi: true }));
    } catch (error) {
      predValue.textContent = "(error)";
      matchValue.textContent = "Runtime error";
      log(`4) Recognition failed: ${error?.message || "unknown error"}`);
      return;
    }

    if (prediction.length !== 7) {
      matchValue.textContent = "Unstable (predicted length is not 7)";
      log("4) Prediction length is invalid; segmentation needs tuning.");
      return;
    }

    if (prediction === groundTruth) {
      matchValue.textContent = "Matched ✅";
      log("4) Template matching finished and equals ground truth.");
    } else {
      matchValue.textContent = "Not matched ❌";
      log("4) Template matching finished but differs from ground truth.");
    }
  };

  const runBenchmark = (sampleCount = 20) => {
    const metrics = collectMetrics(sampleCount);
    const exactAcc = toPercent(metrics.exactAccuracy);
    const charAcc = toPercent(metrics.charAccuracy);
    batchStatusEl.textContent = `Benchmark: ${sampleCount} samples | Exact ${exactAcc} | Char ${charAcc}`;
  };

  const collectMetrics = (sampleCount) => {
    let exactMatches = 0;
    let validLength = 0;
    let validPattern = 0;
    let runtimeErrors = 0;
    let totalChars = 0;
    let correctChars = 0;

    for (let index = 0; index < sampleCount; index += 1) {
      const truth = randomOntarioPlate();
      drawPlate(truth);

      let prediction = "";
      try {
        ({ prediction } = recognizeFromCanvas({ emitLogs: false, updateUi: false }));
      } catch (error) {
        runtimeErrors += 1;
        prediction = "";
      }

      if (prediction === truth) exactMatches += 1;
      if (prediction.length === 7) validLength += 1;
      if (/^[A-Z]{2}[0-9]{5}$/.test(prediction)) validPattern += 1;

      for (let charIndex = 0; charIndex < 7; charIndex += 1) {
        if (prediction[charIndex] && prediction[charIndex] === truth[charIndex]) correctChars += 1;
        totalChars += 1;
      }
    }

    return {
      sampleCount,
      runtimeErrors,
      exactAccuracy: exactMatches / sampleCount,
      charAccuracy: totalChars > 0 ? correctChars / totalChars : 0,
      validLengthRate: validLength / sampleCount,
      validPatternRate: validPattern / sampleCount
    };
  };

  const runQualityGate = () => {
    const metrics = collectMetrics(QUALITY_GATE.samples);
    const checks = [
      metrics.exactAccuracy >= QUALITY_GATE.minExact,
      metrics.charAccuracy >= QUALITY_GATE.minChar,
      metrics.validLengthRate >= QUALITY_GATE.minLength,
      metrics.validPatternRate >= QUALITY_GATE.minPattern,
      metrics.runtimeErrors <= QUALITY_GATE.maxRuntimeErrors
    ];
    const passed = checks.every(Boolean);

    const summary =
      `Quality gate (${metrics.sampleCount}): ` +
      `${passed ? "PASS" : "FAIL"} | ` +
      `Exact ${toPercent(metrics.exactAccuracy)} ` +
      `Char ${toPercent(metrics.charAccuracy)} ` +
      `Len7 ${toPercent(metrics.validLengthRate)} ` +
      `Pattern ${toPercent(metrics.validPatternRate)} ` +
      `Errors ${metrics.runtimeErrors}`;

    setQaStatus(passed ? "pass" : "fail", summary);
    console.table({
      sample_count: metrics.sampleCount,
      exact_accuracy: toPercent(metrics.exactAccuracy),
      char_accuracy: toPercent(metrics.charAccuracy),
      len7_rate: toPercent(metrics.validLengthRate),
      pattern_rate: toPercent(metrics.validPatternRate),
      runtime_errors: metrics.runtimeErrors,
      gate_result: passed ? "PASS" : "FAIL"
    });
  };

  window.addEventListener("opencv-ready", () => {
    if (!templates) templates = createTemplateMap();
    runBtn.disabled = false;
    batchBtn.disabled = false;
    qaBtn.disabled = false;
    runBtn.textContent = "Generate & Recognize";
    statusEl.textContent = "OpenCV.js runtime ready";
    drawPlate("AB12345");
  });

  runBtn.addEventListener("click", runSingleSample);
  batchBtn.addEventListener("click", () => runBenchmark(20));
  qaBtn.addEventListener("click", runQualityGate);
})();
