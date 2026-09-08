import { ref, computed } from 'vue';

const currentPath = ref(typeof window !== 'undefined' ? window.location.pathname : '/');

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => {
    currentPath.value = window.location.pathname;
  });
}

export function useRouter() {
  function push(path) {
    if (typeof window === 'undefined') return;
    if (window.location.pathname !== path) {
      window.history.pushState(null, '', path);
      currentPath.value = path;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  return {
    push,
  };
}

export function useRoute() {
  return computed(() => ({
    path: currentPath.value,
  }));
}
