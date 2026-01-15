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
let threadPicker;
let activeThreadTarget = null;

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
    let cnv = createCanvas(window.innerWidth - 40, window.innerHeight);
    cnv.parent("canvas-container");
    background(255);
    noStroke();

    updateLayout()

    threadPicker = createColorPicker('#ff0000');
    threadPicker.id('thread-picker');
    threadPicker.position(-1000,-1000);
    threadPicker.input(onThreadColorChange);
}

let colorChangeTimeout = null;

function onThreadColorChange() {
  if (!activeThreadTarget) return;
  const val = threadPicker.value();
  const { kind, layer, index } = activeThreadTarget;
  
  if (kind === "warp") {
    if (layer === 'A') warpAColors[index] = val;
    else warpBColors[index] = val;
  } else {
    if (layer === 'A') weftAColors[index] = val;
    else weftBColors[index] = val;
  }

  if (colorChangeTimeout) clearTimeout(colorChangeTimeout);
  colorChangeTimeout = setTimeout(() => {
    makeLayout();
    colorChangeTimeout = null;
  }, 100);

  makeLayout();
}

let xWhenClicked = 0

function mousePressed(e) {
  let canvas = document.getElementById("defaultCanvas0")
  if(!canvas) return;

  const pickerEl = threadPicker?.elt;
  if (e && pickerEl && e.target === pickerEl) return;

  if (e && e.target !== canvas) {
    activeThreadTarget = null;
    threadPicker.position(-1000, -1000);
    return;
  }

  const rect = canvas.getBoundingClientRect();
  const mx = (e.clientX - rect.left) * (width  / rect.width);
  const my = (e.clientY - rect.top)  * (height / rect.height);

  //warp swatches
  const topMinY = topSwatchYA;
  const topMaxY = topSwatchYB + swatchH;
  if(my >= topMinY && my <= topMaxY && mx >= offsetX && mx <= offsetX + totalW) {
    let xPos = offsetX;

    for (let c = 0; c < colW.length; c++) {
      const w = colW[c];

      if (mx >= xPos && mx <= xPos + w) {
        const layer = (my <= topSwatchYA + swatchH) ? 'A' : 'B';
        activeThreadTarget = { kind: 'warp', layer, index: c };

        const effectiveColor = layer === 'A' ? warpAColors[c] || colorA : warpBColors[c] || colorB;
        
        const swatchMidX = xPos + w / 2;
        const pageX = rect.left + (swatchMidX / width) * rect.width;
        const pageY = rect.top  + (my / height) * rect.height;

        threadPicker.position(pageX, pageY + 10);
        threadPicker.value(effectiveColor);
        return;
      }
      xPos += w;
    } 
  } 

  //weft swatches
  const leftMinX = leftSwatchXA;
  const leftMaxX = leftSwatchXB + swatchW;

  if (mx >= leftMinX && mx <= leftMaxX && my >= offsetY && my <= offsetY + totalH) {
    let yPos = offsetY;

    for (let r = 0; r < rowH.length; r++) {
      const h = rowH[r];

      if (my >= yPos && my <= yPos + h) {
        const layer = (mx <= leftSwatchXA + swatchW) ? 'A' : 'B';
        activeThreadTarget = { kind: 'weft', layer, index: r };

        const effectiveColor = layer === 'A' ? weftAColors[r] || colorA : weftBColors[r] || colorB;
        
        const swatchMidY = yPos + h / 2;
        const pageX = rect.left + (mx / width) * rect.width;
        const pageY = rect.top  + (swatchMidY / height) * rect.height;

        threadPicker.position(pageX + 10, pageY);
        threadPicker.value(effectiveColor);
        return;
      }
      yPos += h;
    }
  }

  activeThreadTarget = null;
  threadPicker.position(-1000, -1000);
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

  gridOffsetX = offsetX;
  gridOffsetY = offsetY;
  gridWidth   = totalW;
  gridHeight  = totalH;

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
  background(221);

  offsetX = leftMargin;
  offsetY = topMargin;

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

    xPos += w;
  }

  let yPos = offsetY;
  for (let r = 0; r < rowH.length; r++) {
    const h = rowH[r];

    fill(weftAColors[r] || colorA);
    rect(leftSwatchXA, yPos, swatchW, h);

    fill(weftBColors[r] || colorB);
    rect(leftSwatchXB, yPos, swatchW, h);

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

  colorA = document.getElementById("colorA").value;
  colorB = document.getElementById("colorB").value;

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

  
  //alterWarpPicker.position(0, 0)
  //warpColors = []

  makeLayout();
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

document.addEventListener("mousedown", (e) => {
  const canvas = document.getElementById("defaultCanvas0");
  if (!threadPicker || !canvas) return;

  const pickerEl = threadPicker.elt;

  if (e.target === canvas || e.target === pickerEl) return;

  activeThreadTarget = null;
  threadPicker.position(-1000, -1000);
});

function canvasToPage(xc, yc, rect) {
  return {
    x: rect.left + (xc / width)  * rect.width  + window.scrollX,
    y: rect.top  + (yc / height) * rect.height + window.scrollY
  };
}

