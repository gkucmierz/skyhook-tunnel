<script setup>
import { ref, onMounted } from 'vue';
import Header from './components/Header.vue';
import HeroBanner from './components/HeroBanner.vue';
import QuickStart from './components/QuickStart.vue';
import TunnelDashboard from './components/TunnelDashboard.vue';
import ArchitectureDoc from './components/ArchitectureDoc.vue';
import Footer from './components/Footer.vue';

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

onMounted(() => {
  checkStatus();
});
</script>

<template>
  <div class="app-layout">
    <Header :gateway-online="gatewayOnline" :active-tunnel-count="activeTunnelCount" />
    <main class="main-content">
      <HeroBanner />
      <QuickStart />
      <TunnelDashboard />
      <ArchitectureDoc />
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
