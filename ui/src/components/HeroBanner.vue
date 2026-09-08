<script setup>
import { ref } from 'vue';
import { t } from '../locales.js';

const copied = ref(false);
const cliCommand = 'npx @gkucmierz/skyhook 3000';

function copyCommand() {
  navigator.clipboard.writeText(cliCommand);
  copied.value = true;
  setTimeout(() => {
    copied.value = false;
  }, 2200);
}
</script>

<template>
  <section class="hero-section">
    <div class="hero-logo-box">
      <img :src="'/icon-512.jpg'" alt="Skyhook Tunnel Icon" class="hero-icon" width="100" height="100" />
    </div>

    <div class="hero-badge">
      <span class="pulse-ring"></span>
      <span>{{ t('hero.infraBadge') }}</span>
    </div>

    <h1 class="hero-title">
      {{ t('hero.titlePart1') }}<span class="gradient-text">localhost</span>{{ t('hero.titlePart2') }}<br />
      {{ t('hero.titlePart3') }}
    </h1>

    <p class="hero-subtitle">
      {{ t('hero.subtitle') }}
    </p>

    <!-- Terminal Command Snippet Box -->
    <div class="command-box glass-panel">
      <div class="command-prompt">
        <span class="prompt-symbol">$</span>
        <span class="command-text">{{ cliCommand }}</span>
      </div>
      <button class="copy-btn" :class="{ copied }" @click="copyCommand" :aria-label="t('hero.copyAria')">
        <svg v-if="copied" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
        <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
        </svg>
        <span>{{ copied ? t('hero.copied') : t('hero.copy') }}</span>
      </button>
    </div>

    <!-- Feature highlights pills -->
    <div class="feature-pills">
      <div class="pill-item">
        <span class="pill-icon">⚡</span>
        <span>{{ t('hero.pills.quic') }}</span>
      </div>
      <div class="pill-item">
        <span class="pill-icon">🔒</span>
        <span>{{ t('hero.pills.wildcard') }}</span>
      </div>
      <div class="pill-item">
        <span class="pill-icon">📦</span>
        <span>{{ t('hero.pills.npm') }}</span>
      </div>
      <div class="pill-item">
        <span class="pill-icon">📺</span>
        <span>{{ t('hero.pills.devices') }}</span>
      </div>
    </div>
  </section>
</template>

<style scoped>
.hero-section {
  text-align: center;
  padding: 80px 24px 60px;
  max-width: 900px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24px;
}

.hero-logo-box {
  width: 108px;
  height: 108px;
  border-radius: 28px;
  padding: 3px;
  background: linear-gradient(135deg, rgba(56, 189, 248, 0.5), rgba(168, 85, 247, 0.5));
  box-shadow: 0 0 35px rgba(56, 189, 248, 0.25), 0 0 55px rgba(168, 85, 247, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  animation: float 6s ease-in-out infinite;
}

.hero-icon {
  width: 100%;
  height: 100%;
  border-radius: 25px;
  object-fit: cover;
  display: block;
}

@keyframes float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-6px); }
}

.hero-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: rgba(56, 189, 248, 0.08);
  border: 1px solid rgba(56, 189, 248, 0.25);
  color: #38bdf8;
  padding: 6px 16px;
  border-radius: var(--radius-pill);
  font-size: 13px;
  font-weight: 600;
}

.pulse-ring {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #38bdf8;
  box-shadow: 0 0 8px #38bdf8;
}

.hero-title {
  font-size: 48px;
  font-weight: 800;
  line-height: 1.15;
  letter-spacing: -0.5px;
  color: #ffffff;
}

.gradient-text {
  background: linear-gradient(135deg, #38bdf8 20%, #c084fc 80%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.hero-subtitle {
  font-size: 17px;
  color: var(--text-secondary);
  line-height: 1.6;
  max-width: 680px;
}

.command-box {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 10px 14px 10px 20px;
  border-radius: var(--radius-pill);
  background: rgba(15, 23, 42, 0.8);
  border: 1px solid rgba(255, 255, 255, 0.12);
  width: 100%;
  max-width: 520px;
  margin-top: 10px;
}

.command-prompt {
  display: flex;
  align-items: center;
  gap: 10px;
  font-family: var(--font-mono);
  font-size: 15px;
}

.prompt-symbol {
  color: var(--accent-cyan);
  font-weight: 700;
}

.command-text {
  color: #f1f5f9;
  font-weight: 500;
}

.copy-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.14);
  color: #ffffff;
  padding: 7px 16px;
  border-radius: var(--radius-pill);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.18s ease;
}

.copy-btn:hover {
  background: rgba(255, 255, 255, 0.16);
  border-color: rgba(255, 255, 255, 0.28);
}

.copy-btn.copied {
  background: rgba(34, 197, 94, 0.2);
  border-color: rgba(34, 197, 94, 0.5);
  color: #4ade80;
}

.feature-pills {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 12px;
  margin-top: 12px;
}

.pill-item {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  padding: 6px 14px;
  border-radius: var(--radius-pill);
  font-size: 12px;
  color: var(--text-secondary);
}

.pill-icon {
  font-size: 14px;
}

@media (max-width: 640px) {
  .hero-title {
    font-size: 32px;
  }
  .command-box {
    flex-direction: column;
    padding: 16px;
    border-radius: var(--radius-md);
    gap: 14px;
  }
  .copy-btn {
    width: 100%;
    justify-content: center;
  }
}
</style>
