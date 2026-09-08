import { createApp } from 'vue';
import App from './App.vue';
import './style.css';
import { tracker } from '@gkucmierz/analytics';

// Initialize Analytics Tracking for skyhook.7u.pl
tracker.init('skyhook', 'https://analytics.7u.pl');

createApp(App).mount('#app');
