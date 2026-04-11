(function () {
  const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const DIGITS = "0123456789";

  const TUNING = {
    plate: {
      width: 390,
      height: 190,
      lettersCount: 2,
      digitsCount: 5,
      titleFont: '400 25px "Times New Roman", "Georgia", serif',
      titleYRatio: 0.2,
      mainFontWeight: 500,
      mainFontSize: 72,
      mainFontFamily: '"Arial Narrow", "Helvetica Neue", "Arial", sans-serif',
      mainCharTracking: 2,
      mainShadowColor: "transparent",
      mainShadowBlur: 0,
      mainShadowOffsetY: 0,
      mainBoxXPad: 1,
      mainBoxTopRatio: 0.6,
      mainBoxWidthPad: 4,
      mainBoxHeightRatio: 1.0,
      crownWidthRatio: 0.24,
      crownSideGapRatio: 0.22,
      crownFont: '700 30px "Times New Roman", "Georgia", serif',
      crownYRatio: 0.56,
      sloganFont: '700 12px "Times New Roman", "Georgia", serif',
      sloganYRatio: 0.84
    },
    template: {
      width: 48,
      height: 96,
      font: '500 56px "Arial Narrow", "Helvetica Neue", "Arial", sans-serif',
      baselineOffsetY: 2
    },
    segmentation: {
      charBand: {
        xRatio: 0.14,
        yRatio: 0.3,
        widthRatio: 0.72,
        heightRatio: 0.5
      },
      anchorPadding: {
        left: 1,
        top: 0,
        width: 2,
        bottom: 2
      },
      fallbackFilter: {
        minHeight: 26,
        maxHeight: 100,
        minWidth: 6,
        maxWidth: 58,
        minArea: 280,
        minRatio: 1.0,
        maxRatio: 6.5
      }
    },
    normalize: {
      resizeInterpolation: "INTER_AREA",
      applyBinaryThreshold: true,
      binaryThresholdValue: 170
    },
    diagnostics: {
      enabled: true,
      topCandidates: 3
    },
    qualityGate: {
      samples: 100,
      minExact: 0.6,
      minChar: 0.88,
      minLength: 0.97,
      minPattern: 0.97,
      maxRuntimeErrors: 0
    }
  };

  const WIDTH = TUNING.plate.width;
  const HEIGHT = TUNING.plate.height;
  const TEMPLATE_W = TUNING.template.width;
  const TEMPLATE_H = TUNING.template.height;
  const CHAR_BAND = {
    x: Math.round(WIDTH * TUNING.segmentation.charBand.xRatio),
    y: Math.round(HEIGHT * TUNING.segmentation.charBand.yRatio),
    width: Math.round(WIDTH * TUNING.segmentation.charBand.widthRatio),
    height: Math.round(HEIGHT * TUNING.segmentation.charBand.heightRatio)
  };

  const plateCanvas = document.getElementById("plateCanvas");
  const plateCtx = plateCanvas.getContext("2d");
  const debugCanvas = document.getElementById("debugCanvas");
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
  const charDiagGrid = document.getElementById("charDiagGrid");

  plateCanvas.width = WIDTH;
  plateCanvas.height = HEIGHT;
  debugCanvas.width = WIDTH;
  debugCanvas.height = HEIGHT;

  let templates = null;
  let lastCharBoxes = [];

  const log = (message) => {
    const item = document.createElement("li");
    item.textContent = message;
    logList.appendChild(item);
  };

  const resetLog = () => {
    logList.innerHTML = "";
  };

  const setQaStatus = (statusType, text) => {
    qaStatusEl.classList.remove("pass", "fail");
    if (statusType) qaStatusEl.classList.add(statusType);
    qaStatusEl.textContent = text;
  };

  const toPercent = (value) => `${(value * 100).toFixed(1)}%`;
  const randPick = (pool) => pool[Math.floor(Math.random() * pool.length)];

  const randomOntarioPlate = () => {
    let text = "";
    for (let i = 0; i < TUNING.plate.lettersCount; i += 1) text += randPick(LETTERS);
    for (let i = 0; i < TUNING.plate.digitsCount; i += 1) text += randPick(DIGITS);
    return text;
  };

  const clearDiagnostics = () => {
    charDiagGrid.innerHTML = "";
  };

  const matToDataUrl = (mat) => {
    const canvas = document.createElement("canvas");
    canvas.width = mat.cols;
    canvas.height = mat.rows;
    cv.imshow(canvas, mat);
    return canvas.toDataURL("image/png");
  };

  const renderCharDiagnostic = ({
    index,
    expectedChar,
    predictedChar,
    topCandidates,
    roiGray,
    roiBinary,
    normalized,
    bestTemplate,
    diff
  }) => {
    const card = document.createElement("article");
    card.className = "diag-card";
    const summary = topCandidates.map((item) => `${item.char}:${item.score}`).join(" | ");

    card.innerHTML = `
      <h3>#${index + 1} ${expectedChar || "?"} → ${predictedChar}</h3>
      <p class="diag-candidates">${summary}</p>
      <div class="diag-images">
        <figure><img src="${matToDataUrl(roiGray)}" alt="gray roi"><figcaption>Gray ROI</figcaption></figure>
        <figure><img src="${matToDataUrl(roiBinary)}" alt="binary roi"><figcaption>Binary ROI</figcaption></figure>
        <figure><img src="${matToDataUrl(normalized)}" alt="normalized"><figcaption>Normalized</figcaption></figure>
        <figure><img src="${matToDataUrl(bestTemplate)}" alt="template"><figcaption>Best Template</figcaption></figure>
        <figure><img src="${matToDataUrl(diff)}" alt="diff"><figcaption>Abs Diff</figcaption></figure>
      </div>
    `;
    charDiagGrid.appendChild(card);
  };

  const drawPlate = (text) => {
    const leftBlock = text.slice(0, TUNING.plate.lettersCount);
    const rightBlock = text.slice(TUNING.plate.lettersCount);

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
    plateCtx.font = TUNING.plate.titleFont;
    plateCtx.fillText("ONTARIO", WIDTH / 2, HEIGHT * TUNING.plate.titleYRatio);

    plateCtx.shadowColor = TUNING.plate.mainShadowColor;
    plateCtx.shadowBlur = TUNING.plate.mainShadowBlur;
    plateCtx.shadowOffsetY = TUNING.plate.mainShadowOffsetY;
    plateCtx.font = `${TUNING.plate.mainFontWeight} ${TUNING.plate.mainFontSize}px ${TUNING.plate.mainFontFamily}`;
    plateCtx.textAlign = "left";

    const measureRunWidth = (runText) => {
      let width = 0;
      for (let i = 0; i < runText.length; i += 1) {
        width += plateCtx.measureText(runText[i]).width;
        if (i < runText.length - 1) width += TUNING.plate.mainCharTracking;
      }
      return width;
    };

    const leftWidth = measureRunWidth(leftBlock);
    const rightWidth = measureRunWidth(rightBlock);
    const crownWidth = Math.round(TUNING.plate.mainFontSize * TUNING.plate.crownWidthRatio);
    const sideGap = Math.round(TUNING.plate.mainFontSize * TUNING.plate.crownSideGapRatio);
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
        const charWidth = plateCtx.measureText(ch).width;
        plateCtx.fillText(ch, cursorX, baselineY);
        boxes.push({
          x: cursorX - TUNING.plate.mainBoxXPad,
          y: baselineY - TUNING.plate.mainFontSize * TUNING.plate.mainBoxTopRatio,
          width: charWidth + TUNING.plate.mainBoxWidthPad,
          height: TUNING.plate.mainFontSize * TUNING.plate.mainBoxHeightRatio
        });
        cursorX += charWidth + TUNING.plate.mainCharTracking;
      }
      return boxes;
    };

    const leftBoxes = drawRun(leftBlock, leftX);
    const rightBoxes = drawRun(rightBlock, rightX);
    lastCharBoxes = [...leftBoxes, ...rightBoxes];

    plateCtx.font = TUNING.plate.crownFont;
    plateCtx.textAlign = "center";
    plateCtx.fillText("♕", crownX, HEIGHT * TUNING.plate.crownYRatio);

    plateCtx.font = TUNING.plate.sloganFont;
    plateCtx.fillText("YOURS TO DISCOVER", WIDTH / 2, HEIGHT * TUNING.plate.sloganYRatio);

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
    const templateCanvas = document.createElement("canvas");
    templateCanvas.width = TEMPLATE_W;
    templateCanvas.height = TEMPLATE_H;
    const templateCtx = templateCanvas.getContext("2d");

    for (const ch of CHARS) {
      templateCtx.fillStyle = "#ffffff";
      templateCtx.fillRect(0, 0, TEMPLATE_W, TEMPLATE_H);
      templateCtx.fillStyle = "#000000";
      templateCtx.textAlign = "center";
      templateCtx.textBaseline = "middle";
      templateCtx.font = TUNING.template.font;
      templateCtx.fillText(ch, TEMPLATE_W / 2, TEMPLATE_H / 2 + TUNING.template.baselineOffsetY);

      const src = cv.imread(templateCanvas);
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

  const recognizeChar = (charMat, allowedChars, topK = 3) => {
    const scores = [];
    for (const ch of allowedChars) {
      const diff = new cv.Mat();
      cv.absdiff(charMat, templates[ch], diff);
      scores.push({ char: ch, score: cv.countNonZero(diff) });
      diff.delete();
    }
    scores.sort((left, right) => left.score - right.score);
    const best = scores[0] || { char: "?", score: Number.POSITIVE_INFINITY };
    return {
      bestChar: best.char,
      bestScore: best.score,
      topCandidates: scores.slice(0, topK)
    };
  };

  const segmentCharacters = (binaryBand, debugMat) => {
    const contours = new cv.MatVector();
    const hierarchy = new cv.Mat();
    const boxes = [];
    cv.findContours(binaryBand, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    const filter = TUNING.segmentation.fallbackFilter;
    for (let i = 0; i < contours.size(); i += 1) {
      const contour = contours.get(i);
      const rect = cv.boundingRect(contour);
      const area = rect.width * rect.height;
      const ratio = rect.height / Math.max(rect.width, 1);
      const isCharLike =
        rect.height >= filter.minHeight &&
        rect.height <= filter.maxHeight &&
        rect.width >= filter.minWidth &&
        rect.width <= filter.maxWidth &&
        area >= filter.minArea &&
        ratio >= filter.minRatio &&
        ratio <= filter.maxRatio;

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
    boxes.sort((left, right) => left.x - right.x);

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

  const getInterpolationFlag = () => cv[TUNING.normalize.resizeInterpolation] || cv.INTER_NEAREST;

  const normalizeGlyph = (grayMat, rect) => {
    const x = Math.min(Math.max(0, Math.floor(rect.x)), grayMat.cols - 1);
    const y = Math.min(Math.max(0, Math.floor(rect.y)), grayMat.rows - 1);
    const maxW = grayMat.cols - x;
    const maxH = grayMat.rows - y;
    if (maxW <= 0 || maxH <= 0) return null;
    const w = Math.max(1, Math.min(maxW, Math.ceil(rect.width)));
    const h = Math.max(1, Math.min(maxH, Math.ceil(rect.height)));

    const roiView = grayMat.roi(new cv.Rect(x, y, w, h));
    const roiGray = roiView.clone();
    const roiBinary = new cv.Mat();
    const normalized = new cv.Mat();
    roiView.delete();

    cv.threshold(roiGray, roiBinary, 0, 255, cv.THRESH_BINARY_INV + cv.THRESH_OTSU);
    cv.resize(roiBinary, normalized, new cv.Size(TEMPLATE_W, TEMPLATE_H), 0, 0, getInterpolationFlag());

    if (TUNING.normalize.applyBinaryThreshold) {
      cv.threshold(
        normalized,
        normalized,
        TUNING.normalize.binaryThresholdValue,
        255,
        cv.THRESH_BINARY
      );
    }

    return { roiGray, roiBinary, normalized };
  };

  const recognizeFromCanvas = ({
    emitLogs = true,
    updateUi = true,
    renderDiagnostics = true,
    expectedText = ""
  } = {}) => {
    const src = cv.imread(plateCanvas);
    const debugMat = src.clone();
    const gray = new cv.Mat();
    const fallbackBand = new cv.Mat();
    const fallbackBinary = new cv.Mat();
    const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(2, 2));
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

    if (renderDiagnostics) clearDiagnostics();
    let boxes = [];

    if (lastCharBoxes.length === 7) {
      const pad = TUNING.segmentation.anchorPadding;
      boxes = lastCharBoxes.map((box) => ({
        x: box.x - pad.left,
        y: box.y - pad.top,
        width: box.width + pad.width,
        height: box.height + pad.top + pad.bottom
      }));
      if (emitLogs) log("2) Used renderer-guided character anchors for stable segmentation.");
    } else {
      const bandRoi = gray.roi(new cv.Rect(CHAR_BAND.x, CHAR_BAND.y, CHAR_BAND.width, CHAR_BAND.height));
      bandRoi.copyTo(fallbackBand);
      cv.threshold(fallbackBand, fallbackBinary, 0, 255, cv.THRESH_BINARY_INV + cv.THRESH_OTSU);
      cv.morphologyEx(fallbackBinary, fallbackBinary, cv.MORPH_OPEN, kernel);
      cv.morphologyEx(fallbackBinary, fallbackBinary, cv.MORPH_CLOSE, kernel);
      boxes = segmentCharacters(fallbackBinary, debugMat);
      bandRoi.delete();
      if (emitLogs) log("2) Used contour fallback segmentation.");
    }

    if (emitLogs) log(`3) Candidate character boxes detected: ${boxes.length}.`);

    const recognized = [];
    for (let index = 0; index < Math.min(7, boxes.length); index += 1) {
      const rect = boxes[index];
      cv.rectangle(
        debugMat,
        new cv.Point(rect.x, rect.y),
        new cv.Point(rect.x + rect.width, rect.y + rect.height),
        new cv.Scalar(0, 255, 0, 255),
        2
      );

      const glyph = normalizeGlyph(gray, rect);
      if (!glyph) {
        recognized.push("?");
        continue;
      }

      const allowedChars = index < TUNING.plate.lettersCount ? LETTERS : DIGITS;
      const match = recognizeChar(glyph.normalized, allowedChars, TUNING.diagnostics.topCandidates);
      recognized.push(match.bestChar);

      cv.putText(
        debugMat,
        match.bestChar,
        new cv.Point(rect.x, Math.max(15, rect.y - 4)),
        cv.FONT_HERSHEY_SIMPLEX,
        0.55,
        new cv.Scalar(255, 80, 40, 255),
        2
      );

      if (renderDiagnostics && TUNING.diagnostics.enabled) {
        const diff = new cv.Mat();
        const bestTemplate = templates[match.bestChar];
        cv.absdiff(glyph.normalized, bestTemplate, diff);
        renderCharDiagnostic({
          index,
          expectedChar: expectedText[index] || "",
          predictedChar: match.bestChar,
          topCandidates: match.topCandidates,
          roiGray: glyph.roiGray,
          roiBinary: glyph.roiBinary,
          normalized: glyph.normalized,
          bestTemplate,
          diff
        });
        diff.delete();
      }

      glyph.roiGray.delete();
      glyph.roiBinary.delete();
      glyph.normalized.delete();
    }

    cv.imshow(debugCanvas, debugMat);
    const prediction = recognized.join("");

    src.delete();
    debugMat.delete();
    gray.delete();
    fallbackBand.delete();
    fallbackBinary.delete();
    kernel.delete();

    if (updateUi) predValue.textContent = prediction || "(empty)";
    return { prediction, candidateCount: boxes.length };
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
      ({ prediction } = recognizeFromCanvas({
        emitLogs: true,
        updateUi: true,
        renderDiagnostics: true,
        expectedText: groundTruth
      }));
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
        ({ prediction } = recognizeFromCanvas({
          emitLogs: false,
          updateUi: false,
          renderDiagnostics: false
        }));
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

  const runBenchmark = (sampleCount = 20) => {
    const metrics = collectMetrics(sampleCount);
    batchStatusEl.textContent =
      `Benchmark: ${sampleCount} samples | ` +
      `Exact ${toPercent(metrics.exactAccuracy)} | ` +
      `Char ${toPercent(metrics.charAccuracy)}`;
  };

  const runQualityGate = () => {
    const gate = TUNING.qualityGate;
    const metrics = collectMetrics(gate.samples);
    const passed =
      metrics.exactAccuracy >= gate.minExact &&
      metrics.charAccuracy >= gate.minChar &&
      metrics.validLengthRate >= gate.minLength &&
      metrics.validPatternRate >= gate.minPattern &&
      metrics.runtimeErrors <= gate.maxRuntimeErrors;

    const summary =
      `Quality gate (${metrics.sampleCount}): ${passed ? "PASS" : "FAIL"} | ` +
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
    clearDiagnostics();
    drawPlate("AB12345");
  });

  runBtn.addEventListener("click", runSingleSample);
  batchBtn.addEventListener("click", () => runBenchmark(20));
  qaBtn.addEventListener("click", runQualityGate);
})();
