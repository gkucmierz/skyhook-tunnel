import { ref } from 'vue';

const STORAGE_KEY = 'skyhook_lang';
const defaultLang = typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_KEY) === 'en' ? 'en' : 'pl';

export const currentLang = ref(defaultLang);

export function setLang(lang) {
  if (lang === 'pl' || lang === 'en') {
    currentLang.value = lang;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, lang);
    }
  }
}

export const messages = {
  pl: {
    nav: {
      quickstart: 'Szybki Start',
      tunnels: 'Tunele',
      architecture: 'Architektura',
      admin: 'Admin',
      home: 'Strona Główna',
      gatewayOnline: 'Gateway Online',
      gatewayOffline: 'Gateway Offline',
    },
    hero: {
      infraBadge: 'Własna infrastruktura tunelowania • Hostowana w Niemczech',
      titlePart1: 'Wyprowadź swój ',
      titlePart2: ' na świat.',
      titlePart3: 'W ułamku sekundy.',
      subtitle: 'Niezależna, bezpieczna alternatywa dla Cloudflare Tunnel i ngrok. Obsługuje protokół QUIC (HTTP/3 UDP) eliminujący opóźnienia HoL oraz automatyczny fallback na WebSocket over TLS 1.3.',
      copy: 'Kopiuj',
      copied: 'Skopiowano!',
      copyAria: 'Skopiuj polecenie CLI',
      pills: {
        quic: 'Zero-Downtime QUIC',
        wildcard: 'Wildcard HTTPS (*.skyhook.7u.pl)',
        npm: 'Paczka NPM w stylu dport',
        devices: 'Działa z Android TV & WebGL',
      },
    },
    quickstart: {
      title: 'Instrukcja Uruchomienia',
      desc: 'Wyprowadzenie dowolnego lokalnego portu do publicznego Internetu zajmuje mniej niż 5 sekund.',
      tabs: {
        npx: 'Jednorazowe (npx)',
        global: 'Instalacja Globalna',
        package: 'W package.json',
      },
      npx: {
        step1Title: 'Odpal tunel natychmiast bez instalacji',
        step1Desc: 'Podaj numer portu Twojej lokalnej aplikacji (np. Vite, Express, WebGL):',
        step2Title: 'Zdefiniuj własną subdomenę',
        step2Desc: 'Użyj flagi --name, aby uzyskać stały, czytelny adres HTTPS:',
        urlPreview: 'Adres publiczny:',
      },
      global: {
        step1Title: 'Zainstaluj pakiet globalnie w systemie',
        step2Title: 'Wywołuj bezpośrednio z dowolnego katalogu',
      },
      package: {
        title: 'Wzorzec ekosystemowy (jak w @gkucmierz/dport)',
        desc: 'Dodaj skrypt tunnel do Twojego projektu, aby dzielić się aplikacją w jednym poleceniu:',
      },
      copy: 'Kopiuj',
      copied: 'Skopiowano!',
    },
    dashboard: {
      badge: 'LIVE TELEMETRY',
      title: 'Aktywne Połączenia Tunelowe',
      desc: 'Ruch sieciowy kierowany przez węzeł brzegowy vps-5378edda (Niemcy).',
      stats: {
        edgeNode: 'Węzeł Brzegowy',
        edgeLocation: 'vps-5378edda (Niemcy)',
        activeTunnels: 'Aktywne Tunele',
        sessionSingle: 'aktywna sesja',
        sessionPlural: 'aktywnych sesji',
        protocols: 'Protokoły Transportowe',
        sslCert: 'Certyfikat SSL',
      },
      table: {
        title: 'Zarejestrowane Tunele',
        refresh: 'Odśwież',
        subdomain: 'Subdomena',
        publicUrl: 'Publiczny URL',
        transport: 'Transport',
        requests: 'Żądania',
        transfer: 'Transfer',
        sessionTime: 'Czas Sesji',
      },
      empty: {
        title: 'Brak aktywnych tuneli w tej chwili',
        desc: 'Uruchom lokalnego klienta, aby połączyć się z bramą brzegową:',
      },
      secure: {
        titleSingle: 'aktywna sesja tunelowa',
        titlePlural: 'aktywne sesje tunelowe',
        desc: 'Szczegółowa lista zarejestrowanych subdomen i adresów IP jest zabezpieczona i dostępna wyłącznie dla administratora.',
        manageBtn: 'Zarządzaj w Panelu Admina',
      },
      time: {
        justNow: 'Przed chwilą',
      },
    },
    architecture: {
      badge: 'ENGINE SPECS',
      title: 'Architektura i Protokoły',
      desc: 'Jak Skyhook eliminuje opóźnienia i gwarantuje stabilność tunelowania w skrajnych warunkach sieciowych.',
      nodes: {
        client: 'Klient Zewnętrzny',
        clientSub: 'Telewizor Bravia, Przeglądarka',
        clientPill: 'HTTPS :443 (TCP)',
        edgeProxy: 'Nginx Proxy Manager',
        edgeSub: 'vps-5378edda (DE)',
        edgePill: 'Wildcard SSL (*.skyhook.7u.pl)',
        ingress: 'Skyhook Ingress',
        ingressSub: 'Go Engine (Docker)',
        ingressPill: 'Multiplexer Stream L7',
        local: 'Twój Localhost',
        localSub: 'Mac / RPi (192.168.x)',
        localPill: 'QUIC :4443 / WSS :443',
      },
      quic: {
        badge: 'QUIC (HTTP/3 UDP)',
        title: 'Zero-Head-of-Line Blocking',
        desc: 'W przeciwieństwie do tradycyjnego tunelowania TCP, gdzie zgubienie 1 pakietu w sieci Wi-Fi zamraża całe połączenie, w protokole QUIC każdy strumień HTTP w tunelu jest niezależny. Pobieranie wielkich tekstur 3D WebGL nie spowalnia zapytań API pilota.',
        points: [
          'Nawiązywanie połączenia w 1 RTT (i 0-RTT przy wznawianiu)',
          'Niewrażliwość na zrywanie Wi-Fi (Connection ID Migration)',
          'Bezpośrednia transmisja UDP :4443 do serwera w Niemczech',
        ],
      },
      ws: {
        badge: 'WebSocket over TLS (WSS)',
        title: 'Uniwersalny Fallback',
        desc: 'Niektóre sieci korporacyjne lub publiczne hotspoty blokują pakiety UDP. Gdy klient Skyhook wykryje brak możliwości transmisji na porcie UDP 4443, automatycznie i bezszwowo przełącza się na WSS na porcie 443 HTTPS przez Nginx Proxy Manager.',
        points: [
          '100% kompatybilności z każdym firewallem i proxy',
          'Bezpieczny tunel TLS 1.3 zakończony na certyfikacie wildcard',
          'Działa na standardowych portach przeglądarkowych',
        ],
      },
    },
    admin: {
      badge: 'PANEL ADMINISTRATORA',
      title: 'Zarządzanie Tunelami',
      desc: 'Podgląd na żywo, telemetria oraz możliwość natychmiastowego zamykania sesji tunelowych.',
      loginTitle: 'Dostęp Administracyjny',
      loginSubtitle: 'Wprowadź hasło administratora, aby zarządzać aktywnymi tunelami',
      passwordLabel: 'Hasło Administratora',
      passwordPlaceholder: 'Wprowadź hasło...',
      loginBtn: 'Zaloguj się',
      loggingIn: 'Weryfikacja...',
      logoutBtn: 'Wyloguj',
      backToHome: 'Wróć do strony',
      table: {
        title: 'Aktywne Połączenia Tunelowe',
        refresh: 'Odśwież',
        subdomain: 'Subdomena',
        publicUrl: 'Publiczny URL',
        clientIp: 'Adres IP',
        transport: 'Transport',
        requests: 'Żądania',
        transfer: 'Transfer',
        sessionTime: 'Czas Sesji',
        actions: 'Akcje',
        kill: 'Rozłącz',
      },
      empty: {
        title: 'Brak aktywnych tuneli',
        desc: 'Żaden klient nie jest obecnie połączony z bramą.',
      },
      modal: {
        title: 'Potwierdzenie rozłączenia',
        desc: 'Czy na pewno chcesz natychmiast zamknąć tunel',
        warning: 'Sesja WebSocket / QUIC klienta CLI zostanie natychmiast przerwana.',
        confirm: 'Tak, rozłącz',
        cancel: 'Anuluj',
      },
      toast: {
        killSuccess: 'Tunel został pomyślnie rozłączony.',
      },
    },
    errors: {
      errUnauthorized: 'Brak autoryzacji lub sesja wygasła.',
      errInvalidPassword: 'Nieprawidłowe hasło administratora.',
      errTunnelNotFound: 'Tunel nie istnieje lub został już rozłączony.',
      errInvalidSubdomain: 'Niepoprawna nazwa subdomeny.',
      errNetworkError: 'Nie udało się połączyć z serwerem.',
    },
    footer: {
      sub: 'Autonomiczny system tunelowania wstecznego dla ekosystemu 7u.pl.',
      edge: '🇩🇪 Edge Node: vps-5378edda',
      license: 'Licencja MIT • Autor: gkucmierz',
    },
  },
  en: {
    nav: {
      quickstart: 'Quick Start',
      tunnels: 'Tunnels',
      architecture: 'Architecture',
      admin: 'Admin',
      home: 'Home',
      gatewayOnline: 'Gateway Online',
      gatewayOffline: 'Gateway Offline',
    },
    hero: {
      infraBadge: 'Self-hosted Tunneling Infrastructure • Hosted in Germany',
      titlePart1: 'Expose your ',
      titlePart2: ' to the world.',
      titlePart3: 'In a split second.',
      subtitle: 'An independent, secure alternative to Cloudflare Tunnel and ngrok. Powered by QUIC (HTTP/3 UDP) to eliminate Head-of-Line blocking, with automatic fallback to WebSocket over TLS 1.3.',
      copy: 'Copy',
      copied: 'Copied!',
      copyAria: 'Copy CLI command',
      pills: {
        quic: 'Zero-Downtime QUIC',
        wildcard: 'Wildcard HTTPS (*.skyhook.7u.pl)',
        npm: 'NPM package in dport style',
        devices: 'Works with Android TV & WebGL',
      },
    },
    quickstart: {
      title: 'Quick Start Guide',
      desc: 'Exposing any local port to the public Internet takes less than 5 seconds.',
      tabs: {
        npx: 'One-off (npx)',
        global: 'Global Install',
        package: 'In package.json',
      },
      npx: {
        step1Title: 'Launch tunnel instantly without install',
        step1Desc: 'Specify your local application port (e.g. Vite, Express, WebGL):',
        step2Title: 'Specify your custom subdomain',
        step2Desc: 'Use the --name flag to get a persistent, human-readable HTTPS URL:',
        urlPreview: 'Public URL:',
      },
      global: {
        step1Title: 'Install package globally on your system',
        step2Title: 'Invoke directly from any directory',
      },
      package: {
        title: 'Ecosystem pattern (like @gkucmierz/dport)',
        desc: 'Add a tunnel script to your project to share your app in a single command:',
      },
      copy: 'Copy',
      copied: 'Copied!',
    },
    dashboard: {
      badge: 'LIVE TELEMETRY',
      title: 'Active Tunnel Sessions',
      desc: 'Network traffic routed through edge node vps-5378edda (Germany).',
      stats: {
        edgeNode: 'Edge Node',
        edgeLocation: 'vps-5378edda (Germany)',
        activeTunnels: 'Active Tunnels',
        sessionSingle: 'active session',
        sessionPlural: 'active sessions',
        protocols: 'Transport Protocols',
        sslCert: 'SSL Certificate',
      },
      table: {
        title: 'Registered Tunnels',
        refresh: 'Refresh',
        subdomain: 'Subdomain',
        publicUrl: 'Public URL',
        transport: 'Transport',
        requests: 'Requests',
        transfer: 'Transfer',
        sessionTime: 'Session Uptime',
      },
      empty: {
        title: 'No active tunnels right now',
        desc: 'Launch a local CLI client to connect to the edge gateway:',
      },
      secure: {
        titleSingle: 'active tunnel session',
        titlePlural: 'active tunnel sessions',
        desc: 'Detailed telemetry, registered subdomains, and client IPs are protected and accessible only to administrators.',
        manageBtn: 'Manage in Admin Panel',
      },
      time: {
        justNow: 'Just now',
      },
    },
    architecture: {
      badge: 'ENGINE SPECS',
      title: 'Architecture & Protocols',
      desc: 'How Skyhook eliminates latency and guarantees tunneling stability under extreme network conditions.',
      nodes: {
        client: 'External Client',
        clientSub: 'Bravia TV, Web Browser',
        clientPill: 'HTTPS :443 (TCP)',
        edgeProxy: 'Nginx Proxy Manager',
        edgeSub: 'vps-5378edda (DE)',
        edgePill: 'Wildcard SSL (*.skyhook.7u.pl)',
        ingress: 'Skyhook Ingress',
        ingressSub: 'Go Engine (Docker)',
        ingressPill: 'Multiplexer Stream L7',
        local: 'Your Localhost',
        localSub: 'Mac / RPi (192.168.x)',
        localPill: 'QUIC :4443 / WSS :443',
      },
      quic: {
        badge: 'QUIC (HTTP/3 UDP)',
        title: 'Zero-Head-of-Line Blocking',
        desc: 'Unlike traditional TCP tunnels where a single dropped Wi-Fi packet freezes all multiplexed data, QUIC provides independent streams. Large 3D WebGL texture downloads never lag remote control API calls.',
        points: [
          'Connection establishment in 1 RTT (and 0-RTT resumption)',
          'Immunity to Wi-Fi disconnects (Connection ID Migration)',
          'Direct UDP :4443 transmission to Germany server',
        ],
      },
      ws: {
        badge: 'WebSocket over TLS (WSS)',
        title: 'Universal Fallback',
        desc: 'Some corporate or public Wi-Fi networks block raw UDP traffic. When Skyhook detects UDP port 4443 is blocked, it seamlessly falls back to WSS over HTTPS port 443 through Nginx Proxy Manager.',
        points: [
          '100% compatibility with any firewall and proxy',
          'Secure TLS 1.3 tunnel terminated on wildcard certificate',
          'Operates on standard browser HTTPS ports',
        ],
      },
    },
    admin: {
      badge: 'ADMIN PANEL',
      title: 'Tunnel Management',
      desc: 'Live telemetry, active sessions, and immediate tunnel termination controls.',
      loginTitle: 'Administrative Access',
      loginSubtitle: 'Enter administrator password to manage active tunnels',
      passwordLabel: 'Admin Password',
      passwordPlaceholder: 'Enter password...',
      loginBtn: 'Sign In',
      loggingIn: 'Authenticating...',
      logoutBtn: 'Logout',
      backToHome: 'Back to Home',
      table: {
        title: 'Active Tunnel Sessions',
        refresh: 'Refresh',
        subdomain: 'Subdomain',
        publicUrl: 'Public URL',
        clientIp: 'Client IP',
        transport: 'Transport',
        requests: 'Requests',
        transfer: 'Transfer',
        sessionTime: 'Session Duration',
        actions: 'Actions',
        kill: 'Disconnect',
      },
      empty: {
        title: 'No active tunnels',
        desc: 'No CLI clients are currently connected to the gateway.',
      },
      modal: {
        title: 'Confirm Disconnect',
        desc: 'Are you sure you want to terminate tunnel',
        warning: 'The CLI client WebSocket / QUIC session will be severed immediately.',
        confirm: 'Yes, Disconnect',
        cancel: 'Cancel',
      },
      toast: {
        killSuccess: 'Tunnel disconnected successfully.',
      },
    },
    errors: {
      errUnauthorized: 'Unauthorized or session has expired.',
      errInvalidPassword: 'Invalid administrator password.',
      errTunnelNotFound: 'Tunnel not found or already disconnected.',
      errInvalidSubdomain: 'Invalid subdomain parameter.',
      errNetworkError: 'Failed to connect to gateway server.',
    },
    footer: {
      sub: 'Autonomous reverse tunneling system for the 7u.pl ecosystem.',
      edge: '🇩🇪 Edge Node: vps-5378edda',
      license: 'MIT License • Author: gkucmierz',
    },
  },
};

export function t(path) {
  const keys = path.split('.');
  let obj = messages[currentLang.value];
  for (const k of keys) {
    if (!obj || obj[k] === undefined) {
      // Fallback to PL
      let fallback = messages.pl;
      for (const fk of keys) {
        if (!fallback || fallback[fk] === undefined) return path;
        fallback = fallback[fk];
      }
      return fallback;
    }
    obj = obj[k];
  }
  return obj;
}
