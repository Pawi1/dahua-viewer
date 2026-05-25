# Dahua NVR Web Viewer — CLAUDE.md

## Projekt

Node.js/Express serwer webowy do przeglądania nagrań z rejestratorów Dahua przez przeglądarkę (bez wtyczek). Konwertuje RTSP → HLS przez FFmpeg i serwuje fragmenty HLS do odtwarzacza w przeglądarce.

## Stack

- **Runtime**: Node.js >= 16
- **Framework**: Express 4
- **HTTP do NVR**: axios z Digest Auth
- **Streaming**: FFmpeg (RTSP → HLS), wymagany w systemie (`apt install ffmpeg`)
- **Bez bazy danych**: stan trzymany w pamięci (`Map`), restart kasuje streamy i share-linki

## Uruchamianie

```bash
npm install
NVR_HOST=192.168.1.108 NVR_USER=admin NVR_PASS=haslo node server.js
# dev:
npm run dev   # nodemon
```

Zmienne środowiskowe: `NVR_HOST`, `NVR_PORT` (80), `NVR_USER`, `NVR_PASS`, `NVR_RTSP_PORT` (554), `NVR_CHANNELS` (16), `PORT` (3000), `HLS_TTL_MIN` (60), `SHARE_TTL_H` (72), `HLS_DIR` (/tmp/dahua_hls), `SECRET_KEY`.

## Architektura — server.js

| Sekcja | Opis |
|--------|------|
| `dApi` | axios instance z Digest Auth do NVR (`http://NVR_HOST:NVR_PORT`) |
| `activeStreams` | `Map<token, {ffmpeg, hlsPath, ...}>` — aktywne procesy FFmpeg |
| `sharedLinks` | `Map<token, {channel, times, expiresAt}>` — linki share z TTL |
| GC interval | co 5 min zabija stare streamy i usuwa wygasłe share-linki |

## Endpointy własne

| Metoda | URL | Opis |
|--------|-----|------|
| POST | `/api/search` | body: `{channel, startTime, endTime, types?}` → lista nagrań |
| POST | `/api/stream/start` | body: `{channel, startTime, endTime}` lub `{filePath}` → `{token, streamUrl}` |
| POST | `/api/stream/stop` | body: `{token}` |
| GET | `/hls/:token/:file` | serwowanie segmentów HLS |
| GET | `/api/download` | query: `channel+startTime+endTime` lub `filePath` → plik .dav |
| POST | `/api/share` | generuje link z TTL |
| GET | `/share/:token` | redirect do `/?ch=...` |
| GET | `/api/nvr/info` | info o rejestratorze |
| GET | `/api/nvr/channels` | liczba kanałów |
| GET | `/api/streams` | debug: lista aktywnych streamów |

## Dahua HTTP API V3.98 — podstawy

### Uwierzytelnianie

**Digest Auth** (RFC 7616, MD5). Axios obsługuje to automatycznie przez `auth: {username, password}`. Ręcznie: pierwsze żądanie zwraca 401 z `WWW-Authenticate: Digest realm=..., nonce=...`, potem klient liczy `HA1=MD5(user:realm:pass)`, `HA2=MD5(method:uri)`, `response=MD5(HA1:nonce:nc:cnonce:qop:HA2)`.

Błędna autoryzacja → **403** (nie 401).

### Formaty protokołu

**key=value** — URL: `<protocol>://<server>/cgi-bin/*.cgi?action=xxx&param=val`  
Odpowiedź: `text/plain`, linie `klucz=wartość` lub samo `OK`.

**JSON** — URL: `<protocol>://<server>/cgi-bin/api/...`  
Body: JSON. Błąd: `{"ErrorCode": 10086, "ErrorMsg": "..."}`.

### Konwencja kanałów

Żądanie: `channel` startuje od **1**. Odpowiedź: channel startuje od **0** (request channel 1 = response channel 0).

### Kody HTTP

| Kod | Znaczenie |
|-----|-----------|
| 200 | OK — dane w body |
| 400 | Bad Request — błędna składnia |
| 401 | Unauthorized — brak/przeterminowany nonce |
| 403 | Forbidden — zła autoryzacja lub brak uprawnień |
| 404 | Not Found |
| 500 | Internal Server Error |
| 501 | Not Implemented |

### Kluczowe endpointy Dahua (używane w projekcie)

#### Wyszukiwanie nagrań (mediaFileFind) — key=value

```
# 1. Utwórz obiekt
GET /cgi-bin/mediaFileFind.cgi?action=factory.create
→ result=<objectId>

# 2. Ustaw kryteria
GET /cgi-bin/mediaFileFind.cgi?action=findFile&object=<id>
    &condition.Channel=<ch>&condition.StartTime=<t>&condition.EndTime=<t>
    &condition.Types[0]=dav&condition.Types[1]=mp4

# 3. Pobierz wyniki (max count=100 — limit API)
GET /cgi-bin/mediaFileFind.cgi?action=findNextFile&object=<id>&count=100
→ found=N, items[i].StartTime=..., items[i].EndTime=..., items[i].FilePath=...

# 4. Zamknij (zawsze!)
GET /cgi-bin/mediaFileFind.cgi?action=close&object=<id>
GET /cgi-bin/mediaFileFind.cgi?action=destroy&object=<id>
```

#### RTSP streaming

```
# Live
rtsp://<user>:<pass>@<host>:554/cam/realmonitor?channel=<ch>&subtype=<0|1|2>

# Playback
rtsp://<user>:<pass>@<host>:554/cam/playback?channel=<ch>&starttime=<t>&endtime=<t>
# Format czasu: 2025_01_15_08_00_00 (podkreślniki zamiast -, spacji, :)

# Plik po ścieżce
rtsp://<user>:<pass>@<host>:554<filePath>
```

subtype: `0` = main stream, `1` = sub stream 1, `2` = sub stream 2.

#### Pobieranie pliku

```
# Plik po ścieżce
GET /cgi-bin/RPC_Loadfile<filePath>

# Przedział czasu
GET /cgi-bin/loadfile.cgi?action=startLoad&channel=<ch>
    &startTime=<t>&endTime=<t>&subtype=0&Types=dav
```

#### Info systemowe (magicBox) — key=value

```
GET /cgi-bin/magicBox.cgi?action=getSystemInfo
GET /cgi-bin/magicBox.cgi?action=getDeviceType
GET /cgi-bin/magicBox.cgi?action=getHardwareVersion
GET /cgi-bin/magicBox.cgi?action=getSerialNo
GET /cgi-bin/magicBox.cgi?action=getSoftwareVersion
```

#### Liczba kanałów

```
GET /cgi-bin/devVideoInput.cgi?action=getCollect
→ count=N
```

#### Snapshot

```
GET /cgi-bin/snapshot.cgi?channel=<ch>
→ binarny JPEG
```

#### Subskrypcja eventów (EventManager) — JSON

```
POST /cgi-bin/eventManager.cgi?action=attach&codes=[All]
→ multipart/x-mixed-replace, kolejne części z eventami JSON
```

#### ConfigManager — key=value

```
GET /cgi-bin/configManager.cgi?action=getConfig&name=<ConfigName>
GET /cgi-bin/configManager.cgi?action=setConfig&<ConfigName>.<param>=<val>
```

### Pełna dokumentacja

PDF: `/mnt/mcp/claude/dahua/DAHUA_HTTP_API_V3.98_506171777799197.pdf` (1084 stron)

Rozdziały:
- **4** — General APIs: RTSP, ConfigManager, Audio, Snapshot, Video, System, Users, Network, Events, Record, Log, Upgrader
- **5** — Camera APIs: Image, Exposure, Backlight, White Balance, Day-Night, Zoom/Focus, Lighting
- **6** — Storage APIs: Disks, NAS, SD Card, AcuPick, Burner
- **7** — Display APIs: GUI, Split Screen, Monitor Tour
- **8** — Comm APIs: PTZ, Wiper, Illuminator, SCADA, Gyro
- **9** — Video Analyse APIs: Events (CrossLine, FaceRecognition, People Counting, Heat Map, SMD...)
- **10** — Intelligent Traffic APIs: ANPR, Traffic Flow, Parking
- **11** — Thermography & Radiometry
- **12** — Access Control APIs
- **13** — Intelligent Building APIs: Video Talk, SIP, Elevator
- **14** — DVR APIs
- **15** — Other: GPS, Lens, FishEye, Radar, Water Quality, IoT

## Wzorce w kodzie

### parseKeyValue(text)
Parser odpowiedzi `text/plain` key=value. Używany dla większości CGI endpoints.

### parseMediaFiles(text)
Parser odpowiedzi `mediaFileFind.findNextFile` — wyciąga tablicę `items[i].*`.

### toRtspTime(str)
Konwertuje `"2025-01-15 08:00:00"` → `"2025_01_15_08_00_00"` (format RTSP Dahua).

### Bezpieczeństwo
- Path traversal guard w `/hls/:token/:file` — token tylko `[a-f0-9]+`, plik `[\w.-]+`
- Pobieranie: `safePath = fp.replace(/\.\./g, '')`

## Znane ograniczenia

- Stan tylko w RAM — restart kasuje wszystkie streamy i share-linki
- Brak własnego auth — wymaga reverse proxy (nginx + Basic Auth) lub VPN w produkcji
- FFmpeg musi być zainstalowany systemowo
- `.dav` nie odtworzy się w przeglądarce — użyj SmartPlayer lub VLC
