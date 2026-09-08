<script setup>
import { t } from '../locales.js';
</script>

<template>
  <section id="architecture" class="section-container">
    <div class="section-header">
      <div class="header-badge">{{ t('architecture.badge') }}</div>
      <h2 class="section-title">{{ t('architecture.title') }}</h2>
      <p class="section-desc">
        {{ t('architecture.desc') }}
      </p>
    </div>

    <div class="diagram-panel glass-panel">
      <div class="flow-container">
        <!-- Node 1: Public Web / TV -->
        <div class="flow-card">
          <div class="flow-icon">🌐</div>
          <h4>{{ t('architecture.nodes.client') }}</h4>
          <span class="flow-sub">{{ t('architecture.nodes.clientSub') }}</span>
          <div class="flow-pill cyan">{{ t('architecture.nodes.clientPill') }}</div>
        </div>

        <div class="flow-arrow">➔</div>

        <!-- Node 2: Nginx Proxy Manager & Edge Server -->
        <div class="flow-card edge">
          <div class="flow-icon">🛡️</div>
          <h4>{{ t('architecture.nodes.edgeProxy') }}</h4>
          <span class="flow-sub">{{ t('architecture.nodes.edgeSub') }}</span>
          <div class="flow-pill green">{{ t('architecture.nodes.edgePill') }}</div>
        </div>

        <div class="flow-arrow">➔</div>

        <!-- Node 3: Skyhook Core Engine -->
        <div class="flow-card core">
          <div class="flow-icon">⚡</div>
          <h4>{{ t('architecture.nodes.ingress') }}</h4>
          <span class="flow-sub">{{ t('architecture.nodes.ingressSub') }}</span>
          <div class="flow-pill purple">{{ t('architecture.nodes.ingressPill') }}</div>
        </div>

        <div class="flow-arrow">◄═►</div>

        <!-- Node 4: Local Client Machine -->
        <div class="flow-card local">
          <div class="flow-icon">💻</div>
          <h4>{{ t('architecture.nodes.local') }}</h4>
          <span class="flow-sub">{{ t('architecture.nodes.localSub') }}</span>
          <div class="flow-pill yellow">{{ t('architecture.nodes.localPill') }}</div>
        </div>
      </div>
    </div>

    <!-- Tech Comparison Grid -->
    <div class="comparison-grid">
      <div class="comp-card glass-panel">
        <div class="comp-header">
          <span class="comp-badge quic">{{ t('architecture.quic.badge') }}</span>
          <h3>{{ t('architecture.quic.title') }}</h3>
        </div>
        <p>{{ t('architecture.quic.desc') }}</p>
        <ul class="comp-list">
          <li v-for="(p, i) in t('architecture.quic.points')" :key="i">✔ {{ p }}</li>
        </ul>
      </div>

      <div class="comp-card glass-panel">
        <div class="comp-header">
          <span class="comp-badge ws">{{ t('architecture.ws.badge') }}</span>
          <h3>{{ t('architecture.ws.title') }}</h3>
        </div>
        <p>{{ t('architecture.ws.desc') }}</p>
        <ul class="comp-list">
          <li v-for="(p, i) in t('architecture.ws.points')" :key="i">✔ {{ p }}</li>
        </ul>
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
  color: #c084fc;
  background: rgba(168, 85, 247, 0.1);
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

.diagram-panel {
  padding: 32px;
  margin-bottom: 36px;
}

.flow-container {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.flow-card {
  flex: 1;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  padding: 20px 14px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.flow-icon {
  font-size: 26px;
  margin-bottom: 4px;
}

.flow-card h4 {
  font-size: 14px;
  color: #fff;
}

.flow-sub {
  font-size: 11px;
  color: var(--text-muted);
}

.flow-pill {
  font-size: 10px;
  font-weight: 700;
  padding: 3px 8px;
  border-radius: var(--radius-pill);
  margin-top: 6px;
}

.flow-pill.cyan { background: rgba(56, 189, 248, 0.15); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.3); }
.flow-pill.green { background: rgba(34, 197, 94, 0.15); color: #4ade80; border: 1px solid rgba(34, 197, 94, 0.3); }
.flow-pill.purple { background: rgba(168, 85, 247, 0.15); color: #c084fc; border: 1px solid rgba(168, 85, 247, 0.3); }
.flow-pill.yellow { background: rgba(234, 179, 8, 0.15); color: #facc15; border: 1px solid rgba(234, 179, 8, 0.3); }

.flow-arrow {
  color: var(--text-muted);
  font-weight: 800;
  font-size: 18px;
}

.comparison-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 20px;
}

.comp-card {
  padding: 28px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.comp-badge {
  display: inline-block;
  font-size: 11px;
  font-weight: 700;
  padding: 3px 10px;
  border-radius: var(--radius-pill);
  margin-bottom: 6px;
}

.comp-badge.quic {
  background: rgba(168, 85, 247, 0.15);
  color: #c084fc;
  border: 1px solid rgba(168, 85, 247, 0.3);
}

.comp-badge.ws {
  background: rgba(56, 189, 248, 0.15);
  color: #38bdf8;
  border: 1px solid rgba(56, 189, 248, 0.3);
}

.comp-card h3 {
  font-size: 18px;
  color: #fff;
}

.comp-card p {
  color: var(--text-secondary);
  font-size: 14px;
  line-height: 1.6;
}

.comp-list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 4px;
}

.comp-list li {
  font-size: 13px;
  color: #cbd5e1;
}

@media (max-width: 768px) {
  .flow-container {
    flex-direction: column;
  }
  .flow-arrow {
    transform: rotate(90deg);
  }
}
</style>
