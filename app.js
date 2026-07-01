// State and DOM elements
const storeNameInput = document.getElementById("store-name-input");
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

// Wallet DOM Elements
const saveCardBtn = document.getElementById("save-card-btn");
const savedCardsList = document.getElementById("saved-cards-list");
const exportBtn = document.getElementById("export-btn");
const importBtn = document.getElementById("import-btn");

// Focus Mode Elements
const focusOverlay = document.getElementById("focus-overlay");
const focusCanvas = document.getElementById("focus-canvas");
const focusCtx = focusCanvas.getContext("2d");
const focusToggleBtn = document.getElementById("focus-toggle-btn");
const closeFocusBtn = document.getElementById("close-focus-btn");
const viewportTrigger = document.getElementById("viewport-trigger");

// Subtext space reservation in pixels
const SUBTEXT_HEIGHT = 45;

// Wallet Data Store
let savedCards = [];

// Screen Wake Lock API state
let wakeLock = null;

async function requestWakeLock() {
    if ('wakeLock' in navigator) {
        try {
            wakeLock = await navigator.wakeLock.request('screen');
        } catch (err) {
            console.warn(`Wake Lock failed: ${err.name}, ${err.message}`);
        }
    }
}

function releaseWakeLock() {
    if (wakeLock !== null) {
        wakeLock.release()
            .then(() => {
                wakeLock = null;
            })
            .catch(err => {
                console.error("Failed to release Wake Lock", err);
            });
    }
}

// Auto re-acquire wake lock if browser tab goes background and returns
document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible' && document.body.classList.contains("focus-active")) {
        await requestWakeLock();
    }
});

// Helper: Format Card Numbers in blocks of 4 characters (alphanumeric supported)
function formatCardNumber(str) {
    if (!str) return "";
    const clean = str.toString().replace(/\s+/g, "");
    const matches = clean.match(/.{1,4}/g);
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
    targetCtx.fillStyle = fgColor;
    targetCtx.textAlign = "center";
    targetCtx.textBaseline = "middle";

    let fontSize = canvasW < 250 ? 14 : 20;

    if (pinStr) {
        // Draw two lines (Card Number on line 1, PIN on line 2)
        // Draw Card Number
        let cardFontSize = fontSize;
        targetCtx.font = `600 ${cardFontSize}px 'Fira Code', monospace`;
        while (targetCtx.measureText(formattedCard).width > (canvasW - 10) && cardFontSize > 6) {
            cardFontSize -= 0.5;
            targetCtx.font = `600 ${cardFontSize}px 'Fira Code', monospace`;
        }
        targetCtx.fillText(formattedCard, canvasW / 2, canvasH - 28);

        // Draw PIN
        const pinText = `PIN: ${pinStr}`;
        let pinFontSize = fontSize;
        targetCtx.font = `600 ${pinFontSize}px 'Fira Code', monospace`;
        while (targetCtx.measureText(pinText).width > (canvasW - 10) && pinFontSize > 6) {
            pinFontSize -= 0.5;
            targetCtx.font = `600 ${pinFontSize}px 'Fira Code', monospace`;
        }
        targetCtx.fillText(pinText, canvasW / 2, canvasH - 12);
    } else {
        // Draw one line (Card Number only)
        let cardFontSize = fontSize;
        targetCtx.font = `600 ${cardFontSize}px 'Fira Code', monospace`;
        while (targetCtx.measureText(formattedCard).width > (canvasW - 10) && cardFontSize > 6) {
            cardFontSize -= 0.5;
            targetCtx.font = `600 ${cardFontSize}px 'Fira Code', monospace`;
        }
        targetCtx.fillText(formattedCard, canvasW / 2, canvasH - (SUBTEXT_HEIGHT / 2));
    }
}

// Core drawing engine
function drawCode() {
    const data = cardNumberInput.value.trim().replace(/\s+/g, "");
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
        const verticalPadding = Math.max(2, Math.floor(canvasH * 0.05));
        const activeH = canvasH - (verticalPadding * 2);

        targetCtx.drawImage(
            tempCanvas,
            0, 0, tempCanvas.width, tempCanvas.height,
            quietZone,
            verticalPadding,
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
    const data = cardNumberInput.value.trim().replace(/\s+/g, "");
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
        const verticalPadding = Math.max(2, Math.floor(codeMaxH * 0.05));
        const activeH = codeMaxH - (verticalPadding * 2);

        const scaleX = activeW / rawW;
        const scaleY = activeH / rawH;

        innerContent = `<g transform="translate(${quietZone}, ${verticalPadding}) scale(${scaleX}, ${scaleY})">`;
        paths.forEach(el => {
            innerContent += el.outerHTML;
        });
        innerContent += `</g>`;
    }

    // Add text tags to SVG
    const formattedCard = formatCardNumber(data);
    let textElements = "";
    const fontSize = width < 250 ? 14 : 20;

    if (pin) {
        textElements = `
    <text x="${width / 2}" y="${height - 28}" fill="${fgColor}" font-family="Fira Code, monospace" font-weight="600" font-size="${fontSize}" text-anchor="middle" dominant-baseline="central">${formattedCard}</text>
    <text x="${width / 2}" y="${height - 12}" fill="${fgColor}" font-family="Fira Code, monospace" font-weight="600" font-size="${fontSize}" text-anchor="middle" dominant-baseline="central">PIN: ${pin}</text>
        `;
    } else {
        textElements = `
    <text x="${width / 2}" y="${height - (SUBTEXT_HEIGHT / 2)}" fill="${fgColor}" font-family="Fira Code, monospace" font-weight="600" font-size="${fontSize}" text-anchor="middle" dominant-baseline="central">${formattedCard}</text>
        `;
    }
    innerContent += textElements;

    return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">
<svg xmlns="http://www.w3.org/2000/svg" version="1.1" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <rect width="100%" height="100%" fill="${bgColor}" stroke="none"/>
    ${innerContent}
</svg>`;
}

// Trigger PNG Download (High-Resolution Export)
function downloadPNG() {
    const data = cardNumberInput.value.trim().replace(/\s+/g, "");
    const pin = pinInput.value.trim();
    if (!data) return;

    const type = codeTypeInput.value;
    const width = parseInt(canvasWidth.value) || 190;
    const height = parseInt(canvasHeight.value) || 160;
    const bgColor = bgColorInput.value;
    const fgColor = fgColorInput.value;
    const quietZone = parseInt(borderSlider.value) || 4;

    // Use a scale multiplier of 6 for high-definition export
    const scale = 6;
    const hiResW = width * scale;
    const hiResH = height * scale;
    const hiResQuietZone = quietZone * scale;
    const hiResSubtextH = SUBTEXT_HEIGHT * scale;

    const hiResCanvas = document.createElement("canvas");
    hiResCanvas.width = hiResW;
    hiResCanvas.height = hiResH;

    const hiResCtx = hiResCanvas.getContext("2d");

    // Clear and draw background
    hiResCtx.fillStyle = bgColor;
    hiResCtx.fillRect(0, 0, hiResW, hiResH);

    // Determine target box for code itself (reserve bottom height for subtext)
    const codeMaxH = hiResH - hiResSubtextH;

    if (type === "qr") {
        renderQR(hiResCanvas, hiResCtx, data, hiResW, codeMaxH, fgColor, quietZone);
    } else {
        renderBarcode(hiResCanvas, hiResCtx, data, hiResW, codeMaxH, fgColor, hiResQuietZone);
    }


    // Add human-readable subtext scaled by the multiplier
    const formattedCard = formatCardNumber(data);
    hiResCtx.fillStyle = fgColor;
    hiResCtx.textAlign = "center";
    hiResCtx.textBaseline = "middle";

    // Set font based on card size
    let fontSize = (hiResW < 250 * scale ? 14 : 20) * scale;

    if (pin) {
        // Draw Card Number
        let cardFontSize = fontSize;
        hiResCtx.font = `600 ${cardFontSize}px 'Fira Code', monospace`;
        while (hiResCtx.measureText(formattedCard).width > (hiResW - 10 * scale) && cardFontSize > 6 * scale) {
            cardFontSize -= 0.5 * scale;
            hiResCtx.font = `600 ${cardFontSize}px 'Fira Code', monospace`;
        }
        hiResCtx.fillText(formattedCard, hiResW / 2, hiResH - 28 * scale);

        // Draw PIN
        const pinText = `PIN: ${pin}`;
        let pinFontSize = fontSize;
        hiResCtx.font = `600 ${pinFontSize}px 'Fira Code', monospace`;
        while (hiResCtx.measureText(pinText).width > (hiResW - 10 * scale) && pinFontSize > 6 * scale) {
            pinFontSize -= 0.5 * scale;
            hiResCtx.font = `600 ${pinFontSize}px 'Fira Code', monospace`;
        }
        hiResCtx.fillText(pinText, hiResW / 2, hiResH - 12 * scale);
    } else {
        // Draw one line (Card Number only)
        let cardFontSize = fontSize;
        hiResCtx.font = `600 ${cardFontSize}px 'Fira Code', monospace`;
        while (hiResCtx.measureText(formattedCard).width > (hiResW - 10 * scale) && cardFontSize > 6 * scale) {
            cardFontSize -= 0.5 * scale;
            hiResCtx.font = `600 ${cardFontSize}px 'Fira Code', monospace`;
        }
        hiResCtx.fillText(formattedCard, hiResW / 2, hiResH - (hiResSubtextH / 2));
    }

    // Trigger download
    hiResCanvas.toBlob((blob) => {
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
async function enterFocusMode() {
    const data = cardNumberInput.value.trim().replace(/\s+/g, "");
    const pin = pinInput.value.trim();
    const type = codeTypeInput.value;
    
    if (!data) return;

    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;
    const size = Math.floor(Math.min(viewportW * 0.85, viewportH * 0.6));
    
    focusCanvas.width = size;
    focusCanvas.height = size + SUBTEXT_HEIGHT;

    focusCtx.fillStyle = "#FFFFFF";
    focusCtx.fillRect(0, 0, focusCanvas.width, focusCanvas.height);

    const codeMaxH = size;
    if (type === "qr") {
        renderQR(focusCanvas, focusCtx, data, size, codeMaxH, "#000000", 2);
    } else {
        renderBarcode(focusCanvas, focusCtx, data, size, codeMaxH, "#000000", 15);
    }

    drawCardSubtext(focusCtx, data, pin, size, focusCanvas.height, "#000000");

    focusOverlay.style.display = "flex";
    document.body.classList.add("focus-active");

    // Request wake lock to prevent screen dimming/locking
    await requestWakeLock();
}

function exitFocusMode() {
    focusOverlay.style.display = "none";
    document.body.classList.remove("focus-active");
    releaseWakeLock();
}


// Print layouts (single print)
function printCard() {
    const data = cardNumberInput.value.trim().replace(/\s+/g, "");
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
                ctx.fillStyle = "${fgColor}";
                let fontSize = ${width} < 250 ? 14 : 20;
                
                if (pin) {
                    // Draw Card Number
                    let cardFontSize = fontSize;
                    ctx.font = "600 " + cardFontSize + "px 'Fira Code', monospace";
                    while (ctx.measureText(formattedCard).width > (${width} - 10) && cardFontSize > 6) {
                        cardFontSize -= 0.5;
                        ctx.font = "600 " + cardFontSize + "px 'Fira Code', monospace";
                    }
                    ctx.fillText(formattedCard, ${width / 2}, ${height} - 28);

                    // Draw PIN
                    const pinText = "PIN: " + pin;
                    let pinFontSize = fontSize;
                    ctx.font = "600 " + pinFontSize + "px 'Fira Code', monospace";
                    while (ctx.measureText(pinText).width > (${width} - 10) && pinFontSize > 6) {
                        pinFontSize -= 0.5;
                        ctx.font = "600 " + pinFontSize + "px 'Fira Code', monospace";
                    }
                    ctx.fillText(pinText, ${width / 2}, ${height} - 12);
                } else {
                    let cardFontSize = fontSize;
                    ctx.font = "600 " + cardFontSize + "px 'Fira Code', monospace";
                    while (ctx.measureText(formattedCard).width > (${width} - 10) && cardFontSize > 6) {
                        cardFontSize -= 0.5;
                        ctx.font = "600 " + cardFontSize + "px 'Fira Code', monospace";
                    }
                    ctx.fillText(formattedCard, ${width / 2}, ${height} - (${SUBTEXT_HEIGHT / 2}));
                }
            </script>
        </body>
        </html>
    `);
    printWindow.document.close();
}

// --- Wallet Store Management ---

// Load Wallet from LocalStorage
function loadWallet() {
    try {
        const stored = localStorage.getItem("coregen_wallet");
        if (stored) {
            savedCards = JSON.parse(stored);
            // Auto-clean the old default sample card to start fresh for the user
            if (savedCards.length === 1 && savedCards[0].id === "sample-starbucks") {
                savedCards = [];
                saveWalletToStorage();
            }
        } else {
            savedCards = [];
            saveWalletToStorage();
        }
    } catch (e) {
        console.error("Failed to load wallet", e);
        savedCards = [];
    }
    renderWalletList();
}


function saveWalletToStorage() {
    localStorage.setItem("coregen_wallet", JSON.stringify(savedCards));
}

// Render dynamic cards list
function renderWalletList() {
    savedCardsList.innerHTML = "";

    if (savedCards.length === 0) {
        savedCardsList.innerHTML = `<div class="empty-wallet-text">Your wallet is empty. Add a card below to get started!</div>`;
        return;
    }


    savedCards.forEach(card => {
        const cardItem = document.createElement("div");
        cardItem.className = "wallet-item";
        cardItem.title = "Tap to load card";
        
        // Load details when clicked
        cardItem.addEventListener("click", () => {
            loadCardIntoGenerator(card);
        });

        const info = document.createElement("div");
        info.className = "wallet-info";

        const header = document.createElement("div");
        header.className = "wallet-header";

        const title = document.createElement("span");
        title.className = "wallet-title";
        title.textContent = card.store;
        header.appendChild(title);

        const typeTag = document.createElement("span");
        typeTag.className = "wallet-type-tag";
        typeTag.textContent = card.type === "qr" ? "QR" : "1D";
        header.appendChild(typeTag);
        info.appendChild(header);

        const numbers = document.createElement("div");
        numbers.className = "wallet-numbers";
        numbers.textContent = formatCardNumber(card.card);
        
        if (card.pin) {
            const pinSpan = document.createElement("span");
            pinSpan.className = "wallet-pin";
            pinSpan.textContent = `PIN: ${card.pin}`;
            numbers.appendChild(pinSpan);
        }
        info.appendChild(numbers);
        cardItem.appendChild(info);

        // Delete Button
        const delBtn = document.createElement("button");
        delBtn.className = "delete-card-btn";
        delBtn.innerHTML = "✕";
        delBtn.title = "Delete card";
        delBtn.addEventListener("click", (e) => {
            e.stopPropagation(); // Avoid loading the card when deleting it
            deleteCard(card.id);
        });
        cardItem.appendChild(delBtn);

        savedCardsList.appendChild(cardItem);
    });
}

// Populate Generator with Card details
function loadCardIntoGenerator(card) {
    storeNameInput.value = card.store;
    cardNumberInput.value = formatCardNumber(card.card);
    pinInput.value = card.pin || "";
    
    // Set type input & toggler pills
    codeTypeInput.value = card.type;
    pills.forEach(p => {
        const type = p.getAttribute("data-type");
        if (type === card.type) {
            p.classList.add("active");
            
            // Reapply defaults
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
        } else {
            p.classList.remove("active");
        }
    });

    updateContrastBadge();
    drawCode();
}

// Save Current Fields to Wallet
function saveCurrentCard() {
    const cardNo = cardNumberInput.value.trim().replace(/\s+/g, "");
    const pin = pinInput.value.trim();
    let store = storeNameInput.value.trim();

    if (!cardNo) {
        alert("Please enter a card number first.");
        return;
    }

    if (!store) {
        store = "Unnamed Card";
    }

    const type = codeTypeInput.value;

    // Check if card number already exists in wallet
    const existingIndex = savedCards.findIndex(c => c.card === cardNo);
    
    if (existingIndex > -1) {
        // Update existing card
        savedCards[existingIndex].store = store;
        savedCards[existingIndex].pin = pin;
        savedCards[existingIndex].type = type;
    } else {
        // Add new card
        const newCard = {
            id: Date.now().toString(),
            store: store,
            card: cardNo,
            pin: pin,
            type: type
        };
        savedCards.push(newCard);
    }

    saveWalletToStorage();
    renderWalletList();

    // Clear store name input for the next entry
    storeNameInput.value = "";
}

// Delete Card from Wallet
function deleteCard(id) {
    if (!confirm("Are you sure you want to delete this card?")) return;
    
    savedCards = savedCards.filter(c => c.id !== id);
    saveWalletToStorage();
    renderWalletList();
}

// Wallet Data Backup & Restore Functions
function exportWallet() {
    const dataStr = JSON.stringify(savedCards);
    
    // Attempt clipboard write
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(dataStr).then(() => {
            alert("Success! Your wallet data backup has been COPIED to your clipboard. Paste it somewhere safe.");
        }).catch(err => {
            prompt("Fallback: Copy your backup JSON string below:", dataStr);
        });
    } else {
        prompt("Copy your backup JSON string below:", dataStr);
    }
}

function importWallet() {
    const backupStr = prompt("Paste your wallet backup JSON string here:");
    if (!backupStr) return;

    try {
        const parsed = JSON.parse(backupStr.trim());
        if (Array.isArray(parsed)) {
            // Basic validation
            const valid = parsed.every(item => item.store && item.card && item.type);
            if (valid) {
                if (confirm(`Do you want to overwrite your wallet with these ${parsed.length} cards?`)) {
                    savedCards = parsed;
                    saveWalletToStorage();
                    renderWalletList();
                    
                    // Auto-load first card
                    if (savedCards.length > 0) {
                        loadCardIntoGenerator(savedCards[0]);
                    }
                    alert("Wallet restored successfully!");
                }
            } else {
                alert("Invalid backup format: missing required card details.");
            }
        } else {
            alert("Invalid backup: data must be a list of cards.");
        }
    } catch (e) {
        alert("Failed to restore: invalid JSON string. " + e.message);
    }
}

// --- Bind Controls & Listeners ---

// Format Pills segmented controls
const pills = document.querySelectorAll(".format-pill");
pills.forEach(pill => {
    pill.addEventListener("click", () => {
        pills.forEach(p => p.classList.remove("active"));
        pill.classList.add("active");
        
        const type = pill.getAttribute("data-type");
        codeTypeInput.value = type;

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

// Auto-format the Card Number input box as the user types
cardNumberInput.addEventListener("input", (e) => {
    const cursorPosition = e.target.selectionStart;
    const originalLength = e.target.value.length;
    
    const formatted = formatCardNumber(e.target.value);
    e.target.value = formatted;
    
    const newLength = formatted.length;
    e.target.setSelectionRange(
        cursorPosition + (newLength - originalLength),
        cursorPosition + (newLength - originalLength)
    );
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

// Save Button
saveCardBtn.addEventListener("click", saveCurrentCard);

// Backup buttons
exportBtn.addEventListener("click", exportWallet);
importBtn.addEventListener("click", importWallet);

// Focus mode triggers
focusToggleBtn.addEventListener("click", enterFocusMode);
viewportTrigger.addEventListener("click", enterFocusMode);
closeFocusBtn.addEventListener("click", exitFocusMode);
focusOverlay.addEventListener("click", (e) => {
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
    loadWallet(); // Load local storage
    
    // Auto-load first card from list if available on load
    if (savedCards.length > 0) {
        loadCardIntoGenerator(savedCards[0]);
    } else {
        updateContrastBadge();
        drawCode();
    }
};

if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", runInit);
} else {
    runInit();
}
