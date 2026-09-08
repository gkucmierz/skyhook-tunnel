<script setup>
import { ref, computed } from 'vue';
import { t } from '../locales.js';

const activeTab = ref('npx'); // 'npx', 'global', 'package'

const tabs = computed(() => [
  { id: 'npx', label: t('quickstart.tabs.npx') },
  { id: 'global', label: t('quickstart.tabs.global') },
  { id: 'package', label: t('quickstart.tabs.package') },
]);

const copiedStates = ref({});
const pkgScriptSnippet = '"tunnel": "skyhook 34200"';

function copyCode(key, text) {
  navigator.clipboard.writeText(text);
  copiedStates.value[key] = true;
  setTimeout(() => {
    copiedStates.value[key] = false;
  }, 2000);
}
</script>

<template>
  <section id="quickstart" class="section-container">
    <div class="section-header">
      <h2 class="section-title">{{ t('quickstart.title') }}</h2>
      <p class="section-desc">
        {{ t('quickstart.desc') }}
      </p>
    </div>

    <div class="tabs-header">
      <button
        v-for="tTab in tabs"
        :key="tTab.id"
        class="tab-btn"
        :class="{ active: activeTab === tTab.id }"
        @click="activeTab = tTab.id"
      >
        {{ tTab.label }}
      </button>
    </div>

    <!-- Tab 1: npx -->
    <div v-if="activeTab === 'npx'" class="guide-card glass-panel">
      <div class="step-row">
        <div class="step-num">1</div>
        <div class="step-info">
          <h3>{{ t('quickstart.npx.step1Title') }}</h3>
          <p>{{ t('quickstart.npx.step1Desc') }}</p>
          <div class="code-box">
            <code>npx @gkucmierz/skyhook 34200</code>
            <button class="small-copy" @click="copyCode('npx1', 'npx @gkucmierz/skyhook 34200')">
              {{ copiedStates['npx1'] ? t('quickstart.copied') : t('quickstart.copy') }}
            </button>
          </div>
        </div>
      </div>

      <div class="step-row">
        <div class="step-num">2</div>
        <div class="step-info">
          <h3>{{ t('quickstart.npx.step2Title') }}</h3>
          <p>{{ t('quickstart.npx.step2Desc') }}</p>
          <div class="code-box">
            <code>npx @gkucmierz/skyhook 34200 --name tv-pilot</code>
            <button class="small-copy" @click="copyCode('npx2', 'npx @gkucmierz/skyhook 34200 --name tv-pilot')">
              {{ copiedStates['npx2'] ? t('quickstart.copied') : t('quickstart.copy') }}
            </button>
          </div>
          <span class="url-preview">➔ {{ t('quickstart.npx.urlPreview') }} <strong>https://tv-pilot.skyhook.7u.pl/</strong></span>
        </div>
      </div>
    </div>

    <!-- Tab 2: Global -->
    <div v-else-if="activeTab === 'global'" class="guide-card glass-panel">
      <div class="step-row">
        <div class="step-num">1</div>
        <div class="step-info">
          <h3>{{ t('quickstart.global.step1Title') }}</h3>
          <div class="code-box">
            <code>npm install -g @gkucmierz/skyhook</code>
            <button class="small-copy" @click="copyCode('glob1', 'npm install -g @gkucmierz/skyhook')">
              {{ copiedStates['glob1'] ? t('quickstart.copied') : t('quickstart.copy') }}
            </button>
          </div>
        </div>
      </div>

      <div class="step-row">
        <div class="step-num">2</div>
        <div class="step-info">
          <h3>{{ t('quickstart.global.step2Title') }}</h3>
          <div class="code-box">
            <code>skyhook 3000</code>
            <button class="small-copy" @click="copyCode('glob2', 'skyhook 3000')">
              {{ copiedStates['glob2'] ? t('quickstart.copied') : t('quickstart.copy') }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Tab 3: package.json -->
    <div v-else class="guide-card glass-panel">
      <div class="step-row">
        <div class="step-num">★</div>
        <div class="step-info">
          <h3>{{ t('quickstart.package.title') }}</h3>
          <p>{{ t('quickstart.package.desc') }}</p>
          <div class="code-box json-view">
            <pre><code>"scripts": {
  "dev": "vite",
  "tunnel": "skyhook 34200"
}</code></pre>
            <button class="small-copy" @click="copyCode('pkg1', pkgScriptSnippet)">
              {{ copiedStates['pkg1'] ? t('quickstart.copied') : t('quickstart.copy') }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.section-container {
  max-width: 1000px;
  margin: 0 auto;
  padding: 40px 24px 80px;
}

.section-header {
  text-align: center;
  margin-bottom: 36px;
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

.tabs-header {
  display: flex;
  justify-content: center;
  gap: 8px;
  margin-bottom: 24px;
}

.tab-btn {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--border-subtle);
  color: var(--text-secondary);
  padding: 9px 20px;
  border-radius: var(--radius-pill);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.18s ease;
}

.tab-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.tab-btn.active {
  background: rgba(56, 189, 248, 0.15);
  border-color: rgba(56, 189, 248, 0.45);
  color: #38bdf8;
}

.guide-card {
  padding: 32px;
  display: flex;
  flex-direction: column;
  gap: 28px;
}

.step-row {
  display: flex;
  gap: 20px;
  align-items: flex-start;
}

.step-num {
  width: 38px;
  height: 38px;
  border-radius: 50%;
  background: linear-gradient(135deg, rgba(56, 189, 248, 0.2), rgba(168, 85, 247, 0.2));
  border: 1px solid rgba(56, 189, 248, 0.35);
  color: #38bdf8;
  font-weight: 800;
  font-size: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.step-info {
  flex: 1;
}

.step-info h3 {
  font-size: 18px;
  color: #fff;
  margin-bottom: 6px;
}

.step-info p {
  color: var(--text-secondary);
  font-size: 14px;
  margin-bottom: 12px;
}

.code-box {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #090d16;
  border: 1px solid var(--border-subtle);
  padding: 10px 16px;
  border-radius: var(--radius-sm);
  font-family: var(--font-mono);
  font-size: 14px;
  color: #38bdf8;
}

.code-box.json-view {
  align-items: flex-start;
}

.small-copy {
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: #fff;
  padding: 5px 12px;
  border-radius: var(--radius-pill);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}

.small-copy:hover {
  background: rgba(255, 255, 255, 0.16);
}

.url-preview {
  display: inline-block;
  margin-top: 8px;
  font-size: 13px;
  color: #94a3b8;
}

.url-preview strong {
  color: #38bdf8;
}

@media (max-width: 640px) {
  .step-row {
    flex-direction: column;
    gap: 12px;
  }
}
</style>
