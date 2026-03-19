# SD Backup Pro

Automatische Datensicherung von SD- und CFexpress-Karten auf macOS und Windows.

## Features

- **Auto-Erkennung** von SD/CFexpress-Karten beim Einstecken
- **Automatisches Backup** bei aktiviertem Auto-Modus
- **Datumsbasierter Zielordner** (z.B. `2024-03-19/`)
- **Duplikat-Erkennung** – bereits gesicherte Dateien werden übersprungen
- **Informationsfenster** öffnet Finder/Explorer-Infofenster für Quelle & Ziel zum Vergleich
- **Unterstützte Formate:** MP4, MOV, MXF, R3D, BRAW, ARW, CR3, NEF, DNG, RAW, JPG, HEIC uvm.

## Installation & Start

### Voraussetzungen
- [Node.js](https://nodejs.org) (v18 oder neuer)
- npm

### Einrichten

```bash
# Im Projektordner:
npm install

# App starten (Entwicklungsmodus):
npm start
```

### App bauen (als .dmg / .exe)

```bash
# macOS:
npm run build:mac

# Windows:
npm run build:win

# Beide Plattformen:
npm run build
```

Die fertige App findet sich im `dist/` Ordner.

## Bedienung

1. **App starten** → SD/CFexpress-Karte einlegen
2. Karte in der linken Spalte **auswählen** (oder Auto-Modus aktivieren)
3. **Zielordner auf der SSD** auswählen (einmalig)
4. **"Backup starten"** klicken
5. Nach dem Backup: **"Infofenster öffnen"** → Finder/Explorer zeigt Größen von Quelle & Ziel zum Vergleich

### Auto-Modus
Schalte den Auto-Modus ein: sobald eine Karte eingesteckt wird, startet das Backup automatisch – kein Klick nötig.

## Ordnerstruktur auf der SSD

```
/Dein-SSD-Pfad/
  2024-03-19/
    A001C001_240319_R1AB.MP4
    A001C002_240319_R1AB.MP4
    ...
  2024-03-20/
    ...
```

## Unterstützte Dateiformate

**Video:** MP4, MOV, MXF, R3D, BRAW, ARI, MTS, M2TS, AVI, MKV, CINE  
**Foto:** ARW, CR2, CR3, NEF, DNG, RAF, RAW, RW2, ORF, JPG, JPEG, PNG, HEIC, TIFF  
**Audio:** WAV, AIFF, MP3

## Systemanforderungen

- **macOS:** 10.15 (Catalina) oder neuer
- **Windows:** Windows 10 / 11
