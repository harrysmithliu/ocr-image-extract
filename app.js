(function () {
  const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const DIGITS = "0123456789";

  const TUNING = {
    // Plate rendering sandbox. OCR should not modify this section.
    plateRenderer: {
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
    // OCR sandbox. Keep all recognition knobs here.
    ocr: {
      mode: {
        // Stage starts from the first character and can expand left-to-right.
        initialTargetCount: 1,
        // Logical ceiling for full plate expansion.
        maxSelectableCount: 7,
        // UI ceiling for the current stage (next step: 2).
        maxSelectableCountNow: 2,
        // Base text for template synthesis. Length must match full plate length.
        templateBaseText: "AA00000"
      },
      template: {
        width: 48,
        height: 96,
        // Rendering template letters in a synthetic plate context.
        font: '500 56px "Arial Narrow", "Helvetica Neue", "Arial", sans-serif',
        baselineOffsetY: 2
      },
      segmentation: {
        // Anchor padding before ROI extraction.
        leftPad: 1,
        topPad: 0,
        widthPad: 2,
        bottomPad: 2
      },
      normalize: {
        // INTER_AREA, INTER_LINEAR, INTER_NEAREST
        resizeInterpolation: "INTER_AREA",
        // Optional second binarization after resize.
        applyPostThreshold: true,
        postThreshold: 170
      },
      diagnostics: {
        enabled: true,
        topCandidates: 3
      }
    },
    evaluation: {
      quickSamples: 20,
      qualitySamples: 100,
      // Stage-1 goal for first character.
      minExact: 1.0,
      maxRuntimeErrors: 0
    }
  };

  const WIDTH = TUNING.plateRenderer.width;
  const HEIGHT = TUNING.plateRenderer.height;
  const TEMPLATE_W = TUNING.ocr.template.width;
  const TEMPLATE_H = TUNING.ocr.template.height;

  const plateCanvas = document.getElementById("plateCanvas");
  const plateCtx = plateCanvas.getContext("2d");
  const debugCanvas = document.getElementById("debugCanvas");
  const targetCountInput = document.getElementById("targetCountInput");
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

  let templateBank = null;
  const plateCharCount = TUNING.plateRenderer.lettersCount + TUNING.plateRenderer.digitsCount;
  const currentStageMaxCount = Math.min(
    TUNING.ocr.mode.maxSelectableCountNow,
    TUNING.ocr.mode.maxSelectableCount,
    plateCharCount
  );
  let activeTargetIndices = [];

  const toPercent = (value) => `${(value * 100).toFixed(1)}%`;
  const randPick = (pool) => pool[Math.floor(Math.random() * pool.length)];

  const log = (message) => {
    const item = document.createElement("li");
    item.textContent = message;
    logList.appendChild(item);
  };

  const resetLog = () => {
    logList.innerHTML = "";
  };

  const clearDiagnostics = () => {
    charDiagGrid.innerHTML = "";
  };

  const setQaStatus = (statusType, text) => {
    qaStatusEl.classList.remove("pass", "fail");
    if (statusType) qaStatusEl.classList.add(statusType);
    qaStatusEl.textContent = text;
  };

  const createCanvasContext = (width, height) => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return { canvas, ctx: canvas.getContext("2d") };
  };

  const createPlateRenderer = (config) => {
    const totalLength = config.lettersCount + config.digitsCount;

    const randomText = () => {
      let text = "";
      for (let index = 0; index < config.lettersCount; index += 1) text += randPick(LETTERS);
      for (let index = 0; index < config.digitsCount; index += 1) text += randPick(DIGITS);
      return text;
    };

    const drawToContext = (ctx, plateText) => {
      const leftBlock = plateText.slice(0, config.lettersCount);
      const rightBlock = plateText.slice(config.lettersCount);

      ctx.clearRect(0, 0, config.width, config.height);
      const bgGradient = ctx.createLinearGradient(0, 0, 0, config.height);
      bgGradient.addColorStop(0, "#f8f9fb");
      bgGradient.addColorStop(1, "#eceff4");
      ctx.fillStyle = bgGradient;
      ctx.fillRect(0, 0, config.width, config.height);

      const outerMargin = Math.round(config.width * 0.01) + 3;
      const innerMargin = outerMargin + 4;
      ctx.strokeStyle = "#b6bec9";
      ctx.lineWidth = 2;
      ctx.strokeRect(outerMargin, outerMargin, config.width - outerMargin * 2, config.height - outerMargin * 2);
      ctx.strokeStyle = "#d3d9e2";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(innerMargin, innerMargin, config.width - innerMargin * 2, config.height - innerMargin * 2);

      ctx.fillStyle = "#1e2430";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = config.titleFont;
      ctx.fillText("ONTARIO", config.width / 2, config.height * config.titleYRatio);

      ctx.shadowColor = config.mainShadowColor;
      ctx.shadowBlur = config.mainShadowBlur;
      ctx.shadowOffsetY = config.mainShadowOffsetY;
      ctx.font = `${config.mainFontWeight} ${config.mainFontSize}px ${config.mainFontFamily}`;
      ctx.textAlign = "left";

      const measureRunWidth = (runText) => {
        let width = 0;
        for (let index = 0; index < runText.length; index += 1) {
          width += ctx.measureText(runText[index]).width;
          if (index < runText.length - 1) width += config.mainCharTracking;
        }
        return width;
      };

      const leftWidth = measureRunWidth(leftBlock);
      const rightWidth = measureRunWidth(rightBlock);
      const crownWidth = Math.round(config.mainFontSize * config.crownWidthRatio);
      const sideGap = Math.round(config.mainFontSize * config.crownSideGapRatio);
      const contentWidth = leftWidth + sideGap + crownWidth + sideGap + rightWidth;
      const startX = (config.width - contentWidth) / 2;
      const leftX = startX;
      const crownX = leftX + leftWidth + sideGap + crownWidth / 2;
      const rightX = leftX + leftWidth + sideGap + crownWidth + sideGap;
      const baselineY = config.height * 0.57;

      const anchors = [];
      const drawRun = (runText, startXValue) => {
        let cursorX = startXValue;
        for (let index = 0; index < runText.length; index += 1) {
          const ch = runText[index];
          const charWidth = ctx.measureText(ch).width;
          ctx.fillText(ch, cursorX, baselineY);
          anchors.push({
            x: cursorX - config.mainBoxXPad,
            y: baselineY - config.mainFontSize * config.mainBoxTopRatio,
            width: charWidth + config.mainBoxWidthPad,
            height: config.mainFontSize * config.mainBoxHeightRatio
          });
          cursorX += charWidth + config.mainCharTracking;
        }
      };

      drawRun(leftBlock, leftX);
      drawRun(rightBlock, rightX);

      ctx.font = config.crownFont;
      ctx.textAlign = "center";
      ctx.fillText("♕", crownX, config.height * config.crownYRatio);

      ctx.font = config.sloganFont;
      ctx.fillText("YOURS TO DISCOVER", config.width / 2, config.height * config.sloganYRatio);

      ctx.strokeStyle = "#bcc5d0";
      ctx.lineWidth = 1.5;
      const slotW = 16;
      const slotH = 8;
      const slotX = Math.round(config.width * 0.16);
      const slotTopY = Math.round(config.height * 0.11);
      const slotBottomY = Math.round(config.height * 0.82);
      ctx.strokeRect(slotX, slotTopY, slotW, slotH);
      ctx.strokeRect(config.width - slotX - slotW, slotTopY, slotW, slotH);
      ctx.strokeRect(slotX, slotBottomY, slotW, slotH);
      ctx.strokeRect(config.width - slotX - slotW, slotBottomY, slotW, slotH);

      if (anchors.length !== totalLength) {
        throw new Error("Anchor generation failed: unexpected anchor count.");
      }
      return anchors;
    };

    const generatePacket = (plateText = randomText()) => {
      const { canvas, ctx } = createCanvasContext(config.width, config.height);
      const anchors = drawToContext(ctx, plateText);
      return {
        source: "synthetic",
        image: canvas,
        groundTruth: plateText,
        anchors
      };
    };

    return { randomText, drawToContext, generatePacket };
  };

  const getCharsetForIndex = (targetIndex) =>
    targetIndex < TUNING.plateRenderer.lettersCount ? LETTERS : DIGITS;

  const clampTargetCount = (value) => {
    const parsed = Number.parseInt(value, 10);
    if (Number.isNaN(parsed)) return TUNING.ocr.mode.initialTargetCount;
    return Math.max(1, Math.min(currentStageMaxCount, parsed));
  };

  const buildTargetIndices = (count) =>
    Array.from({ length: clampTargetCount(count) }, (_, index) => index);

  const targetLabel = () => activeTargetIndices.map((index) => `#${index + 1}`).join(",");
  const targetSummary = () => `${activeTargetIndices.length} (${targetLabel()})`;

  activeTargetIndices = buildTargetIndices(TUNING.ocr.mode.initialTargetCount);

  const resetResultPanels = () => {
    batchStatusEl.textContent = "Benchmark: not started";
    setQaStatus("", "Quality gate: not started");
    clearDiagnostics();
    gtValue.textContent = "-";
    predValue.textContent = "-";
    matchValue.textContent = "-";
  };

  const refreshStatus = () => {
    statusEl.textContent = `OpenCV.js runtime ready (target count: ${targetSummary()})`;
  };

  const applyTargetCount = (value, { resetUi = true } = {}) => {
    const nextCount = clampTargetCount(value);
    activeTargetIndices = buildTargetIndices(nextCount);
    if (targetCountInput) targetCountInput.value = String(nextCount);
    if (templateBank) templateBank = buildTemplateBankForCurrentMode();
    refreshStatus();
    if (resetUi) resetResultPanels();
  };

  const createOCRPipeline = (config) => {
    const getInterpolationFlag = () => cv[config.normalize.resizeInterpolation] || cv.INTER_NEAREST;

    const normalizeFromGray = (grayMat, rect) => {
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
      if (config.normalize.applyPostThreshold) {
        cv.threshold(
          normalized,
          normalized,
          config.normalize.postThreshold,
          255,
          cv.THRESH_BINARY
        );
      }
      return { roiGray, roiBinary, normalized };
    };

    const makeTargetRects = (packet, targetIndices) => {
      if (!packet.anchors || packet.anchors.length === 0) return [];
      return targetIndices
        .map((targetIndex) => {
          const base = packet.anchors[targetIndex];
          if (!base) return null;
          return {
            index: targetIndex,
            x: base.x - config.segmentation.leftPad,
            y: base.y - config.segmentation.topPad,
            width: base.width + config.segmentation.widthPad,
            height: base.height + config.segmentation.topPad + config.segmentation.bottomPad
          };
        })
        .filter(Boolean);
    };

    const matchChar = (normalized, allowedChars, templatesForIndex, topK) => {
      const scores = [];
      for (const char of allowedChars) {
        const template = templatesForIndex?.[char];
        if (!template) continue;
        const diff = new cv.Mat();
        cv.absdiff(normalized, template, diff);
        scores.push({ char, score: cv.countNonZero(diff) });
        diff.delete();
      }
      scores.sort((left, right) => left.score - right.score);
      const best = scores[0] || { char: "?", score: Number.POSITIVE_INFINITY };
      return {
        predicted: best.char,
        score: best.score,
        topCandidates: scores.slice(0, topK)
      };
    };

    const recognize = ({
      packet,
      templates,
      targetIndices,
      expectedText = "",
      renderDebug = true,
      renderDiagnostics = true
    }) => {
      const src = cv.imread(packet.image);
      const gray = new cv.Mat();
      const debugMat = src.clone();
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

      const targetRects = makeTargetRects(packet, targetIndices);
      const results = [];

      for (const rect of targetRects) {
        cv.rectangle(
          debugMat,
          new cv.Point(rect.x, rect.y),
          new cv.Point(rect.x + rect.width, rect.y + rect.height),
          new cv.Scalar(0, 255, 0, 255),
          2
        );

        const glyph = normalizeFromGray(gray, rect);
        if (!glyph) {
          results.push({ index: rect.index, predicted: "?", score: Number.POSITIVE_INFINITY });
          continue;
        }

        const charset = getCharsetForIndex(rect.index);
        const templatesForIndex = templates[rect.index] || {};
        const match = matchChar(
          glyph.normalized,
          charset,
          templatesForIndex,
          config.diagnostics.topCandidates
        );

        cv.putText(
          debugMat,
          match.predicted,
          new cv.Point(rect.x, Math.max(15, rect.y - 4)),
          cv.FONT_HERSHEY_SIMPLEX,
          0.55,
          new cv.Scalar(255, 80, 40, 255),
          2
        );

        let diagPayload = null;
        if (renderDiagnostics && config.diagnostics.enabled) {
          const diff = new cv.Mat();
          cv.absdiff(glyph.normalized, templatesForIndex[match.predicted], diff);
          diagPayload = {
            index: rect.index,
            expected: expectedText[rect.index] || "",
            predicted: match.predicted,
            topCandidates: match.topCandidates,
            roiGray: glyph.roiGray.clone(),
            roiBinary: glyph.roiBinary.clone(),
            normalized: glyph.normalized.clone(),
            bestTemplate: templatesForIndex[match.predicted].clone(),
            diff: diff.clone()
          };
          diff.delete();
        }

        results.push({
          index: rect.index,
          predicted: match.predicted,
          score: match.score,
          topCandidates: match.topCandidates,
          diagnostics: diagPayload
        });

        glyph.roiGray.delete();
        glyph.roiBinary.delete();
        glyph.normalized.delete();
      }

      if (renderDebug) cv.imshow(debugCanvas, debugMat);

      src.delete();
      gray.delete();
      debugMat.delete();

      return results;
    };

    return { normalizeFromGray, makeTargetRects, matchChar, recognize };
  };

  const plateRenderer = createPlateRenderer(TUNING.plateRenderer);
  const ocrPipeline = createOCRPipeline(TUNING.ocr);

  const renderPacketToMainCanvas = (packet) => {
    plateCtx.clearRect(0, 0, WIDTH, HEIGHT);
    plateCtx.drawImage(packet.image, 0, 0);
  };

  const matToDataUrl = (mat) => {
    const { canvas } = createCanvasContext(mat.cols, mat.rows);
    cv.imshow(canvas, mat);
    return canvas.toDataURL("image/png");
  };

  const renderDiagnosticCard = (diag) => {
    const card = document.createElement("article");
    card.className = "diag-card";
    const summary = diag.topCandidates.map((item) => `${item.char}:${item.score}`).join(" | ");
    card.innerHTML = `
      <h3>#${diag.index + 1} ${diag.expected || "?"} → ${diag.predicted}</h3>
      <p class="diag-candidates">${summary}</p>
      <div class="diag-images">
        <figure><img src="${matToDataUrl(diag.roiGray)}" alt="gray roi"><figcaption>Gray ROI</figcaption></figure>
        <figure><img src="${matToDataUrl(diag.roiBinary)}" alt="binary roi"><figcaption>Binary ROI</figcaption></figure>
        <figure><img src="${matToDataUrl(diag.normalized)}" alt="normalized"><figcaption>Normalized</figcaption></figure>
        <figure><img src="${matToDataUrl(diag.bestTemplate)}" alt="template"><figcaption>Best Template</figcaption></figure>
        <figure><img src="${matToDataUrl(diag.diff)}" alt="diff"><figcaption>Abs Diff</figcaption></figure>
      </div>
    `;
    charDiagGrid.appendChild(card);

    diag.roiGray.delete();
    diag.roiBinary.delete();
    diag.normalized.delete();
    diag.bestTemplate.delete();
    diag.diff.delete();
  };

  const buildTemplateBankForCurrentMode = () => {
    const bank = {};
    if (activeTargetIndices.length === 0) return bank;
    if (TUNING.ocr.mode.templateBaseText.length !== plateCharCount) {
      throw new Error(`templateBaseText must have length ${plateCharCount}.`);
    }

    for (const targetIndex of activeTargetIndices) {
      bank[targetIndex] = {};
      const charset = getCharsetForIndex(targetIndex);

      for (const char of charset) {
        const chars = TUNING.ocr.mode.templateBaseText.split("");
        chars[targetIndex] = char;
        const packet = plateRenderer.generatePacket(chars.join(""));
        const src = cv.imread(packet.image);
        const gray = new cv.Mat();
        cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
        const rect = ocrPipeline
          .makeTargetRects(packet, [targetIndex])
          .find((item) => item.index === targetIndex);
        if (!rect) {
          src.delete();
          gray.delete();
          continue;
        }
        const glyph = ocrPipeline.normalizeFromGray(gray, rect);
        if (glyph) {
          bank[targetIndex][char] = glyph.normalized.clone();
          glyph.roiGray.delete();
          glyph.roiBinary.delete();
          glyph.normalized.delete();
        }
        src.delete();
        gray.delete();
      }
    }
    return bank;
  };

  const runRecognitionForPacket = ({
    packet,
    renderDebug,
    renderDiagnostics,
    emitLogs
  }) => {
    const expectedText = packet.groundTruth || "";
    const results = ocrPipeline.recognize({
      packet,
      templates: templateBank,
      targetIndices: activeTargetIndices,
      expectedText,
      renderDebug,
      renderDiagnostics
    });

    const primaryTargetIndex = activeTargetIndices[0];
    const targetResult = results.find((result) => result.index === primaryTargetIndex) || null;
    if (emitLogs) {
      log(
        `2) OCR sandbox consumed frame packet and recognized target index set ${targetLabel()}.`
      );
      if (targetResult) {
        const charsetSize = getCharsetForIndex(targetResult.index).length;
        log(`3) Candidate set size: ${charsetSize}; best score: ${targetResult.score}.`);
      } else {
        log("3) No target result returned.");
      }
    }

    if (renderDiagnostics) {
      clearDiagnostics();
      for (const result of results) {
        if (result.diagnostics) renderDiagnosticCard(result.diagnostics);
      }
    }
    return { targetResult, results };
  };

  const runSingleSample = () => {
    resetLog();
    batchStatusEl.textContent = "Benchmark: not started";
    setQaStatus("", "Quality gate: not started");

    const packet = plateRenderer.generatePacket();
    renderPacketToMainCanvas(packet);
    log(`1) Generated plate text: ${packet.groundTruth}.`);

    const expectedByIndex = {};
    for (const targetIndex of activeTargetIndices) {
      expectedByIndex[targetIndex] = packet.groundTruth[targetIndex] || "";
    }
    const expectedByOrder = activeTargetIndices.map((targetIndex) => expectedByIndex[targetIndex] || "");
    gtValue.textContent =
      `${packet.groundTruth} | target ${targetLabel()}: ${expectedByOrder.join("")}`;
    predValue.textContent = "-";
    matchValue.textContent = "-";

    let recognitionOutput = null;
    try {
      recognitionOutput = runRecognitionForPacket({
        packet,
        renderDebug: true,
        renderDiagnostics: true,
        emitLogs: true
      });
    } catch (error) {
      predValue.textContent = "(error)";
      matchValue.textContent = "Runtime error";
      log(`4) Recognition failed: ${error?.message || "unknown error"}`);
      return;
    }

    const results = recognitionOutput?.results || [];
    const predictionByIndex = new Map(results.map((result) => [result.index, result.predicted]));
    const predictedByOrder = activeTargetIndices.map(
      (targetIndex) => predictionByIndex.get(targetIndex) || "?"
    );
    predValue.textContent = `${predictedByOrder.join("")} (target ${targetLabel()})`;
    const allMatched = activeTargetIndices.every(
      (targetIndex) => (predictionByIndex.get(targetIndex) || "") === (expectedByIndex[targetIndex] || "")
    );
    if (allMatched) {
      matchValue.textContent = "Matched ✅";
      log("4) Target character set prediction equals ground truth.");
    } else {
      matchValue.textContent = "Not matched ❌";
      log("4) Target character set prediction differs from ground truth.");
    }
  };

  const collectMetrics = (sampleCount) => {
    let exactMatches = 0;
    let totalChars = 0;
    let matchedChars = 0;
    let runtimeErrors = 0;

    for (let index = 0; index < sampleCount; index += 1) {
      const packet = plateRenderer.generatePacket();
      let resultMap = new Map();
      try {
        const results = ocrPipeline.recognize({
          packet,
          templates: templateBank,
          targetIndices: activeTargetIndices,
          expectedText: packet.groundTruth,
          renderDebug: false,
          renderDiagnostics: false
        });
        resultMap = new Map(results.map((result) => [result.index, result.predicted]));
      } catch (error) {
        runtimeErrors += 1;
      }

      let sampleAllMatched = true;
      for (const targetIndex of activeTargetIndices) {
        const expected = packet.groundTruth[targetIndex] || "";
        const predicted = resultMap.get(targetIndex) || "";
        totalChars += 1;
        if (predicted === expected) {
          matchedChars += 1;
        } else {
          sampleAllMatched = false;
        }
      }
      if (sampleAllMatched) exactMatches += 1;
    }

    return {
      sampleCount,
      runtimeErrors,
      exactAccuracy: sampleCount > 0 ? exactMatches / sampleCount : 0,
      charAccuracy: totalChars > 0 ? matchedChars / totalChars : 0
    };
  };

  const runBenchmark = (sampleCount = TUNING.evaluation.quickSamples) => {
    const metrics = collectMetrics(sampleCount);
    batchStatusEl.textContent =
      `Benchmark: ${sampleCount} samples | ` +
      `Exact(target ${targetLabel()}) ${toPercent(metrics.exactAccuracy)} | ` +
      `Char ${toPercent(metrics.charAccuracy)} | ` +
      `Errors ${metrics.runtimeErrors}`;
  };

  const runQualityGate = () => {
    const metrics = collectMetrics(TUNING.evaluation.qualitySamples);
    const passed =
      metrics.exactAccuracy >= TUNING.evaluation.minExact &&
      metrics.runtimeErrors <= TUNING.evaluation.maxRuntimeErrors;
    const summary =
      `Quality gate (${metrics.sampleCount}): ${passed ? "PASS" : "FAIL"} | ` +
      `Exact(target ${targetLabel()}) ${toPercent(metrics.exactAccuracy)} ` +
      `Char ${toPercent(metrics.charAccuracy)} ` +
      `Errors ${metrics.runtimeErrors}`;

    setQaStatus(passed ? "pass" : "fail", summary);
    console.table({
      sample_count: metrics.sampleCount,
      exact_target: toPercent(metrics.exactAccuracy),
      char_accuracy: toPercent(metrics.charAccuracy),
      runtime_errors: metrics.runtimeErrors,
      gate_result: passed ? "PASS" : "FAIL"
    });
  };

  window.addEventListener("opencv-ready", () => {
    const initialPacket = plateRenderer.generatePacket("AB12345");
    renderPacketToMainCanvas(initialPacket);

    runBtn.disabled = false;
    batchBtn.disabled = false;
    qaBtn.disabled = false;
    runBtn.textContent = "Generate & Recognize";
    if (targetCountInput) {
      targetCountInput.min = "1";
      targetCountInput.max = String(currentStageMaxCount);
      targetCountInput.disabled = false;
    }
    templateBank = buildTemplateBankForCurrentMode();
    applyTargetCount(TUNING.ocr.mode.initialTargetCount, { resetUi: true });
  });

  if (targetCountInput) {
    targetCountInput.addEventListener("input", () => {
      applyTargetCount(targetCountInput.value, { resetUi: true });
    });
  }

  runBtn.addEventListener("click", runSingleSample);
  batchBtn.addEventListener("click", () => runBenchmark(TUNING.evaluation.quickSamples));
  qaBtn.addEventListener("click", runQualityGate);
})();
