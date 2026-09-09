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
  telemetry: null,
});
const isLoading = ref(true);

let pollTimer = null;

function getMaxTunnels() {
  if (!stats.value.telemetry?.daily_history) return 1;
  const max = Math.max(...stats.value.telemetry.daily_history.map(d => d.tunnels), 1);
  return max;
}

function getBarHeight(count) {
  const max = getMaxTunnels();
  if (count === 0) return '6px';
  const pct = Math.max(Math.round((count / max) * 100), 12);
  return `${pct}%`;
}

function formatBarDate(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  return parts.length === 3 ? `${parts[1]}/${parts[2]}` : dateStr;
}

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
      telemetry: data.telemetry || null,
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

    <!-- Persistent Telemetry & Activity Section -->
    <div v-if="stats.telemetry" class="telemetry-box glass-panel">
      <div class="telemetry-header">
        <span class="box-title">{{ t('dashboard.telemetry.sectionTitle') }}</span>
        <span class="telemetry-sub">{{ t('dashboard.telemetry.sectionDesc') }}</span>
      </div>

      <!-- Telemetry Cards Grid -->
      <div class="telemetry-grid">
        <div class="telemetry-card">
          <span class="telemetry-card-label">{{ t('dashboard.telemetry.last24h') }}</span>
          <div class="telemetry-card-val highlight-cyan">
            {{ stats.telemetry.last_24h.tunnels }} <span class="telemetry-unit">{{ t('dashboard.telemetry.tunnels') }}</span>
          </div>
          <span class="telemetry-card-sub">{{ stats.telemetry.last_24h.requests }} {{ t('dashboard.telemetry.requests') }}</span>
        </div>

        <div class="telemetry-card">
          <span class="telemetry-card-label">{{ t('dashboard.telemetry.last7d') }}</span>
          <div class="telemetry-card-val highlight-green">
            {{ stats.telemetry.last_7d.tunnels }} <span class="telemetry-unit">{{ t('dashboard.telemetry.tunnels') }}</span>
          </div>
          <span class="telemetry-card-sub">{{ stats.telemetry.last_7d.requests }} {{ t('dashboard.telemetry.requests') }}</span>
        </div>

        <div class="telemetry-card">
          <span class="telemetry-card-label">{{ t('dashboard.telemetry.last30d') }}</span>
          <div class="telemetry-card-val highlight-purple">
            {{ stats.telemetry.last_30d.tunnels }} <span class="telemetry-unit">{{ t('dashboard.telemetry.tunnels') }}</span>
          </div>
          <span class="telemetry-card-sub">{{ stats.telemetry.last_30d.requests }} {{ t('dashboard.telemetry.requests') }}</span>
        </div>

        <div class="telemetry-card">
          <span class="telemetry-card-label">{{ t('dashboard.telemetry.allTime') }}</span>
          <div class="telemetry-card-val highlight-amber">
            {{ stats.telemetry.all_time.tunnels }} <span class="telemetry-unit">{{ t('dashboard.telemetry.tunnels') }}</span>
          </div>
          <span class="telemetry-card-sub">{{ stats.telemetry.all_time.requests }} {{ t('dashboard.telemetry.requests') }}</span>
        </div>
      </div>

      <!-- Activity Sparkline / Bars -->
      <div v-if="stats.telemetry.daily_history && stats.telemetry.daily_history.length > 0" class="activity-section">
        <span class="activity-title">{{ t('dashboard.telemetry.activity') }}</span>
        <div class="activity-bars">
          <div
            v-for="day in stats.telemetry.daily_history"
            :key="day.date"
            class="activity-bar-col"
          >
            <div class="bar-track">
              <div
                class="bar-fill"
                :style="{ height: getBarHeight(day.tunnels) }"
              ></div>
            </div>
            <span class="bar-date">{{ formatBarDate(day.date) }}</span>
            <span class="bar-val">{{ day.tunnels }}</span>
          </div>
        </div>
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

/* Telemetry & Historical Activity */
.telemetry-box {
  margin-top: 32px;
  padding: 24px;
}

.telemetry-header {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 20px;
}

.telemetry-sub {
  font-size: 13px;
  color: var(--text-secondary);
}

.telemetry-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
  margin-bottom: 28px;
}

.telemetry-card {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  transition: all 0.2s ease;
}

.telemetry-card:hover {
  background: rgba(255, 255, 255, 0.05);
  border-color: rgba(255, 255, 255, 0.15);
  transform: translateY(-2px);
}

.telemetry-card-label {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-muted);
}

.telemetry-card-val {
  font-size: 24px;
  font-weight: 800;
  line-height: 1.2;
}

.telemetry-unit {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
  margin-left: 2px;
}

.telemetry-card-sub {
  font-size: 12px;
  color: var(--text-muted);
}

.highlight-amber {
  color: #fbbf24;
}

/* Sparkline / Daily Activity Bars */
.activity-section {
  border-top: 1px solid var(--border-subtle);
  padding-top: 20px;
}

.activity-title {
  display: block;
  font-size: 13px;
  font-weight: 700;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 16px;
}

.activity-bars {
  display: flex;
  align-items: flex-end;
  gap: 12px;
  height: 120px;
  padding: 0 4px 4px;
}

.activity-bar-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  height: 100%;
  min-width: 32px;
  gap: 6px;
}

.bar-track {
  flex: 1;
  width: 100%;
  max-width: 44px;
  background: rgba(255, 255, 255, 0.04);
  border-radius: 6px 6px 0 0;
  display: flex;
  align-items: flex-end;
  position: relative;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.bar-fill {
  width: 100%;
  background: linear-gradient(180deg, #38bdf8 0%, rgba(56, 189, 248, 0.35) 100%);
  border-radius: 5px 5px 0 0;
  transition: height 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 0 12px rgba(56, 189, 248, 0.4);
}

.bar-track:hover .bar-fill {
  background: linear-gradient(180deg, #67e8f9 0%, rgba(56, 189, 248, 0.6) 100%);
}

.bar-date {
  font-size: 11px;
  color: var(--text-muted);
  font-family: var(--font-mono);
  user-select: none;
  -webkit-user-select: none;
}

.bar-val {
  font-size: 11px;
  font-weight: 700;
  color: var(--accent-cyan);
  font-family: var(--font-mono);
  user-select: none;
  -webkit-user-select: none;
}
</style>
