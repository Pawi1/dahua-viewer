# Dahua NVR Web Viewer

Aplikacja webowa do przeglądania i udostępniania nagrań z rejestratorów Dahua
przez przeglądarkę. Żadnych wtyczek, żadnego ActiveX — czyste HLS w przeglądarce.

## Funkcje

- **Wyszukiwanie nagrań** po kanale i przedziale czasu (mediaFileFind API)
- **Odtwarzanie** w przeglądarce przez konwersję RTSP → HLS (FFmpeg)
- **Pobieranie** pliku .dav bezpośrednio z rejestratora
- **Linki share** z terminem ważności — wyślij klientowi link bez dostępu do systemu

## Wymagania

- **Node.js** >= 16 (`node --version`)
- **FFmpeg** zainstalowany w systemie
- Dostęp sieciowy do rejestratora Dahua (HTTP port 80 + RTSP port 554)

## Instalacja

```bash
# 1. Zainstaluj FFmpeg
sudo apt update && sudo apt install -y ffmpeg     # Ubuntu/Debian
# lub:
# brew install ffmpeg                              # macOS

# 2. Zainstaluj zależności Node.js
npm install

# 3. Uruchom (podstawowe)
NVR_HOST=192.168.1.108 NVR_USER=admin NVR_PASS=TwojeHaslo node server.js

# 4. Otwórz przeglądarkę
http://localhost:3000
```

## Konfiguracja przez zmienne środowiskowe

| Zmienna        | Domyślnie      | Opis                              |
|----------------|----------------|-----------------------------------|
| `NVR_HOST`     | 192.168.1.108  | IP rejestratora Dahua             |
| `NVR_PORT`     | 80             | Port HTTP rejestratora            |
| `NVR_USER`     | admin          | Użytkownik                        |
| `NVR_PASS`     | admin          | Hasło                             |
| `NVR_RTSP_PORT`| 554            | Port RTSP                         |
| `NVR_CHANNELS` | 16             | Liczba kanałów wideo              |
| `PORT`         | 3000           | Port serwera webowego             |
| `HLS_TTL_MIN`  | 60             | Max czas życia strumienia [min]   |
| `SHARE_TTL_H`  | 72             | Domyślny czas ważności linku [h]  |
| `HLS_DIR`      | /tmp/dahua_hls | Katalog na pliki HLS              |

## Plik .env (opcjonalnie)

Utwórz plik `.env` w katalogu aplikacji:

```env
NVR_HOST=192.168.1.108
NVR_PORT=80
NVR_USER=admin
NVR_PASS=TwojeHaslo
NVR_RTSP_PORT=554
NVR_CHANNELS=16
PORT=3000
SHARE_TTL_H=72
```

I uruchom z: `node -r dotenv/config server.js` (po `npm install dotenv`)

## Jako usługa systemd

```ini
# /etc/systemd/system/dahua-viewer.service
[Unit]
Description=Dahua NVR Web Viewer
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/dahua-viewer
Environment="NVR_HOST=192.168.1.108"
Environment="NVR_USER=admin"
Environment="NVR_PASS=TwojeHaslo"
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable dahua-viewer
sudo systemctl start dahua-viewer
sudo systemctl status dahua-viewer
```

## Endpointy API

| Metoda | URL                          | Opis                              |
|--------|------------------------------|-----------------------------------|
| POST   | `/api/search`                | Wyszukaj nagrania                 |
| POST   | `/api/stream/start`          | Uruchom stream HLS                |
| POST   | `/api/stream/stop`           | Zatrzymaj stream                  |
| GET    | `/hls/:token/:file`          | Serwowanie segmentów HLS          |
| GET    | `/api/download`              | Pobierz plik .dav                 |
| POST   | `/api/share`                 | Generuj link z TTL                |
| GET    | `/share/:token`              | Otwórz nagranie przez link share  |
| GET    | `/api/nvr/info`              | Info o rejestratorze              |
| GET    | `/api/streams`               | Lista aktywnych streamów          |

## Uwagi techniczne

- Pliki HLS tworzone są w `/tmp/dahua_hls/<token>/`
- Stare streamy są czyszczone automatycznie po `HLS_TTL_MIN` minutach
- Linki share są przechowywane w pamięci — restart serwera usuwa je
- Do produkcji zamiast pamięci RAM użyj Redis (łatwa podmiana w `server.js`)
- Format pliku Dahua `.dav` można odtworzyć w SmartPlayer lub VLC

## Bezpieczeństwo

> **Uwaga**: Ta aplikacja nie ma własnego systemu uwierzytelniania.  
> W środowisku produkcyjnym zabezpiecz ją przez:
> - Reverse proxy (nginx) z Basic Auth lub SSO
> - VPN (dostęp tylko z sieci wewnętrznej)
> - Firewall blokujący dostęp do portu z zewnątrz

## Troubleshooting

**„Nie można połączyć z rejestratorem"**  
→ Sprawdź czy `NVR_HOST` jest poprawny i port 80/554 jest dostępny  
→ `curl -u admin:haslo http://192.168.1.108/cgi-bin/magicBox.cgi?action=getSystemInfo`

**„Brak nagrań w podanym przedziale"**  
→ Sprawdź czy nagrywanie jest aktywne na kanale  
→ Upewnij się że dysk rejestratora nie jest pełny

**Strumień nie startuje / timeout**  
→ Sprawdź czy FFmpeg jest zainstalowany: `ffmpeg -version`  
→ Testuj RTSP ręcznie: `ffplay "rtsp://admin:haslo@192.168.1.108:554/cam/playback?channel=1&starttime=..."`

**Plik .dav nie odtwarza się w przeglądarce po pobraniu**  
→ Użyj SmartPlayer (Dahua) lub VLC; .dav to format proprietary Dahua
