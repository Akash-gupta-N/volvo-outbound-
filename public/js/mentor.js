document.addEventListener('DOMContentLoaded', () => {
  const socket = io();

  // Tab Navigation
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.getAttribute('data-tab');
      tabBtns.forEach(b => b.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));

      btn.classList.add('active');
      document.getElementById(tabId).classList.add('active');

      // Refresh tab-specific data
      refreshCurrentTab(tabId);
    });
  });

  function refreshCurrentTab(tabId) {
    if (tabId === 'expected-tab') loadExpectedPicklists();
    else if (tabId === 'live-tab') loadLiveMonitoring();
    else if (tabId === 'qr-tab') loadQRCodes();
    else if (tabId === 'confirmation-tab') loadConfirmationTab();
    else if (tabId === 'history-tab') loadHistoryTab();
  }

  // System Info & Connection Banner
  async function loadSystemInfo() {
    try {
      const info = await API.get('/api/system-info');
      const ipSpan = document.getElementById('local-ip-display');
      if (ipSpan && info.localIPs.length > 0) {
        ipSpan.textContent = `Phone URL: http://${info.localIPs[0]}:3000/operator.html`;
      }
      const timeSpan = document.getElementById('ist-clock');
      if (timeSpan) {
        timeSpan.textContent = `IST: ${info.currentTimeIST}`;
      }
    } catch (e) {
      console.error(e);
    }
  }

  // Realtime Socket listeners
  socket.on('liveUpdate', () => {
    const activeTab = document.querySelector('.tab-btn.active').getAttribute('data-tab');
    refreshCurrentTab(activeTab);
    loadSystemInfo();
  });

  socket.on('confirmationGenerated', (data) => {
    alert(`Confirmation Excel automatically generated for ${data.count} completed picklist(s) at configured IST time.`);
    const activeTab = document.querySelector('.tab-btn.active').getAttribute('data-tab');
    refreshCurrentTab(activeTab);
  });

  // 1. EXPECTED PICKLISTS TAB
  const uploadBox = document.getElementById('upload-box');
  const excelInput = document.getElementById('excel-file-input');

  if (uploadBox && excelInput) {
    uploadBox.addEventListener('click', () => excelInput.click());

    uploadBox.addEventListener('dragover', (e) => {
      e.preventDefault();
      uploadBox.style.borderColor = 'var(--accent-blue)';
    });

    uploadBox.addEventListener('dragleave', () => {
      uploadBox.style.borderColor = 'var(--border-color)';
    });

    uploadBox.addEventListener('drop', (e) => {
      e.preventDefault();
      uploadBox.style.borderColor = 'var(--border-color)';
      if (e.dataTransfer.files.length > 0) {
        handleFileUpload(e.dataTransfer.files[0]);
      }
    });

    excelInput.addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        handleFileUpload(e.target.files[0]);
      }
    });
  }

  async function handleFileUpload(file) {
    try {
      const res = await API.uploadFile('/api/picklists/upload', file);
      alert(res.message);
      loadExpectedPicklists();
      excelInput.value = '';
    } catch (err) {
      alert(`Upload Failed: ${err.message}`);
    }
  }

  async function loadExpectedPicklists() {
    try {
      const res = await API.get('/api/picklists/expected');
      const tbody = document.getElementById('expected-table-body');
      if (!tbody) return;

      if (res.picklists.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color: var(--text-muted);">No expected picklists uploaded yet. Upload an Excel file above.</td></tr>`;
        return;
      }

      tbody.innerHTML = res.picklists.map(p => `
        <tr>
          <td><strong>${p.picklistNo}</strong></td>
          <td>
            <span id="lines-display-${p.picklistNo}">${p.lines}</span>
            <button class="btn btn-outline" style="padding: 0.2rem 0.5rem; font-size: 0.75rem; margin-left: 0.5rem;" onclick="editLines('${p.picklistNo}', ${p.lines})">✏️ Edit</button>
          </td>
          <td><span class="status-pill ${getStatusClass(p.pickingStatus)}">Picking: ${p.pickingStatus}</span></td>
          <td><span class="status-pill ${getStatusClass(p.packingStatus)}">Packing: ${p.packingStatus}</span></td>
          <td>${p.pickingStatus === 'Completed' && p.packingStatus === 'Completed' ? '✅ Completed / Awaiting Confirmation' : '⌛ Pending Scan Workflow'}</td>
        </tr>
      `).join('');
    } catch (err) {
      console.error(err);
    }
  }

  window.editLines = async function(picklistNo, currentLines) {
    const newLinesStr = prompt(`Correct Lines count for Picklist ${picklistNo}:`, currentLines);
    if (newLinesStr === null) return;
    const newLines = parseInt(newLinesStr, 10);
    if (isNaN(newLines) || newLines <= 0) {
      alert('Please enter a valid positive number for Lines.');
      return;
    }

    try {
      await API.patch(`/api/picklists/${picklistNo}`, { lines: newLines });
      loadExpectedPicklists();
    } catch (err) {
      alert(`Error updating lines: ${err.message}`);
    }
  };

  // 2. LIVE OUTBOUND MONITORING TAB
  async function loadLiveMonitoring() {
    try {
      const data = await API.get('/api/picklists/live');

      // Update Summary Cards
      document.getElementById('sum-total').textContent = data.summary.totalExpected;
      document.getElementById('sum-picking').textContent = data.summary.pickingInProgress;
      document.getElementById('sum-packing').textContent = data.summary.packingInProgress;
      document.getElementById('sum-completed').textContent = data.summary.completedAwaitingConfirmation;
      document.getElementById('sum-last-scan').textContent = data.summary.lastScanTime ? formatTimeIST(data.summary.lastScanTime) : '—';

      const tbody = document.getElementById('live-table-body');
      if (!tbody) return;

      if (data.picklists.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color: var(--text-muted);">No active picklists being monitored.</td></tr>`;
        return;
      }

      tbody.innerHTML = data.picklists.map(p => `
        <tr>
          <td><strong>${p.picklistNo}</strong></td>
          <td>${p.lines}</td>
          <td><span class="status-pill ${getStatusClass(p.pickingStatus)}">${p.pickingStatus}</span></td>
          <td><span class="status-pill ${getStatusClass(p.packingStatus)}">${p.packingStatus}</span></td>
          <td>${formatTimeIST(p.pickingStartTime)}</td>
          <td>${formatTimeIST(p.pickingEndTime)}</td>
          <td>${formatTimeIST(p.packingStartTime)}</td>
          <td>${formatTimeIST(p.packingEndTime)}</td>
        </tr>
      `).join('');
    } catch (err) {
      console.error(err);
    }
  }

  // 3. QR / EXPECTED SCANS TAB (Row per Picklist with 4 event QR codes)
  async function loadQRCodes() {
    try {
      const res = await API.get('/api/picklists/qr-codes');
      const container = document.getElementById('qr-cards-container');
      if (!container) return;

      if (res.picklists.length === 0) {
        container.innerHTML = `<div style="text-align:center; padding: 2rem; color: var(--text-muted);">No active picklists available for QR generation. Upload expected data first.</div>`;
        return;
      }

      container.innerHTML = res.picklists.map(item => `
        <div class="table-card" style="margin-bottom: 1.5rem; padding: 1.25rem;">
          <div style="font-size: 1.1rem; font-weight: 700; margin-bottom: 1rem; border-bottom: 1px solid var(--border-color); padding-bottom: 0.5rem;">
            Picklist: <span style="color: var(--accent-blue);">${item.picklistNo}</span> | Lines: ${item.lines}
          </div>
          <div style="display: flex; gap: 1.5rem; flex-wrap: wrap; justify-content: flex-start;">
            <div class="qr-item-card">
              <img src="${item.qrs.PICKING_START.dataUrl}" alt="Picking Start QR">
              <div class="qr-item-label">1. Picking Start</div>
            </div>
            <div class="qr-item-card">
              <img src="${item.qrs.PICKING_END.dataUrl}" alt="Picking End QR">
              <div class="qr-item-label">2. Picking End</div>
            </div>
            <div class="qr-item-card">
              <img src="${item.qrs.PACKING_START.dataUrl}" alt="Packing Start QR">
              <div class="qr-item-label">3. Packing Start</div>
            </div>
            <div class="qr-item-card">
              <img src="${item.qrs.PACKING_END.dataUrl}" alt="Packing End QR">
              <div class="qr-item-label">4. Packing End</div>
            </div>
          </div>
        </div>
      `).join('');
    } catch (err) {
      console.error(err);
    }
  }

  // 4. CONFIRMATION TAB
  async function loadConfirmationTab() {
    try {
      const res = await API.get('/api/confirmation/config');
      const timeInput = document.getElementById('conf-time-input');
      if (timeInput) timeInput.value = res.confirmationTime;

      const countSpan = document.getElementById('eligible-count-display');
      if (countSpan) countSpan.textContent = res.completedUnconfirmedCount;
    } catch (err) {
      console.error(err);
    }
  }

  const saveTimeBtn = document.getElementById('save-conf-time-btn');
  if (saveTimeBtn) {
    saveTimeBtn.addEventListener('click', async () => {
      const timeVal = document.getElementById('conf-time-input').value;
      try {
        const res = await API.post('/api/confirmation/config', { confirmationTime: timeVal });
        alert(res.message);
      } catch (err) {
        alert(err.message);
      }
    });
  }

  const generateBtn = document.getElementById('manual-generate-btn');
  if (generateBtn) {
    generateBtn.addEventListener('click', async () => {
      try {
        const response = await fetch('/api/confirmation/generate', { method: 'POST' });
        if (!response.ok) {
          const err = await response.json();
          alert(err.message || 'No completed picklists available for confirmation.');
          return;
        }

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Outbound_Confirmation_${Date.now()}.xlsx`;
        document.body.appendChild(a);
        a.click();
        a.remove();

        loadConfirmationTab();
      } catch (err) {
        alert(`Error: ${err.message}`);
      }
    });
  }

  // 5. HISTORY TAB
  async function loadHistoryTab() {
    try {
      const res = await API.get('/api/history');
      const tbody = document.getElementById('history-table-body');
      if (!tbody) return;

      if (res.history.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color: var(--text-muted);">No historical confirmed records found.</td></tr>`;
        return;
      }

      tbody.innerHTML = res.history.map(h => `
        <tr>
          <td><strong>${h.historyDate}</strong></td>
          <td><strong>${h.picklistNo}</strong></td>
          <td>${h.lines}</td>
          <td>${formatTimeIST(h.pickingStartTime)}</td>
          <td>${formatTimeIST(h.pickingEndTime)}</td>
          <td>${formatTimeIST(h.packingStartTime)}</td>
          <td>${formatTimeIST(h.packingEndTime)}</td>
        </tr>
      `).join('');
    } catch (err) {
      console.error(err);
    }
  }

  // Helper functions
  function getStatusClass(status) {
    if (status === 'In Progress') return 'in-progress';
    if (status === 'Completed') return 'completed';
    return 'not-started';
  }

  function formatTimeIST(isoStr) {
    if (!isoStr) return '—';
    if (isoStr.length === 8 && isoStr.includes(':')) return isoStr; // Already HH:mm:ss
    const date = new Date(isoStr);
    if (isNaN(date.getTime())) return isoStr;
    return date.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false });
  }

  // Initial Load
  loadSystemInfo();
  loadExpectedPicklists();
});
