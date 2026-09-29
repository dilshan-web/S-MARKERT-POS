/**
 * Central App Router, Scanner Wedge, Camera Scanner, Hotkeys & PWA Service Worker
 */

const App = {
  currentTab: 'pos',
  scannerBuffer: '',
  scannerLastKeyTime: 0,
  html5QrScanner: null,

  async init() {
    console.log('[App] Initializing Offline Supermarket POS System with Sinhala & Wholesale support...');

    // 1. Setup UI listeners and Form handlers immediately (Synchronous)
    this.setupLoginForm();
    this.setupNavRouting();
    this.setupKeyboardShortcuts();
    this.setupScannerWedgeListener();
    this.setupMouseWheelScrollSupport();

    // 2. Init Auth Manager FIRST so user can log in instantly
    try {
      await AuthManager.init();
      if (window.BackupManager) {
        BackupManager.loadStoreLogo().catch(() => {});
      }
      if (window.I18n) {
        I18n.init().catch(() => {});
      }
    } catch (e) {
      console.warn('[App] Auth/Logo init error:', e);
    }

    // 3. Seed and synchronize database in background safely
    try {
      seedDatabaseIfEmpty().catch(e => console.warn('[App] Background seed notice:', e));
    } catch (e) {}

    // 4. Init Sound Manager setting safely
    try {
      const beepVal = await getSetting('beep_sound_enabled', true);
      SoundManager.enabled = beepVal === true || beepVal === 'true';
    } catch (e) {}

    // 5. Init Shift Manager safely
    try {
      await ShiftManager.init();
    } catch (e) {
      console.warn('[App] Shift init error:', e);
    }

    // 6. Init POS Module & Dashboard safely
    try {
      await POSManager.init();
    } catch (e) {
      console.warn('[App] POS init error:', e);
    }
    try {
      if (window.DashboardManager) {
        await DashboardManager.init();
      }
    } catch (e) {
      console.warn('[App] Dashboard init error:', e);
    }

    // 7. Register PWA Service Worker & Install Manager
    try {
      this.registerServiceWorker();
      PWAInstallManager.init();
    } catch (e) {}

    // 8. Update real-time clock
    this.startLiveClock();

    // 9. If user is logged in, ensure UI and default tab are rendered
    if (AuthManager.isLoggedIn()) {
      AuthManager.updateUI();
      const initialTab = this.currentTab || 'pos';
      this.switchTab(initialTab);
    }

    console.log('[App] LankaPOS successfully initialized.');
  },
  switchTab(tabName) {
    if (!AuthManager.hasPermission(tabName)) {
      alert(`Access Restricted: Your role (${AuthManager.currentUser?.role}) cannot access this section.`);
      return;
    }

    this.currentTab = tabName;
    this.closeMobileMoreDrawer();

    // Update Desktop Nav Button Styles
    document.querySelectorAll('.nav-tab-btn').forEach(btn => {
      if (btn.getAttribute('data-tab') === tabName) {
        btn.classList.add('bg-sky-600', 'text-white', 'shadow-md', 'shadow-sky-600/30');
        btn.classList.remove('text-slate-400', 'hover:bg-slate-800');
      } else {
        btn.classList.remove('bg-sky-600', 'text-white', 'shadow-md', 'shadow-sky-600/30');
        btn.classList.add('text-slate-400', 'hover:bg-slate-800');
      }
    });

    // Update Mobile Bottom Nav Button Styles
    document.querySelectorAll('.mobile-nav-btn').forEach(btn => {
      if (btn.getAttribute('data-tab') === tabName) {
        btn.classList.add('text-sky-400', 'font-black');
        btn.classList.remove('text-slate-400');
      } else {
        btn.classList.remove('text-sky-400', 'font-black');
        btn.classList.add('text-slate-400');
      }
    });

    // Toggle Tab Views
    document.querySelectorAll('.tab-view').forEach(view => {
      if (view.id === `tabView_${tabName}`) {
        view.classList.remove('hidden');
      } else {
        view.classList.add('hidden');
      }
    });

    // Lazy load tab data safely
    try {
      if (tabName === 'dashboard' && window.DashboardManager) DashboardManager.init();
      else if (tabName === 'inventory' && window.InventoryManager) InventoryManager.init();
      else if (tabName === 'grn' && window.GRNManager) GRNManager.init();
      else if (tabName === 'customers' && window.CustomerManager) CustomerManager.init();
      else if (tabName === 'credit' && window.CustomerManager) CustomerManager.initCreditTab();
      else if (tabName === 'suppliers' && window.SupplierManager) SupplierManager.init();
      else if (tabName === 'expenses' && window.ExpenseManager) ExpenseManager.init();
      else if (tabName === 'shifts' && window.ShiftManager) ShiftManager.init();
      else if (tabName === 'reports' && window.ReportsManager) ReportsManager.init();
      else if (tabName === 'settings') {
        if (window.BackupManager) BackupManager.init();
        if (window.AuthManager && (AuthManager.isAdmin() || AuthManager.isManager())) {
          AuthManager.renderUsersTable();
        }
      }
      else if (tabName === 'pos' && window.POSManager) {
        POSManager.renderCategoryFilter();
        POSManager.renderProductGrid();
        POSManager.renderCart();
        POSManager.focusSearchInput();
      }
    } catch (err) {
      console.warn(`[App] Error loading tab "${tabName}":`, err);
    }
  },

  openMobileMoreDrawer() {
    const drawer = document.getElementById('mobileMoreMenuDrawer');
    if (drawer) drawer.classList.remove('hidden');
  },

  closeMobileMoreDrawer() {
    const drawer = document.getElementById('mobileMoreMenuDrawer');
    if (drawer) drawer.classList.add('hidden');
  },

  openNotificationsModal() {
    this.switchTab('dashboard');
    setTimeout(() => {
      const container = document.getElementById('dashAlertsContainer');
      if (container) {
        container.scrollIntoView({ behavior: 'smooth', block: 'center' });
        container.classList.add('ring-2', 'ring-rose-500');
        setTimeout(() => container.classList.remove('ring-2', 'ring-rose-500'), 2000);
      }
    }, 100);
  },

  // Setup Navigation listeners
  setupNavRouting() {
    document.querySelectorAll('.nav-tab-btn, .mobile-nav-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.getAttribute('data-tab');
        if (tab === 'more') {
          this.openMobileMoreDrawer();
        } else if (tab) {
          this.switchTab(tab);
        }
      });
    });
  },

  // Global USB/Bluetooth Barcode Scanner Wedge Listener
  setupScannerWedgeListener() {
    document.addEventListener('keydown', (e) => {
      const now = Date.now();
      const timeDiff = now - this.scannerLastKeyTime;
      this.scannerLastKeyTime = now;

      if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'].includes(e.key)) {
        return;
      }

      const activeEl = document.activeElement;
      const isInput = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable);

      if (e.key === 'Enter') {
        if (this.scannerBuffer.length >= 3) {
          const barcode = this.scannerBuffer;
          this.scannerBuffer = '';

          if (this.currentTab === 'pos') {
            e.preventDefault();
            if (isInput) activeEl.blur();
            POSManager.handleBarcodeScan(barcode);
            return;
          }
        }
        this.scannerBuffer = '';
      } else if (e.key.length === 1) {
        if (timeDiff < 50 || this.scannerBuffer.length === 0) {
          this.scannerBuffer += e.key;
        } else {
          this.scannerBuffer = e.key;
        }
      }
    });
  },

  // Keyboard Shortcuts (F1-F12, Esc)
  setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      if (!AuthManager.isLoggedIn()) return;

      if (e.key === 'Escape') {
        document.querySelectorAll('.app-modal').forEach(m => m.classList.add('hidden'));
        this.stopCameraScanner();
        if (this.currentTab === 'pos') {
          POSManager.focusSearchInput();
        }
        return;
      }

      if (this.currentTab === 'pos') {
        if (e.key === 'F1') {
          e.preventDefault();
          const search = document.getElementById('posSearchInput');
          if (search) { search.focus(); search.select(); }
        } else if (e.key === 'F2') {
          e.preventDefault();
          const manualCode = prompt('බාර්කෝඩ් අංකය ඇතුළත් කරන්න (Enter Barcode or SKU):');
          if (manualCode) POSManager.handleBarcodeScan(manualCode);
        } else if (e.key === 'F3') {
          e.preventDefault();
          CustomerManager.openCustomerSelectModal();
        } else if (e.key === 'F4') {
          e.preventDefault();
          POSManager.openDiscountModal('bill');
        } else if (e.key === 'F6') {
          e.preventDefault();
          POSManager.setPricingMode(POSManager.pricingMode === 'retail' ? 'wholesale' : 'retail');
        } else if (e.key === 'F7') {
          e.preventDefault();
          POSManager.openSalesHistoryModal();
        } else if (e.key === 'F8') {
          e.preventDefault();
          POSManager.holdCurrentBill();
        } else if (e.key === 'F9') {
          e.preventDefault();
          POSManager.openRecallBillsModal();
        } else if (e.key === 'F10') {
          e.preventDefault();
          POSManager.openPaymentModal();
        }
      }
    });
  },

  // Global Smart Mouse Wheel Scrolling Support
  setupMouseWheelScrollSupport() {
    window.addEventListener('wheel', (e) => {
      // 1. If an active modal is open, scroll its scrollable area
      const openModals = Array.from(document.querySelectorAll('.app-modal:not(.hidden)'));
      if (openModals.length > 0) {
        const topModal = openModals[openModals.length - 1];
        const scrollContainer = topModal.querySelector('.overflow-y-auto, [class*="overflow-y"]') || topModal;
        if (scrollContainer && scrollContainer.scrollHeight > scrollContainer.clientHeight) {
          scrollContainer.scrollTop += e.deltaY;
        }
        return;
      }

      // 2. If user is on POS tab
      if (this.currentTab === 'pos') {
        const rightPane = document.getElementById('posRightProductsPane');
        const prodGrid = document.getElementById('posProductGrid');
        const leftPane = document.getElementById('posLeftCartPane');
        const cartContainer = document.getElementById('posCartTableBody')?.parentElement;

        // If mouse is anywhere in the Products right pane
        if (rightPane && (rightPane.contains(e.target) || e.target === rightPane)) {
          if (prodGrid) {
            prodGrid.scrollTop += e.deltaY;
          }
          return;
        }

        // If mouse is anywhere in the Cart left pane
        if (leftPane && (leftPane.contains(e.target) || e.target === leftPane)) {
          if (cartContainer) {
            cartContainer.scrollTop += e.deltaY;
          }
          return;
        }
      }

      // 3. For all other tabs (dashboard, inventory, grn, customers, credit, suppliers, expenses, shifts, reports, settings)
      const activeTabView = document.querySelector('.tab-view:not(.hidden)');
      if (activeTabView && activeTabView.id !== 'tabView_pos') {
        const scrollTarget = activeTabView.classList.contains('overflow-y-auto') ? activeTabView : (activeTabView.querySelector('.overflow-y-auto') || activeTabView);
        if (scrollTarget && scrollTarget.scrollHeight > scrollTarget.clientHeight) {
          scrollTarget.scrollTop += e.deltaY;
        }
      }
    }, { passive: true });
  },

  // Camera Barcode Scanner using html5-qrcode
  async startCameraScanner() {
    const modal = document.getElementById('cameraScannerModal');
    modal.classList.remove('hidden');

    if (window.Html5Qrcode) {
      try {
        if (!this.html5QrScanner) {
          this.html5QrScanner = new Html5Qrcode('cameraScannerReader');
        }
        await this.html5QrScanner.start(
          { facingMode: 'environment' },
          {
            fps: 15,
            qrbox: { width: 250, height: 180 }
          },
          (decodedText) => {
            console.log('[Camera Scanner] Barcode Decoded:', decodedText);
            SoundManager.playScanBeep();
            this.stopCameraScanner();
            POSManager.handleBarcodeScan(decodedText);
          },
          (errorMessage) => {}
        );
      } catch (err) {
        console.error('Camera Scanner Error:', err);
        alert('Could not access camera for scanning.');
        this.stopCameraScanner();
      }
    } else {
      alert('Camera scanner library not available in offline mode.');
      modal.classList.add('hidden');
    }
  },

  stopCameraScanner() {
    const modal = document.getElementById('cameraScannerModal');
    if (modal) modal.classList.add('hidden');
    if (this.html5QrScanner) {
      try {
        this.html5QrScanner.stop().catch(() => {});
      } catch (e) {}
    }
  },

  async handleLogin(e) {
    if (e) {
      try { e.preventDefault(); e.stopPropagation(); } catch (err) {}
    }
    const loginError = document.getElementById('loginErrorMessage');
    const uInput = document.getElementById('loginUsernameInput');
    const pInput = document.getElementById('loginPasswordInput');

    const username = uInput ? uInput.value : '';
    const password = pInput ? pInput.value : '';

    if (loginError) loginError.classList.add('hidden');

    const res = await AuthManager.loginWithCredentials(username, password);
    if (!res.success) {
      if (loginError) {
        loginError.textContent = res.message;
        loginError.classList.remove('hidden');
      }
    } else {
      if (pInput) pInput.value = '';
      const landingTab = AuthManager.hasPermission('dashboard') ? 'dashboard' : 'pos';
      App.switchTab(landingTab);
    }
    return false;
  },

  setupLoginForm() {
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
      loginForm.onsubmit = (e) => this.handleLogin(e);
    }
  },

  startLiveClock() {
    const clockEl = document.getElementById('headerLiveClock');
    const dateEl = document.getElementById('headerLiveDate');

    const updateTime = () => {
      const now = new Date();
      if (clockEl) {
        clockEl.textContent = now.toLocaleTimeString('en-LK', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      }
      if (dateEl) {
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const weekdayEn = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][now.getDay()];
        const weekdaySi = ['ඉරිදා', 'සඳුදා', 'අඟහරුවාදා', 'බදාදා', 'බ්‍රහස්පතින්දා', 'සිකුරාදා', 'සෙනසුරාදා'][now.getDay()];
        
        if (window.I18n && I18n.currentLang === 'si') {
          dateEl.textContent = `${year}-${month}-${day} (${weekdaySi})`;
        } else if (window.I18n && I18n.currentLang === 'bi') {
          dateEl.textContent = `${year}-${month}-${day} (${weekdaySi} / ${weekdayEn})`;
        } else {
          dateEl.textContent = `${year}-${month}-${day} (${weekdayEn})`;
        }
      }
    };
    updateTime();
    setInterval(updateTime, 1000);
  },

  registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js')
        .then((reg) => {
          console.log('[ServiceWorker] Registered with scope:', reg.scope);
        })
        .catch((err) => {
          console.warn('[ServiceWorker] Registration failed:', err);
        });
    }
  }
};

const PWAInstallManager = {
  deferredPrompt: null,
  isInstalled: false,

  init() {
    // Check if running in standalone mode (installed)
    if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true) {
      this.isInstalled = true;
      this.updateInstallButtons(false);
    }

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferredPrompt = e;
      this.updateInstallButtons(true);
      console.log('[PWA] beforeinstallprompt captured!');
    });

    window.addEventListener('appinstalled', () => {
      this.deferredPrompt = null;
      this.isInstalled = true;
      this.updateInstallButtons(false);
      console.log('[PWA] App successfully installed!');
      alert('🎉 Lanka Mega POS App has been successfully installed on your device!');
    });
  },

  updateInstallButtons(canInstall) {
    const headerBtn = document.getElementById('headerPwaInstallBtn');
    const mobileBtn = document.getElementById('mobileMenuPwaInstallBtn');
    const settingsBtn = document.getElementById('settingsPwaInstallBtn');

    [headerBtn, mobileBtn, settingsBtn].forEach(btn => {
      if (btn) {
        if (canInstall || !this.isInstalled) {
          btn.classList.remove('hidden');
        } else {
          btn.classList.add('hidden');
        }
      }
    });
  },

  async promptInstall() {
    if (this.deferredPrompt) {
      this.deferredPrompt.prompt();
      const choiceResult = await this.deferredPrompt.userChoice;
      if (choiceResult.outcome === 'accepted') {
        console.log('[PWA] User accepted the install prompt');
        this.deferredPrompt = null;
      }
    } else {
      this.openInstallGuideModal();
    }
  },

  openInstallGuideModal() {
    const modal = document.getElementById('pwaInstallGuideModal');
    if (modal) modal.classList.remove('hidden');
  }
};

window.App = App;
window.PWAInstallManager = PWAInstallManager;

window.togglePasswordVisibility = function() {
  const input = document.getElementById('loginPasswordInput');
  if (input) {
    input.type = input.type === 'password' ? 'text' : 'password';
  }
};

window.quickFillLogin = async function(u, p) {
  const uInput = document.getElementById('loginUsernameInput');
  const pInput = document.getElementById('loginPasswordInput');
  const loginError = document.getElementById('loginErrorMessage');
  if (uInput) uInput.value = u;
  if (pInput) pInput.value = p;
  if (loginError) loginError.classList.add('hidden');

  const res = await AuthManager.loginWithCredentials(u, p);
  if (!res.success) {
    if (loginError) {
      loginError.textContent = res.message;
      loginError.classList.remove('hidden');
    }
  } else {
    if (pInput) pInput.value = '';
    const landingTab = AuthManager.hasPermission('dashboard') ? 'dashboard' : 'pos';
    App.switchTab(landingTab);
  }
};

window.handleLoginFormSubmit = function(e) {
  return App.handleLogin(e);
};

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', () => {
    App.init();
  });
} else {
  App.init();
}

