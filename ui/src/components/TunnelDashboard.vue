<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import { t } from '../locales.js';

const tunnels = ref([]);
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
    tunnels.value = data.tunnels || [];
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

onMounted(() => {
  fetchTelemetry();
  pollTimer = setInterval(fetchTelemetry, 3000);
});

onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer);
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

    <!-- Active Tunnels Table / Empty state -->
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

      <div v-if="tunnels.length > 0" class="table-wrapper">
        <table class="tunnels-table">
          <thead>
            <tr>
              <th>{{ t('dashboard.table.subdomain') }}</th>
              <th>{{ t('dashboard.table.publicUrl') }}</th>
              <th>{{ t('dashboard.table.transport') }}</th>
              <th>{{ t('dashboard.table.requests') }}</th>
              <th>{{ t('dashboard.table.transfer') }}</th>
              <th>{{ t('dashboard.table.sessionTime') }}</th>
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
              <td>
                <span class="transport-tag" :class="tTunnel.transport?.includes('QUIC') ? 'quic' : 'ws'">
                  {{ tTunnel.transport || 'WebSocket' }}
                </span>
              </td>
              <td class="col-num">{{ tTunnel.total_requests || 0 }} req</td>
              <td class="col-num">{{ formatBytes(tTunnel.total_bytes) }}</td>
              <td class="col-time">{{ formatDuration(tTunnel.connected_at) }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Empty State -->
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
</style>
