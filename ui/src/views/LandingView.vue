<script setup>
import HeroBanner from '../components/HeroBanner.vue';
import QuickStart from '../components/QuickStart.vue';
import TunnelDashboard from '../components/TunnelDashboard.vue';
import ArchitectureDoc from '../components/ArchitectureDoc.vue';
</script>

<template>
  <div class="landing-view">
    <HeroBanner />
    <QuickStart />
    <TunnelDashboard />
    <ArchitectureDoc />
  </div>
</template>

<style scoped>
.landing-view {
  display: flex;
  flex-direction: column;
}
</style>
