<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import { useRouter } from '../router.js';
import { t } from '../locales.js';

const router = useRouter();

const stats = ref({
  active_count: 0,
  domain: 'skyhook.7u.pl',
  quic_port: 4443,
  status: 'online',
});
const isLoading = ref(true);

let pollTimer = null;

async function fetchTelemetry() {
  try {
    const res = await fetch('/api/tunnels');
    if (!res.ok) throw new Error('API offline');
    const data = await res.json();
    stats.value = {
      active_count: data.active_count || 0,
      domain: data.domain || 'skyhook.7u.pl',
      quic_port: data.quic_port || 4443,
      status: data.status || 'online',
    };
  } catch {
    // If backend is not running or dev mode without proxy
  } finally {
    isLoading.value = false;
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

onMounted(() => {
  isPolling = true;
  pollTelemetry();
});

onUnmounted(() => {
  isPolling = false;
  if (pollTimer) clearTimeout(pollTimer);
});
</script>

<template>
  <section id="dashboard" class="section-container">
    <div class="section-header">
      <div class="header-badge">{{ t('dashboard.badge') }}</div>
      <h2 class="section-title">{{ t('dashboard.title') }}</h2>
      <p class="section-desc">
        {{ t('dashboard.desc') }}
      </p>
    </div>

    <!-- Gateway Stats Cards Grid -->
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
        <span class="stat-sub">{{ stats.active_count === 1 ? t('dashboard.stats.sessionSingle') : t('dashboard.stats.sessionPlural') }}</span>
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

    <!-- Active Sessions Box (Protected State or Empty State) -->
    <div class="tunnels-list-box glass-panel">
      <div class="box-header">
        <span class="box-title">{{ t('dashboard.table.title') }}</span>
        <button class="refresh-btn" @click="fetchTelemetry">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="23 4 23 10 17 10"></polyline>
            <polyline points="1 20 1 14 7 14"></polyline>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
          </svg>
          <span>{{ t('dashboard.table.refresh') }}</span>
        </button>
      </div>

      <!-- State A: Active Tunnels are Connected -> Safe Secure State -->
      <div v-if="stats.active_count > 0" class="secure-state">
        <div class="secure-icon-box">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
          </svg>
        </div>
        <h3 class="secure-title">
          {{ stats.active_count }} {{ stats.active_count === 1 ? t('dashboard.secure.titleSingle') : t('dashboard.secure.titlePlural') }}
        </h3>
        <p class="secure-desc">{{ t('dashboard.secure.desc') }}</p>
        <button type="button" class="admin-portal-cta" @click="router.push('/admin')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
          </svg>
          <span>{{ t('dashboard.secure.manageBtn') }}</span>
        </button>
      </div>

      <!-- State B: No Active Tunnels -> Empty state instructions -->
      <div v-else class="empty-state">
        <div class="empty-icon-box">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="2" y="2" width="20" height="8" rx="2" ry="2"></rect>
            <rect x="2" y="14" width="20" height="8" rx="2" ry="2"></rect>
            <line x1="6" y1="6" x2="6.01" y2="6"></line>
            <line x1="6" y1="18" x2="6.01" y2="18"></line>
          </svg>
        </div>
        <h3>{{ t('dashboard.empty.title') }}</h3>
        <p>{{ t('dashboard.empty.desc') }}</p>
        <code>npx @gkucmierz/skyhook 34200 --name test</code>
      </div>
    </div>
  </section>
</template>

<style scoped>
.section-container {
  max-width: 1100px;
  margin: 0 auto;
  padding: 40px 24px 80px;
}

.section-header {
  text-align: center;
  margin-bottom: 36px;
}

.header-badge {
  display: inline-block;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 1px;
  color: #38bdf8;
  background: rgba(56, 189, 248, 0.1);
  padding: 3px 10px;
  border-radius: var(--radius-pill);
  margin-bottom: 8px;
}

.section-title {
  font-size: 32px;
  font-weight: 800;
  color: #fff;
  letter-spacing: -0.5px;
}

.section-desc {
  color: var(--text-secondary);
  font-size: 16px;
  margin-top: 8px;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 16px;
  margin-bottom: 32px;
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

.tunnels-list-box {
  padding: 24px;
}

.box-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.box-title {
  font-size: 16px;
  font-weight: 700;
  color: #fff;
}

.refresh-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid var(--border-subtle);
  color: var(--text-secondary);
  padding: 5px 12px;
  border-radius: var(--radius-pill);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}

.refresh-btn:hover {
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
}

.table-wrapper {
  overflow-x: auto;
}

.tunnels-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.tunnels-table th {
  text-align: left;
  padding: 10px 14px;
  color: var(--text-muted);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  border-bottom: 1px solid var(--border-subtle);
}

.tunnels-table td {
  padding: 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
}

.col-subdomain {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #fff;
}

.live-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #22c55e;
  box-shadow: 0 0 8px #22c55e;
}

.url-link {
  color: #38bdf8;
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-family: var(--font-mono);
  font-size: 12px;
}

.url-link:hover {
  text-decoration: underline;
}

.transport-tag {
  display: inline-block;
  padding: 3px 8px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
}

.transport-tag.quic {
  background: rgba(168, 85, 247, 0.15);
  color: #c084fc;
  border: 1px solid rgba(168, 85, 247, 0.3);
}

.transport-tag.ws {
  background: rgba(56, 189, 248, 0.15);
  color: #38bdf8;
  border: 1px solid rgba(56, 189, 248, 0.3);
}

.col-num {
  font-family: var(--font-mono);
  color: var(--text-secondary);
}

.col-time {
  color: var(--text-muted);
}

.empty-state {
  text-align: center;
  padding: 50px 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.empty-icon-box {
  width: 70px;
  height: 70px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.03);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  margin-bottom: 6px;
}

.empty-state h3 {
  font-size: 18px;
  color: #fff;
}

.empty-state p {
  color: var(--text-secondary);
  font-size: 14px;
}

.empty-state code {
  background: #090d16;
  border: 1px solid var(--border-subtle);
  color: #38bdf8;
  padding: 8px 18px;
  border-radius: var(--radius-pill);
  font-family: var(--font-mono);
  font-size: 13px;
  margin-top: 4px;
}

.secure-state {
  text-align: center;
  padding: 46px 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.secure-icon-box {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: rgba(56, 189, 248, 0.1);
  color: var(--accent-cyan);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 4px;
}

.secure-title {
  font-size: 18px;
  font-weight: 800;
  color: #fff;
}

.secure-desc {
  font-size: 14px;
  color: var(--text-secondary);
  max-width: 480px;
  line-height: 1.5;
}

.admin-portal-cta {
  margin-top: 8px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 22px;
  background: linear-gradient(135deg, rgba(56, 189, 248, 0.2), rgba(168, 85, 247, 0.2));
  border: 1px solid rgba(56, 189, 248, 0.4);
  border-radius: var(--radius-pill);
  color: #fff;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s ease;
}

.admin-portal-cta:hover {
  background: linear-gradient(135deg, rgba(56, 189, 248, 0.35), rgba(168, 85, 247, 0.35));
  border-color: var(--accent-cyan);
  transform: translateY(-1px);
}
</style>
