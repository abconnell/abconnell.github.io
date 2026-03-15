let blockSize = 12;

let defaultColSeqStr = "A2BABA4B10BA4BABA2";
let colSeqStr = defaultColSeqStr;
let customColSeqStr = defaultColSeqStr;
let lastWarpPresetValue = "ABABABABABABAB";
let randomColSeqStr = defaultColSeqStr;

let defaultRowSeqStr = "A3B4A2B1A1B3A1B";
let rowSeqStr = defaultRowSeqStr;
let lastRowMode = "tromp";
let randomRowSeqStr = defaultRowSeqStr;

let colRepeatCount = 1;
let rowRepeatCount = 1;
let mirrorCols = false;
let flipped = false;

let draftMode        = 'block';
let pickupW          = 40;
let pickupH          = 40;
let pickupGrid       = [];
let _pickupDrawing   = false;
let _pickupDrawValue = false;
let pickupPenW       = 1;
let pickupPenH       = 1;
let _cursorCell      = null;

// Swatch drag-to-paint
let _swatchDragActive   = false;
let _swatchDragMoved    = false;
let _swatchDragStartX   = 0;
let _swatchDragStartY   = 0;
let _pendingSwatchClick = null;

// Single-repeat thread sequences — set each render, used for color tiling
let _colBaseSeq = [];
let _rowBaseSeq = [];

let colorA = '#000000';
let colorB = '#ffffff';
let granularColors = false;
let _prevGranularColors = false;
// Per-mode color memory: switching block ↔ pickup restores each mode's own colors
let _savedBlockColors  = null;  // { warpAColors, warpBColors, weftAColors, weftBColors, granularColors }
let _savedPickupColors = null;
let _prevDraftMode     = 'block';
let warpAColors = [];
let warpBColors = [];
let weftAColors = [];
let weftBColors = [];

let iroPicker;
let iroPopover;
let iroIgnoreChange = false;
let lastAppliedHex = null;
let activeThreadTarget = null;

let userSwatches = [
  // light neutrals
  "#ffffff", // white
  "#f2efe3", // warm off-white
  "#c9c3b4", // warm gray / stone
  "#cfe3f6", // pale blue
  "#cddfc4", // pale sage

  // darks + cools
  "#1a1a1a", // near black
  "#2e2a7f", // deep indigo
  "#379a4a", // medium green
  "#35543c", // dark forest green

  // yellows + earth tones
  "#f4cd4f", // golden yellow
  "#f6ecab", // pale butter
  "#9b3e1c", // rust / brick
  "#ff7a1a", // bright orange

  // reds + pinks + purples
  "#d62f2f", // red
  "#efb3a1", // peach
  "#5a2f33", // dark maroon
  "#8f3c8c", // magenta purple
  "#d4a6de"  // lavender
];

let warpBtnA = [];
let warpBtnB = [];
let weftBtnA = [];
let weftBtnB = [];
let swatchButtonsBuilt = false;

const swatchH = 12;
const swatchW = 12;
const swatchGap = 2;

const topSwatchYA = 20;
const topSwatchYB = topSwatchYA + swatchH + swatchGap;
const leftSwatchXA = 20;
const leftSwatchXB = leftSwatchXA + swatchW + swatchGap;

const gridSwatchGap = 8;
const weftSwatchGap = 12;
let gridOffsetX = 0;
let gridOffsetY = 0;
let gridWidth   = 0;
let gridHeight  = 0;

let colW = [];
let rowH = [];
let totalW = 0;
let totalH = 0;
let offsetX = 0;
let offsetY = 0;

let labelAreaH = 65;
let padding = 10;
let showLabels = false;

let colPositions = [];
let selectedColIndex = null;
let warpColors = [];

let rowInputWrapper, rowInput, warpPresetSelect;


function setup() {
    let cnv = createCanvas(10,10);
    cnv.parent("canvas-scale-wrap");
    background(255);
    noStroke();

    const container = document.getElementById("canvas-container");
    iroPopover = document.getElementById("iro-popover");

    iroPicker = new iro.ColorPicker("#iro-picker", {

      width: 180,
      color: colorA,
    });

    renderIroSwatches();

    document.getElementById("add-swatch-btn").addEventListener("click", (e) => {
      e.stopPropagation(); // don’t close popover
      addCurrentColorAsSwatch();
    });

    iroPicker.on("color:change", (c) => {
      if (iroIgnoreChange) return;

      const hex = c.hexString;
      if(hex === lastAppliedHex) return;
      lastAppliedHex = hex;

      applyPickedColor(hex);
    });

    initPickupGrid(pickupW, pickupH, false);

    container.addEventListener('pointerdown', onPickupPointerDown);
    container.addEventListener('pointermove', onPickupPointerMove);
    container.addEventListener('pointerleave', onPickupPointerLeave);
    document.addEventListener('pointerup', onPickupPointerUp);
    document.addEventListener('pointermove', onSwatchDragMove);

    loadStateFromStorage();
    updateLayout();
    syncBaseChips();
    renderIroSwatches();
}

let colorChangeTimeout = null;

function applyPickedColor(hex) {
  if (!activeThreadTarget) return;

  const t = activeThreadTarget;

  if (t.kind === "base") {
    if (t.layer === "A") colorA = hex;
    else colorB = hex;

    syncBaseChips();
    makeLayout();
    return;
  }

  // existing warp/weft behavior:
  const { kind, layer, index } = t;

  if (kind === "warp") {
    if (layer === "A") warpAColors[index] = hex;
    else warpBColors[index] = hex;
  } else {
    if (layer === "A") weftAColors[index] = hex;
    else weftBColors[index] = hex;
  }

  makeLayout();
}

function makeLayout() {
  if (draftMode === 'pickup') { makePickupLayout(); return; }
  // 1) parse base sequences
  const colBase = parseSequence(colSeqStr);
  const rowBase = parseRowSequence(rowSeqStr);

  // 2) mirror if checkbox is on
  let colExpanded = colBase;
  if (mirrorCols) {
    const reversed = [...colBase].reverse();
    colExpanded = colBase.concat(reversed);
  }
  
  // 3) repeat sequences
  const colSeqRepeated = repeatParsedSeq(colExpanded, colRepeatCount);

  const rowModeVal = document.getElementById("row-mode").value;

  let rowSeqRepeated;
  if (rowModeVal === "tromp") {
    rowSeqRepeated = repeatParsedSeq(colExpanded, rowRepeatCount);
  } else {
    rowSeqRepeated = repeatParsedSeq(rowBase, rowRepeatCount);
  }

  // --- label strings that reflect mirror + repeats ---
  const warpLabelSeq = colSeqRepeated.join("");  // full warp
  let weftLabelSeq;

  if (rowModeVal === "tromp") {
    // Tromp as Writ: weft follows warp exactly
    weftLabelSeq = warpLabelSeq;
  } else {
    // custom / preset / random: use the actual weft pattern
    weftLabelSeq = rowSeqRepeated.join("");
  }

  // block-level runs (before any granular expansion) — needed for mode-change remapping
  const blockColRuns = calcRuns(colSeqRepeated);
  const blockRowRuns = calcRuns(rowSeqRepeated);

  // granular: expand each block-run into individual single-thread runs
  let colRuns, rowRuns;
  if (granularColors) {
    colRuns = blockColRuns.flatMap(r => Array.from({length: r.len}, () => ({ch: r.ch, len: 1})));
    rowRuns = blockRowRuns.flatMap(r => Array.from({length: r.len}, () => ({ch: r.ch, len: 1})));
  } else {
    colRuns = blockColRuns;
    rowRuns = blockRowRuns;
  }

  //run lengths to sizes
  colW = colRuns.map(r => r.len * blockSize);
  rowH = rowRuns.map(r => r.len * blockSize);

  // Store single-repeat base sequences for color tiling
  _colBaseSeq = colExpanded;
  _rowBaseSeq = (rowModeVal === "tromp") ? colExpanded : rowBase;

  //call thread arrays
  syncThreadColorArrays(colRuns, rowRuns, blockColRuns, blockRowRuns);
  _prevGranularColors = granularColors;

  //toggle when letter changes
  const phaseFn = granularColors ? phasesFromRunsGranular : phasesFromRuns;
  const colPhase = phaseFn(colRuns);
  const rowPhase = phaseFn(rowRuns);

  // compute total size of grid
  totalW = 0;
  totalH = 0;
  for (let c = 0; c < colW.length; c++) totalW += colW[c];
  for (let r = 0; r < rowH.length; r++) totalH += rowH[r];

  // store column positions for the color picker hit detection (right-to-left order)
  colPositions = [];
  let accumX = totalW;
  for (let c = 0; c < colW.length; c++) {
    accumX -= colW[c];
    colPositions.push({
      start: accumX,
      end: accumX + colW[c]
    });
  }

  // resize canvas to fit labels
  const showLabels = document.getElementById("show-labels").checked;
  const swatchAreaHeight = topSwatchYB + swatchH + 4;
  const topMargin    = swatchAreaHeight + gridSwatchGap;
  const leftMargin   = padding;
  const rightSwatchW = weftSwatchGap + swatchW + swatchGap + swatchW + gridSwatchGap;
  const rightMargin  = rightSwatchW + (showLabels ? 40 : 0);

  resizeCanvas(totalW + leftMargin + rightMargin, totalH + topMargin);
  fitToViewport(totalW + leftMargin + rightMargin, totalH + topMargin);
  background(221);

  offsetX = leftMargin;
  offsetY = topMargin;

  // right-side weft swatch column positions
  const rightSwatchXA = offsetX + totalW + weftSwatchGap;
  const rightSwatchXB = rightSwatchXA + swatchW + swatchGap;

  gridOffsetX = offsetX;
  gridOffsetY = offsetY;
  gridWidth   = totalW;
  gridHeight  = totalH;

  //draw grid
  let y = offsetY;
  for (let r = 0; r < rowH.length; r++) {
    let x = offsetX + totalW;

    const rowChar = rowRuns[r].ch;

    for (let c = 0; c < colW.length; c++) {
      x -= colW[c];

      let blockLetter;
      if (rowChar === 'C') {
        blockLetter = flipped ? 'B' : 'A';
      } else if (rowChar === 'D') {
        blockLetter = flipped ? 'A' : 'B';
      } else {
        const on = xor(rowPhase[r], colPhase[c]);
        blockLetter = (on !== flipped) ? 'B' : 'A';
      }

      const baseFill = (blockLetter === 'A') ? colorA : colorB;
      fill (baseFill);
      rect(x, y, colW[c], rowH[r]);

      let warpCol, weftCol;
      if (blockLetter === 'A') {
        warpCol = warpAColors[c] || colorA;
        weftCol = weftAColors[r] || colorA;
      } else {
        warpCol = warpBColors[c] || colorB;
        weftCol = weftBColors[r] || colorB;
      }

      // draw dithered overlay
      drawDitheredCell(x, y, colW[c], rowH[r], warpCol, weftCol, 3);
    }
    y += rowH[r];

  }

  //swatches

  const canvasEl = document.getElementById("canvas-scale-wrap");
  const containerEl = document.getElementById("canvas-container");
  const canvasRect = canvasEl.getBoundingClientRect();
  const containerRect = containerEl.getBoundingClientRect();

  noStroke();
  fill(90);
  textAlign(LEFT, CENTER);
  textSize(12);

  textAlign(CENTER, CENTER);
  text('A', rightSwatchXA + swatchW / 2, topSwatchYA + swatchH / 2);
  text('B', rightSwatchXB + swatchW / 2, topSwatchYB + swatchH / 2);
  textAlign(LEFT, CENTER);

  stroke (221);
  strokeWeight(2);

  let xPos = offsetX + totalW;
  for (let c = 0; c < colW.length; c++) {
    const w = colW[c];
    xPos -= w;

    fill(warpAColors[c] || colorA);
    rect(xPos, topSwatchYA, w, swatchH);

    fill(warpBColors[c] || colorB);
    rect(xPos, topSwatchYB, w, swatchH);

    //buttons
    const btnA = ensureSwatchButton(warpBtnA, c, "A", () =>
      openThreadPickerAtButton(btnA, "warp", "A", c), "warp", "A", c
    );

    const btnB = ensureSwatchButton(warpBtnB, c, "B", () =>
      openThreadPickerAtButton(btnB, "warp", "B", c), "warp", "B", c
    );

    placeBtnOverCanvasRect(
      btnA,
      xPos, topSwatchYA,
      xPos + w, topSwatchYA + swatchH
    );

    placeBtnOverCanvasRect(
      btnB,
      xPos, topSwatchYB,
      xPos + w, topSwatchYB + swatchH
    );
  }

  let yPos = offsetY;
  for (let r = 0; r < rowH.length; r++) {
    const h = rowH[r];

    fill(weftAColors[r] || colorA);
    rect(rightSwatchXA, yPos, swatchW, h);

    fill(weftBColors[r] || colorB);
    rect(rightSwatchXB, yPos, swatchW, h);

    //buttons
    const btnA = ensureSwatchButton(weftBtnA, r, "A", () =>
      openThreadPickerAtButton(btnA, "weft", "A", r), "weft", "A", r
    );

    const btnB = ensureSwatchButton(weftBtnB, r, "B", () =>
      openThreadPickerAtButton(btnB, "weft", "B", r), "weft", "B", r
    );

    placeBtnOverCanvasRect(
      btnA,
      rightSwatchXA, yPos,
      rightSwatchXA + swatchW, yPos + h
    );

    placeBtnOverCanvasRect(
      btnB,
      rightSwatchXB, yPos,
      rightSwatchXB + swatchW, yPos + h
    );

    yPos += h;
  }

  noStroke();
  

  //draw labels
  if (showLabels) {
    const labelBandHeight = 18;
    noStroke();
    fill(221);
    rect(offsetX, topSwatchYA - labelBandHeight, totalW, labelBandHeight);
    
    const weftStripW = 40;
    const weftStripX = width - weftStripW;
    rect(weftStripX, offsetY, weftStripW, totalH);

    fill(0);
    noStroke();
    textSize(12);
    textAlign(CENTER, BOTTOM);

    // Always label by block run (not expanded thread runs) so A4 stays A4 in thread mode
    let xPos = offsetX + totalW;
    for (let b = 0; b < blockColRuns.length; b++) {
      const blockW = blockColRuns[b].len * blockSize;
      xPos -= blockW;
      const run  = blockColRuns[b];
      const lab  = run.len > 1 ? run.ch + run.len : run.ch;
      text(lab, xPos + blockW / 2, topSwatchYA - 5);
    }

    textAlign(LEFT, CENTER);
    let yPos = offsetY;
    const xLabel = width - 30;

    for (let b = 0; b < blockRowRuns.length; b++) {
      const blockH = blockRowRuns[b].len * blockSize;
      const run  = blockRowRuns[b];
      const lab  = run.len > 1 ? run.ch + run.len : run.ch;
      text(lab, xLabel, yPos + blockH / 2);
      yPos += blockH;
    }
  }

  for (let i = colW.length; i < warpBtnA.length; i++) { warpBtnA[i]?.hide(); warpBtnB[i]?.hide(); }
  for (let i = rowH.length; i < weftBtnA.length; i++) { weftBtnA[i]?.hide(); weftBtnB[i]?.hide(); }

  saveStateToStorage();
}

function getWarpPreset() {
  return document.getElementById("warp-preset").value;
}

function getRowMode() {
  return document.getElementById("row-mode").value;
}

function updateWarpMode (colInputEl) {
  const warpPreset = getWarpPreset();

  if (warpPreset === "random" && lastWarpPresetValue !== "random") {
    const lenInput = document.getElementById("col-random-length");
    const length   = parseInt(lenInput.value, 10) || 8;
    randomColSeqStr = randomABSequence(length);
  }

  if (warpPreset === "custom" && lastWarpPresetValue !== "custom") {
    customColSeqStr = colSeqStr;
    colInputEl.value = customColSeqStr;
  }

  const colInputVal = colInputEl.value.trim();

  if (warpPreset === "custom") {
    if (colInputVal !== "") {
      customColSeqStr = colInputVal;
    }
    colSeqStr = colInputVal;
  } else if (warpPreset === "random") {
    colSeqStr = randomColSeqStr;
  } else {
    colSeqStr = warpPreset;
  }

  lastWarpPresetValue = warpPreset;
}

function updateRowMode(rowInputEl) {
  const rowMode = getRowMode();
  if (rowMode === "random" && lastRowMode !== "random") {
    const lenInput = document.getElementById("row-random-length");
    const length   = parseInt(lenInput.value, 10) || 8;
    randomRowSeqStr = randomABSequence(length);
  }

  if (rowMode === "tromp") {

  } else {
    if (rowMode === "custom" && lastRowMode !== "custom") {
      if (lastRowMode === "tromp") {
        rowInputEl.value = colSeqStr;
      } else if (lastRowMode === "random") {
        rowInputEl.value = randomRowSeqStr;
      } else {
        rowInputEl.value = rowSeqStr;
      }
    }

    if (rowMode === "custom") {
      const inputVal = rowInputEl.value.trim();
      rowSeqStr = inputVal || defaultRowSeqStr;
    } else if (rowMode === "random") {
      rowSeqStr = randomRowSeqStr;
    } else {
      rowSeqStr = rowMode;
    }
  }

  lastRowMode = rowMode;
}

function updateLayout() {

  background(255)

  const newDraftMode = document.getElementById('draft-mode')?.value || 'block';
  if (newDraftMode !== _prevDraftMode) {
    // Save current mode's colors before switching
    if (_prevDraftMode === 'block') {
      _savedBlockColors = snapshotColors();
    } else {
      _savedPickupColors = snapshotColors();
    }
    // Restore target mode's colors (if we've been there before)
    const snap = newDraftMode === 'block' ? _savedBlockColors : _savedPickupColors;
    applyColorSnap(snap);
    _prevDraftMode = newDraftMode;
  }
  draftMode = newDraftMode;
  updateModeVisibility();

  if (draftMode === 'pickup') {
    const newW = Math.max(1, Math.min(200, parseInt(document.getElementById('pickup-width')?.value)  || 40));
    const newH = Math.max(1, Math.min(200, parseInt(document.getElementById('pickup-height')?.value) || 40));
    if (newW !== pickupW || newH !== pickupH || pickupGrid.length === 0) {
      initPickupGrid(newW, newH, pickupGrid.length > 0);
      pickupW = newW;
      pickupH = newH;
    }
    granularColors = true;
    syncPenSizeLabels();
    syncPickupSizeLabels();
    makePickupLayout();
    syncBaseChips();
    return;
  }

  //get input values

  const warpPresetSelect = document.getElementById("warp-preset").value;
  const colInputEl = document.getElementById("input-cols");
  const rowInputEl = document.getElementById("input-rows");

  let rowInputVal = rowInputEl.value;

  updateRowInputVisibility();
  updateColInputVisibility(warpPresetSelect);

  updateRowRandomVisibility();
  updateColRandomVisibility();

  const mirrorCheckbox = document.getElementById("col-mirror");
  mirrorCols = mirrorCheckbox && mirrorCheckbox.checked;

  const showLabelsCheckbox = document.getElementById("show-labels");
  showLabels = showLabelsCheckbox ? showLabelsCheckbox.checked : false;

  const colorModeEl = document.querySelector('input[name="color-mode"]:checked');
  granularColors = colorModeEl ? colorModeEl.value === "thread" : false;

  const colRepeats = document.getElementById("col-repeats").value;
  colRepeatCount = parseInt(colRepeats, 10) || 1;

  const rowRepeats = document.getElementById("row-repeats").value;
  rowRepeatCount = parseInt(rowRepeats, 10) || 1;

  updateWarpMode(colInputEl);
  updateRowMode(rowInputEl);

  makeLayout();
  syncBaseChips();
}

//---------helpers--------
const xor = (a, b) => (a ^ b) === 1;

//parse inputs to array, combo of AB, or AB + counts
function parseSequence(input) {
  let s = String(input)
    .toUpperCase()
    .replace(/\s+/g, "");

  const out = [];
  let i = 0;

  while (i < s.length ) {
    const ch = s[i];
    if (!/[AB]/.test(ch)) { i++; continue; }
    i++;

    // allow counts e.g. A2B4A1
    let numStr = "";
    while (i < s.length && /\d/.test(s[i])) {
      numStr += s[i];
      i++
    }

    const count = numStr ? parseInt(numStr, 10) : 1;
    for (let k = 0; k < count; k++) {
      out.push(ch);
    }
  }

  return out;
}

function parseRowSequence(input) {
  let s = String(input)
    .toUpperCase()
    .replace(/\s+/g, "");

  const out = [];
  let i = 0;

  while (i < s.length ) {
    const ch = s[i];
    if (!/[ABCD]/.test(ch)) { i++; continue; }
    i++;

    // allow counts e.g. A2B4A1
    let numStr = "";
    while (i < s.length && /\d/.test(s[i])) {
      numStr += s[i];
      i++
    }

    const count = numStr ? parseInt(numStr, 10) : 1;
    for (let k = 0; k < count; k++) {
      out.push(ch);
    }
  }

  return out;
}

// repeat parsed seq
function repeatParsedSeq(arr, colRepeatCount) {
  const out = [];
  for (let i = 0; i < colRepeatCount; i++) out.push(...arr);
  return out;
}

function calcRuns (arr) {
  const out = [];
  if (!arr.length) return out;
  let cur = arr[0], len = 1;
  for (let i = 1; i < arr.length; i++) {
    if (arr[i] === cur) len++;
    else { out.push({ ch: cur, len}); cur = arr[i]; len = 1;}
  }
  out.push({ ch: cur, len});
  return out;
}

function phasesFromRuns(runs) {
  const start = runs.length ? (runs[0].ch === 'B' ? 1: 0) : 0;
  return runs.map((_, i) => (start + i) % 2);
}

// Granular phase: assign by character identity (all A→same phase, all B→opposite)
// so expanded runs of the same letter don't toggle incorrectly.
function phasesFromRunsGranular(runs) {
  const firstCh = runs.find(r => r.ch === 'A' || r.ch === 'B')?.ch ?? 'A';
  const base = firstCh === 'B' ? 1 : 0;
  return runs.map(r => {
    if (r.ch === 'C' || r.ch === 'D') return base;
    return (base + (r.ch === 'B' ? 1 : 0)) % 2;
  });
}

function updateRowInputVisibility() {
  const rowWrapper = document.getElementById("input-rows-wrapper");
  const rowModeVal = document.getElementById("row-mode").value;

  rowWrapper.style.display = (rowModeVal === "custom") ? "flex" : "none";
}

function updateRowRandomVisibility() {
  const rowRandomControls = document.getElementById("row-random-controls");
  const rowModeVal = document.getElementById("row-mode").value;

  rowRandomControls.style.display =
    (rowModeVal === "random") ? "flex" : "none";
}

function updateColInputVisibility(presetValue) {
  const colWrapper = document.getElementById("input-cols-wrapper");
  
  colWrapper.style.display = (presetValue === "custom") ? "flex" : "none"; 
}

function updateColRandomVisibility() {
  const colRandomControls = document.getElementById("col-random-controls");
  const colModeVal = document.getElementById("warp-preset").value;

  colRandomControls.style.display =
    (colModeVal === "random") ? "flex" : "none";
}

function saveImage() {
  const raw  = prompt('Save as:', 'blocks');
  if (raw === null) return;
  const name = raw.trim() || 'blocks';
  const filename = name.endsWith('.png') ? name : name + '.png';
  save(filename);
}

function randomABSequence(length = 8) {
  const letters = ["A", "B"];
  let out = "";
  for (let i = 0; i < length; i++) {
    out += letters[Math.floor(Math.random() * letters.length)];
  }
  return out;
}

function randomFromLetters(letters, length = 8) {
  if (!letters.length) return "";
  let out = "";
  for (let i = 0; i < length; i++) {
    out += letters[Math.floor(Math.random() * letters.length)];
  }
  return out;
}

function generateColRandom() {
  const lenInput = document.getElementById("col-random-length");
  const length   = parseInt(lenInput.value, 10) || 8;

  const seq = randomABSequence(length);
  const warpPresetSel = document.getElementById("warp-preset");

  warpPresetSel.value = "random";

  randomColSeqStr = seq;
  colSeqStr = seq;

  updateLayout();
}

function editColRandom() {
  const colSel = document.getElementById("warp-preset");
  const colInputEl = document.getElementById("input-cols");

  colSel.value = "custom";
  colInputEl.value = randomColSeqStr || colSeqStr || "";

  if (typeof customColSeqStr !== "undefined") {
    customColSeqStr = colInputEl.value.trim() || customColSeqStr;
  }

  updateLayout();
}


function generateRowRandom() {
  const lenInput = document.getElementById("row-random-length");
  const length = parseInt(lenInput.value, 10) || 8;

  const letters = [];
  if (document.getElementById("rowRandA").checked) letters.push("A");
  if (document.getElementById("rowRandB").checked) letters.push("B");
  if (document.getElementById("rowRandC").checked) letters.push("C");
  if (document.getElementById("rowRandD").checked) letters.push("D");

  if (letters.length === 0) {
    alert("Select at least one letter");
    return;
  }

  const seq = randomFromLetters(letters, length);

  const rowModeSel = document.getElementById("row-mode");

  // Stay in "random" mode
  rowModeSel.value = "random";
  
  randomRowSeqStr = seq;
  rowSeqStr = seq;

  updateLayout();
}

function editRowRandom() {
  const rowSel = document.getElementById("row-mode");
  const rowInputEl = document.getElementById("input-rows");

  rowSel.value = "custom";
  rowInputEl.value = randomRowSeqStr || rowSeqStr || "";

  if (typeof customRowSeqStr !== "undefined") {
    customRowSeqStr = rowInputEl.value.trim() || customRowSeqStr;
  }

  updateLayout();
}

// Returns the index of the run in `runs` that contains thread position `threadIndex`.
function runIndexForThread(runs, threadIndex) {
  let t = 0;
  for (let i = 0; i < runs.length; i++) {
    t += runs[i].len;
    if (threadIndex < t) return i;
  }
  return runs.length - 1;
}

function syncThreadColorArrays(colRuns, rowRuns, blockColRuns, blockRowRuns) {
  const baseColRuns        = calcRuns(_colBaseSeq);
  const baseColThreadCount = _colBaseSeq.length;
  const baseRowRuns        = calcRuns(_rowBaseSeq);
  const baseRowThreadCount = _rowBaseSeq.length;

  // ── Mode transition: remap colors between block-indexed and thread-indexed ──
  const modeChanged = granularColors !== _prevGranularColors;

  if (modeChanged && warpAColors.length > 0) {
    const oldA = warpAColors.slice();
    const oldB = warpBColors.slice();
    const newA = [], newB = [];

    if (granularColors) {
      // block → thread: spread each block run's color across all its threads
      let t = 0;
      for (let b = 0; b < blockColRuns.length; b++) {
        for (let k = 0; k < blockColRuns[b].len; k++) {
          newA[t] = oldA[b] ?? null;
          newB[t] = oldB[b] ?? null;
          t++;
        }
      }
    } else {
      // thread → block: take the first thread's color for each block run
      let t = 0;
      for (let b = 0; b < blockColRuns.length; b++) {
        newA[b] = oldA[t] ?? null;
        newB[b] = oldB[t] ?? null;
        t += blockColRuns[b].len;
      }
    }
    warpAColors = newA;
    warpBColors = newB;
  }

  if (modeChanged && weftAColors.length > 0) {
    const oldA = weftAColors.slice();
    const oldB = weftBColors.slice();
    const newA = [], newB = [];

    if (granularColors) {
      // block → thread
      let t = 0;
      for (let b = 0; b < blockRowRuns.length; b++) {
        for (let k = 0; k < blockRowRuns[b].len; k++) {
          newA[t] = oldA[b] ?? null;
          newB[t] = oldB[b] ?? null;
          t++;
        }
      }
    } else {
      // thread → block
      let t = 0;
      for (let b = 0; b < blockRowRuns.length; b++) {
        newA[b] = oldA[t] ?? null;
        newB[b] = oldB[t] ?? null;
        t += blockRowRuns[b].len;
      }
    }
    weftAColors = newA;
    weftBColors = newB;
  }

  // ── Length sync: handle sequence changes (repeats, new presets, etc.) ───────
  if (warpAColors.length !== colW.length) {
    const oldA = warpAColors.slice();
    const oldB = warpBColors.slice();
    warpAColors = [];
    warpBColors = [];
    let threadOffset = 0;
    for (let c = 0; c < colW.length; c++) {
      if (c < oldA.length) {
        warpAColors[c] = oldA[c];
        warpBColors[c] = oldB[c];
      } else if (baseColThreadCount > 0) {
        const baseThread = threadOffset % baseColThreadCount;
        const baseIdx    = granularColors ? baseThread : runIndexForThread(baseColRuns, baseThread);
        warpAColors[c] = oldA[baseIdx] ?? null;
        warpBColors[c] = oldB[baseIdx] ?? null;
      } else {
        warpAColors[c] = null;
        warpBColors[c] = null;
      }
      threadOffset += colRuns[c].len;
    }
  }

  if (weftAColors.length !== rowH.length) {
    const oldA = weftAColors.slice();
    const oldB = weftBColors.slice();
    weftAColors = [];
    weftBColors = [];
    let threadOffset = 0;
    for (let r = 0; r < rowH.length; r++) {
      if (r < oldA.length) {
        weftAColors[r] = oldA[r];
        weftBColors[r] = oldB[r];
      } else if (baseRowThreadCount > 0) {
        const baseThread = threadOffset % baseRowThreadCount;
        const baseIdx    = granularColors ? baseThread : runIndexForThread(baseRowRuns, baseThread);
        weftAColors[r] = oldA[baseIdx] ?? null;
        weftBColors[r] = oldB[baseIdx] ?? null;
      } else {
        weftAColors[r] = null;
        weftBColors[r] = null;
      }
      threadOffset += rowRuns[r].len;
    }
  }
}

// ─── Pickup Mode ─────────────────────────────────────────────────────────────

function initPickupGrid(newW, newH, preserve) {
  const old = pickupGrid;
  pickupGrid = [];
  for (let r = 0; r < newH; r++) {
    pickupGrid[r] = [];
    for (let c = 0; c < newW; c++) {
      pickupGrid[r][c] = preserve && old[r] ? (old[r][c] || false) : false;
    }
  }
}

function syncPickupColorArrays() {
  while (warpAColors.length < pickupW) { warpAColors.push(null); warpBColors.push(null); }
  warpAColors.length = pickupW;
  warpBColors.length = pickupW;
  while (weftAColors.length < pickupH) { weftAColors.push(null); weftBColors.push(null); }
  weftAColors.length = pickupH;
  weftBColors.length = pickupH;
}

function makePickupLayout() {
  colW   = Array(pickupW).fill(blockSize);
  rowH   = Array(pickupH).fill(blockSize);
  totalW = pickupW * blockSize;
  totalH = pickupH * blockSize;

  if (pickupGrid.length !== pickupH || (pickupH > 0 && pickupGrid[0].length !== pickupW)) {
    initPickupGrid(pickupW, pickupH, true);
  }
  syncPickupColorArrays();

  const swatchAreaHeight = topSwatchYB + swatchH + 4;
  const topMargin   = swatchAreaHeight + gridSwatchGap;
  const leftMargin  = padding;
  const rightMargin = weftSwatchGap + swatchW + swatchGap + swatchW + gridSwatchGap;

  resizeCanvas(totalW + leftMargin + rightMargin, totalH + topMargin);
  fitToViewport(totalW + leftMargin + rightMargin, totalH + topMargin);
  background(221);

  offsetX = leftMargin;
  offsetY = topMargin;
  gridOffsetX = offsetX;
  gridOffsetY = offsetY;
  gridWidth   = totalW;
  gridHeight  = totalH;

  const rightSwatchXA = offsetX + totalW + weftSwatchGap;
  const rightSwatchXB = rightSwatchXA + swatchW + swatchGap;

  // Draw grid cells
  noStroke();
  for (let r = 0; r < pickupH; r++) {
    for (let c = 0; c < pickupW; c++) {
      const isBack = flipped ? !pickupGrid[r][c] : pickupGrid[r][c];
      const x = offsetX + c * blockSize;
      const y = offsetY + r * blockSize;
      const warpCol = isBack ? (warpBColors[c] || colorB) : (warpAColors[c] || colorA);
      const weftCol = isBack ? (weftBColors[r] || colorB) : (weftAColors[r] || colorA);
      drawDitheredCell(x, y, blockSize, blockSize, warpCol, weftCol, 3);
    }
  }

  // Grid overlay
  if (document.getElementById('show-grid')?.checked) {
    for (let c = 0; c <= pickupW; c++) {
      const x = offsetX + c * blockSize;
      strokeWeight(c % 4 === 0 ? 1.5 : 0.5);
      stroke(221);
      line(x, offsetY, x, offsetY + totalH);
    }
    for (let r = 0; r <= pickupH; r++) {
      const y = offsetY + r * blockSize;
      strokeWeight(r % 4 === 0 ? 1.5 : 0.5);
      stroke(221);
      line(offsetX, y, offsetX + totalW, y);
    }
  }

  // Swatch column labels
  noStroke();
  fill(90);
  textAlign(CENTER, CENTER);
  textSize(12);
  text('A', rightSwatchXA + swatchW / 2, topSwatchYA + swatchH / 2);
  text('B', rightSwatchXB + swatchW / 2, topSwatchYB + swatchH / 2);
  textAlign(LEFT, CENTER);

  stroke(221);
  strokeWeight(2);

  // Warp swatches (top strip, left to right)
  for (let c = 0; c < pickupW; c++) {
    const x = offsetX + c * blockSize;
    fill(warpAColors[c] || colorA);
    rect(x, topSwatchYA, blockSize, swatchH);
    fill(warpBColors[c] || colorB);
    rect(x, topSwatchYB, blockSize, swatchH);
    const btnA = ensureSwatchButton(warpBtnA, c, 'A', () => openThreadPickerAtButton(btnA, 'warp', 'A', c), 'warp', 'A', c);
    const btnB = ensureSwatchButton(warpBtnB, c, 'B', () => openThreadPickerAtButton(btnB, 'warp', 'B', c), 'warp', 'B', c);
    placeBtnOverCanvasRect(btnA, x, topSwatchYA, x + blockSize, topSwatchYA + swatchH);
    placeBtnOverCanvasRect(btnB, x, topSwatchYB, x + blockSize, topSwatchYB + swatchH);
  }

  // Weft swatches (right strip)
  for (let r = 0; r < pickupH; r++) {
    const y = offsetY + r * blockSize;
    fill(weftAColors[r] || colorA);
    rect(rightSwatchXA, y, swatchW, blockSize);
    fill(weftBColors[r] || colorB);
    rect(rightSwatchXB, y, swatchW, blockSize);
    const btnA = ensureSwatchButton(weftBtnA, r, 'A', () => openThreadPickerAtButton(btnA, 'weft', 'A', r), 'weft', 'A', r);
    const btnB = ensureSwatchButton(weftBtnB, r, 'B', () => openThreadPickerAtButton(btnB, 'weft', 'B', r), 'weft', 'B', r);
    placeBtnOverCanvasRect(btnA, rightSwatchXA, y, rightSwatchXA + swatchW, y + blockSize);
    placeBtnOverCanvasRect(btnB, rightSwatchXB, y, rightSwatchXB + swatchW, y + blockSize);
  }

  noStroke();

  for (let i = pickupW; i < warpBtnA.length; i++) { warpBtnA[i]?.hide(); warpBtnB[i]?.hide(); }
  for (let i = pickupH; i < weftBtnA.length; i++) { weftBtnA[i]?.hide(); weftBtnB[i]?.hide(); }

  // Draw pen cursor outline
  if (_cursorCell) {
    const halfW = Math.floor(pickupPenW / 2);
    const halfH = Math.floor(pickupPenH / 2);
    const ox = offsetX + (_cursorCell.col - halfW) * blockSize;
    const oy = offsetY + (_cursorCell.row - halfH) * blockSize;
    const szW = pickupPenW * blockSize;
    const szH = pickupPenH * blockSize;
    noFill();
    strokeWeight(2);
    stroke(255);
    rect(ox, oy, szW, szH);
    strokeWeight(1);
    stroke(0);
    drawingContext.setLineDash([3, 3]);
    rect(ox, oy, szW, szH);
    drawingContext.setLineDash([]);
  }

  _prevGranularColors = true;
}

function updateModeVisibility() {
  const isPickup = draftMode === 'pickup';

  ['warp-panel', 'weft-panel', 'color-mode-row', 'show-sequences-row'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = isPickup ? 'none' : '';
  });

  const showGridRow = document.getElementById('show-grid-row');
  if (showGridRow) showGridRow.style.display = isPickup ? '' : 'none';

  const pickupPanel = document.getElementById('pickup-size-panel');
  if (pickupPanel) {
    const wasHidden = pickupPanel.style.display === 'none';
    pickupPanel.style.display = isPickup ? '' : 'none';
    if (isPickup && wasHidden) pickupPanel.open = true;
  }

  const pickupPenPanel = document.getElementById('pickup-pen-panel');
  if (pickupPenPanel) {
    const wasHidden = pickupPenPanel.style.display === 'none';
    pickupPenPanel.style.display = isPickup ? '' : 'none';
    if (isPickup && wasHidden) pickupPenPanel.open = true;
  }

  const flipBtn = document.getElementById('flip-btn');
  if (flipBtn) flipBtn.style.display = '';

  const labelA = document.getElementById('label-block-a');
  const labelB = document.getElementById('label-block-b');
  if (labelA) labelA.textContent = isPickup ? 'Front' : 'Block A';
  if (labelB) labelB.textContent = isPickup ? 'Back'  : 'Block B';

  const randWarpA = document.getElementById('rand-warp-a-btn');
  const randWarpB = document.getElementById('rand-warp-b-btn');
  const randWeftA = document.getElementById('rand-weft-a-btn');
  const randWeftB = document.getElementById('rand-weft-b-btn');
  if (randWarpA) randWarpA.textContent = isPickup ? 'Warp Front' : 'Warp A';
  if (randWarpB) randWarpB.textContent = isPickup ? 'Warp Back'  : 'Warp B';
  if (randWeftA) randWeftA.textContent = isPickup ? 'Weft Front' : 'Weft A';
  if (randWeftB) randWeftB.textContent = isPickup ? 'Weft Back'  : 'Weft B';

  const canvasArea = document.querySelector('.canvas-area');
  if (canvasArea) canvasArea.classList.toggle('pickup-mode', isPickup);
}

function screenToPickupCell(screenX, screenY) {
  const wrap = document.getElementById('canvas-scale-wrap');
  if (!wrap) return null;
  const wr = wrap.getBoundingClientRect();
  const cx = (screenX - wr.left) / currentScale;
  const cy = (screenY - wr.top)  / currentScale;
  if (cx < offsetX || cx >= offsetX + totalW || cy < offsetY || cy >= offsetY + totalH) return null;
  const col = Math.floor((cx - offsetX) / blockSize);
  const row = Math.floor((cy - offsetY) / blockSize);
  if (col < 0 || col >= pickupW || row < 0 || row >= pickupH) return null;
  return { col, row };
}

function syncPenSizeLabels() {
  const sw = document.getElementById('pickup-pen-width');
  const lw = document.getElementById('pickup-pen-width-label');
  if (sw && lw) { pickupPenW = parseInt(sw.value) || 1; lw.textContent = sw.value; }

  const sh = document.getElementById('pickup-pen-height');
  const lh = document.getElementById('pickup-pen-height-label');
  if (sh && lh) { pickupPenH = parseInt(sh.value) || 1; lh.textContent = sh.value; }
}

function syncPickupSizeLabels() {
  const sw = document.getElementById('pickup-width');
  const lw = document.getElementById('pickup-width-label');
  if (sw && lw) lw.textContent = sw.value;

  const sh = document.getElementById('pickup-height');
  const lh = document.getElementById('pickup-height-label');
  if (sh && lh) lh.textContent = sh.value;
}

function paintPickupCells(centerRow, centerCol, value) {
  const halfW = Math.floor(pickupPenW / 2);
  const halfH = Math.floor(pickupPenH / 2);
  let changed = false;
  for (let dr = -halfH; dr < -halfH + pickupPenH; dr++) {
    for (let dc = -halfW; dc < -halfW + pickupPenW; dc++) {
      const r = centerRow + dr;
      const c = centerCol + dc;
      if (r >= 0 && r < pickupH && c >= 0 && c < pickupW) {
        pickupGrid[r][c] = value;
        changed = true;
      }
    }
  }
  return changed;
}

function onPickupPointerDown(e) {
  if (draftMode !== 'pickup') return;
  if (e.target.closest('.swatch-btn') || e.target.closest('.iro-popover') || e.target.closest('.flip-btn')) return;
  const cell = screenToPickupCell(e.clientX, e.clientY);
  if (!cell) return;
  _pickupDrawValue = !pickupGrid[cell.row][cell.col];
  _pickupDrawing = true;
  paintPickupCells(cell.row, cell.col, _pickupDrawValue);
  makePickupLayout();
}

function onPickupPointerMove(e) {
  if (draftMode !== 'pickup') return;
  if (_swatchDragActive) return;
  const cell = screenToPickupCell(e.clientX, e.clientY);

  // Update cursor indicator
  const prevCursor = _cursorCell;
  _cursorCell = cell;
  const cursorMoved = !cell !== !prevCursor ||
    (cell && prevCursor && (cell.row !== prevCursor.row || cell.col !== prevCursor.col));

  if (_pickupDrawing && cell) {
    if (paintPickupCells(cell.row, cell.col, _pickupDrawValue)) {
      makePickupLayout();
      return; // already redrawn
    }
  }

  if (cursorMoved) {
    makePickupLayout();
  }
}

function onPickupPointerLeave() {
  if (_cursorCell !== null) {
    _cursorCell = null;
    if (draftMode === 'pickup') makePickupLayout();
  }
}

function onPickupPointerUp() {
  const wasDrawing = _pickupDrawing;
  _pickupDrawing = false;

  if (_swatchDragActive) {
    if (!_swatchDragMoved && _pendingSwatchClick) {
      _pendingSwatchClick();
    }
    _swatchDragActive   = false;
    _swatchDragMoved    = false;
    _pendingSwatchClick = null;
    // color changes already saved via makeLayout() → saveStateToStorage()
  } else if (wasDrawing) {
    // pickup grid strokes save here since makePickupLayout() doesn't call saveStateToStorage()
    saveStateToStorage();
  }
}

// ─────────────────────────────────────────────────────────────────────────────

function drawDitheredCell(x, y, w, h, warpCol, weftCol, pixel = 2) {
  noStroke();
  for (let yy = y; yy < y + h; yy += pixel) {
    for (let xx = x; xx < x + w; xx += pixel) {
      const useWarp = ((Math.floor(xx / pixel) + Math.floor(yy / pixel)) % 2) === 0;
      fill(useWarp ? warpCol : weftCol);
      rect(xx, yy, pixel, pixel);
    }
  }
}

function openInfoPanel() {
  const panel = document.getElementById("info-panel");
  if (panel) panel.classList.add("open");
}

function closeInfoPanel() {
  const panel = document.getElementById("info-panel");
  if (panel) panel.classList.remove("open");
}

document.addEventListener("click", (e) => {
  const panel = document.getElementById("info-panel");
  if (!panel || !panel.classList.contains("open")) return;
  if (e.target === panel) panel.classList.remove("open");
});

// for swatch buttons

function ensureSwatchButton(arr, i, label, onClickFn, kind, layer, idx) {
  if (!arr[i]) {
    const b = createButton(label);
    b.addClass("swatch-btn");
    b.parent("canvas-container");
    b.style("position", "absolute");
    b.elt._swatchKind  = kind;
    b.elt._swatchLayer = layer;
    b.elt._swatchIdx   = (idx !== undefined) ? idx : i;
    b.elt.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      _swatchDragStartX   = e.clientX;
      _swatchDragStartY   = e.clientY;
      _swatchDragMoved    = false;
      _swatchDragActive   = true;
      _pendingSwatchClick = onClickFn;
    });
    arr[i] = b;
  }
  return arr[i];
}

function openThreadPickerAtButton(btn, kind, layer, index) {
  activeThreadTarget = { kind, layer, index };

  const effectiveColor = (kind === "warp")
    ? (layer === 'A' ? (warpAColors[index] ?? colorA) : (warpBColors[index] ?? colorB))
    : (layer === 'A' ? (weftAColors[index] ?? colorA) : (weftBColors[index] ?? colorB));

    const container = document.getElementById("canvas-container");
    const cr = container.getBoundingClientRect();
    const br = btn.elt.getBoundingClientRect();

    iroPopover.style.display = "block";
    const pr = iroPopover.getBoundingClientRect();
    const popW = pr.width;
    const popH = pr.height;
    const pad = 12;

    let x = br.right + pad;
    let y = br.top + pad*1.5;

    const maxX = window.innerWidth - popW - pad;
    const maxY = window.innerHeight - popH - pad;

    if (x > maxX) x = br.left - popW - pad;
    x = Math.max(pad, Math.min(x, maxX));
    y = Math.max(pad, Math.min(y, maxY));

    renderIroSwatches(collectUsedColors());

    iroPopover.style.left = `${x}px`;
    iroPopover.style.top  = `${y}px`;
    iroPopover.style.display = "block";

    iroIgnoreChange = true;
    iroPicker.color.hexString = effectiveColor;
    iroIgnoreChange = false;

    lastAppliedHex = effectiveColor;

}

function placeBtnOverCanvasRect(btn, x0, y0, x1, y1) {
  const wrap = document.getElementById("canvas-scale-wrap");

  const wrapLeft = parseFloat(wrap.style.left || 0);
  const wrapTop  = parseFloat(wrap.style.top  || 0);

  const x = wrapLeft + x0 * currentScale;
  const y = wrapTop  + y0 * currentScale;
  const w = (x1-x0) * currentScale;
  const h = (y1-y0) * currentScale;

  btn.position(x,y);
  btn.size(Math.max(6, w), Math.max(6, h));
  btn.show();
}


function canvasToViewport(xc, yc, canvasRect, canvasEl) {
  const sx = canvasEl.width / width;
  const sy = canvasEl.height / height;

  const bx = xc * sx;
  const by = yc * sy;
  
  return {
    x: canvasRect.left + (bx / canvasEl.width)  * canvasRect.width,
    y: canvasRect.top  + (by / canvasEl.height) * canvasRect.height
  };
}

function getComputedScale(el) {
  const t = getComputedStyle(el).transform;
  if (!t || t === "none") return 1;
  const m = new DOMMatrixReadOnly(t);
  return m.a; 
}

let currentScale = 1;

function fitToViewport(contentW, contentH) {
  const wrap = document.getElementById("canvas-scale-wrap");
  const host = document.getElementById("canvas-container");

  const hostRect = host.getBoundingClientRect();
  const cs = getComputedStyle(host);

  const padL = parseFloat(cs.paddingLeft);
  const padR = parseFloat(cs.paddingRight);
  const padT = parseFloat(cs.paddingTop);
  const padB = parseFloat(cs.paddingBottom);

  const availW = hostRect.width - padL - padR;
  const availH = hostRect.height - padT - padB;

  const s = Math.min(availW / contentW, availH / contentH, 1);
  currentScale = s;

  const scaledW = contentW * s;
  const scaledH = contentH * s;

  const left = padL + (availW - scaledW) / 2;
  const top  = padT + (availH - scaledH) / 2;

  wrap.style.transform = `scale(${s})`;
  wrap.style.left = `${left}px`;
  wrap.style.top  = `${top}px`;
}

document.addEventListener("pointerdown", (e) => {
  if (!iroPopover || iroPopover.style.display === "none") return;

  // clicks inside popover: keep it open
  if (iroPopover.contains(e.target)) return;

  // clicks on swatch buttons: keep it open (your button handler will reposition it)
  if (e.target.closest && e.target.closest(".swatch-btn")) return;

  iroPopover.style.display = "none";
  activeThreadTarget = null;
});

function syncBaseChips() {
  const a = document.getElementById("baseA-chip");
  const b = document.getElementById("baseB-chip");

  if (a) a.style.backgroundColor = colorA;
  if (b) b.style.backgroundColor = colorB;
}

function openBasePicker(layer) {
  activeThreadTarget = { kind: "base", layer };

  const chip = document.getElementById(layer === "A" ? "baseA-chip" : "baseB-chip");
  const br = chip.getBoundingClientRect();

  const popW = 260, popH = 260;
  let x = br.right + 12;
  let y = br.top;

  const maxX = window.innerWidth  - popW - 8;
  const maxY = window.innerHeight - popH - 8;
  if (x > maxX) x = br.left - popW - 12;
  x = Math.max(8, Math.min(x, maxX));
  y = Math.max(8, Math.min(y, maxY));

  iroPopover.style.left = `${x}px`;
  iroPopover.style.top  = `${y}px`;
  iroPopover.style.display = "block";

  const effective = (layer === "A") ? colorA : colorB;

  iroIgnoreChange = true;
  iroPicker.color.hexString = effective;
  iroIgnoreChange = false;

  lastAppliedHex = effective;
}

function renderIroSwatches() {
  const wrap = document.getElementById("iro-swatches");
  if (!wrap) return;

  syncPaletteSliderMax();
  wrap.innerHTML = "";
  
  userSwatches.forEach(hex => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "iro-swatch";
    b.style.backgroundColor = hex;

    b.addEventListener("click", (e) => {
      e.stopPropagation(); 
      iroIgnoreChange = true;
      iroPicker.color.hexString = hex;
      iroIgnoreChange = false;

      lastAppliedHex = hex;
      applyPickedColor(hex);
    });

    wrap.appendChild(b);
  });
}

function collectUsedColors() {
  const set = new Set();

  if (Array.isArray(userSwatches)) {
    for (const s of userSwatches) if (s) set.add(String(s));
  }

  if (colorA) set.add(String(colorA));
  if (colorB) set.add(String(colorB));

  const pools = [warpAColors, warpBColors, weftAColors, weftBColors];
  for (const arr of pools) {
    if (!Array.isArray(arr)) continue;
    for (const c of arr) if (c) set.add(String(c));
  }

  const out = Array.from(set);
  return out.slice(0,24);

}

function addCurrentColorAsSwatch() {
  const hex = iroPicker.color.hexString;

  if (!userSwatches.includes(hex)) {
    userSwatches.unshift(hex);
    userSwatches = userSwatches.slice(0, 24);
    renderIroSwatches();
  }
}

let _activeRandomPalette = null;

function refreshRandomPalette() {
  const slider = document.getElementById("palette-size");
  const limit = slider ? Math.min(parseInt(slider.value) || userSwatches.length, userSwatches.length) : userSwatches.length;
  // Shuffle a copy of the full palette and take the first `limit` entries
  const shuffled = userSwatches.slice().sort(() => Math.random() - 0.5);
  _activeRandomPalette = shuffled.slice(0, limit);
}

function randomSwatch() {
  const pool = _activeRandomPalette || userSwatches;
  return pool[Math.floor(Math.random() * pool.length)];
}

function syncPaletteSliderLabel() {
  const slider = document.getElementById("palette-size");
  const label  = document.getElementById("palette-size-label");
  if (slider && label) label.textContent = slider.value;
}

function syncPaletteSliderMax() {
  const slider = document.getElementById("palette-size");
  if (!slider) return;
  const newMax = userSwatches.length;
  const oldMax = parseInt(slider.max);
  // If slider was at max (all swatches), keep it pinned to the new max
  const wasAtMax = parseInt(slider.value) >= oldMax;
  slider.max = newMax;
  if (wasAtMax || parseInt(slider.value) > newMax) {
    slider.value = newMax;
  }
  syncPaletteSliderLabel();
}

function randomizeBaseColors() {
  refreshRandomPalette();
  colorA = randomSwatch();
  colorB = randomSwatch();
  syncBaseChips();
  makeLayout();
}

function randomizeWarpAColors() {
  refreshRandomPalette();
  for (let c = 0; c < colW.length; c++) warpAColors[c] = randomSwatch();
  makeLayout();
}

function randomizeWarpBColors() {
  refreshRandomPalette();
  for (let c = 0; c < colW.length; c++) warpBColors[c] = randomSwatch();
  makeLayout();
}

function randomizeWeftAColors() {
  refreshRandomPalette();
  for (let r = 0; r < rowH.length; r++) weftAColors[r] = randomSwatch();
  makeLayout();
}

function randomizeWeftBColors() {
  refreshRandomPalette();
  for (let r = 0; r < rowH.length; r++) weftBColors[r] = randomSwatch();
  makeLayout();
}

function resetColors() {
  colorA = '#000000';
  colorB = '#ffffff';
  warpAColors = warpAColors.map(() => null);
  warpBColors = warpBColors.map(() => null);
  weftAColors = weftAColors.map(() => null);
  weftBColors = weftBColors.map(() => null);
  syncBaseChips();
  makeLayout();
}

function toggleFlip() {
  flipped = !flipped;
  const btn = document.getElementById("flip-btn");
  if (btn) btn.classList.toggle("active", flipped);
  makeLayout();
}

function toggleSidebar() {
  const sidebar = document.querySelector('.sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  const isOpen  = sidebar.classList.toggle('open');
  overlay.classList.toggle('active', isOpen);
}

function closeSidebar() {
  const sidebar = document.querySelector('.sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  sidebar.classList.remove('open');
  overlay.classList.remove('active');
}

function windowResized() {
  updateLayout();
}

// ─── Swatch drag-to-paint ─────────────────────────────────────────────────────

function onSwatchDragMove(e) {
  if (!_swatchDragActive) return;
  const dx = e.clientX - _swatchDragStartX;
  const dy = e.clientY - _swatchDragStartY;
  if (!_swatchDragMoved && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
    _swatchDragMoved = true;
  }
  if (_swatchDragMoved && lastAppliedHex) {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const target = el?.classList.contains('swatch-btn') ? el : el?.closest?.('.swatch-btn');
    if (target?._swatchKind) {
      paintSwatchDrag(target, lastAppliedHex);
    }
  }
}

function paintSwatchDrag(elt, hex) {
  const kind  = elt._swatchKind;
  const layer = elt._swatchLayer;
  const idx   = elt._swatchIdx;
  if (!kind || !layer || idx === undefined) return;
  if (kind === 'warp') {
    if (layer === 'A') warpAColors[idx] = hex;
    else               warpBColors[idx] = hex;
  } else {
    if (layer === 'A') weftAColors[idx] = hex;
    else               weftBColors[idx] = hex;
  }
  makeLayout();
}

// ─── Persistence ──────────────────────────────────────────────────────────────

function setEl(id, prop, val) {
  const el = document.getElementById(id);
  if (el) el[prop] = val;
}

// ─── Per-mode color memory ─────────────────────────────────────────────────────
function snapshotColors() {
  return {
    warpAColors:    warpAColors.slice(),
    warpBColors:    warpBColors.slice(),
    weftAColors:    weftAColors.slice(),
    weftBColors:    weftBColors.slice(),
    granularColors,
  };
}

function cloneColorSnap(snap) {
  if (!snap) return null;
  return {
    warpAColors:    snap.warpAColors.slice(),
    warpBColors:    snap.warpBColors.slice(),
    weftAColors:    snap.weftAColors.slice(),
    weftBColors:    snap.weftBColors.slice(),
    granularColors: snap.granularColors,
  };
}

function applyColorSnap(snap) {
  if (!snap) return;
  warpAColors         = snap.warpAColors.slice();
  warpBColors         = snap.warpBColors.slice();
  weftAColors         = snap.weftAColors.slice();
  weftBColors         = snap.weftBColors.slice();
  granularColors      = snap.granularColors;
  _prevGranularColors = granularColors; // prevent syncThreadColorArrays from remapping
}

function buildStateObject() {
  return {
    version: 1,
    draftMode,
    colSeqStr, customColSeqStr, randomColSeqStr, lastWarpPresetValue,
    rowSeqStr, randomRowSeqStr, lastRowMode,
    colRepeatCount, rowRepeatCount, mirrorCols,
    pickupW, pickupH,
    pickupGrid: pickupGrid.map(r => Array.isArray(r) ? r.slice() : []),
    pickupPenW, pickupPenH,
    colorA, colorB, granularColors, flipped,
    warpAColors: warpAColors.slice(),
    warpBColors: warpBColors.slice(),
    weftAColors: weftAColors.slice(),
    weftBColors: weftBColors.slice(),
    userSwatches: userSwatches.slice(),
    savedBlockColors:  cloneColorSnap(_savedBlockColors),
    savedPickupColors: cloneColorSnap(_savedPickupColors),
    ui: {
      draftMode,
      warpPreset:      document.getElementById('warp-preset')?.value        ?? 'ABABABABABABAB',
      inputCols:       document.getElementById('input-cols')?.value          ?? '',
      colRepeats:      document.getElementById('col-repeats')?.value         ?? '1',
      colMirror:       document.getElementById('col-mirror')?.checked        ?? false,
      rowMode:         document.getElementById('row-mode')?.value            ?? 'tromp',
      inputRows:       document.getElementById('input-rows')?.value          ?? '',
      rowRepeats:      document.getElementById('row-repeats')?.value         ?? '1',
      showLabels:      document.getElementById('show-labels')?.checked       ?? false,
      showGrid:        document.getElementById('show-grid')?.checked         ?? false,
      colorMode:       document.querySelector('input[name="color-mode"]:checked')?.value ?? 'block',
      pickupWidth:     document.getElementById('pickup-width')?.value        ?? '40',
      pickupHeight:    document.getElementById('pickup-height')?.value       ?? '40',
      pickupPenWidth:  document.getElementById('pickup-pen-width')?.value    ?? '1',
      pickupPenHeight: document.getElementById('pickup-pen-height')?.value   ?? '1',
    }
  };
}

function applyStateObject(s) {
  if (!s || s.version !== 1) return;
  draftMode           = s.draftMode           || 'block';
  colSeqStr           = s.colSeqStr           || defaultColSeqStr;
  customColSeqStr     = s.customColSeqStr      || colSeqStr;
  randomColSeqStr     = s.randomColSeqStr      || colSeqStr;
  lastWarpPresetValue = s.lastWarpPresetValue  || 'custom';
  rowSeqStr           = s.rowSeqStr            || defaultRowSeqStr;
  randomRowSeqStr     = s.randomRowSeqStr      || rowSeqStr;
  lastRowMode         = s.lastRowMode          || 'tromp';
  colRepeatCount      = s.colRepeatCount       || 1;
  rowRepeatCount      = s.rowRepeatCount       || 1;
  mirrorCols          = s.mirrorCols           || false;
  pickupW             = s.pickupW              || 40;
  pickupH             = s.pickupH              || 40;
  pickupGrid          = Array.isArray(s.pickupGrid)
    ? s.pickupGrid.map(r => Array.isArray(r) ? r.slice() : [])
    : [];
  pickupPenW          = s.pickupPenW           || 1;
  pickupPenH          = s.pickupPenH           || 1;
  colorA              = s.colorA               || '#000000';
  colorB              = s.colorB               || '#ffffff';
  granularColors      = s.granularColors       || false;
  _prevGranularColors = granularColors;
  flipped             = s.flipped              || false;
  warpAColors         = Array.isArray(s.warpAColors) ? s.warpAColors.slice() : [];
  warpBColors         = Array.isArray(s.warpBColors) ? s.warpBColors.slice() : [];
  weftAColors         = Array.isArray(s.weftAColors) ? s.weftAColors.slice() : [];
  weftBColors         = Array.isArray(s.weftBColors) ? s.weftBColors.slice() : [];
  if (Array.isArray(s.userSwatches) && s.userSwatches.length > 0) {
    userSwatches = s.userSwatches.slice();
  }
  _savedBlockColors  = cloneColorSnap(s.savedBlockColors  || null);
  _savedPickupColors = cloneColorSnap(s.savedPickupColors || null);
  _prevDraftMode     = s.draftMode || 'block'; // so first updateLayout doesn't re-trigger a swap

  const ui = s.ui || {};
  setEl('draft-mode',        'value',   ui.draftMode    || 'block');
  setEl('warp-preset',       'value',   ui.warpPreset   || 'ABABABABABABAB');
  setEl('input-cols',        'value',   ui.inputCols    || '');
  setEl('col-repeats',       'value',   ui.colRepeats   || '1');
  setEl('col-mirror',        'checked', !!ui.colMirror);
  setEl('row-mode',          'value',   ui.rowMode      || 'tromp');
  setEl('input-rows',        'value',   ui.inputRows    || '');
  setEl('row-repeats',       'value',   ui.rowRepeats   || '1');
  setEl('show-labels',       'checked', !!ui.showLabels);
  setEl('show-grid',         'checked', !!ui.showGrid);
  setEl('pickup-width',      'value',   String(ui.pickupWidth     || 40));
  setEl('pickup-height',     'value',   String(ui.pickupHeight    || 40));
  setEl('pickup-pen-width',  'value',   String(ui.pickupPenWidth  || 1));
  setEl('pickup-pen-height', 'value',   String(ui.pickupPenHeight || 1));

  const colorMode = ui.colorMode || 'block';
  const radio = document.querySelector(`input[name="color-mode"][value="${colorMode}"]`);
  if (radio) radio.checked = true;

  const flipBtn = document.getElementById('flip-btn');
  if (flipBtn) flipBtn.classList.toggle('active', !!s.flipped);
}

function saveStateToStorage() {
  try {
    localStorage.setItem('blockDraftState', JSON.stringify(buildStateObject()));
  } catch(e) { /* quota exceeded or private browsing */ }
}

function loadStateFromStorage() {
  try {
    const raw = localStorage.getItem('blockDraftState');
    if (!raw) return false;
    const s = JSON.parse(raw);
    applyStateObject(s);
    return true;
  } catch(e) { return false; }
}

function exportState() {
  const raw  = prompt('Save as:', 'block-draft');
  if (raw === null) return;                          // cancelled
  const name = raw.trim() || 'block-draft';
  const filename = name.endsWith('.json') ? name : name + '.json';

  const data = buildStateObject();
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function importState() {
  const input  = document.createElement('input');
  input.type   = 'file';
  input.accept = '.json,application/json';
  input.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const s = JSON.parse(ev.target.result);
        applyStateObject(s);
        updateLayout();
        syncBaseChips();
        renderIroSwatches();
      } catch(err) {
        alert('Could not read save file: ' + err.message);
      }
    };
    reader.readAsText(file);
  });
  input.click();
}

function resetToDefaults() {
  localStorage.removeItem('blockDraftState');
  // preserve whichever mode (block / pickup) the user is currently in
  const currentMode   = draftMode;
  draftMode           = currentMode;
  colSeqStr           = defaultColSeqStr;
  customColSeqStr     = defaultColSeqStr;
  randomColSeqStr     = defaultColSeqStr;
  lastWarpPresetValue = 'custom';
  rowSeqStr           = defaultRowSeqStr;
  randomRowSeqStr     = defaultRowSeqStr;
  lastRowMode         = 'tromp';
  colRepeatCount      = 1;
  rowRepeatCount      = 1;
  mirrorCols          = false;
  flipped             = false;
  pickupW             = 40;
  pickupH             = 40;
  pickupGrid          = [];
  pickupPenW          = 1;
  pickupPenH          = 1;
  colorA              = '#000000';
  colorB              = '#ffffff';
  granularColors      = false;
  _prevGranularColors = false;
  _savedBlockColors   = null;
  _savedPickupColors  = null;
  _prevDraftMode      = currentMode;
  warpAColors         = [];
  warpBColors         = [];
  weftAColors         = [];
  weftBColors         = [];

  setEl('warp-preset',       'value',   'custom');
  setEl('input-cols',        'value',   defaultColSeqStr);
  setEl('col-repeats',       'value',   '1');
  setEl('col-mirror',        'checked', false);
  setEl('row-mode',          'value',   'tromp');
  setEl('input-rows',        'value',   '');
  setEl('row-repeats',       'value',   '1');
  setEl('show-labels',       'checked', false);
  setEl('show-grid',         'checked', false);
  setEl('pickup-width',      'value',   '40');
  setEl('pickup-height',     'value',   '40');
  setEl('pickup-pen-width',  'value',   '1');
  setEl('pickup-pen-height', 'value',   '1');
  const radio = document.querySelector('input[name="color-mode"][value="block"]');
  if (radio) radio.checked = true;

  const flipBtn = document.getElementById('flip-btn');
  if (flipBtn) flipBtn.classList.remove('active');

  updateLayout();
  syncBaseChips();
  renderIroSwatches();
}