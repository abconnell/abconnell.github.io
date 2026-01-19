let blockSize = 20;

let defaultColSeqStr = "AAABBBAB";
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

let colorA = '#000000';
let colorB = '#ffffff';
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

    pixelDensity(1);

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

    updateLayout()
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

  //run-length with repeated sequences
  const colRuns = calcRuns(colSeqRepeated);
  const rowRuns = calcRuns(rowSeqRepeated);

  //run lengths to sizes
  colW = colRuns.map(r => r.len * blockSize);
  rowH = rowRuns.map(r => r.len * blockSize);

  //call thread arrays
  syncThreadColorArrays()

  //toggle when letter changes
  const colPhase = phasesFromRuns(colRuns);
  const rowPhase = phasesFromRuns(rowRuns);

  // compute total size of grid
  totalW = 0;
  totalH = 0;
  for (let c = 0; c < colW.length; c++) totalW += colW[c];
  for (let r = 0; r < rowH.length; r++) totalH += rowH[r];

  // store column positions for the color picker hit detection
  colPositions = [];
  let accumX = 0;
  for (let c=0; c < colW.length; c++) {
    colPositions.push({
      start: accumX, 
      end: accumX + colW[c]
    });
    accumX += colW[c]
  }

  // resize canvas to fit labels
  const showLabels = document.getElementById("show-labels").checked;
  const swatchAreaHeight = topSwatchYB + swatchH + 4;
  const swatchAreaWidth  = leftSwatchXB + swatchW + 4;
  const topMargin   = swatchAreaHeight + gridSwatchGap;
  const leftMargin = swatchAreaWidth + gridSwatchGap;
  const rightMargin = showLabels ? 40 : 0;

  resizeCanvas(totalW + leftMargin + rightMargin, totalH + topMargin);
  fitToViewport(totalW + leftMargin + rightMargin, totalH + topMargin);
  background(221);

  offsetX = leftMargin;
  offsetY = topMargin;

  gridOffsetX = offsetX;
  gridOffsetY = offsetY;
  gridWidth   = totalW;
  gridHeight  = totalH;

  //draw grid
  let y = offsetY;
  for (let r = 0; r < rowH.length; r++) {
    let x = offsetX;

    const rowChar = rowRuns[r].ch;

    for (let c = 0; c < colW.length; c++) {
      let blockLetter;
      if (rowChar === 'C') {
        blockLetter = 'A';
      } else if (rowChar === 'D') {
        blockLetter = 'B';
      } else {
        const on = xor(rowPhase[r], colPhase[c]);
        blockLetter = on ? 'B' : 'A';
      }

      const baseFill = (blockLetter === 'A') ? colorA : colorB;
      fill (baseFill);
      rect(x,y, colW[c], rowH[r]);

      let warpCol, weftCol;
      if (blockLetter === 'A') {
        warpCol = warpAColors[c] || colorA;
        weftCol = weftAColors[r] || colorA;
      } else {
        warpCol = warpBColors[c] || colorB;
        weftCol = weftBColors[r] || colorB;
      }

      // draw dithered overlay
      drawDitheredCell(x, y, colW[c], rowH[r], warpCol, weftCol, 2);

      x += colW[c];
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

  const labelX = offsetX - 36;
  text('A', labelX, topSwatchYA + swatchH / 2 + 2);
  text('B', labelX + 15, topSwatchYB + swatchH / 2);

  stroke (221);
  strokeWeight(2);

  let xPos = offsetX;
  for (let c = 0; c < colW.length; c++) {
    const w = colW[c];

    fill(warpAColors[c] || colorA);
    rect(xPos, topSwatchYA, w, swatchH);

    fill(warpBColors[c] || colorB);
    rect(xPos, topSwatchYB, w, swatchH);

    //buttons
    const btnA = ensureSwatchButton(warpBtnA, c, "A", () =>
      openThreadPickerAtButton(btnA, "warp", "A", c)
    );

    const btnB = ensureSwatchButton(warpBtnB, c, "B", () =>
      openThreadPickerAtButton(btnB, "warp", "B", c)
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

    xPos += w;
  }

  let yPos = offsetY;
  for (let r = 0; r < rowH.length; r++) {
    const h = rowH[r];

    fill(weftAColors[r] || colorA);
    rect(leftSwatchXA, yPos, swatchW, h);

    fill(weftBColors[r] || colorB);
    rect(leftSwatchXB, yPos, swatchW, h);

    //buttons
    const btnA = ensureSwatchButton(weftBtnA, r, "A", () =>
      openThreadPickerAtButton(btnA, "weft", "A", r)
    );

    const btnB = ensureSwatchButton(weftBtnB, r, "B", () =>
      openThreadPickerAtButton(btnB, "weft", "B", r)
    );

    placeBtnOverCanvasRect(
      btnA,
      leftSwatchXA, yPos,
      leftSwatchXA + swatchW, yPos + h
    );

    placeBtnOverCanvasRect(
      btnB,
      leftSwatchXB, yPos,
      leftSwatchXB + swatchW, yPos + h
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
    
    const weftStripW = rightMargin; 
    const weftStripX = width - weftStripW;
    rect(weftStripX, offsetY, weftStripW, totalH);

    fill(0);
    noStroke();
    textSize(12);
    textAlign(CENTER, BOTTOM);

    let xPos = offsetX;
    for (let c = 0; c < colW.length; c++) {
      const run  = colRuns[c];  
      const lab  = run.len > 1 ? run.ch + run.len : run.ch;
      const xMid = xPos + colW[c] / 2;
      const yLab = topSwatchYA - 5;  

      text(lab, xMid, yLab);
      xPos += colW[c];
    }

    textAlign(LEFT, CENTER);
    let yPos = offsetY;
    const xLabel = width - 30; 

    for (let r = 0; r < rowH.length; r++) {
      const run  = rowRuns[r];
      const lab  = run.len > 1 ? run.ch + run.len : run.ch;
      const yMid = yPos + rowH[r] / 2;

      text(lab, xLabel, yMid);
      yPos += rowH[r];
    }
  }

  for (let i = colW.length; i < warpBtnA.length; i++) { warpBtnA[i]?.hide(); warpBtnB[i]?.hide(); }
  for (let i = rowH.length; i < weftBtnA.length; i++) { weftBtnA[i]?.hide(); weftBtnB[i]?.hide(); }

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
  save("blocks.png");
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

function syncThreadColorArrays() {
  if (warpAColors.length !== colW.length) {
    const oldA = warpAColors.slice();
    const oldB = warpBColors.slice();
    warpAColors = [];
    warpBColors = [];
    for (let c = 0; c < colW.length; c++) {
      warpAColors[c] = (oldA[c] !== undefined) ? oldA[c] : null;
      warpBColors[c] = (oldB[c] !== undefined) ? oldB[c] : null;
    }
  }

  if (weftAColors.length !== rowH.length) {
    const oldA = weftAColors.slice();
    const oldB = weftBColors.slice();
    weftAColors = [];
    weftBColors = [];
    for (let r = 0; r < rowH.length; r++) {
      weftAColors[r] = (oldA[r] !== undefined) ? oldA[r] : null;
      weftBColors[r] = (oldB[r] !== undefined) ? oldB[r] : null;
    }
  }
}

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

function ensureSwatchButton(arr, i, label, onClick) {
  if (!arr[i]) {
    const b = createButton(label);
    b.addClass("swatch-btn");
    b.parent("canvas-container");
    b.style("position", "absolute");
    b.mousePressed(onClick);
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

    const popW = 260;
    const popH = 260;

    let x = (br.right - cr.left) + 12;
    let y = (br.top - cr.top);

    const maxY = cr.height - popH - 8;
    y = Math.max(8, Math.min(y, maxY));

    const maxX = cr.width - popW - 8;
    if (x > maxX) x = (br.left - cr.left) - popW - 12;
    x = Math.max(8, Math.min(x,maxX));

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