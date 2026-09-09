<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import { useRouter } from '../router.js';
import { t } from '../locales.js';
import pkg from '../../package.json';

const router = useRouter();

const isAuthenticated = ref(false);
const adminToken = ref(typeof localStorage !== 'undefined' ? localStorage.getItem('skyhook_admin_token') : null);

// Login state
const passwordInput = ref('');
const showPassword = ref(false);
const isLoggingIn = ref(false);
const loginError = ref('');

// Telemetry state
const tunnels = ref([]);
const stats = ref({
  active_count: 0,
  domain: 'skyhook.7u.pl',
  quic_port: 4443,
  status: 'online',
  version: pkg.version,
});
const isLoadingTelemetry = ref(false);
let pollTimer = null;

// Kill confirmation modal state
const killTarget = ref(null);
const isKilling = ref(false);
const toastMessage = ref('');
let toastTimer = null;

function getAuthHeaders() {
  const token = localStorage.getItem('skyhook_admin_token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
  };
}

function showToast(msg) {
  toastMessage.value = msg;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastMessage.value = '';
  }, 4000);
}

async function handleLogin() {
  if (!passwordInput.value) {
    loginError.value = t('errors.errInvalidPassword');
    return;
  }

  isLoggingIn.value = true;
  loginError.value = '';

  try {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: passwordInput.value }),
    });

    const data = await res.json();
    if (res.ok && data.success) {
      adminToken.value = data.token;
      localStorage.setItem('skyhook_admin_token', data.token);
      isAuthenticated.value = true;
      passwordInput.value = '';
      await fetchTelemetry();
      startPolling();
    } else {
      const errKey = data.error || 'errInvalidPassword';
      loginError.value = t(`errors.${errKey}`);
    }
  } catch {
    loginError.value = t('errors.errNetworkError');
  } finally {
    isLoggingIn.value = false;
  }
}

async function handleLogout() {
  try {
    await fetch('/api/admin/logout', { method: 'POST' });
  } catch {
    // Ignore network failure on logout
  }
  adminToken.value = null;
  localStorage.removeItem('skyhook_admin_token');
  isAuthenticated.value = false;
  tunnels.value = [];
  stopPolling();
}

async function fetchTelemetry() {
  try {
    const res = await fetch('/api/admin/tunnels', {
      headers: getAuthHeaders(),
    });

    if (res.status === 401) {
      handleLogout();
      return;
    }

    if (!res.ok) throw new Error('API offline');

    const data = await res.json();
    tunnels.value = data.tunnels || [];
    stats.value = {
      active_count: data.active_count || 0,
      domain: data.domain || 'skyhook.7u.pl',
      quic_port: data.quic_port || 4443,
      status: data.status || 'online',
      version: data.version || pkg.version,
    };
  } catch {
    // Graceful telemetry retry
  }
}

let isPolling = false;

async function pollTelemetry() {
  if (!isPolling) return;
  await fetchTelemetry();
  if (isPolling) {
    pollTimer = setTimeout(pollTelemetry, 3000);
  }
}

function startPolling() {
  stopPolling();
  isPolling = true;
  pollTelemetry();
}

function stopPolling() {
  isPolling = false;
  if (pollTimer) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
}

function openKillModal(subdomain) {
  killTarget.value = subdomain;
}

function closeKillModal() {
  if (!isKilling.value) {
    killTarget.value = null;
  }
}

async function confirmKill() {
  if (!killTarget.value) return;

  isKilling.value = true;
  const subdomain = killTarget.value;

  try {
    const res = await fetch('/api/admin/tunnels/kill', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ subdomain }),
    });

    const data = await res.json();
    if (res.ok && data.success) {
      closeKillModal();
      showToast(`${t('admin.toast.killSuccess')} (${subdomain})`);
      await fetchTelemetry();
    } else {
      const errKey = data.error || 'errTunnelNotFound';
      showToast(t(`errors.${errKey}`));
    }
  } catch {
    showToast(t('errors.errNetworkError'));
  } finally {
    isKilling.value = false;
  }
}

function handleKeyDown(e) {
  if (e.key === 'Escape') {
    e.stopPropagation();
    closeKillModal();
  }
}

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatDuration(dateStr) {
  if (!dateStr) return t('dashboard.time.justNow');
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  return `${Math.floor(diff / 3600)}h`;
}

onMounted(async () => {
  window.addEventListener('keydown', handleKeyDown);
  if (adminToken.value) {
    isAuthenticated.value = true;
    await fetchTelemetry();
    startPolling();
  }
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown);
  stopPolling();
  if (toastTimer) clearTimeout(toastTimer);
});
</script>

<template>
  <div class="admin-view-container">
    <!-- Toast Notification -->
    <transition name="toast-fade">
      <div v-if="toastMessage" class="toast-popup glass-panel">
        <span class="toast-dot"></span>
        <span class="toast-text">{{ toastMessage }}</span>
      </div>
    </transition>

    <!-- State 1: Unauthenticated Login Card -->
    <div v-if="!isAuthenticated" class="login-wrapper">
      <div class="login-card glass-panel">
        <div class="login-header">
          <div class="login-icon-box">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
            </svg>
          </div>
          <h2 class="login-title">{{ t('admin.loginTitle') }}</h2>
          <p class="login-subtitle">{{ t('admin.loginSubtitle') }}</p>
        </div>

        <form @submit.prevent="handleLogin" class="login-form">
          <div class="form-group">
            <label for="admin-password" class="input-label">{{ t('admin.passwordLabel') }}</label>
            <div class="input-wrapper">
              <input
                id="admin-password"
                :type="showPassword ? 'text' : 'password'"
                v-model="passwordInput"
                :placeholder="t('admin.passwordPlaceholder')"
                class="login-input"
                autofocus
                autocomplete="current-password"
              />
              <button
                type="button"
                class="pwd-toggle-btn"
                @click="showPassword = !showPassword"
                :aria-label="showPassword ? 'Hide password' : 'Show password'"
              >
                <svg v-if="!showPassword" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                  <circle cx="12" cy="12" r="3"></circle>
                </svg>
                <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                  <line x1="1" y1="1" x2="23" y2="23"></line>
                </svg>
              </button>
            </div>
          </div>

          <div v-if="loginError" class="login-error-box">
            {{ loginError }}
          </div>

          <button type="submit" class="submit-btn" :disabled="isLoggingIn">
            <span v-if="isLoggingIn">{{ t('admin.loggingIn') }}</span>
            <span v-else>{{ t('admin.loginBtn') }}</span>
          </button>
        </form>

        <div class="login-footer">
          <button type="button" class="back-link" @click="router.push('/')">
            ← {{ t('admin.backToHome') }}
          </button>
        </div>
      </div>
    </div>

    <!-- State 2: Authenticated Admin Dashboard -->
    <div v-else class="admin-dashboard-wrapper">
      <!-- Admin Top Bar -->
      <div class="admin-toolbar glass-panel">
        <div class="toolbar-left">
          <div class="admin-badge">
            <span class="live-dot"></span>
            {{ t('admin.badge') }}
          </div>
          <span class="version-tag">v{{ stats.version }}</span>
        </div>

        <div class="toolbar-right">
          <button type="button" class="toolbar-btn" @click="router.push('/')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
              <polyline points="9 22 9 12 15 12 15 22"></polyline>
            </svg>
            <span>{{ t('admin.backToHome') }}</span>
          </button>

          <button type="button" class="toolbar-btn logout-btn" @click="handleLogout">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
              <polyline points="16 17 21 12 16 7"></polyline>
              <line x1="21" y1="12" x2="9" y2="12"></line>
            </svg>
            <span>{{ t('admin.logoutBtn') }}</span>
          </button>
        </div>
      </div>

      <!-- Stats Grid -->
      <div class="stats-grid">
        <div class="stat-card glass-panel">
          <span class="stat-label">{{ t('dashboard.stats.edgeNode') }}</span>
          <span class="stat-val highlight-cyan">DE Contabo</span>
          <span class="stat-sub">{{ t('dashboard.stats.edgeLocation') }}</span>
        </div>

        <div class="stat-card glass-panel">
          <span class="stat-label">{{ t('dashboard.stats.activeTunnels') }}</span>
          <span class="stat-val" :class="stats.active_count > 0 ? 'highlight-green' : ''">
            {{ stats.active_count }}
          </span>
          <span class="stat-sub">
            {{ stats.active_count === 1 ? t('dashboard.stats.sessionSingle') : t('dashboard.stats.sessionPlural') }}
          </span>
        </div>

        <div class="stat-card glass-panel">
          <span class="stat-label">{{ t('dashboard.stats.protocols') }}</span>
          <span class="stat-val highlight-purple">QUIC + WSS</span>
          <span class="stat-sub">UDP :{{ stats.quic_port }} + TCP :443</span>
        </div>

        <div class="stat-card glass-panel">
          <span class="stat-label">{{ t('dashboard.stats.sslCert') }}</span>
          <span class="stat-val highlight-green">Wildcard Let's Encrypt</span>
          <span class="stat-sub">*.skyhook.7u.pl (HSTS & TLS 1.3)</span>
        </div>
      </div>

      <!-- Active Tunnels Table -->
      <div class="tunnels-box glass-panel">
        <div class="box-header">
          <div class="box-title-group">
            <h3 class="box-title">{{ t('admin.table.title') }}</h3>
            <span class="count-pill">{{ tunnels.length }}</span>
          </div>
          <button class="refresh-btn" @click="fetchTelemetry">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="23 4 23 10 17 10"></polyline>
              <polyline points="1 20 1 14 7 14"></polyline>
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
            </svg>
            <span>{{ t('admin.table.refresh') }}</span>
          </button>
        </div>

        <div v-if="tunnels.length > 0" class="table-wrapper">
          <table class="tunnels-table">
            <thead>
              <tr>
                <th>{{ t('admin.table.subdomain') }}</th>
                <th>{{ t('admin.table.publicUrl') }}</th>
                <th>{{ t('admin.table.clientIp') }}</th>
                <th>{{ t('admin.table.transport') }}</th>
                <th>{{ t('admin.table.requests') }}</th>
                <th>{{ t('admin.table.transfer') }}</th>
                <th>{{ t('admin.table.sessionTime') }}</th>
                <th class="col-action">{{ t('admin.table.actions') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="tTunnel in tunnels" :key="tTunnel.subdomain">
                <td class="col-subdomain">
                  <span class="live-dot"></span>
                  <strong>{{ tTunnel.subdomain }}</strong>
                </td>
                <td class="col-url">
                  <a :href="tTunnel.public_url" target="_blank" rel="noopener noreferrer" class="url-link">
                    {{ tTunnel.public_url }}
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                      <polyline points="15 3 21 3 21 9"></polyline>
                      <line x1="10" y1="14" x2="21" y2="3"></line>
                    </svg>
                  </a>
                </td>
                <td class="col-ip">
                  <code class="ip-code">{{ tTunnel.client_ip || '—' }}</code>
                </td>
                <td>
                  <span class="transport-tag" :class="tTunnel.transport?.includes('QUIC') ? 'quic' : 'ws'">
                    {{ tTunnel.transport || 'WebSocket' }}
                  </span>
                </td>
                <td class="col-num">{{ tTunnel.total_requests || 0 }} req</td>
                <td class="col-num">{{ formatBytes(tTunnel.total_bytes) }}</td>
                <td class="col-time">{{ formatDuration(tTunnel.connected_at) }}</td>
                <td class="col-action">
                  <button
                    type="button"
                    class="kill-btn"
                    @click="openKillModal(tTunnel.subdomain)"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <line x1="18" y1="6" x2="6" y2="18"></line>
                      <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                    <span>{{ t('admin.table.kill') }}</span>
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Empty State -->
        <div v-else class="empty-state">
          <div class="empty-icon-box">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <rect x="2" y="2" width="20" height="8" rx="2" ry="2"></rect>
              <rect x="2" y="14" width="20" height="8" rx="2" ry="2"></rect>
              <line x1="6" y1="6" x2="6.01" y2="6"></line>
              <line x1="6" y1="18" x2="6.01" y2="18"></line>
            </svg>
          </div>
          <h3>{{ t('admin.empty.title') }}</h3>
          <p>{{ t('admin.empty.desc') }}</p>
        </div>
      </div>
    </div>

    <!-- Kill Confirmation Modal (ESC Dismissal Supported) -->
    <transition name="modal-fade">
      <div v-if="killTarget" class="modal-overlay" @click.self="closeKillModal">
        <div class="modal-card glass-panel" role="dialog" aria-modal="true">
          <div class="modal-header">
            <div class="modal-icon-box danger">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="15" y1="9" x2="9" y2="15"></line>
                <line x1="9" y1="9" x2="15" y2="15"></line>
              </svg>
            </div>
            <h3 class="modal-title">{{ t('admin.modal.title') }}</h3>
            <button type="button" class="modal-close-btn" @click="closeKillModal" aria-label="Close modal">✕</button>
          </div>

          <div class="modal-body">
            <p class="modal-desc">
              {{ t('admin.modal.desc') }} <code class="highlight-target">{{ killTarget }}</code>?
            </p>
            <p class="modal-warning">
              ⚠️ {{ t('admin.modal.warning') }}
            </p>
          </div>

          <div class="modal-footer">
            <button type="button" class="btn-cancel" @click="closeKillModal" :disabled="isKilling">
              {{ t('admin.modal.cancel') }}
            </button>
            <button type="button" class="btn-confirm-kill" @click="confirmKill" :disabled="isKilling">
              <span v-if="isKilling">{{ t('admin.table.kill') }}...</span>
              <span v-else>{{ t('admin.modal.confirm') }}</span>
            </button>
          </div>
        </div>
      </div>
    </transition>
  </div>
</template>

<style scoped>
.admin-view-container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 32px 24px 80px;
  min-height: calc(100vh - 160px);
}

/* Toast Notification */
.toast-popup {
  position: fixed;
  top: 80px;
  right: 24px;
  z-index: 1000;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 18px;
  background: rgba(18, 24, 38, 0.95);
  border: 1px solid var(--accent-cyan);
  border-radius: var(--radius-sm);
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);
}

.toast-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--accent-cyan);
}

.toast-text {
  font-size: 13px;
  font-weight: 600;
  color: #fff;
}

.toast-fade-enter-active,
.toast-fade-leave-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}

.toast-fade-enter-from,
.toast-fade-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

/* Login Card */
.login-wrapper {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 60px 0;
}

.login-card {
  width: 100%;
  max-width: 440px;
  padding: 36px;
  border-radius: var(--radius-lg);
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.login-header {
  text-align: center;
}

.login-icon-box {
  width: 52px;
  height: 52px;
  margin: 0 auto 16px;
  border-radius: 50%;
  background: rgba(56, 189, 248, 0.1);
  color: var(--accent-cyan);
  display: flex;
  align-items: center;
  justify-content: center;
}

.login-title {
  font-size: 22px;
  font-weight: 800;
  color: #fff;
  letter-spacing: -0.5px;
}

.login-subtitle {
  font-size: 13px;
  color: var(--text-secondary);
  margin-top: 6px;
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.input-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.login-input {
  width: 100%;
  padding: 12px 42px 12px 14px;
  background: rgba(12, 16, 26, 0.8);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  color: #fff;
  font-size: 14px;
  transition: border-color 0.2s ease;
}

.login-input:focus {
  border-color: var(--accent-cyan);
}

.pwd-toggle-btn {
  position: absolute;
  right: 12px;
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  padding: 4px;
}

.pwd-toggle-btn:hover {
  color: #fff;
}

.login-error-box {
  padding: 10px 14px;
  background: rgba(239, 68, 68, 0.15);
  border: 1px solid rgba(239, 68, 68, 0.4);
  border-radius: var(--radius-sm);
  color: #fca5a5;
  font-size: 12px;
  font-weight: 600;
}

.submit-btn {
  padding: 12px;
  background: linear-gradient(135deg, var(--accent-cyan), var(--accent-purple));
  border: none;
  border-radius: var(--radius-sm);
  color: #fff;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.submit-btn:hover:not(:disabled) {
  opacity: 0.95;
  transform: translateY(-1px);
}

.submit-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.login-footer {
  text-align: center;
  border-top: 1px solid var(--border-subtle);
  padding-top: 16px;
}

.back-link {
  background: none;
  border: none;
  color: var(--text-secondary);
  font-size: 13px;
  cursor: pointer;
}

.back-link:hover {
  color: var(--accent-cyan);
}

/* Admin Dashboard Toolbar */
.admin-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 20px;
  margin-bottom: 24px;
  border-radius: var(--radius-md);
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.admin-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 1px;
  color: #38bdf8;
  background: rgba(56, 189, 248, 0.12);
  padding: 4px 10px;
  border-radius: var(--radius-pill);
}

.version-tag {
  font-size: 11px;
  font-family: var(--font-mono);
  color: var(--text-muted);
  background: rgba(255, 255, 255, 0.05);
  padding: 3px 8px;
  border-radius: 6px;
}

.toolbar-right {
  display: flex;
  align-items: center;
  gap: 10px;
}

.toolbar-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 12px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.toolbar-btn:hover {
  color: #fff;
  border-color: rgba(255, 255, 255, 0.2);
  background: rgba(255, 255, 255, 0.08);
}

.logout-btn:hover {
  color: #ef4444;
  border-color: rgba(239, 68, 68, 0.3);
  background: rgba(239, 68, 68, 0.08);
}

/* Stats Cards */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 16px;
  margin-bottom: 24px;
}

.stat-card {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.stat-label {
  font-size: 12px;
  color: var(--text-muted);
  text-transform: uppercase;
  font-weight: 600;
  letter-spacing: 0.5px;
}

.stat-val {
  font-size: 20px;
  font-weight: 800;
  color: #fff;
}

.stat-sub {
  font-size: 12px;
  color: var(--text-secondary);
}

.highlight-cyan { color: #38bdf8; }
.highlight-green { color: #4ade80; }
.highlight-purple { color: #c084fc; }

/* Tunnels Box */
.tunnels-box {
  padding: 24px;
}

.box-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 18px;
}

.box-title-group {
  display: flex;
  align-items: center;
  gap: 10px;
}

.box-title {
  font-size: 16px;
  font-weight: 700;
  color: #fff;
}

.count-pill {
  font-size: 11px;
  font-weight: 700;
  padding: 2px 8px;
  background: rgba(56, 189, 248, 0.15);
  color: var(--accent-cyan);
  border-radius: var(--radius-pill);
}

.refresh-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.refresh-btn:hover {
  color: #fff;
  border-color: rgba(255, 255, 255, 0.18);
  background: rgba(255, 255, 255, 0.08);
}

/* Table */
.table-wrapper {
  overflow-x: auto;
}

.tunnels-table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
}

.tunnels-table th {
  padding: 10px 14px;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-muted);
  border-bottom: 1px solid var(--border-subtle);
}

.tunnels-table td {
  padding: 14px;
  font-size: 13px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  vertical-align: middle;
}

.col-subdomain {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #fff;
  font-family: var(--font-mono);
}

.live-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #22c55e;
  box-shadow: 0 0 8px rgba(34, 197, 94, 0.6);
}

.col-url .url-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--accent-cyan);
  text-decoration: none;
  font-family: var(--font-mono);
  font-size: 12px;
}

.col-url .url-link:hover {
  text-decoration: underline;
}

.ip-code {
  font-size: 12px;
  color: var(--text-secondary);
  background: rgba(255, 255, 255, 0.04);
  padding: 2px 6px;
  border-radius: 4px;
}

.transport-tag {
  display: inline-block;
  padding: 3px 8px;
  font-size: 11px;
  font-weight: 700;
  border-radius: 6px;
}

.transport-tag.quic {
  background: rgba(168, 85, 247, 0.15);
  color: var(--accent-purple);
  border: 1px solid rgba(168, 85, 247, 0.3);
}

.transport-tag.ws {
  background: rgba(56, 189, 248, 0.15);
  color: var(--accent-cyan);
  border: 1px solid rgba(56, 189, 248, 0.3);
}

.col-num {
  font-family: var(--font-mono);
  color: var(--text-secondary);
}

.col-time {
  color: var(--text-muted);
  font-size: 12px;
}

.col-action {
  text-align: right;
}

.kill-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 5px 10px;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.25);
  border-radius: var(--radius-sm);
  color: #ef4444;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s ease;
}

.kill-btn:hover {
  background: rgba(239, 68, 68, 0.2);
  border-color: rgba(239, 68, 68, 0.5);
  transform: translateY(-1px);
}

/* Empty State */
.empty-state {
  text-align: center;
  padding: 48px 24px;
}

.empty-icon-box {
  width: 56px;
  height: 56px;
  margin: 0 auto 16px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.04);
  color: var(--text-muted);
  display: flex;
  align-items: center;
  justify-content: center;
}

.empty-state h3 {
  font-size: 16px;
  color: #fff;
  margin-bottom: 6px;
}

.empty-state p {
  font-size: 13px;
  color: var(--text-secondary);
}

/* Modal Overlay & Card */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.75);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.modal-card {
  width: 100%;
  max-width: 460px;
  padding: 28px;
  border-radius: var(--radius-lg);
  border-color: rgba(239, 68, 68, 0.3);
  display: flex;
  flex-direction: column;
  gap: 20px;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.6);
}

.modal-header {
  display: flex;
  align-items: center;
  gap: 12px;
}

.modal-icon-box.danger {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.modal-title {
  font-size: 18px;
  font-weight: 800;
  color: #fff;
  flex: 1;
}

.modal-close-btn {
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: 16px;
  cursor: pointer;
  padding: 4px;
}

.modal-close-btn:hover {
  color: #fff;
}

.modal-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.modal-desc {
  font-size: 14px;
  color: var(--text-primary);
  line-height: 1.5;
}

.highlight-target {
  color: #ef4444;
  background: rgba(239, 68, 68, 0.1);
  padding: 2px 6px;
  border-radius: 4px;
  font-family: var(--font-mono);
  font-weight: 700;
}

.modal-warning {
  font-size: 12px;
  color: #fca5a5;
  background: rgba(239, 68, 68, 0.08);
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  border: 1px solid rgba(239, 68, 68, 0.2);
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding-top: 10px;
}

.btn-cancel {
  padding: 9px 16px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-cancel:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.btn-confirm-kill {
  padding: 9px 18px;
  background: #ef4444;
  border: none;
  border-radius: var(--radius-sm);
  color: #fff;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-confirm-kill:hover:not(:disabled) {
  background: #dc2626;
  transform: translateY(-1px);
}

.btn-confirm-kill:disabled,
.btn-cancel:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.2s ease;
}

.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}
</style>
