<script setup>
import { t } from '../locales.js';
</script>

<template>
  <footer class="site-footer">
    <div class="footer-content">
      <div class="footer-left">
        <span class="footer-brand">SKYHOOK TUNNEL</span>
        <p class="footer-sub">
          {{ t('footer.sub') }}
        </p>
      </div>

      <div class="footer-meta">
        <span class="footer-node">{{ t('footer.edge') }} • v1.2.0</span>
        <span class="footer-license">{{ t('footer.license') }}</span>
      </div>
    </div>
  </footer>
</template>

<style scoped>
.site-footer {
  border-top: 1px solid var(--border-subtle);
  background: rgba(6, 8, 14, 0.9);
  padding: 36px 24px;
  margin-top: 60px;
}

.footer-content {
  max-width: 1100px;
  margin: 0 auto;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 20px;
}

.footer-brand {
  font-size: 15px;
  font-weight: 800;
  letter-spacing: 1px;
  color: #fff;
}

.footer-sub {
  font-size: 13px;
  color: var(--text-muted);
  margin-top: 4px;
}

.footer-meta {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
}

.footer-node {
  font-size: 12px;
  color: #38bdf8;
  font-weight: 600;
}

.footer-license {
  font-size: 12px;
  color: var(--text-muted);
}

@media (max-width: 640px) {
  .footer-content {
    flex-direction: column;
    align-items: flex-start;
  }
  .footer-meta {
    align-items: flex-start;
  }
}
</style>
