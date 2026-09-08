<script setup>
import { currentLang, setLang, t } from '../locales.js';
import { useRouter } from '../router.js';

const props = defineProps({
  gatewayOnline: {
    type: Boolean,
    default: true,
  },
  activeTunnelCount: {
    type: Number,
    default: 0,
  },
  isAdmin: {
    type: Boolean,
    default: false,
  },
});

const router = useRouter();
</script>

<template>
  <header class="site-header">
    <div class="header-content">
      <div class="brand" @click="router.push('/')" role="button" tabindex="0">
        <div class="logo-box">
          <svg width="32" height="32" viewBox="0 0 512 512" fill="none">
            <rect width="512" height="512" rx="128" fill="#07090e" />
            <circle cx="340" cy="150" r="48" stroke="#a855f7" stroke-width="20" />
            <circle cx="160" cy="360" r="28" fill="#38bdf8" />
            <path d="M 160 360 C 160 440, 310 440, 340 360 C 370 280, 160 250, 190 170 C 215 105, 300 110, 340 150" 
                  stroke="#38bdf8" 
                  stroke-width="26" 
                  stroke-linecap="round" />
            <path d="M 160 360 C 160 440, 310 440, 340 360 C 370 280, 160 250, 190 170 C 215 105, 300 110, 340 150" 
                  stroke="#ffffff" 
                  stroke-width="8" 
                  stroke-linecap="round" />
          </svg>
        </div>
        <div class="brand-text">
          <span class="brand-name">SKYHOOK</span>
          <span class="brand-badge" :class="{ 'admin-badge-color': isAdmin }">
            {{ isAdmin ? 'ADMIN' : 'TUNNEL' }}
          </span>
        </div>
      </div>

      <nav class="nav-links">
        <template v-if="isAdmin">
          <button type="button" class="nav-link btn-nav-link" @click="router.push('/')">
            {{ t('nav.home') }}
          </button>
          <button type="button" class="nav-link btn-nav-link active" @click="router.push('/admin')">
            {{ t('nav.admin') }}
          </button>
        </template>
        <template v-else>
          <a href="#quickstart" class="nav-link">{{ t('nav.quickstart') }}</a>
          <a href="#dashboard" class="nav-link">
            {{ t('nav.tunnels') }}
            <span v-if="activeTunnelCount > 0" class="tunnel-count-badge">{{ activeTunnelCount }}</span>
          </a>
          <a href="#architecture" class="nav-link">{{ t('nav.architecture') }}</a>
          <button type="button" class="nav-link btn-nav-link admin-pill-btn" @click="router.push('/admin')">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
            </svg>
            <span>{{ t('nav.admin') }}</span>
          </button>
        </template>
      </nav>

      <div class="header-right">
        <div class="status-indicator" :class="{ online: gatewayOnline }">
          <span class="status-dot"></span>
          <span class="status-text">{{ gatewayOnline ? t('nav.gatewayOnline') : t('nav.gatewayOffline') }}</span>
        </div>

        <!-- Language Switcher -->
        <div class="lang-switcher">
          <button 
            type="button"
            class="lang-btn" 
            :class="{ active: currentLang === 'pl' }" 
            @click="setLang('pl')"
            aria-label="Język polski"
          >
            PL
          </button>
          <button 
            type="button"
            class="lang-btn" 
            :class="{ active: currentLang === 'en' }" 
            @click="setLang('en')"
            aria-label="English language"
          >
            EN
          </button>
        </div>
        <!-- Gitea Repo Link -->
        <a href="https://gitea.7u.pl/gkucmierz/skyhook-tunnel" target="_blank" rel="noopener noreferrer" class="repo-btn gitea-btn" aria-label="Gitea Repository">
          <svg width="24" height="15" viewBox="0 4.2 24 13.6" fill="currentColor" class="repo-icon">
            <path d="M4.209 4.603c-.247 0-.525.02-.84.088-.333.07-1.28.283-2.054 1.027C-.403 7.25.035 9.685.089 10.052c.065.446.263 1.687 1.21 2.768 1.749 2.141 5.513 2.092 5.513 2.092s.462 1.103 1.168 2.119c.955 1.263 1.936 2.248 2.89 2.367 2.406 0 7.212-.004 7.212-.004s.458.004 1.08-.394c.535-.324 1.013-.893 1.013-.893s.492-.527 1.18-1.73c.21-.37.385-.729.538-1.068 0 0 2.107-4.471 2.107-8.823-.042-1.318-.367-1.55-.443-1.627-.156-.156-.366-.153-.366-.153s-4.475.252-6.792.306c-.508.011-1.012.023-1.512.027v4.474l-.634-.301c0-1.39-.004-4.17-.004-4.17-1.107.016-3.405-.084-3.405-.084s-5.399-.27-5.987-.324c-.187-.011-.401-.032-.648-.032zm.354 1.832h.111s.271 2.269.6 3.597C5.549 11.147 6.22 13 6.22 13s-.996-.119-1.641-.348c-.99-.324-1.409-.714-1.409-.714s-.73-.511-1.096-1.52C1.444 8.73 2.021 7.7 2.021 7.7s.32-.859 1.47-1.145c.395-.106.863-.12 1.072-.12zm8.33 2.554c.26.003.509.127.509.127l.868.422-.529 1.075a.686.686 0 0 0-.614.359.685.685 0 0 0 .072.756l-.939 1.924a.69.69 0 0 0-.66.527.687.687 0 0 0 .347.763.686.686 0 0 0 .867-.206.688.688 0 0 0-.069-.882l.916-1.874a.667.667 0 0 0 .237-.02.657.657 0 0 0 .271-.137 8.826 8.826 0 0 1 1.016.512.761.761 0 0 1 .286.282c.073.21-.073.569-.073.569-.087.29-.702 1.55-.702 1.55a.692.692 0 0 0-.676.477.681.681 0 1 0 1.157-.252c.073-.141.141-.282.214-.431.19-.397.515-1.16.515-1.16.035-.066.218-.394.103-.814-.095-.435-.48-.638-.48-.638-.467-.301-1.116-.58-1.116-.58s0-.156-.042-.27a.688.688 0 0 0-.148-.241l.516-1.062 2.89 1.401s.48.218.583.619c.073.282-.019.534-.069.657-.24.587-2.1 4.317-2.1 4.317s-.232.554-.748.588a1.065 1.065 0 0 1-.393-.045l-.202-.08-4.31-2.1s-.417-.218-.49-.596c-.083-.31.104-.691.104-.691l2.073-4.272s.183-.37.466-.497a.855.855 0 0 1 .35-.077z"/>
          </svg>
          <span>Gitea</span>
        </a>

        <!-- GitHub Mirror Link -->
        <a href="https://github.com/gkucmierz/skyhook-tunnel" target="_blank" rel="noopener noreferrer" class="repo-btn github-btn" aria-label="GitHub Mirror">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" class="repo-icon">
            <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
          </svg>
          <span>GitHub</span>
        </a>
      </div>
    </div>
  </header>
</template>

<style scoped>
.site-header {
  position: sticky;
  top: 0;
  z-index: 100;
  background: rgba(6, 8, 14, 0.75);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-bottom: 1px solid var(--border-subtle);
}

.header-content {
  max-width: 1280px;
  margin: 0 auto;
  padding: 14px 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.brand {
  display: flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
}

.logo-box {
  display: flex;
  align-items: center;
  justify-content: center;
}

.brand-text {
  display: flex;
  align-items: center;
  gap: 8px;
}

.brand-name {
  font-size: 19px;
  font-weight: 800;
  letter-spacing: 1.5px;
  background: linear-gradient(135deg, #38bdf8 0%, #a855f7 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.brand-badge {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 1px;
  background: rgba(168, 85, 247, 0.15);
  border: 1px solid rgba(168, 85, 247, 0.35);
  color: #c084fc;
  padding: 2px 7px;
  border-radius: var(--radius-pill);
  transition: all 0.2s ease;
}

.brand-badge.admin-badge-color {
  background: rgba(56, 189, 248, 0.15);
  border-color: rgba(56, 189, 248, 0.4);
  color: #38bdf8;
}

.nav-links {
  display: flex;
  align-items: center;
  gap: 28px;
}

.nav-link {
  color: var(--text-secondary);
  text-decoration: none;
  font-size: 14px;
  font-weight: 500;
  transition: color 0.18s ease;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.nav-link:hover {
  color: #ffffff;
}

.btn-nav-link {
  background: none;
  border: none;
  font-family: inherit;
  cursor: pointer;
  padding: 0;
}

.btn-nav-link.active {
  color: #fff;
  font-weight: 700;
}

.admin-pill-btn {
  padding: 4px 10px;
  background: rgba(56, 189, 248, 0.08);
  border: 1px solid rgba(56, 189, 248, 0.2);
  border-radius: var(--radius-pill);
  color: var(--accent-cyan);
  font-size: 13px;
  font-weight: 600;
  transition: all 0.2s ease;
}

.admin-pill-btn:hover {
  background: rgba(56, 189, 248, 0.18);
  border-color: rgba(56, 189, 248, 0.4);
  color: #fff;
}

.tunnel-count-badge {
  background: rgba(34, 197, 94, 0.2);
  color: #4ade80;
  font-size: 11px;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: var(--radius-pill);
  border: 1px solid rgba(34, 197, 94, 0.4);
}

.header-right {
  display: flex;
  align-items: center;
  gap: 16px;
}

.status-indicator {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--border-subtle);
  padding: 0 14px;
  height: 36px;
  box-sizing: border-box;
  border-radius: var(--radius-pill);
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
}

.status-indicator.online {
  border-color: rgba(34, 197, 94, 0.3);
  color: #86efac;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #64748b;
}

.status-indicator.online .status-dot {
  background: #22c55e;
  box-shadow: 0 0 10px #22c55e;
  animation: pulse 1.8s infinite;
}

.lang-switcher {
  display: inline-flex;
  align-items: center;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-pill);
  padding: 3px;
  gap: 3px;
  height: 36px;
  box-sizing: border-box;
}

.lang-btn {
  background: transparent;
  border: none;
  color: var(--text-secondary);
  padding: 0 11px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-pill);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.5px;
  cursor: pointer;
  transition: all 0.15s ease;
  user-select: none;
  -webkit-user-select: none;
  outline: none !important;
}

.lang-btn:hover {
  color: #ffffff;
}

.lang-btn.active {
  background: rgba(56, 189, 248, 0.2);
  color: #38bdf8;
  box-shadow: inset 0 0 0 1px rgba(56, 189, 248, 0.4);
}

.repo-btn {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.14);
  color: #ffffff;
  padding: 0 14px;
  height: 36px;
  box-sizing: border-box;
  border-radius: var(--radius-pill);
  font-size: 13px;
  font-weight: 600;
  text-decoration: none;
  transition: all 0.18s ease;
  user-select: none;
  -webkit-user-select: none;
  outline: none !important;
}

.repo-btn:hover {
  background: rgba(255, 255, 255, 0.15);
  border-color: rgba(255, 255, 255, 0.25);
  color: #ffffff;
}

.repo-btn:focus,
.repo-btn:focus-visible {
  outline: none !important;
}

.repo-icon {
  display: block;
  flex-shrink: 0;
}

@keyframes pulse {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(0.85); opacity: 0.5; }
}

@media (max-width: 860px) {
  .nav-links {
    display: none;
  }
}

@media (max-width: 640px) {
  .status-text {
    display: none;
  }
  .status-indicator {
    padding: 6px 8px;
  }
}

@media (max-width: 480px) {
  .repo-btn span {
    display: none;
  }
  .repo-btn {
    padding: 6px 10px;
  }
}
</style>
