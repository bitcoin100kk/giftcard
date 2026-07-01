// State and DOM elements
const cardNumberInput = document.getElementById("card-number-input");
const pinInput = document.getElementById("pin-input");
const codeTypeInput = document.getElementById("code-type");
const canvasWidth = document.getElementById("canvas-width");
const canvasHeight = document.getElementById("canvas-height");
const bgColorInput = document.getElementById("bg-color");
const fgColorInput = document.getElementById("fg-color");
const borderSlider = document.getElementById("border-slider");
const borderValue = document.getElementById("border-value");
const qrEcc = document.getElementById("qr-ecc");
const squareLock = document.getElementById("square-lock");
const contrastBadge = document.getElementById("contrast-badge");
const downloadPngBtn = document.getElementById("download-png-btn");
const downloadSvgBtn = document.getElementById("download-svg-btn");
const printBtn = document.getElementById("print-btn");
const canvas = document.getElementById("qr-canvas");
const ctx = canvas.getContext("2d");

// Focus Mode Elements
const focusOverlay = document.getElementById("focus-overlay");
const focusCanvas = document.getElementById("focus-canvas");
const focusCtx = focusCanvas.getContext("2d");
const focusToggleBtn = document.getElementById("focus-toggle-btn");
const closeFocusBtn = document.getElementById("close-focus-btn");
const viewportTrigger = document.getElementById("viewport-trigger");

// Subtext space reservation in pixels
const SUBTEXT_HEIGHT = 45;

// Helper: Format Card Numbers in blocks of 4 digits
function formatCardNumber(str) {
    const clean = str.replace(/\s+/g, "");
    const matches = clean.match(/\d{1,4}/g);
    return matches ? matches.join(" ") : str;
}

// Helper: Calculate WCAG 2.0 Relative Luminance
function getLuminance(hexColor) {
    const hex = hexColor.replace("#", "");
    const r = parseInt(hex.slice(0, 2), 16) / 255;
    const g = parseInt(hex.slice(2, 4), 16) / 255;
    const b = parseInt(hex.slice(4, 6), 16) / 255;

    const a = [r, g, b].map(v => {
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
}

// Helper: Calculate Contrast Ratio
function getContrastRatio(color1, color2) {
    const l1 = getLuminance(color1);
    const l2 = getLuminance(color2);
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    return (lighter + 0.05) / (darker + 0.05);
}

// Update Contrast Indicator
function updateContrastBadge() {
    const fg = fgColorInput.value;
    const bg = bgColorInput.value;
    const ratio = getContrastRatio(fg, bg);

    contrastBadge.textContent = `Contrast Ratio: ${ratio.toFixed(2)}:1`;
    contrastBadge.className = "badge"; // Reset classes

    if (ratio >= 4.5) {
        contrastBadge.classList.add("badge-success");
        downloadPngBtn.disabled = false;
        downloadSvgBtn.disabled = false;
    } else if (ratio >= 3.0) {
        contrastBadge.classList.add("badge-warning");
        downloadPngBtn.disabled = false;
        downloadSvgBtn.disabled = false;
    } else {
        contrastBadge.classList.add("badge-danger");
        downloadPngBtn.disabled = true;
        downloadSvgBtn.disabled = true;
    }
}

// Draw the Card Subtext onto a given canvas context
function drawCardSubtext(targetCtx, cardStr, pinStr, canvasW, canvasH, fgColor) {
    const formattedCard = formatCardNumber(cardStr);
    const displayText = pinStr ? `${formattedCard}   PIN: ${pinStr}` : formattedCard;

    targetCtx.fillStyle = fgColor;
    targetCtx.textAlign = "center";
    targetCtx.textBaseline = "middle";

    // Set font based on card size
    const fontSize = canvasW < 250 ? 10 : 12;
    targetCtx.font = `600 ${fontSize}px 'Fira Code', monospace`;
    
    // Draw in the middle of the reserved bottom container
    const yPos = canvasH - (SUBTEXT_HEIGHT / 2);
    targetCtx.fillText(displayText, canvasW / 2, yPos);
}

// Core drawing engine
function drawCode() {
    const data = cardNumberInput.value.trim();
    const pin = pinInput.value.trim();
    const type = codeTypeInput.value;
    const width = parseInt(canvasWidth.value) || 190;
    const height = parseInt(canvasHeight.value) || 160;
    const bgColor = bgColorInput.value;
    const fgColor = fgColorInput.value;
    const quietZone = parseInt(borderSlider.value) || 4;

    canvas.width = width;
    canvas.height = height;

    // Clear and draw background
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, width, height);

    if (!data) {
        ctx.fillStyle = fgColor;
        ctx.font = "14px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("Enter card number", width / 2, height / 2);
        return;
    }

    // Determine target box for code itself (reserve bottom height for subtext)
    const codeMaxH = height - SUBTEXT_HEIGHT;

    if (type === "qr") {
        renderQR(canvas, ctx, data, width, codeMaxH, fgColor, quietZone);
    } else {
        renderBarcode(canvas, ctx, data, width, codeMaxH, fgColor, quietZone);
    }

    // Add human-readable subtext
    drawCardSubtext(ctx, data, pin, width, height, fgColor);
}

// Render QR Code onto a given context with height constraint
function renderQR(targetCanvas, targetCtx, data, canvasW, canvasH, fgColor, quietZone) {
    try {
        const eccMap = {
            "L": window.qrcodegen.QrCode.Ecc.LOW,
            "M": window.qrcodegen.QrCode.Ecc.MEDIUM,
            "Q": window.qrcodegen.QrCode.Ecc.QUARTILE,
            "H": window.qrcodegen.QrCode.Ecc.HIGH
        };
        const ecc = eccMap[qrEcc.value] || window.qrcodegen.QrCode.Ecc.QUARTILE;
        const qr = window.qrcodegen.QrCode.encodeText(data, ecc);
        const qrSize = qr.size;

        let scale = 1;
        let offsetX = 0;
        let offsetY = 0;

        if (squareLock.checked) {
            const totalModules = qrSize + 2 * quietZone;
            scale = Math.max(1, Math.min(Math.floor(canvasW / totalModules), Math.floor(canvasH / totalModules)));
            
            const qrPixelSize = qrSize * scale;
            offsetX = Math.floor((canvasW - qrPixelSize) / 2);
            offsetY = Math.floor((canvasH - qrPixelSize) / 2);
        } else {
            const scaleX = (canvasW - (quietZone * 2)) / qrSize;
            const scaleY = (canvasH - (quietZone * 2)) / qrSize;
            offsetX = quietZone;
            offsetY = quietZone;

            targetCtx.fillStyle = fgColor;
            for (let y = 0; y < qrSize; y++) {
                for (let x = 0; x < qrSize; x++) {
                    if (qr.getModule(x, y)) {
                        targetCtx.fillRect(
                            offsetX + x * scaleX,
                            offsetY + y * scaleY,
                            Math.ceil(scaleX),
                            Math.ceil(scaleY)
                        );
                    }
                }
            }
            return;
        }

        // Draw normal square modules
        targetCtx.fillStyle = fgColor;
        for (let y = 0; y < qrSize; y++) {
            for (let x = 0; x < qrSize; x++) {
                if (qr.getModule(x, y)) {
                    targetCtx.fillRect(
                        offsetX + x * scale,
                        offsetY + y * scale,
                        scale,
                        scale
                    );
                }
            }
        }
    } catch (e) {
        targetCtx.fillStyle = "red";
        targetCtx.font = "12px monospace";
        targetCtx.fillText("QR Error: " + e.message, 10, canvasH / 2);
    }
}

// Render Code 128 Barcode onto a given context
function renderBarcode(targetCanvas, targetCtx, data, canvasW, canvasH, fgColor, quietZone) {
    try {
        const tempCanvas = document.createElement("canvas");
        window.JsBarcode(tempCanvas, data, {
            format: "CODE128",
            displayValue: false,
            margin: 0,
            lineColor: fgColor,
            background: "rgba(0,0,0,0)"
        });

        const activeW = canvasW - (quietZone * 2);
        const activeH = canvasH - (quietZone * 2);

        targetCtx.drawImage(
            tempCanvas,
            0, 0, tempCanvas.width, tempCanvas.height,
            quietZone,
            quietZone,
            activeW,
            activeH
        );
    } catch (e) {
        targetCtx.fillStyle = "red";
        targetCtx.font = "12px monospace";
        targetCtx.fillText("Barcode Error: " + e.message, 10, canvasH / 2);
    }
}

// Generate SVG Code
function generateSVGString() {
    const data = cardNumberInput.value.trim();
    const pin = pinInput.value.trim();
    const type = codeTypeInput.value;
    const width = parseInt(canvasWidth.value) || 190;
    const height = parseInt(canvasHeight.value) || 160;
    const bgColor = bgColorInput.value;
    const fgColor = fgColorInput.value;
    const quietZone = parseInt(borderSlider.value) || 4;

    const codeMaxH = height - SUBTEXT_HEIGHT;
    let innerContent = "";

    if (type === "qr") {
        const eccMap = {
            "L": window.qrcodegen.QrCode.Ecc.LOW,
            "M": window.qrcodegen.QrCode.Ecc.MEDIUM,
            "Q": window.qrcodegen.QrCode.Ecc.QUARTILE,
            "H": window.qrcodegen.QrCode.Ecc.HIGH
        };
        const ecc = eccMap[qrEcc.value] || window.qrcodegen.QrCode.Ecc.QUARTILE;
        const qr = window.qrcodegen.QrCode.encodeText(data, ecc);
        const qrSize = qr.size;

        let scale = 1;
        let offsetX = 0;
        let offsetY = 0;
        let scaleX = 1;
        let scaleY = 1;

        if (squareLock.checked) {
            const totalModules = qrSize + 2 * quietZone;
            scale = Math.max(1, Math.min(Math.floor(width / totalModules), Math.floor(codeMaxH / totalModules)));
            const qrPixelSize = qrSize * scale;
            offsetX = Math.floor((width - qrPixelSize) / 2);
            offsetY = Math.floor((codeMaxH - qrPixelSize) / 2);
            scaleX = scale;
            scaleY = scale;
        } else {
            scaleX = (width - (quietZone * 2)) / qrSize;
            scaleY = (codeMaxH - (quietZone * 2)) / qrSize;
            offsetX = quietZone;
            offsetY = quietZone;
        }

        let paths = [];
        for (let y = 0; y < qrSize; y++) {
            for (let x = 0; x < qrSize; x++) {
                if (qr.getModule(x, y)) {
                    const px = offsetX + x * scaleX;
                    const py = offsetY + y * scaleY;
                    paths.push(`M${px},${py}h${scaleX}v${scaleY}h-${scaleX}z`);
                }
            }
        }
        innerContent = `<path d="${paths.join(" ")}" fill="${fgColor}" stroke="none"/>`;
    } else {
        const tempSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        window.JsBarcode(tempSvg, data, {
            format: "CODE128",
            displayValue: false,
            margin: 0,
            lineColor: fgColor
        });

        const paths = Array.from(tempSvg.querySelectorAll("path, rect"));
        const rawW = tempSvg.viewBox.baseVal.width || 100;
        const rawH = tempSvg.viewBox.baseVal.height || 100;

        const activeW = width - (quietZone * 2);
        const activeH = codeMaxH - (quietZone * 2);

        const scaleX = activeW / rawW;
        const scaleY = activeH / rawH;

        innerContent = `<g transform="translate(${quietZone}, ${quietZone}) scale(${scaleX}, ${scaleY})">`;
        paths.forEach(el => {
            innerContent += el.outerHTML;
        });
        innerContent += `</g>`;
    }

    // Add text tag to SVG
    const formattedCard = formatCardNumber(data);
    const displayText = pin ? `${formattedCard}   PIN: ${pin}` : formattedCard;
    const yPos = height - (SUBTEXT_HEIGHT / 2);
    const fontSize = width < 250 ? 10 : 12;
    
    innerContent += `<text x="${width / 2}" y="${yPos}" fill="${fgColor}" font-family="Fira Code, monospace" font-weight="600" font-size="${fontSize}" text-anchor="middle" dominant-baseline="central">${displayText}</text>`;

    return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">
<svg xmlns="http://www.w3.org/2000/svg" version="1.1" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <rect width="100%" height="100%" fill="${bgColor}" stroke="none"/>
    ${innerContent}
</svg>`;
}

// Trigger PNG Download
function downloadPNG() {
    const data = cardNumberInput.value.trim();
    if (!data) return;
    
    canvas.toBlob((blob) => {
        const link = document.createElement("a");
        link.download = `card_${data}.png`;
        link.href = URL.createObjectURL(blob);
        link.click();
    }, "image/png");
}

// Trigger SVG Download
function downloadSVG() {
    const data = cardNumberInput.value.trim();
    if (!data) return;

    const svgStr = generateSVGString();
    const blob = new Blob([svgStr], { type: "image/svg+xml" });
    const link = document.createElement("a");
    link.download = `card_${data}.svg`;
    link.href = URL.createObjectURL(blob);
    link.click();
}

// Focus Mode: Show high-contrast fullscreen code on white background
function enterFocusMode() {
    const data = cardNumberInput.value.trim();
    const pin = pinInput.value.trim();
    const type = codeTypeInput.value;
    
    if (!data) return;

    // Expand screen dimensions
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;
    
    // Choose size fitting 85% of screen width and 60% of screen height
    const size = Math.floor(Math.min(viewportW * 0.85, viewportH * 0.6));
    
    // Set high-fidelity canvas size
    focusCanvas.width = size;
    focusCanvas.height = size + SUBTEXT_HEIGHT;

    // Draw high-contrast scanning base
    focusCtx.fillStyle = "#FFFFFF";
    focusCtx.fillRect(0, 0, focusCanvas.width, focusCanvas.height);

    const codeMaxH = size;
    // Always render high contrast black on white for iOS focus mode scanability
    if (type === "qr") {
        renderQR(focusCanvas, focusCtx, data, size, codeMaxH, "#000000", 2);
    } else {
        renderBarcode(focusCanvas, focusCtx, data, size, codeMaxH, "#000000", 15);
    }

    // Add subtext (black color)
    drawCardSubtext(focusCtx, data, pin, size, focusCanvas.height, "#000000");

    // Activate overlay styles
    focusOverlay.style.display = "flex";
    document.body.classList.add("focus-active");
}

function exitFocusMode() {
    focusOverlay.style.display = "none";
    document.body.classList.remove("focus-active");
}

// Print layouts (single list print)
function printCard() {
    const data = cardNumberInput.value.trim();
    const pin = pinInput.value.trim();
    if (!data) return;

    const type = codeTypeInput.value;
    const width = parseInt(canvasWidth.value) || 190;
    const height = parseInt(canvasHeight.value) || 160;
    const bgColor = bgColorInput.value;
    const fgColor = fgColorInput.value;
    const quietZone = parseInt(borderSlider.value) || 4;

    const printWindow = window.open("", "_blank");
    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Print Card - ${data}</title>
            <script src="qrcodegen.js"></script>
            <script src="JsBarcode.all.min.js"></script>
            <style>
                body {
                    margin: 0;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    height: 100vh;
                    background: white;
                }
                .card {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    background: ${bgColor};
                    width: ${width}px;
                    padding: 10px;
                    border: 1px solid #eee;
                }
                canvas {
                    width: ${width}px;
                    height: ${height}px;
                }
            </style>
        </head>
        <body onload="window.print()">
            <div class="card">
                <canvas id="p-canvas" width="${width}" height="${height}"></canvas>
            </div>
            <script>
                const canvas = document.getElementById("p-canvas");
                const ctx = canvas.getContext("2d");
                ctx.fillStyle = "${bgColor}";
                ctx.fillRect(0, 0, ${width}, ${height});
                
                const codeH = ${height - SUBTEXT_HEIGHT};
                if ("${type}" === "qr") {
                    const eccMap = {
                        "L": qrcodegen.QrCode.Ecc.LOW,
                        "M": qrcodegen.QrCode.Ecc.MEDIUM,
                        "Q": qrcodegen.QrCode.Ecc.QUARTILE,
                        "H": qrcodegen.QrCode.Ecc.HIGH
                    };
                    const ecc = eccMap["${qrEcc.value}"] || qrcodegen.QrCode.Ecc.QUARTILE;
                    const qr = qrcodegen.QrCode.encodeText("${data}", ecc);
                    const qrSize = qr.size;
                    
                    let scale = 1;
                    let offsetX = 0;
                    let offsetY = 0;
                    if (${squareLock.checked}) {
                        const totalModules = qrSize + 2 * ${quietZone};
                        scale = Math.max(1, Math.min(Math.floor(${width} / totalModules), Math.floor(codeH / totalModules)));
                        const qrPixelSize = qrSize * scale;
                        offsetX = Math.floor((${width} - qrPixelSize) / 2);
                        offsetY = Math.floor((codeH - qrPixelSize) / 2);
                    } else {
                        scale = (${width} - (${quietZone} * 2)) / qrSize;
                        offsetX = ${quietZone};
                        offsetY = ${quietZone};
                    }
                    ctx.fillStyle = "${fgColor}";
                    for(let y=0; y<qrSize; y++) {
                        for(let x=0; x<qrSize; x++) {
                            if(qr.getModule(x, y)) {
                                ctx.fillRect(offsetX + x*scale, offsetY + y*scale, scale, scale);
                            }
                        }
                    }
                } else {
                    const tempCanvas = document.createElement("canvas");
                    JsBarcode(tempCanvas, "${data}", {
                        format: "CODE128",
                        displayValue: false,
                        margin: 0,
                        lineColor: "${fgColor}"
                    });
                    ctx.drawImage(tempCanvas, 0, 0, tempCanvas.width, tempCanvas.height, ${quietZone}, ${quietZone}, ${width} - (${quietZone}*2), codeH - (${quietZone}*2));
                }
                
                // Draw text
                const formattedCard = "${formatCardNumber(data)}";
                const pin = "${pin}";
                const text = pin ? formattedCard + "   PIN: " + pin : formattedCard;
                ctx.fillStyle = "${fgColor}";
                ctx.font = "600 ${width < 250 ? 10 : 12}px 'Fira Code', monospace";
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText(text, ${width / 2}, ${height - SUBTEXT_HEIGHT / 2});
            </script>
        </body>
        </html>
    `);
    printWindow.document.close();
}

// Bind pills interaction
const pills = document.querySelectorAll(".format-pill");
pills.forEach(pill => {
    pill.addEventListener("click", () => {
        pills.forEach(p => p.classList.remove("active"));
        pill.classList.add("active");
        
        const type = pill.getAttribute("data-type");
        codeTypeInput.value = type;

        // Auto swap sizing presets
        if (type === "qr") {
            canvasWidth.value = 190;
            canvasHeight.value = 160;
            borderSlider.min = 0;
            borderSlider.max = 10;
            borderSlider.value = 4;
            borderValue.textContent = "4 px";
        } else {
            canvasWidth.value = 375;
            canvasHeight.value = 65;
            borderSlider.min = 0;
            borderSlider.max = 50;
            borderSlider.value = 10;
            borderValue.textContent = "10 px";
        }
        
        updateContrastBadge();
        drawCode();
    });
});

// Event Listeners for Live Rendering
[cardNumberInput, pinInput, canvasWidth, canvasHeight, bgColorInput, fgColorInput, borderSlider, qrEcc, squareLock].forEach(element => {
    element.addEventListener("input", () => {
        if (element === borderSlider) {
            borderValue.textContent = borderSlider.value + " px";
        }
        updateContrastBadge();
        drawCode();
    });
});

// Focus mode triggers
focusToggleBtn.addEventListener("click", enterFocusMode);
viewportTrigger.addEventListener("click", enterFocusMode);
closeFocusBtn.addEventListener("click", exitFocusMode);
focusOverlay.addEventListener("click", (e) => {
    // Only close if tapping background, not the canvas container itself
    if (e.target === focusOverlay || e.target.classList.contains("focus-hint")) {
        exitFocusMode();
    }
});

// Orientation change listener for clean resizing in iOS
window.addEventListener("resize", () => {
    if (document.body.classList.contains("focus-active")) {
        enterFocusMode();
    }
});

downloadPngBtn.addEventListener("click", downloadPNG);
downloadSvgBtn.addEventListener("click", downloadSVG);
printBtn.addEventListener("click", printCard);

// Initial Run
const runInit = () => {
    updateContrastBadge();
    drawCode();
};

if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", runInit);
} else {
    runInit();
}
