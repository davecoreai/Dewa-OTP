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
    selectedService: null, selectedServiceName: '', selectedAmount: 0, catalogPrices: {},
    currentOrder: null, pollTimer: null, historyTab: 'orders', history: { orders: [], deposits: [] }, captchaWidget: null, captchaReady: false
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
    $$('.auth-tab').forEach(button => {
      const active = button.dataset.authTab === tab;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', String(active));
    });
    $('#login-form').classList.toggle('hidden', !login);
    $('#register-form').classList.toggle('hidden', login);
    $('#auth-title').textContent = login ? 'Selamat datang kembali' : 'Buat akun DEWA OTP';
    $('#auth-subtitle').textContent = login ? 'Masuk untuk melanjutkan ke akun DEWA OTP.' : 'Daftar untuk mulai menggunakan layanan DEWA OTP.';
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
    const initial = (name.trim()[0] || 'D').toUpperCase();
    $('#sidebar-name').textContent = name;
    $('#sidebar-username').textContent = `@${username}`;
    $('#welcome-name').textContent = name.split(' ')[0];
    $('#sidebar-avatar').textContent = initial;
    $('#topbar-avatar').textContent = initial;
    $('#account-avatar').textContent = initial;
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
    const titles = { home: 'Dashboard', buy: 'Beli Nomor', otp: 'Detail Pesanan OTP', topup: 'Beli Saldo', history: 'Riwayat', account: 'Akun & Keamanan', support: 'Bantuan Sonny AI' };
    $('#breadcrumb-page').textContent = titles[page] || 'Dashboard';
    $('#topbar-title').textContent = titles[page] || 'Dashboard';
    $('#sidebar').classList.remove('open');
    $('#mobile-scrim').classList.remove('show');
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

  async function loadCatalog() {
    try {
      const data = await api('/api/catalog');
      const countrySelect = $('#country-select');
      if (Array.isArray(data.countries) && data.countries.length) {
        const current = countrySelect.value;
        countrySelect.innerHTML = data.countries.map(country => `<option value="${Number(country.id)}">${escapeHtml(country.name)} (${escapeHtml(country.prefix || '')})</option>`).join('');
        if ([...countrySelect.options].some(option => option.value === current)) countrySelect.value = current;
        $('#summary-country').textContent = countrySelect.selectedOptions[0]?.textContent || '—';
      }
      if (Array.isArray(data.services) && data.services.length) {
        const iconMap = { wa: ['WA', 'app-wa'], tg: ['TG', 'app-tg'], dc: ['D', 'app-discord'], ig: ['IG', 'app-ig'], go: ['G', 'app-google'], sh: ['S', 'app-shopee'] };
        const logoRules = [
          { file: 'whatsapp.jpg', codes: ['wa', 'whatsapp'], names: ['whatsapp'] },
          { file: 'telegram.jpg', codes: ['tg', 'telegram'], names: ['telegram'] },
          { file: 'bigolive.jpg', codes: ['bigo', 'bigolive'], names: ['bigolive'] },
          { file: 'google.jpg', codes: ['go', 'google', 'gmail', 'googlevoice'], names: ['google', 'gmail'] },
          { file: 'facebook.jpg', codes: ['fb', 'facebook'], names: ['facebook'] },
          { file: 'akulaku.jpg', codes: ['akulaku'], names: ['akulaku'] },
          { file: 'blibli.jpg', codes: ['blibli'], names: ['blibli'] },
          { file: 'openai.jpg', codes: ['openai', 'chatgpt', 'gpt'], names: ['openai', 'chatgpt'] },
          { file: 'dana.jpg', codes: ['dana'], names: ['dana'] },
          { file: 'claude.jpg', codes: ['claude', 'anthropic'], names: ['claude', 'anthropic'] },
          { file: 'cursor.jpg', codes: ['cursor'], names: ['cursor'] },
          { file: 'discord.jpg', codes: ['dc', 'discord'], names: ['discord'] },
          { file: 'tiktok.jpg', codes: ['tt', 'tiktok'], names: ['tiktok'] },
          { file: 'shopee.jpg', codes: ['sh', 'shopee'], names: ['shopee'] },
          { file: 'snapchat.jpg', codes: ['snap', 'snapchat'], names: ['snapchat'] }
        ];
        const normalizeServiceKey = value => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const resolveServiceLogo = (code, name) => {
          const codeKey = normalizeServiceKey(code);
          const nameKey = normalizeServiceKey(name);
          const matchByName = logoRules.find(rule =>
            rule.names.some(alias => nameKey === alias || nameKey.includes(alias))
          );
          const match = matchByName || logoRules.find(rule => rule.codes.includes(codeKey));
          return match ? `/images/apps/${match.file}` : null;
        };
        const container = $('#app-catalog');
        const services = data.services.filter(item => item && /^[a-z0-9_-]{1,16}$/i.test(String(item.code || '')) && item.name).slice(0, 500);
        container.innerHTML = services.map(item => {
          const code = String(item.code);
          const [glyph, iconClass] = iconMap[code.toLowerCase()] || [code.slice(0, 2).toUpperCase(), 'app-default'];
          const logoPath = resolveServiceLogo(code, item.name);
          const logoMarkup = logoPath
            ? `<span class="app-logo app-logo-image"><img src="${logoPath}" alt="" loading="lazy" decoding="async"></span>`
            : `<span class="app-logo ${iconClass}">${escapeHtml(glyph)}</span>`;
          return `<button class="app-card" data-service="${escapeHtml(code)}" data-name="${escapeHtml(item.name)}" type="button">${logoMarkup}<span class="app-info"><b>${escapeHtml(item.name)}</b><small>${escapeHtml(code)}</small></span><span class="app-price">Pilih <i>→</i></span></button>`;
        }).join('');
        $$('.app-card', container).forEach(button => button.addEventListener('click', () => chooseService(button)));
        const first = $('.app-card', container);
        if (first) chooseService(first);
        else container.innerHTML = '<div class="empty-state"><b>Katalog provider kosong</b><small>Coba muat ulang atau hubungi bantuan.</small></div>';
      } else { $('#app-catalog').innerHTML = '<div class="empty-state"><b>Katalog provider kosong</b><small>Provider tidak mengembalikan layanan.</small></div>'; }
      await updateCatalogPrices();
    } catch (err) { $('#app-catalog').innerHTML = '<div class="empty-state"><b>Katalog gagal dimuat</b><small>Periksa konfigurasi Nokos dan coba kembali.</small></div>'; $('#summary-price').textContent = 'Tidak tersedia'; $('#summary-stock').textContent = 'Tidak tersedia'; $('.auto-value').textContent = 'Tidak tersedia'; console.warn('Catalog:', err.message); }
  }

  async function updateCatalogPrices() {
    
    try {
      const data = await api(`/api/catalog/prices?country=${encodeURIComponent($('#country-select').value)}`);
      state.catalogPrices = data.prices || {};
      $$('.app-card').forEach(card => {
        const quote = state.catalogPrices[card.dataset.service];
        const stock = quote ? Number(quote.stock) : 0;
        const meta = $('.app-info small', card);
        if (meta) meta.textContent = `${card.dataset.service} · ${stock.toLocaleString('id-ID')} stok`;
        let price = $('.app-card-price', card);
        if (!price) {
          price = document.createElement('small');
          price.className = 'app-card-price';
          $('.app-info', card)?.appendChild(price);
        }
        price.textContent = quote && stock > 0 ? money(quote.salePrice) : 'Stok kosong';
        card.classList.toggle('out-of-stock', !quote || stock <= 0);
      });
      const selected = state.catalogPrices[state.selectedService];
      $('#summary-price').textContent = selected && selected.stock > 0 ? money(selected.salePrice) : 'Stok tidak tersedia';
      $('#summary-stock').textContent = selected && selected.stock > 0 ? `${selected.stock.toLocaleString('id-ID')} tersedia` : 'Tidak tersedia';
      $('.auto-value').textContent = selected && selected.stock > 0 ? `${selected.serverName} (${selected.server})` : 'Tidak tersedia';
    } catch (err) { console.warn('Catalog prices:', err.message); }
  }

  async function updateQuote() {
    
    const country = $('#country-select').value;
    try {
      const data = await api(`/api/catalog/quote?service=${encodeURIComponent(state.selectedService)}&country=${encodeURIComponent(country)}`);
      const selected = data.selected;
      $('#summary-price').textContent = selected ? money(selected.salePrice) : 'Stok tidak tersedia';
      $('#summary-stock').textContent = selected ? `${selected.stock.toLocaleString('id-ID')} tersedia` : 'Tidak tersedia';
      $('.auto-value').textContent = selected ? `${selected.serverName} (${selected.server})` : 'Tidak tersedia';
    } catch {
      $('#summary-price').textContent = 'Harga dicek saat order';
      $('#summary-stock').textContent = 'Tidak dapat dimuat';
      $('.auto-value').textContent = 'Otomatis';
    }
  }

  function chooseService(button) {
    $$('.app-card').forEach(card => card.classList.toggle('selected', card === button));
    state.selectedService = button.dataset.service;
    state.selectedServiceName = button.dataset.name;
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
    $('#otp-server').textContent = order.serverName || order.server || 'Otomatis';
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
    if (!state.selectedService) return toast('Pilih layanan dari katalog provider terlebih dahulu.', 'error');
    if (!$('#country-select').value) return toast('Pilih negara dari katalog provider terlebih dahulu.', 'error');
    button.disabled = true;
    button.textContent = 'Memproses...';
    const country = Number($('#country-select').value);
    const operator = $('#operator-select').value;
    try {
        state.pendingIdempotencyKey = state.pendingIdempotencyKey || crypto.randomUUID();
        const idempotencyKey = state.pendingIdempotencyKey;
        const data = await api('/api/orders', { method: 'POST', body: JSON.stringify({ service: state.selectedService, country, operator, idempotencyKey }) });
        state.pendingIdempotencyKey = null;
        const order = { id: data.orderId, providerOrderId: data.providerOrderId, phone: data.phone, price: data.price, server: data.server, serverName: data.server === 's2' ? 'Plus' : 'Ekonomi / Express', serviceName: state.selectedServiceName, status: 'pending', createdAt: new Date().toISOString() };
        renderOrder(order);
        await refreshMe();
        toast('Nomor berhasil dipesan. Menunggu OTP.', 'success');
    } catch (err) {
      if (['PROVIDER_REJECTED', 'OUT_OF_STOCK', 'RESERVE_FAILED'].includes(err.code)) state.pendingIdempotencyKey = null;
      const retryNote = err.code === 'PROVIDER_ERROR' ? ' Retry berikutnya akan memakai kunci idempotensi yang sama untuk mencegah pembelian ganda.' : '';
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

  async function sendSonny(message) {
    const container = $('#chat-messages');
    appendChat('user', message);
    $('#chat-input').value = '';
    const typing = document.createElement('div');
    typing.className = 'chat-message bot typing-message';
    typing.innerHTML = '<div class="message-avatar">S</div><div class="message-bubble">Sonny sedang mengetik...</div>';
    container.appendChild(typing);
    container.scrollTop = container.scrollHeight;
    try {
      const data = await api('/api/sonny', { method: 'POST', body: JSON.stringify({ message }) });
      typing.remove();
      appendChat('bot', data.reply);
    } catch (err) { typing.remove(); appendChat('bot', err.message); }
  }

  function appendChat(role, message) {
    const row = document.createElement('div');
    row.className = `chat-message ${role}`;
    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.textContent = role === 'bot' ? 'S' : (state.user?.name?.[0] || 'U').toUpperCase();
    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';
    const paragraph = document.createElement('p');
    paragraph.textContent = message;
    bubble.appendChild(paragraph);
    row.append(avatar, bubble);
    const container = $('#chat-messages');
    container.appendChild(row);
    container.scrollTop = container.scrollHeight;
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

  async function logout() {
    try { await api('/api/auth/logout', { method: 'POST', body: '{}' }); }
    catch (err) { toast(err.message, 'error'); }
    state.user = null; state.currentOrder = null;
    $('#app-shell').classList.add('hidden');
    $('#auth-screen').classList.remove('hidden');
    setAuthTab('login');
    toast('Anda telah keluar.');
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

  // Event wiring
  $$('.auth-tab').forEach(button => button.addEventListener('click', () => setAuthTab(button.dataset.authTab)));
  $('#login-form').addEventListener('submit', loginSubmit);
  $('#register-form').addEventListener('submit', registerSubmit);
  $('#google-login').addEventListener('click', async () => {
    try { const data = await api('/api/auth/google'); window.location.assign(data.url); }
    catch (err) { toast(err.message, 'error'); }
  });
  $('#forgot-password').addEventListener('click', resetPassword);
  $('#account-forgot-password').addEventListener('click', resetPassword);
  $$('.nav-item,[data-navigate]').forEach(button => button.addEventListener('click', () => navigate(button.dataset.navigate)));
  $('#logout-btn').addEventListener('click', logout);
  $('#menu-toggle').addEventListener('click', () => { $('#sidebar').classList.add('open'); $('#mobile-scrim').classList.add('show'); });
  $('#sidebar-close').addEventListener('click', () => { $('#sidebar').classList.remove('open'); $('#mobile-scrim').classList.remove('show'); });
  $('#mobile-scrim').addEventListener('click', () => { $('#sidebar').classList.remove('open'); $('#mobile-scrim').classList.remove('show'); });
  $$('.app-card').forEach(button => button.addEventListener('click', () => chooseService(button)));
  $('#service-search').addEventListener('input', event => {
    const value = event.target.value.toLowerCase();
    $$('.app-card').forEach(card => card.classList.toggle('hidden', !card.dataset.name.toLowerCase().includes(value)));
  });
  $('#country-select').addEventListener('change', () => { const text = $('#country-select').selectedOptions[0]?.textContent || '—'; $('#summary-country').textContent = text; updateQuote(); updateCatalogPrices(); });
  $('#operator-select').addEventListener('change', () => { $('#summary-operator').textContent = $('#operator-select').selectedOptions[0].textContent; });
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
  $('#refresh-history').addEventListener('click', refreshHistory);
  $('#chat-form').addEventListener('submit', event => { event.preventDefault(); const message = $('#chat-input').value.trim(); if (message) sendSonny(message); });
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
      $$('.auth-tabs').forEach(item => item.classList.remove('hidden'));
      $('#auth-title').textContent = 'Password berhasil diubah';
      $('#auth-subtitle').textContent = 'Silakan login menggunakan password baru Anda.';
      history.replaceState({}, '', '/index.html');
    } catch (err) { toast(err.message, 'error'); }
    finally { button.disabled = false; }
  }
  $('#reset-password-form').addEventListener('submit', updatePasswordSubmit);

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
      $('.auth-tabs').classList.add('hidden');
      $('#auth-title').textContent = 'Buat password baru';
      $('#auth-subtitle').textContent = 'Masukkan password baru untuk akun DEWA OTP Anda.';
      return;
    }
    const restored = await tryRestoreSession();
    if (!restored) setAuthTab('login');
  })();
})();
