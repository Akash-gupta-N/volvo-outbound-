document.addEventListener('DOMContentLoaded', () => {
  let selectedMode = 'PICKING_START';
  let html5QrCode = null;
  let isScanningActive = false;

  const modeButtons = document.querySelectorAll('.mode-btn');
  const currentModeDisplay = document.getElementById('current-mode-display');
  const scanResultBox = document.getElementById('scan-result-box');
  const resultTitle = document.getElementById('result-title');
  const resultDetails = document.getElementById('result-details');
  const startCamBtn = document.getElementById('start-cam-btn');
  const qrInputFile = document.getElementById('qr-input-file');
  const toggleManualBtn = document.getElementById('toggle-manual-btn');
  const manualInputBox = document.getElementById('manual-input-box');
  const manualQrText = document.getElementById('manual-qr-text');
  const submitManualBtn = document.getElementById('submit-manual-btn');

  // Mode Selection
  modeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      modeButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedMode = btn.getAttribute('data-mode');
      
      const labelText = btn.textContent.trim();
      if (currentModeDisplay) {
        currentModeDisplay.textContent = labelText;
      }
      
      hideResultCard();
    });
  });

  // Live Camera Scanner Function
  async function startLiveVideoScanner() {
    if (typeof Html5Qrcode === 'undefined') {
      console.error('Html5Qrcode scanner library not loaded.');
      return;
    }

    try {
      if (!html5QrCode) {
        html5QrCode = new Html5Qrcode("reader");
      }

      const cameras = await Html5Qrcode.getCameras().catch(err => []);

      const qrCodeSuccessCallback = (decodedText) => {
        if (isScanningActive) return;
        isScanningActive = true;

        if (html5QrCode.isScanning) {
          html5QrCode.pause();
        }

        processScannedQR(decodedText).finally(() => {
          setTimeout(() => {
            isScanningActive = false;
            if (html5QrCode.isScanning) html5QrCode.resume();
          }, 2500);
        });
      };

      const config = { fps: 10, qrbox: { width: 220, height: 220 } };

      let cameraIdOrConfig = { facingMode: "environment" };
      if (cameras && cameras.length > 0) {
        const backCam = cameras.find(c => c.label.toLowerCase().includes('back') || c.label.toLowerCase().includes('rear'));
        if (backCam) cameraIdOrConfig = backCam.id;
      }

      await html5QrCode.start(cameraIdOrConfig, config, qrCodeSuccessCallback);

      if (startCamBtn) {
        startCamBtn.textContent = '🟢 Live Camera Active';
        startCamBtn.classList.replace('btn-primary', 'btn-success');
      }
    } catch (err) {
      console.warn("Live camera start failed/denied:", err);
      if (startCamBtn) {
        startCamBtn.textContent = '📷 Tap to Start Live Camera';
        startCamBtn.classList.replace('btn-success', 'btn-primary');
      }
    }
  }

  if (startCamBtn) {
    startCamBtn.addEventListener('click', startLiveVideoScanner);
  }

  // File Upload Fallback
  if (qrInputFile) {
    qrInputFile.addEventListener('change', async (e) => {
      if (e.target.files.length === 0) return;
      const file = e.target.files[0];
      try {
        if (!html5QrCode) html5QrCode = new Html5Qrcode("reader");
        const decodedText = await html5QrCode.scanFile(file, true);
        processScannedQR(decodedText);
      } catch (err) {
        showResultCard(false, `Could not decode QR from image file.`);
      }
      qrInputFile.value = '';
    });
  }

  // Manual Input Toggle
  if (toggleManualBtn && manualInputBox) {
    toggleManualBtn.addEventListener('click', () => {
      manualInputBox.style.display = manualInputBox.style.display === 'none' ? 'block' : 'none';
    });
  }

  if (submitManualBtn && manualQrText) {
    submitManualBtn.addEventListener('click', () => {
      const val = manualQrText.value.trim();
      if (!val) return;
      processScannedQR(val);
      manualQrText.value = '';
    });
  }

  async function processScannedQR(rawQRText) {
    const scanPayload = {
      rawQR: rawQRText,
      selectedEventType: selectedMode
    };

    if (!navigator.onLine) {
      queueScanOffline(scanPayload);
      showResultCard(false, "Network Offline! Scan queued locally and will auto-sync when Wi-Fi reconnects.");
      return;
    }

    try {
      const res = await API.post('/api/scan', scanPayload);
      if (res.success) {
        showResultCard(true, `
          <div><strong>Picklist:</strong> ${res.picklistNo}</div>
          <div><strong>Lines:</strong> ${res.lines}</div>
          <div><strong>Event:</strong> ${formatEventName(res.eventType)}</div>
          <div><strong>Time:</strong> ${res.time} IST</div>
        `, res.message);
      } else {
        showResultCard(false, res.message || "Scan Rejected.");
      }
    } catch (err) {
      queueScanOffline(scanPayload);
      showResultCard(false, `Wi-Fi Interruption: Scan queued locally. Will retry when connection returns.`);
    }
  }

  function showResultCard(isAccepted, detailsHtml) {
    if (!scanResultBox) return;
    scanResultBox.className = `result-card ${isAccepted ? 'accepted' : 'rejected'}`;
    
    resultTitle.innerHTML = isAccepted 
      ? `✅ Scan Accepted` 
      : `❌ Scan Rejected`;

    resultDetails.innerHTML = detailsHtml;
    scanResultBox.style.display = 'block';
  }

  function hideResultCard() {
    if (scanResultBox) scanResultBox.style.display = 'none';
  }

  function formatEventName(evt) {
    if (evt === 'PICKING_START') return 'Picking Start';
    if (evt === 'PICKING_END') return 'Picking End';
    if (evt === 'PACKING_START') return 'Packing Start';
    if (evt === 'PACKING_END') return 'Packing End';
    return evt;
  }

  // OFFLINE QUEUE LOGIC
  function queueScanOffline(payload) {
    const queue = JSON.parse(localStorage.getItem('outbound_scan_queue') || '[]');
    queue.push({ payload, timestamp: Date.now() });
    localStorage.setItem('outbound_scan_queue', JSON.stringify(queue));
  }

  async function syncOfflineQueue() {
    const queue = JSON.parse(localStorage.getItem('outbound_scan_queue') || '[]');
    if (queue.length === 0 || !navigator.onLine) return;

    const remaining = [];
    for (const item of queue) {
      try {
        await API.post('/api/scan', item.payload);
      } catch (err) {
        remaining.push(item);
      }
    }
    localStorage.setItem('outbound_scan_queue', JSON.stringify(remaining));
  }

  window.addEventListener('online', syncOfflineQueue);
  setInterval(syncOfflineQueue, 10000);

  // Automatically start live continuous camera scanning on page load
  setTimeout(startLiveVideoScanner, 400);
});
