<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { useRoute } from './router.js';
import Header from './components/Header.vue';
import LandingView from './views/LandingView.vue';
import AdminView from './views/AdminView.vue';
import Footer from './components/Footer.vue';

const route = useRoute();
const isAdmin = computed(() => route.value.path.startsWith('/admin') || route.value.path.startsWith('/login'));

const gatewayOnline = ref(true);
const activeTunnelCount = ref(0);

async function checkStatus() {
  try {
    const res = await fetch('/api/tunnels');
    if (res.ok) {
      const data = await res.json();
      gatewayOnline.value = true;
      activeTunnelCount.value = data.active_count || 0;
    }
  } catch {
    // If backend is not yet started or running standalone vite
  }
}

watch(isAdmin, (adminMode) => {
  if (adminMode) {
    document.title = 'Admin Portal | Skyhook Tunnel';
  } else {
    document.title = 'Skyhook Tunnel | Fast & Secure Ingress';
  }
}, { immediate: true });

onMounted(() => {
  checkStatus();
});
</script>

<template>
  <div class="app-layout">
    <Header
      :gateway-online="gatewayOnline"
      :active-tunnel-count="activeTunnelCount"
      :is-admin="isAdmin"
    />
    <main class="main-content">
      <AdminView v-if="isAdmin" />
      <LandingView v-else />
    </main>
    <Footer />
  </div>
</template>

<style scoped>
.app-layout {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.main-content {
  flex: 1;
}
</style>
