(() => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const money = (value) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(value || 0));
  const dateTime = (value) => value ? new Date(value).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
  const api = async (url, options = {}) => {
    const response = await fetch(url, {
      ...options,
      headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) },
      credentials: 'same-origin',
      cache: 'no-store'
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.success === false) {
      const err = new Error(data.error || `Permintaan gagal (${response.status}).`);
      err.code = data.code || 'REQUEST_ERROR';
      err.orderId = data.orderId;
      throw err;
    }
    return data;
  };

  const state = {
    config: {}, user: null, page: 'home',
    selectedService: null, selectedServiceName: '', selectedAmount: 0, catalogPrices: {}, selectedProduct: null,
    currentOrder: null, pollTimer: null, historyTab: 'orders', history: { orders: [], deposits: [] }, captchaWidget: null, captchaReady: false, chatBusy: false
  };

  function toast(message, type = 'info') {
    const stack = $('#toast-stack');
    const item = document.createElement('div');
    item.className = `toast ${type}`;
    item.textContent = message;
    stack.appendChild(item);
    window.setTimeout(() => item.remove(), 3800);
  }

  function setAuthTab(tab) {
    const login = tab === 'login';
    $('#login-form').classList.toggle('hidden', !login);
    $('#register-form').classList.toggle('hidden', login);
    $('#auth-title').textContent = login ? 'Selamat datang kembali' : 'Buat akun DEWA OTP';
    $('#auth-subtitle').textContent = login ? 'Masuk untuk melanjutkan ke akun DEWA OTP.' : 'Daftar untuk mulai menggunakan layanan DEWA OTP.';
    $('#auth-switch-copy').textContent = login ? 'Belum punya akun?' : 'Sudah punya akun?';
    $('#auth-switch-button').textContent = login ? 'Register' : 'Login';
    $('#auth-switch-button').dataset.target = login ? 'register' : 'login';
  }

  async function initConfig() {
    try {
      const data = await api('/api/config');
      state.config = data.config || {};
      if (state.config.recaptchaSiteKey) loadRecaptcha(state.config.recaptchaSiteKey);
      else setCaptchaUnavailable('reCAPTCHA belum dikonfigurasi. Registrasi dinonaktifkan sampai Site Key disetel.');
    } catch { state.config = {}; setCaptchaUnavailable('Konfigurasi keamanan gagal dimuat. Registrasi ditutup sementara.'); }
  }

  function setCaptchaUnavailable(message) {
    const hint = $('#captcha-hint');
    if (hint) hint.textContent = message;
    const submit = $('#register-form button[type=submit]');
    if (submit) submit.disabled = true;
  }

  function loadRecaptcha(siteKey) {
    const hint = $('#captcha-hint');
    hint.textContent = 'Memuat verifikasi reCAPTCHA...';
    window.recaptchaReady = () => {
      try {
        state.captchaWidget = window.grecaptcha.render('recaptcha-container', {
          sitekey: siteKey,
          theme: 'light',
          callback: () => { state.captchaReady = true; hint.textContent = 'Verifikasi berhasil. Token akan diverifikasi oleh server.'; const submit = $('#register-form button[type=submit]'); if (submit) submit.disabled = false; },
          'expired-callback': () => { state.captchaReady = false; hint.textContent = 'Verifikasi kedaluwarsa. Silakan ulangi.'; const submit = $('#register-form button[type=submit]'); if (submit) submit.disabled = true; }
        });
        hint.textContent = 'Selesaikan verifikasi sebelum mendaftar.';
        const submit = $('#register-form button[type=submit]'); if (submit) submit.disabled = true;
      } catch { hint.textContent = 'reCAPTCHA gagal dimuat. Periksa domain site key.'; }
    };
    const script = document.createElement('script');
    script.src = 'https://www.google.com/recaptcha/api.js?onload=recaptchaReady&render=explicit';
    script.async = true;
    script.defer = true;
    script.onerror = () => setCaptchaUnavailable('Google reCAPTCHA gagal dimuat. Periksa koneksi, CSP, dan domain yang didaftarkan.');
    document.head.appendChild(script);
  }

  function openApp(user) {
    if (!user?.id) {
      toast('Sesi tidak valid. Silakan login kembali.', 'error');
      return;
    }
    state.user = user;
    $('#auth-screen').classList.add('hidden');
    $('#app-shell').classList.remove('hidden');
    updateUserUI();
    navigate('home');
    refreshMe();
    refreshHistory();
    loadCatalog();
  }

  function updateUserUI() {
    const name = state.user?.name || 'Pengguna';
    const username = state.user?.username || 'member';
    $('#welcome-name').textContent = name.split(' ')[0];
    $('#account-display-name').textContent = name;
    $('#account-display-username').textContent = `@${username}`;
    $('#account-display-email').textContent = state.user?.email || '';
    $('#profile-name').value = name;
    $('#profile-username').value = username;
    $('#email-verification-status').textContent = 'Dikelola melalui Supabase Auth.';
  }

  function updateBalance(value) {
    const amount = Number(value || 0);
    state.user.balance = amount;
    $('#sidebar-balance').textContent = money(amount);
    $('#home-balance').textContent = money(amount);
    $('#topup-current-balance').textContent = money(amount);
  }

  async function refreshMe() {
    try {
      const data = await api('/api/auth/me');
      state.user = { ...state.user, ...data.user, balance: Number(data.balance || 0) };
      updateUserUI();
      updateBalance(data.balance);
    } catch (err) {
      if (err.message.includes('Belum login')) {
        $('#app-shell').classList.add('hidden');
        $('#auth-screen').classList.remove('hidden');
      }
    }
  }

  async function tryRestoreSession() {
    try {
      const data = await api('/api/auth/me');
      openApp({ ...data.user, balance: data.balance });
      return true;
    } catch { return false; }
  }

  function navigate(page) {
    state.page = page;
    $$('.page-section').forEach(section => section.classList.toggle('active', section.dataset.page === page));
    $$('.nav-item').forEach(item => item.classList.toggle('active', item.dataset.navigate === page));
    const titles = { home: 'Dashboard', buy: 'Beli Nomor', otp: 'Detail Pesanan OTP', topup: 'Beli Saldo', history: 'Riwayat', account: 'Akun & Keamanan', support: 'Bantuan' };
    $('#breadcrumb-page').textContent = titles[page] || 'Dashboard';
    $('#topbar-title').textContent = titles[page] || 'Dashboard';
    closeMobileSidebar();
    $('#app-shell').classList.toggle('support-mode', page === 'support');
    if (page === 'support') requestAnimationFrame(() => { const messages = $('#chat-messages'); if (messages) messages.scrollTop = messages.scrollHeight; });
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (page === 'history') refreshHistory();
    if (page === 'account') updateUserUI();
    if (page === 'otp') startOtpPolling(); else stopOtpPolling();
  }

  function setHistoryTab(tab) {
    state.historyTab = tab;
    $$('.history-tab').forEach(button => button.classList.toggle('active', button.dataset.historyTab === tab));
    renderHistoryTable();
  }

  function statusLabel(status) {
    const labels = { creating: 'Menyiapkan nomor', pending: 'Menunggu OTP', success: 'Success', refunded: 'Refunded', refund_pending: 'Refund diproses', refund_processing: 'Refund diproses', cancelled: 'Dibatalkan', failed: 'Gagal', expired: 'Expired', paid: 'Lunas' };
    return labels[status] || status || '—';
  }

  function renderHistoryTable() {
    const head = $('#history-head');
    const body = $('#history-body');
    const rows = state.historyTab === 'orders' ? state.history.orders : state.history.deposits;
    $('#history-order-count').textContent = state.history.orders.length;
    $('#history-deposit-count').textContent = state.history.deposits.length;
    if (state.historyTab === 'orders') {
      head.innerHTML = '<tr><th>LAYANAN</th><th>NOMOR</th><th>HARGA</th><th>STATUS</th><th>TANGGAL</th><th>AKSI</th></tr>';
      if (!rows.length) return showEmptyTable(body, 'Belum ada pembelian nomor.');
      body.innerHTML = rows.map(order => `<tr><td><b>${escapeHtml(order.service_code || '—')}</b></td><td>${escapeHtml(order.phone_number || 'Menunggu')}</td><td>${money(order.price)}</td><td><span class="table-status ${statusClass(order.status)}">${statusLabel(order.status)}</span></td><td>${dateTime(order.created_at)}</td><td><button class="table-action" data-open-order="${escapeHtml(order.id)}">Detail</button></td></tr>`).join('');
      $$('[data-open-order]', body).forEach(button => button.addEventListener('click', () => openOrderFromHistory(button.dataset.openOrder)));
    } else {
      head.innerHTML = '<tr><th>INVOICE</th><th>NOMINAL</th><th>METODE</th><th>STATUS</th><th>TANGGAL</th></tr>';
      if (!rows.length) return showEmptyTable(body, 'Belum ada deposit.');
      body.innerHTML = rows.map(item => `<tr><td><b>${escapeHtml(item.gateway_reference || item.id?.slice(0, 8) || '—')}</b></td><td>${money(item.amount)}</td><td>DOKU / QRIS</td><td><span class="table-status ${statusClass(item.status)}">${statusLabel(item.status)}</span></td><td>${dateTime(item.created_at)}</td></tr>`).join('');
    }
  }

  function showEmptyTable(body, message) {
    body.innerHTML = `<tr><td colspan="6"><div class="empty-state"><span>◷</span><b>${escapeHtml(message)}</b><small>Data akan muncul setelah aktivitas dilakukan.</small></div></td></tr>`;
  }

  function statusClass(status) {
    if (status === 'success' || status === 'paid') return 'success';
    if (status === 'pending' || status === 'creating' || status === 'refund_pending' || status === 'refund_processing') return 'pending';
    return 'refunded';
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  }

  async function refreshHistory() {
    try {
      const data = await api('/api/history');
      state.history = { orders: data.orders || [], deposits: data.deposits || [] };
      updateBalance(data.balance);
      $('#personal-orders').textContent = state.history.orders.length;
      $('#personal-total').textContent = state.history.orders.length;
      renderHistoryTable();
      renderRecent();
    } catch (err) { toast(err.message, 'error'); }
  }

  function renderRecent() {
    const container = $('#recent-orders');
    const rows = state.history.orders.slice(0, 4);
    if (!rows.length) {
      container.innerHTML = '<div class="empty-state compact-empty"><span>◷</span><b>Belum ada pesanan</b><small>Pesanan terbaru akan muncul di sini.</small></div>';
      return;
    }
    container.innerHTML = rows.map(item => `<div class="recent-item"><span class="recent-service">▣</span><div><b>${escapeHtml(item.service_code)}</b><small>${escapeHtml(item.phone_number || 'Menunggu nomor')}</small></div><span class="table-status ${statusClass(item.status)}">${statusLabel(item.status)}</span></div>`).join('');
  }

  function updateCountryPickerLabel() {
    const select = $('#country-select');
    const selected = select?.selectedOptions?.[0];
    const label = $('#country-picker-value');
    if (label) label.textContent = selected?.textContent || 'Pilih negara';
  }

  function closeCountryOverlay() {
    const overlay = $('#country-overlay');
    if (overlay) overlay.remove();
    $('#country-picker-trigger')?.setAttribute('aria-expanded', 'false');
  }

  function openCountryOverlay() {
    const select = $('#country-select');
    if (!select || !select.options.length) return;
    closeCountryOverlay();
    const overlay = document.createElement('div');
    overlay.id = 'country-overlay';
    overlay.className = 'custom-overlay country-overlay';
    overlay.innerHTML = '<section class="glass-dialog country-dialog" role="dialog" aria-modal="true" aria-labelledby="country-dialog-title"><div class="dialog-top"><div><span class="eyebrow">PILIH LOKASI</span><h2 id="country-dialog-title">Pilih Negara</h2></div><button class="dialog-close" type="button" id="country-dialog-close" aria-label="Tutup"><i class="fa-solid fa-xmark"></i></button></div><label class="country-search"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i><input id="country-search-input" type="search" placeholder="Cari nama negara atau kode..." autocomplete="off"></label><div class="country-options" id="country-options" role="listbox"></div></section>';
    document.body.appendChild(overlay);
    $('#country-picker-trigger').setAttribute('aria-expanded', 'true');
    const options = [...select.options].filter(option => option.value && !option.disabled);
    const list = $('#country-options');
    const draw = query => {
      const q = query.trim().toLowerCase();
      const filtered = options.filter(option => option.textContent.toLowerCase().includes(q));
      list.replaceChildren();
      if (!filtered.length) { const empty = document.createElement('p'); empty.className = 'country-empty'; empty.textContent = 'Negara tidak ditemukan.'; list.appendChild(empty); return; }
      filtered.forEach(option => {
        const button = document.createElement('button');
        button.type = 'button'; button.className = 'country-option'; button.setAttribute('role', 'option');
        button.setAttribute('aria-selected', String(option.value === select.value));
        const parts = option.textContent.match(/^(.*?)(?:\s*\((.*?)\))?$/);
        const title = document.createElement('span'); title.textContent = parts?.[1] || option.textContent;
        const prefix = document.createElement('small'); prefix.textContent = parts?.[2] || '';
        button.append(title, prefix);
        button.addEventListener('click', () => { select.value = option.value; select.dispatchEvent(new Event('change', { bubbles: true })); closeCountryOverlay(); });
        list.appendChild(button);
      });
    };
    draw('');
    $('#country-search-input').addEventListener('input', event => draw(event.target.value));
    $('#country-dialog-close').addEventListener('click', closeCountryOverlay);
    overlay.addEventListener('click', event => { if (event.target === overlay) closeCountryOverlay(); });
    $('#country-search-input').focus();
  }

  function renderServiceCards(services) {
    const faRules = [
      { match: /whatsapp|\bwa\b/i, icon: 'fa-whatsapp', brand: true },
      { match: /telegram|\btg\b/i, icon: 'fa-telegram', brand: true },
      { match: /bigo/i, icon: 'fa-video', brand: false },
      { match: /google|gmail|googlevoice|\bgo\b/i, icon: 'fa-google', brand: true },
      { match: /facebook|\bfb\b/i, icon: 'fa-facebook', brand: true },
      { match: /akulaku|dana/i, icon: 'fa-wallet', brand: false },
      { match: /blibli|shopee/i, icon: 'fa-bag-shopping', brand: false },
      { match: /openai|chatgpt|\bgpt\b/i, icon: 'fa-brain', brand: false },
      { match: /claude|anthropic/i, icon: 'fa-comments', brand: false },
      { match: /cursor/i, icon: 'fa-terminal', brand: false },
      { match: /discord|\bdc\b/i, icon: 'fa-discord', brand: true },
      { match: /tiktok|\btt\b/i, icon: 'fa-tiktok', brand: true },
      { match: /snapchat|\bsnap\b/i, icon: 'fa-snapchat', brand: true }
    ];
    const getServiceIcon = (code, name) => faRules.find(rule => rule.match.test(`${name || ''} ${code || ''}`)) || { icon: 'fa-mobile-screen-button', brand: false };
    const container = $('#app-catalog');
    const normalized = (Array.isArray(services) ? services : []).filter(item => Number.isInteger(Number(item.platformId)) && Number(item.platformId) > 0 && item.name);
    if (!normalized.length) {
      container.innerHTML = '<div class="empty-state"><b>Tidak ada layanan untuk negara ini</b><small>Pilih negara lain atau periksa katalog Nokosnesia.</small></div>';
      state.selectedService = null;
      state.selectedProduct = null;
      $('#summary-price').textContent = 'Tidak tersedia';
      $('#summary-stock').textContent = 'Tidak tersedia';
      return;
    }
    container.innerHTML = normalized.map(item => {
      const code = String(item.platformId);
      const logo = getServiceIcon(item.code || code, item.name);
      const logoMarkup = `<span class="app-logo app-logo-fa"><i class="${logo.brand ? 'fa-brands' : 'fa-solid'} ${logo.icon}" aria-hidden="true"></i></span>`;
      return `<button class="app-card" data-service="${escapeHtml(code)}" data-name="${escapeHtml(item.name)}" type="button">${logoMarkup}<span class="app-info"><b>${escapeHtml(item.name)}</b><small>ID layanan ${escapeHtml(code)} · pilih untuk cek stok</small></span><span class="app-price">Pilih <i>→</i></span></button>`;
    }).join('');
    $$('.app-card', container).forEach(button => button.addEventListener('click', () => chooseService(button)));
    const current = normalized.find(item => String(item.platformId) === String(state.selectedService));
    const first = current ? $(`.app-card[data-service="${CSS.escape(String(current.platformId))}"]`, container) : $('.app-card', container);
    if (first) chooseService(first);
  }

  async function loadServicesForCountry() {
    const country = $('#country-select').value;
    if (!country) return;
    try {
      const data = await api(`/api/catalog?country_id=${encodeURIComponent(country)}`);
      renderServiceCards(data.services || []);
    } catch (err) {
      $('#app-catalog').innerHTML = `<div class="empty-state"><b>Layanan tidak dapat dimuat</b><small>${escapeHtml(err.message)}</small></div>`;
      state.selectedService = null;
      state.selectedProduct = null;
    }
  }

  async function loadCatalog() {
    try {
      const data = await api('/api/catalog');
      const countrySelect = $('#country-select');
      if (Array.isArray(data.countries) && data.countries.length) {
        const current = countrySelect.value;
        countrySelect.innerHTML = data.countries.map(country => `<option value="${Number(country.id)}">${escapeHtml(country.name)} (+${escapeHtml(country.code || '')})</option>`).join('');
        const indonesia = data.countries.find(country => String(country.iso || '').toUpperCase() === 'ID' || /indonesia/i.test(country.name));
        const defaultId = String(indonesia?.id ?? data.countries[0].id);
        countrySelect.value = [...countrySelect.options].some(option => option.value === current) ? current : defaultId;
        $('#summary-country').textContent = countrySelect.selectedOptions[0]?.textContent || '—';
        updateCountryPickerLabel();
      }
      await loadServicesForCountry();
    } catch (err) {
      $('#app-catalog').innerHTML = `<div class="empty-state"><b>Katalog Nokosnesia gagal dimuat</b><small>${escapeHtml(err.message)}. Periksa API Key di Vercel.</small></div>`;
      $('#summary-price').textContent = 'Tidak tersedia';
      $('#summary-stock').textContent = 'Tidak tersedia';
    }
  }

  async function updateCatalogPrices() {
    if (state.selectedService) await updateQuote();
  }

  async function updateQuote() {
    const country = $('#country-select').value;
    if (!country || !state.selectedService) return;
    const operatorSelect = $('#operator-select');
    const requestedOperator = operatorSelect.value || 'any';
    $('#buy-number-btn').disabled = true;
    try {
      const data = await api(`/api/catalog/quote?service=${encodeURIComponent(state.selectedService)}&country=${encodeURIComponent(country)}&operator=${encodeURIComponent(requestedOperator)}`);
      const operators = Array.isArray(data.operators) ? data.operators : [];
      const oldValue = operatorSelect.value || 'any';
      const operatorOptions = [{ id: 'any', name: 'Semua Operator' }, ...operators.filter(item => item.id !== null && item.id !== undefined).map(item => ({ id: String(item.id), name: item.name }))];
      const uniqueOptions = operatorOptions.filter((item, index, rows) => rows.findIndex(other => String(other.id) === String(item.id)) === index);
      operatorSelect.innerHTML = uniqueOptions.map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join('');
      operatorSelect.value = uniqueOptions.some(item => String(item.id) === String(oldValue)) ? oldValue : 'any';

      const selected = data.selected || null;
      state.selectedProduct = selected;
      const selectedOperatorName = selected?.operatorName || operatorSelect.selectedOptions[0]?.textContent || 'Semua Operator';
      $('#summary-operator').textContent = selectedOperatorName;
      $('#summary-price').textContent = selected ? money(selected.salePrice) : 'Stok tidak tersedia';
      $('#summary-stock').textContent = selected ? `${selected.stock.toLocaleString('id-ID')} tersedia` : 'Tidak tersedia';
      $('.auto-value').textContent = selected ? 'Nokosnesia · harga live' : 'Tidak tersedia';
      $('#buy-number-btn').disabled = !selected || selected.stock <= 0;

      const card = $(`.app-card[data-service="${CSS.escape(String(state.selectedService))}"]`);
      if (card) {
        const meta = $('.app-info small', card);
        if (meta) meta.textContent = selected ? `${selected.stock.toLocaleString('id-ID')} stok · ${selectedOperatorName}` : 'Stok kosong untuk filter ini';
        let price = $('.app-card-price', card);
        if (!price) { price = document.createElement('small'); price.className = 'app-card-price'; $('.app-info', card)?.appendChild(price); }
        price.textContent = selected ? money(selected.salePrice) : 'Stok kosong';
        card.classList.toggle('out-of-stock', !selected || selected.stock <= 0);
      }
    } catch (err) {
      state.selectedProduct = null;
      $('#summary-price').textContent = 'Harga tidak tersedia';
      $('#summary-stock').textContent = 'Tidak dapat dimuat';
      $('.auto-value').textContent = 'Nokosnesia';
      $('#buy-number-btn').disabled = true;
      console.warn('Nokosnesia quote:', err.message);
    }
  }

  function chooseService(button) {
    $$('.app-card').forEach(card => card.classList.toggle('selected', card === button));
    state.selectedService = button.dataset.service;
    state.selectedServiceName = button.dataset.name;
    state.selectedProduct = null;
    $('#operator-select').value = 'any';
    const logo = $('.app-logo', button);
    const summaryLogo = $('#summary-app-logo');
    summaryLogo.className = logo.className;
    summaryLogo.replaceChildren(...[...logo.childNodes].map(node => node.cloneNode(true)));
    $('#summary-app-name').textContent = state.selectedServiceName;
    updateQuote();
  }

  function renderOrder(order) {
    state.currentOrder = order;
    $('#otp-phone').textContent = order.phone || 'Nomor sedang diproses';
    $('#otp-service-name').textContent = order.serviceName || state.selectedServiceName;
    $('#otp-order-id').textContent = `Order Nokos: ${order.providerOrderId || '—'}`;
    $('#otp-price').textContent = money(order.price);
    $('#otp-server').textContent = order.serverName || 'Nokosnesia';
    $('#otp-created').textContent = dateTime(order.createdAt || new Date().toISOString());
    $('#otp-code').textContent = order.otp || '— — — — — —';
    setOtpStatus(order.status || 'pending');
    navigate('otp');
  }

  function setOtpStatus(status) {
    const pill = $('#otp-status-pill');
    const labels = { creating: ['Menyiapkan Nomor', 'Creating', 'pending'], pending: ['Menunggu OTP', 'Waiting', 'pending'], success: ['Pesanan Berhasil', 'Success', 'success'], refunded: ['Refund Berhasil', 'Refunded', 'success'], refund_pending: ['Refund Diproses', 'Refund', 'pending'], cancelled: ['Dibatalkan', 'Cancelled', 'danger'], expired: ['Kedaluwarsa', 'Expired', 'danger'] };
    const current = labels[status] || labels.pending;
    $('#otp-status-text').textContent = current[0];
    pill.className = `status-pill ${current[2]}`;
    pill.innerHTML = `<i></i> ${current[1]}`;
    const done = ['success', 'refunded', 'cancelled', 'expired'].includes(status);
    if (done) stopOtpPolling();
    $('#check-otp-btn').disabled = done || status === 'creating';
    $('#refund-btn').disabled = done || status === 'refund_pending' || status === 'creating';
    $('#refund-btn').textContent = status === 'refunded' ? 'Refund Berhasil' : 'Ajukan Refund';
    $('#otp-helper').textContent = status === 'success' ? 'OTP sudah diterima. Pesanan ditandai berhasil.' : status === 'refunded' ? 'Saldo telah dikembalikan 100% ke wallet Anda.' : 'Kode OTP akan muncul setelah provider menerimanya.';
  }

  async function buyNumber() {
    const button = $('#buy-number-btn');
    if (!state.selectedService || !state.selectedProduct) return toast('Pilih layanan yang memiliki stok dan harga aktif terlebih dahulu.', 'error');
    if (!$('#country-select').value) return toast('Pilih negara dari katalog provider terlebih dahulu.', 'error');
    button.disabled = true;
    button.textContent = 'Memproses...';
    const country = Number($('#country-select').value);
    const operatorId = state.selectedProduct.operatorId;
    try {
        state.pendingIdempotencyKey = state.pendingIdempotencyKey || crypto.randomUUID();
        const idempotencyKey = state.pendingIdempotencyKey;
        const data = await api('/api/orders', { method: 'POST', body: JSON.stringify({ platformId: Number(state.selectedService), countryId: country, catalogProductId: state.selectedProduct.catalogProductId, operatorId, serviceName: state.selectedServiceName, expectedPrice: Number(state.selectedProduct.salePrice), idempotencyKey }) });
        state.pendingIdempotencyKey = null;
        const order = { id: data.orderId, providerOrderId: data.providerOrderId, phone: data.phone, price: data.price, server: 'Nokosnesia', serverName: 'Nokosnesia', serviceName: state.selectedServiceName, status: 'pending', createdAt: new Date().toISOString() };
        renderOrder(order);
        await refreshMe();
        toast('Nomor berhasil dipesan. Menunggu OTP.', 'success');
    } catch (err) {
      if (['PROVIDER_REJECTED', 'OUT_OF_STOCK', 'RESERVE_FAILED'].includes(err.code)) state.pendingIdempotencyKey = null;
      const retryNote = ['PROVIDER_ERROR', 'ORDER_PENDING_SYNC'].includes(err.code) ? ' Periksa riwayat atau hubungi bantuan sebelum mencoba dengan kunci pesanan baru.' : '';
      toast(err.message + retryNote, 'error');
    }
    finally { button.disabled = false; button.innerHTML = 'Beli Nomor <span>→</span>'; }
  }


  function stopOtpPolling() {
    if (state.pollTimer) window.clearInterval(state.pollTimer);
    state.pollTimer = null;
  }

  function startOtpPolling() {
    stopOtpPolling();
    const order = state.currentOrder;
    if (!order || order.status !== 'pending') return;
    state.pollTimer = window.setInterval(() => {
      if (document.visibilityState === 'visible' && state.page === 'otp' && state.currentOrder?.status === 'pending') {
        checkOtp({ silent: true });
      }
    }, 6000);
  }

  async function checkOtp(options = {}) {
    const order = state.currentOrder;
    if (!order) return toast('Tidak ada pesanan aktif.', 'error');
    const button = $('#check-otp-btn');
    if (button.disabled) return;
    button.disabled = true;
    if (!options.silent) button.textContent = 'Memeriksa...';
    try {
      const data = await api(`/api/orders/${encodeURIComponent(order.id)}/otp`);
      order.status = data.status;
      if (data.otp) order.otp = data.otp;
      $('#otp-code').textContent = data.otp || '— — — — — —';
      setOtpStatus(data.status);
      if (data.status === 'success') {
        stopOtpPolling();
        if (!options.silent) toast('OTP diterima. Pesanan berstatus Success.', 'success');
        refreshHistory();
      } else {
        if (['refunded', 'cancelled', 'expired'].includes(data.status)) stopOtpPolling();
        if (!options.silent) toast('OTP belum masuk. Pengecekan otomatis tetap berjalan.', 'info');
      }
    } catch (err) { if (!options.silent) toast(err.message, 'error'); }
    finally {
      button.disabled = ['creating', 'success', 'refunded', 'cancelled', 'expired'].includes(order.status);
      button.innerHTML = '↻ &nbsp; Cek OTP Sekarang';
    }
  }

  async function refundOrder() {
    const order = state.currentOrder;
    if (!order) return toast('Tidak ada pesanan aktif.', 'error');
    if (!window.confirm('Ajukan refund 100%? Jika OTP sudah diterima provider, refund tidak dapat dilakukan.')) return;
    const button = $('#refund-btn');
    button.disabled = true;
    button.textContent = 'Memverifikasi...';
    try {
      const data = await api(`/api/orders/${encodeURIComponent(order.id)}/refund`, { method: 'POST', body: '{}' });
      order.status = 'refunded';
      setOtpStatus('refunded');
      await refreshMe();
      await refreshHistory();
      toast(`Refund ${money(data.refundAmount)} berhasil dikembalikan ke saldo.`, 'success');
    } catch (err) {
      toast(err.message, 'error');
      button.disabled = false;
      button.textContent = 'Ajukan Refund';
    }
  }

  async function createPayment() {
    const amount = Number(state.selectedAmount || $('#custom-amount').value || 0);
    if (!Number.isInteger(amount) || amount < 10000 || amount > 10000000) return toast('Nominal harus Rp10.000–Rp10.000.000.', 'error');
    try {
      const data = await api('/api/payments', { method: 'POST', body: JSON.stringify({ amount, method: 'QRIS' }) });
      $('#payment-result').classList.remove('hidden');
      $('#payment-result-message').textContent = data.message || 'Selesaikan pembayaran sebelum kedaluwarsa.';
      if (data.qrImage) { $('#payment-qr').src = data.qrImage; $('#payment-qr').classList.remove('hidden'); }
      $('#payment-amount').textContent = money(amount);
    } catch (err) { toast(err.message, 'error'); }
  }

  const wait = ms => new Promise(resolve => window.setTimeout(resolve, ms));

  async function appendSmoothStream(paragraph, chunk) {
    for (let index = 0; index < chunk.length; index += 1) {
      paragraph.textContent += chunk[index];
      const messages = $('#chat-messages');
      messages.scrollTop = messages.scrollHeight;
      if (chunk[index] !== ' ') await wait(5);
    }
  }

  async function sendSonny(message) {
    if (state.chatBusy) return;
    state.chatBusy = true;
    const container = $('#chat-messages');
    appendChat('user', message);
    $('#chat-input').value = '';
    $('#chat-input').style.height = 'auto';
    const sendButton = $('#chat-form button[type="submit"]');
    sendButton.disabled = true;
    const typing = document.createElement('div');
    typing.className = 'chat-message bot typing-message';
    typing.innerHTML = '<div class="message-bubble"><span class="typing-dots" role="status" aria-label="Sonny sedang mengetik"><i></i><i></i><i></i></span></div>';
    container.appendChild(typing);
    container.scrollTop = container.scrollHeight;
    let paragraph = null;
    let fullReply = '';
    try {
      const response = await fetch('/api/sonny', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        cache: 'no-store',
        body: JSON.stringify({ message })
      });
      if (!response.ok) {
        const failure = await response.json().catch(() => ({}));
        throw new Error(failure.error || `Permintaan Sonny gagal (${response.status}).`);
      }
      if (!response.body) throw new Error('Browser tidak mendukung streaming jawaban Sonny.');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let finished = false;
      const consumeEvent = async block => {
        const dataLine = block.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trim()).join('\n');
        if (!dataLine || dataLine === '[DONE]') return;
        let payload;
        try { payload = JSON.parse(dataLine); } catch { return; }
        if (payload.error?.message) throw new Error(payload.error.message);
        const delta = payload.choices?.[0]?.delta?.content;
        const content = typeof delta === 'string' ? delta : Array.isArray(delta) ? delta.map(part => part.text || '').join('') : '';
        if (!content) return;
        if (!paragraph) {
          typing.remove();
          const row = document.createElement('div');
          row.className = 'chat-message bot';
          const bubble = document.createElement('div');
          bubble.className = 'message-bubble';
          paragraph = document.createElement('p');
          bubble.appendChild(paragraph);
          row.appendChild(bubble);
          container.appendChild(row);
        }
        fullReply += content;
        await appendSmoothStream(paragraph, content);
      };
      while (!finished) {
        const result = await reader.read();
        finished = result.done;
        buffer += decoder.decode(result.value || new Uint8Array(), { stream: !finished });
        buffer = buffer.replace(/\r\n/g, '\n');
        let boundary = buffer.indexOf('\n\n');
        while (boundary !== -1) {
          const eventBlock = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          await consumeEvent(eventBlock);
          boundary = buffer.indexOf('\n\n');
        }
      }
      if (buffer.trim()) await consumeEvent(buffer);
      if (!fullReply) {
        typing.remove();
        appendChat('bot', 'Maaf, Sonny belum memberikan jawaban. Silakan coba kembali.');
      } else {
        typing.remove();
      }
    } catch (err) {
      typing.remove();
      appendChat('bot', err.message || 'Sonny tidak dapat dihubungi.');
    } finally {
      state.chatBusy = false;
      sendButton.disabled = false;
      $('#chat-input').focus({ preventScroll: true });
    }
  }

  function appendChat(role, message) {
    const row = document.createElement('div');
    row.className = `chat-message ${role}`;
    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';
    const paragraph = document.createElement('p');
    paragraph.textContent = String(message || '');
    bubble.appendChild(paragraph);
    row.appendChild(bubble);
    const container = $('#chat-messages');
    container.appendChild(row);
    container.scrollTop = container.scrollHeight;
    return row;
  }

  function openOrderFromHistory(id) {
    const found = state.history.orders.find(item => item.id === id);
    if (!found) return;
    renderOrder({ id: found.id, providerOrderId: found.provider_activation_id, phone: found.phone_number, price: found.price, serviceName: found.service_code, status: found.status, otp: found.otp_code, createdAt: found.created_at });
  }

  async function loginSubmit(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const button = event.currentTarget.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: form.get('email'), password: form.get('password') }) });
      const data = await api('/api/auth/me');
      openApp({ ...data.user, balance: data.balance });
      toast('Login berhasil.', 'success');
    } catch (err) { toast(err.message, 'error'); }
    finally { button.disabled = false; }
  }

  async function registerSubmit(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const captchaToken = window.grecaptcha && state.captchaWidget !== null ? window.grecaptcha.getResponse(state.captchaWidget) : '';
    if (!state.captchaReady || !captchaToken) return toast('Selesaikan reCAPTCHA sebelum mendaftar.', 'error');
    const button = event.currentTarget.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      const data = await api('/api/auth/register', { method: 'POST', body: JSON.stringify({ name: form.get('name'), username: form.get('username'), email: form.get('email'), password: form.get('password'), captchaToken }) });
      toast(data.message || 'Pendaftaran berhasil. Periksa email Anda.', 'success');
      event.currentTarget.reset();
      if (window.grecaptcha) window.grecaptcha.reset(state.captchaWidget);
      setAuthTab('login');
    } catch (err) { toast(err.message, 'error'); }
    finally { if (window.grecaptcha && state.captchaWidget !== null) window.grecaptcha.reset(state.captchaWidget); state.captchaReady = false; button.disabled = true; }
  }

  async function performLogout() {
    try { await api('/api/auth/logout', { method: 'POST', body: '{}' }); }
    catch (err) { toast(err.message, 'error'); }
    state.user = null; state.currentOrder = null;
    $('#app-shell').classList.add('hidden');
    $('#auth-screen').classList.remove('hidden');
    setAuthTab('login');
    toast('Anda telah keluar.');
  }

  function closeConfirmOverlay() {
    const overlay = $('#confirm-overlay');
    if (overlay) overlay.remove();
  }

  function openLogoutConfirmation() {
    closeConfirmOverlay();
    const overlay = document.createElement('div');
    overlay.id = 'confirm-overlay';
    overlay.className = 'custom-overlay';
    overlay.innerHTML = '<section class="glass-dialog" role="dialog" aria-modal="true" aria-labelledby="logout-confirm-title"><div class="dialog-symbol"><i class="fa-solid fa-right-from-bracket" aria-hidden="true"></i></div><h2 id="logout-confirm-title">Apakah anda yakin ingin keluar?</h2><div class="dialog-actions"><button type="button" class="btn btn-glass" id="logout-cancel">Tidak</button><button type="button" class="btn btn-primary" id="logout-confirm">Iya</button></div></section>';
    document.body.appendChild(overlay);
    overlay.addEventListener('click', event => { if (event.target === overlay) closeConfirmOverlay(); });
    $('#logout-cancel').addEventListener('click', closeConfirmOverlay);
    $('#logout-confirm').addEventListener('click', async () => { closeConfirmOverlay(); await performLogout(); });
    $('#logout-cancel').focus();
  }

  async function resetPassword() {
    const email = state.user?.email || window.prompt('Masukkan email akun:');
    if (!email) return;
    try {
      const data = await api('/api/auth/reset-password', { method: 'POST', body: JSON.stringify({ email }) });
      toast(data.message, 'success');
    } catch (err) { toast(err.message, 'error'); }
  }

  async function saveProfile(event) {
    event.preventDefault();
    const name = $('#profile-name').value.trim();
    try {
      await api('/api/profile', { method: 'PATCH', body: JSON.stringify({ name }) });
      state.user.name = name;
      updateUserUI();
      toast('Profil berhasil diperbarui.', 'success');
    } catch (err) { toast(err.message, 'error'); }
  }

  function closeMobileSidebar() {
    $('#sidebar').classList.remove('open');
    $('#mobile-scrim').classList.remove('show');
    $('#menu-toggle')?.setAttribute('aria-expanded', 'false');
  }

  // Event wiring
  $('#auth-switch-button').addEventListener('click', event => setAuthTab(event.currentTarget.dataset.target || 'register'));
  $('#login-form').addEventListener('submit', loginSubmit);
  $('#register-form').addEventListener('submit', registerSubmit);
  $('#google-login').addEventListener('click', async () => {
    try { const data = await api('/api/auth/google'); window.location.assign(data.url); }
    catch (err) { toast(err.message, 'error'); }
  });
  $('#forgot-password').addEventListener('click', resetPassword);
  $('#account-forgot-password').addEventListener('click', resetPassword);
  $$('.nav-item,[data-navigate]').forEach(button => button.addEventListener('click', () => navigate(button.dataset.navigate)));
  $('#logout-btn').addEventListener('click', openLogoutConfirmation);
  $('#menu-toggle').addEventListener('click', () => {
    if (window.matchMedia('(max-width: 720px)').matches) {
      const opened = $('#sidebar').classList.toggle('open');
      $('#mobile-scrim').classList.toggle('show', opened);
      $('#menu-toggle').setAttribute('aria-expanded', String(opened));
    } else {
      const collapsed = $('#app-shell').classList.toggle('sidebar-collapsed');
      $('#menu-toggle').setAttribute('aria-expanded', String(!collapsed));
    }
  });
  $('#sidebar-close').addEventListener('click', closeMobileSidebar);
  $('#mobile-scrim').addEventListener('click', closeMobileSidebar);
  $('#country-picker-trigger').addEventListener('click', openCountryOverlay);
  document.addEventListener('keydown', event => { if (event.key === 'Escape') { closeCountryOverlay(); closeConfirmOverlay(); closeMobileSidebar(); } });
  $$('.app-card').forEach(button => button.addEventListener('click', () => chooseService(button)));
  $('#service-search').addEventListener('input', event => {
    const value = event.target.value.toLowerCase();
    $$('.app-card').forEach(card => card.classList.toggle('hidden', !card.dataset.name.toLowerCase().includes(value)));
  });
  $('#country-select').addEventListener('change', async () => { const text = $('#country-select').selectedOptions[0]?.textContent || '—'; $('#summary-country').textContent = text; updateCountryPickerLabel(); state.selectedProduct = null; await loadServicesForCountry(); });
  $('#operator-select').addEventListener('change', updateQuote);
  $('#buy-number-btn').addEventListener('click', buyNumber);
  $('#check-otp-btn').addEventListener('click', checkOtp);
  $('#refund-btn').addEventListener('click', refundOrder);
  $('#copy-number').addEventListener('click', async () => { try { await navigator.clipboard.writeText($('#otp-phone').textContent); toast('Nomor disalin.', 'success'); } catch { toast('Tidak dapat menyalin nomor.', 'error'); } });
  $$('.amount-option').forEach(button => button.addEventListener('click', () => {
    $$('.amount-option').forEach(item => item.classList.toggle('active', item === button));
    state.selectedAmount = Number(button.dataset.amount);
    $('#custom-amount').value = '';
  }));
  $('#custom-amount').addEventListener('input', () => { state.selectedAmount = 0; $$('.amount-option').forEach(item => item.classList.remove('active')); });
  $('#create-payment-btn').addEventListener('click', createPayment);
  $$('.history-tab').forEach(button => button.addEventListener('click', () => setHistoryTab(button.dataset.historyTab)));

  $('#chat-form').addEventListener('submit', event => { event.preventDefault(); const message = $('#chat-input').value.trim(); if (message) sendSonny(message); });
  $('#chat-input').addEventListener('input', event => { event.target.style.height = 'auto'; event.target.style.height = `${Math.min(event.target.scrollHeight, 140)}px`; });
  $('#chat-input').addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); $('#chat-form').requestSubmit(); } });
  $('#profile-form').addEventListener('submit', saveProfile);
  $('#change-password-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const oldPassword = String(form.get('oldPassword') || '');
    const newPassword = String(form.get('newPassword') || '');
    const confirmPassword = String(form.get('confirmPassword') || '');
    if (newPassword.length < 8) return toast('Password baru minimal 8 karakter.', 'error');
    if (newPassword !== confirmPassword) return toast('Konfirmasi password baru tidak sama.', 'error');
    try {
      const data = await api('/api/auth/change-password', { method: 'POST', body: JSON.stringify({ oldPassword, newPassword }) });
      event.currentTarget.reset();
      toast(data.message || 'Password berhasil diubah.', 'success');
    } catch (err) { toast(err.message, 'error'); }
  });

  async function updatePasswordSubmit(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = String(form.get('password') || '');
    const confirmPassword = String(form.get('confirmPassword') || '');
    if (password.length < 8) return toast('Password minimal 8 karakter.', 'error');
    if (password !== confirmPassword) return toast('Konfirmasi password tidak sama.', 'error');
    const button = event.currentTarget.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      const data = await api('/api/auth/update-password', { method: 'POST', body: JSON.stringify({ password }) });
      toast(data.message, 'success');
      await api('/api/auth/logout', { method: 'POST', body: '{}' });
      event.currentTarget.reset();
      $('#reset-password-form').classList.add('hidden');
      $('#login-form').classList.remove('hidden');
      $('#auth-switch').classList.remove('hidden');
      $('#auth-title').textContent = 'Password berhasil diubah';
      $('#auth-subtitle').textContent = 'Silakan login menggunakan password baru Anda.';
      history.replaceState({}, '', '/dashboard');
    } catch (err) { toast(err.message, 'error'); }
    finally { button.disabled = false; }
  }
  $('#reset-password-form').addEventListener('submit', updatePasswordSubmit);

  function updateVisualViewport() {
    const height = window.visualViewport?.height || window.innerHeight;
    const top = window.visualViewport?.offsetTop || 0;
    document.documentElement.style.setProperty('--app-viewport-height', `${height}px`);
    document.documentElement.style.setProperty('--app-viewport-top', `${top}px`);
  }
  updateVisualViewport();
  window.visualViewport?.addEventListener('resize', updateVisualViewport);
  window.visualViewport?.addEventListener('scroll', updateVisualViewport);
  window.addEventListener('resize', updateVisualViewport);

  // Startup
  (async () => {
    await initConfig();
    const recoveryMode = new URLSearchParams(window.location.search).get('recovery') === '1';
    if (recoveryMode) {
      $('#auth-screen').classList.remove('hidden');
      $('#app-shell').classList.add('hidden');
      $('#login-form').classList.add('hidden');
      $('#register-form').classList.add('hidden');
      $('#reset-password-form').classList.remove('hidden');
      $('#auth-switch').classList.add('hidden');
      $('#auth-title').textContent = 'Buat password baru';
      $('#auth-subtitle').textContent = 'Masukkan password baru untuk akun DEWA OTP Anda.';
      return;
    }
    const restored = await tryRestoreSession();
    if (!restored) setAuthTab('login');
  })();
})();
