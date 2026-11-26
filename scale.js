/**
 * Budry Electronics (MFD-51) & Compatible Trade Electronic Scales Manager
 * Web Serial API Engine for Direct POS Weight Capture & Real-time Digital Streaming
 */

const ScaleManager = {
  port: null,
  reader: null,
  keepReading: false,
  isConnected: false,
  currentWeight: 0.000,
  rawBuffer: '',
  isStable: true,
  baudRate: 9600,
  autoApplyWeight: true,
  softwareTare: 0.000,
  lastRawValue: 0.000,
  recentLogs: [],

  async init() {
    // Load saved settings
    try {
      const savedBaud = localStorage.getItem('lankapos_scale_baud');
      if (savedBaud) this.baudRate = parseInt(savedBaud, 10);
      const savedAuto = localStorage.getItem('lankapos_scale_auto');
      if (savedAuto !== null) this.autoApplyWeight = savedAuto === 'true';
    } catch (e) {}

    this.renderHeaderWidget();

    // Auto-reconnect if browser already has authorized serial port
    if ('serial' in navigator) {
      try {
        const ports = await navigator.serial.getPorts();
        if (ports && ports.length > 0) {
          console.log('[ScaleManager] Found previously authorized serial port. Auto-connecting...');
          this.connect(false, ports[0]).catch(err => {
            console.log('[ScaleManager] Auto-connect standby (Scale may be powered off or disconnected).');
          });
        }
      } catch (e) {}
    }
  },

  isSupported() {
    return 'serial' in navigator;
  },

  async toggleConnection() {
    if (this.isConnected) {
      this.openScaleModal();
    } else {
      await this.connect(true);
    }
  },

  async connect(interactive = true, existingPort = null) {
    if (!this.isSupported()) {
      alert('⚠️ Web Serial API is not supported in this browser.\n\nPlease open LankaPOS in Google Chrome or Microsoft Edge on localhost or HTTPS to connect your Budry MFD-51 electronic scale.');
      return;
    }

    try {
      let targetPort = existingPort;
      if (!targetPort) {
        if (!interactive) return;
        targetPort = await navigator.serial.requestPort();
      }

      if (!targetPort) return;

      this.port = targetPort;
      await this.port.open({
        baudRate: this.baudRate,
        dataBits: 8,
        stopBits: 1,
        parity: 'none',
        flowControl: 'none'
      });

      this.isConnected = true;
      this.keepReading = true;
      this.renderHeaderWidget();
      if (window.SoundManager) SoundManager.playSuccessChime();

      this.startReadingLoop();
      this.log(`Scale connected at ${this.baudRate} baud (8-N-1). Ready.`);
    } catch (err) {
      console.error('[ScaleManager] Connection error:', err);
      this.isConnected = false;
      this.renderHeaderWidget();
      if (interactive) {
        alert(`❌ Could not connect to scale:\n${err.message || err}\n\nMake sure no other program (like PuTTY or another browser tab) is using this COM port.`);
      }
    }
  },

  async disconnect() {
    this.keepReading = false;
    try {
      if (this.reader) {
        await this.reader.cancel();
        this.reader.releaseLock();
        this.reader = null;
      }
      if (this.port) {
        await this.port.close();
        this.port = null;
      }
    } catch (e) {
      console.warn('[ScaleManager] Disconnect error:', e);
    }
    this.isConnected = false;
    this.currentWeight = 0.000;
    this.renderHeaderWidget();
    this.log('Scale disconnected.');
  },

  async startReadingLoop() {
    const textDecoder = new TextDecoderStream();
    const readableStreamClosed = this.port.readable.pipeTo(textDecoder.writable);
    this.reader = textDecoder.readable.getReader();

    try {
      while (this.keepReading) {
        const { value, done } = await this.reader.read();
        if (done) break;
        if (value) {
          this.rawBuffer += value;
          // Split incoming stream by newlines or carriage returns
          if (this.rawBuffer.includes('\n') || this.rawBuffer.includes('\r')) {
            const lines = this.rawBuffer.split(/[\r\n]+/);
            this.rawBuffer = lines.pop(); // Keep incomplete chunk
            for (const line of lines) {
              if (line.trim()) {
                this.parseScaleLine(line);
              }
            }
          }
        }
      }
    } catch (err) {
      if (this.keepReading) {
        console.warn('[ScaleManager] Stream reading error:', err);
      }
    } finally {
      this.isConnected = false;
      this.renderHeaderWidget();
    }
  },

  /**
   * Parse Budry MFD-51 / CAS / Toledo / Continuous ASCII Scale output
   * Supported formats:
   * 1. ST,GS,+001.250kg / ST,NT,+001.250kg / US,GS,+001.240kg
   * 2. WN  001.250kg / WN001.250kg
   * 3. =01.250 / +001.250 /  1.250 kg
   * 4. Raw digits like 1.250 or 0.500
   */
  parseScaleLine(rawLine) {
    const line = (rawLine || '').trim();
    if (!line) return;

    this.log(`RX: ${line}`);

    // Check stability indicator: ST = Stable, US = Unstable / dynamic
    let stable = true;
    if (line.toUpperCase().includes('US') || line.includes('?') || line.includes('~')) {
      stable = false;
    }

    // Regular expressions matching various weighing scale outputs
    // Match 1: ST,GS,+001.250kg or ST,NT,001.250kg or WN 001.250kg
    const matchKg = line.match(/(?:[+-]?\s*(\d+\.\d{2,3}))\s*(kg|g)?/i);

    if (matchKg) {
      let num = parseFloat(matchKg[1]);
      const unit = (matchKg[2] || 'kg').toLowerCase();
      if (unit === 'g') num = num / 1000;

      if (!isNaN(num)) {
        this.lastRawValue = num;
        let netWeight = Math.max(0, num - this.softwareTare);
        netWeight = Math.round(netWeight * 1000) / 1000;
        this.updateWeight(netWeight, stable);
      }
    }
  },

  updateWeight(weight, isStable = true) {
    this.currentWeight = weight;
    this.isStable = isStable;
    this.renderHeaderWidget();

    // Update Live Monitor in Modal if open
    const modalDisplay = document.getElementById('scaleModalLiveWeight');
    if (modalDisplay) {
      modalDisplay.textContent = `${this.currentWeight.toFixed(3)} kg`;
      const stableBadge = document.getElementById('scaleModalStableBadge');
      if (stableBadge) {
        stableBadge.textContent = this.isStable ? 'STABLE (ස්ථාවරයි)' : 'MOTION (සෙලවේ)';
        stableBadge.className = this.isStable
          ? 'px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-700'
          : 'px-2 py-0.5 rounded text-[10px] font-bold bg-amber-950 text-amber-300 border border-amber-700 animate-pulse';
      }
    }
  },

  renderHeaderWidget() {
    const btn = document.getElementById('posScaleConnectBtn');
    const textEl = document.getElementById('posScaleStatusText');
    const iconEl = document.getElementById('posScaleIcon');
    if (!btn || !textEl) return;

    if (!this.isConnected) {
      btn.className = 'px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shrink-0 border border-slate-700 cursor-pointer';
      textEl.textContent = '⚖️ Scale';
      if (iconEl) iconEl.className = 'text-sm text-slate-400';
    } else {
      const isMotion = !this.isStable;
      const weightStr = `${this.currentWeight.toFixed(3)} kg`;
      if (isMotion) {
        btn.className = 'px-3 py-2 bg-amber-950/80 hover:bg-amber-900 text-amber-300 rounded-xl text-xs font-mono font-black transition flex items-center gap-1.5 shrink-0 border border-amber-500 shadow-sm cursor-pointer';
        textEl.textContent = `⚖️ ${weightStr} ~`;
      } else {
        btn.className = 'px-3 py-2 bg-emerald-950/90 hover:bg-emerald-900 text-emerald-300 rounded-xl text-xs font-mono font-black transition flex items-center gap-1.5 shrink-0 border border-emerald-500 shadow-md shadow-emerald-950/50 cursor-pointer';
        textEl.textContent = `⚖️ ${weightStr}`;
      }
    }
  },

  /**
   * Called by POSManager when an item is being added to the cart
   * Returns weight in kg if scale is connected and has a valid weight, or null
   */
  getWeightForProduct(product) {
    if (!this.isConnected) return null;
    const isWeightItem = product && (product.unit === 'kg' || product.unit === 'g');

    if (isWeightItem || this.autoApplyWeight) {
      if (this.currentWeight > 0) {
        return this.currentWeight;
      }
    }
    return null;
  },

  /**
   * Apply live scale weight to a specific cart row index
   */
  applyWeightToCartIndex(index) {
    if (!this.isConnected) {
      this.connect(true);
      return;
    }

    if (this.currentWeight <= 0) {
      alert('⚠️ Scale reads 0.000 kg.\nPlease place the item on the Budry scale first.');
      return;
    }

    if (window.POSManager && POSManager.cart && POSManager.cart[index]) {
      POSManager.updateItemQty(index, this.currentWeight);
      if (window.SoundManager) SoundManager.playScanBeep();
      POSManager.focusSearchInput();
    }
  },

  /**
   * Capture weight for Farmer Intake
   */
  captureWeightForFarmerIntake() {
    if (!this.isConnected) {
      this.connect(true);
      return;
    }

    if (this.currentWeight <= 0) {
      alert('⚠️ Scale reads 0.000 kg.\nPlease place the vegetable bag/crate on the Budry scale first.');
      return;
    }

    const input = document.getElementById('farmerVegWeightInput') || document.getElementById('farmerIntakeWeightInput');
    if (input) {
      input.value = this.currentWeight.toFixed(3);
      if (typeof FarmerManager !== 'undefined' && FarmerManager.onIntakeWeightChange) {
        FarmerManager.onIntakeWeightChange();
      }
      if (window.SoundManager) SoundManager.playScanBeep();
      const p = document.getElementById('farmerVegPriceInput');
      if (p) { p.focus(); p.select(); }
    }
  },

  /**
   * Zero / Tare the scale (Software Tare if serial tare command unsupported)
   */
  tare() {
    this.softwareTare = this.lastRawValue;
    this.currentWeight = 0.000;
    this.renderHeaderWidget();
    this.log(`Tare set to ${this.softwareTare.toFixed(3)} kg`);

    // Also attempt sending standard Tare command over serial
    try {
      if (this.port && this.port.writable) {
        const writer = this.port.writable.getWriter();
        const encoder = new TextEncoder();
        writer.write(encoder.encode('T\r\n'));
        writer.releaseLock();
      }
    } catch (e) {}
  },

  zero() {
    this.softwareTare = 0.000;
    this.log('Software Tare cleared (Zero reset).');
    this.renderHeaderWidget();
  },

  setBaudRate(newBaud) {
    this.baudRate = parseInt(newBaud, 10);
    localStorage.setItem('lankapos_scale_baud', this.baudRate);
    this.log(`Baud rate set to ${this.baudRate}. Please reconnect.`);
    if (this.isConnected) {
      alert(`Baud rate changed to ${this.baudRate}. Reconnecting...`);
      this.disconnect().then(() => this.connect(true));
    }
  },

  toggleAutoApply(checked) {
    this.autoApplyWeight = checked;
    localStorage.setItem('lankapos_scale_auto', checked);
  },

  log(msg) {
    const time = new Date().toLocaleTimeString();
    this.recentLogs.unshift(`[${time}] ${msg}`);
    if (this.recentLogs.length > 30) this.recentLogs.pop();

    const logBox = document.getElementById('scaleModalLogBox');
    if (logBox) {
      logBox.textContent = this.recentLogs.join('\n');
    }
  },

  openScaleModal() {
    const modal = document.getElementById('scaleSettingsModal');
    if (!modal) return;

    const baudSelect = document.getElementById('scaleBaudRateSelect');
    if (baudSelect) baudSelect.value = String(this.baudRate);

    const autoCheck = document.getElementById('scaleAutoApplyCheck');
    if (autoCheck) autoCheck.checked = this.autoApplyWeight;

    const statusBadge = document.getElementById('scaleModalConnBadge');
    if (statusBadge) {
      statusBadge.textContent = this.isConnected ? 'CONNECTED (සම්බන්ධයි)' : 'DISCONNECTED (විසන්ධි කර ඇත)';
      statusBadge.className = this.isConnected
        ? 'px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-950 text-emerald-300 border border-emerald-700'
        : 'px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-800 text-slate-400 border border-slate-700';
    }

    const connectBtn = document.getElementById('scaleModalToggleBtn');
    if (connectBtn) {
      connectBtn.textContent = this.isConnected ? '🔴 Disconnect Scale' : '🟢 Connect Budry Scale';
      connectBtn.className = this.isConnected
        ? 'px-4 py-2 bg-rose-700 hover:bg-rose-600 text-white rounded-xl text-xs font-bold transition'
        : 'px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition shadow-md shadow-emerald-600/30';
    }

    this.log(this.isConnected ? `Scale status: Online (${this.baudRate} bps)` : 'Scale status: Offline');
    modal.classList.remove('hidden');
  },

  closeScaleModal() {
    document.getElementById('scaleSettingsModal')?.classList.add('hidden');
  }
};

window.ScaleManager = ScaleManager;
