const { app, BrowserWindow, ipcMain, dialog, shell, Notification } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

let mainWindow;
let watchInterval = null;
let knownDrives = new Set();
let cancelBackup = false;

// ──────────────────────────────────────────────
// Window erstellen
// ──────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 820,
    height: 620,
    minWidth: 720,
    minHeight: 520,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    backgroundColor: '#0d0f14',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    icon: path.join(__dirname, '../assets/icon.png'),
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  mainWindow.on('closed', () => {
    stopWatcher();
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ──────────────────────────────────────────────
// Hilfsfunktionen
// ──────────────────────────────────────────────

function getTodayFolder() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function getMediaExtensions() {
  return [
    // Video — Cinema & Professional
    '.mp4', '.mov', '.mxf', '.avi', '.mkv', '.wmv',
    '.m4v', '.mpg', '.mpeg', '.m2v', '.ts', '.mts', '.m2ts',
    // RED
    '.r3d',
    // Blackmagic
    '.braw',
    // ARRI
    '.ari', '.arx', '.mxf',
    // Canon
    '.crm',                          // Canon RAW Movie (Cinema EOS)
    // Sony
    '.mxf', '.mp4',
    // Insta360
    '.insv', '.insp',
    // GoPro
    '.lrv', '.thm',
    // Andere Cinema/Log Formate
    '.cine', '.cin', '.dpx', '.exr',
    '.webm', '.ogv', '.flv', '.f4v',
    // Foto — Canon
    '.cr2', '.cr3', '.crw',
    // Foto — Sony
    '.arw', '.srf', '.sr2',
    // Foto — Nikon
    '.nef', '.nrw',
    // Foto — Fujifilm
    '.raf',
    // Foto — Panasonic
    '.rw2',
    // Foto — Olympus / OM System
    '.orf', '.ori',
    // Foto — Leica / Hasselblad / Phase One
    '.rwl', '.3fr', '.fff', '.iiq',
    // Foto — DJI / Drone
    '.dng',
    // Foto — Universal RAW
    '.raw', '.nef', '.pef', '.srw', '.x3f',
    // Foto — Standard
    '.jpg', '.jpeg', '.png', '.heic', '.heif',
    '.tiff', '.tif', '.bmp', '.webp',
    // Foto — Insta360
    '.insp',
    // Audio
    '.wav', '.aiff', '.aif', '.mp3', '.aac',
    '.flac', '.ogg', '.m4a', '.opus',
    // Projektdateien / Sidecar (optional aber üblich)
    '.xml', '.srt', '.lut', '.cube',
  ].filter((v, i, a) => a.indexOf(v) === i); // Duplikate entfernen
}

// Alle verbundenen Wechselmedien ermitteln
function getRemovableVolumes() {
  const platform = process.platform;
  const volumes = [];

  try {
    if (platform === 'darwin') {
      const volumesDir = '/Volumes';
      if (fs.existsSync(volumesDir)) {
        const entries = fs.readdirSync(volumesDir);
        for (const entry of entries) {
          const fullPath = path.join(volumesDir, entry);
          try {
            const stat = fs.statSync(fullPath);
            if (stat.isDirectory() && entry !== 'Macintosh HD') {
              volumes.push({ name: entry, mountPath: fullPath });
            }
          } catch (e) {}
        }
      }
    } else if (platform === 'win32') {
      // Windows: Laufwerksbuchstaben A-Z prüfen
      for (let i = 65; i <= 90; i++) {
        const letter = String.fromCharCode(i);
        const drivePath = `${letter}:\\`;
        try {
          fs.accessSync(drivePath);
          if (letter !== 'C') { // C ausschließen
            volumes.push({ name: `${letter}:`, mountPath: drivePath });
          }
        } catch (e) {}
      }
    }
  } catch (e) {
    console.error('Fehler beim Ermitteln der Volumes:', e);
  }

  return volumes;
}

// Dateigröße eines Ordners rekursiv berechnen
// mediaOnly=true zählt nur Mediendateien (gleiche Liste wie beim Kopieren)
function getFolderSize(folderPath, mediaOnly = false) {
  let totalSize = 0;
  let fileCount = 0;
  const extensions = mediaOnly ? getMediaExtensions() : null;

  function walk(dirPath) {
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue;
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath);
        } else if (entry.isFile()) {
          if (mediaOnly) {
            const ext = path.extname(entry.name).toLowerCase();
            if (!extensions.includes(ext)) continue;
          }
          try {
            const stat = fs.statSync(fullPath);
            totalSize += stat.size;
            fileCount++;
          } catch (e) {}
        }
      }
    } catch (e) {}
  }

  walk(folderPath);
  return { totalSize, fileCount };
}

// Mediendateien auf einem Volume suchen — mit relativem Pfad fuer 1:1-Spiegelung
function findMediaFiles(volumePath) {
  const extensions = getMediaExtensions();
  const files = [];

  function walk(dirPath, depth = 0) {
    if (depth > 8) return;
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue;
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath, depth + 1);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (extensions.includes(ext)) {
            const stat = fs.statSync(fullPath);
            // Relativer Pfad ab Wurzel der Karte, z.B. "DCIM/A001/clip001.mp4"
            const relativePath = path.relative(volumePath, fullPath);
            files.push({
              src: fullPath,
              name: entry.name,
              relativePath,
              size: stat.size,
              ext,
            });
          }
        }
      }
    } catch (e) {}
  }

  walk(volumePath);
  return files;
}

// Datei kopieren mit Fortschritt
async function copyFileWithProgress(src, dest, onProgress) {
  return new Promise((resolve, reject) => {
    const srcStat = fs.statSync(src);
    const total = srcStat.size;
    let copied = 0;

    const readStream = fs.createReadStream(src, { highWaterMark: 1024 * 1024 });
    const writeStream = fs.createWriteStream(dest);

    readStream.on('data', (chunk) => {
      copied += chunk.length;
      onProgress(copied, total);
    });

    readStream.on('error', reject);
    writeStream.on('error', reject);
    writeStream.on('finish', resolve);

    readStream.pipe(writeStream);
  });
}

// ──────────────────────────────────────────────
// IPC Handler
// ──────────────────────────────────────────────

// Wechselmedien auflisten
ipcMain.handle('get-volumes', () => {
  return getRemovableVolumes();
});

// Zielordner auswählen
ipcMain.handle('select-destination', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Zielordner auf der SSD wählen',
    properties: ['openDirectory', 'createDirectory'],
  });
  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
});

// Nächsten freien nummerierten Ordner ermitteln
// Ergibt: 2024-03-19 → 2024-03-19_2 → 2024-03-19_3 …
function getNextDestFolder(base, today) {
  const first = path.join(base, today);
  if (!fs.existsSync(first)) return { folder: first, index: 1 };

  let i = 2;
  while (true) {
    const candidate = path.join(base, `${today}_${i}`);
    if (!fs.existsSync(candidate)) return { folder: candidate, index: i };
    i++;
  }
}

// Backup starten
ipcMain.handle('start-backup', async (event, { sourceVolume, destinationBase }) => {
  cancelBackup = false;
  const today = getTodayFolder();
  const { folder: destFolder, index: cardIndex } = getNextDestFolder(destinationBase, today);

  // Zielordner erstellen
  fs.mkdirSync(destFolder, { recursive: true });

  // Mediendateien finden
  const files = findMediaFiles(sourceVolume);

  if (files.length === 0) {
    return { success: false, message: 'Keine Mediendateien auf der Karte gefunden.' };
  }

  let copiedCount = 0;
  let copiedBytes = 0;
  const totalBytes = files.reduce((acc, f) => acc + f.size, 0);
  const errors = [];

  for (let i = 0; i < files.length; i++) {
    if (cancelBackup) {
      throw new Error('Backup abgebrochen');
    }
    const file = files[i];
    // 1:1 Spiegelung: relativer Pfad der Karte wird unter destFolder nachgebaut
    const destFilePath = path.join(destFolder, file.relativePath);
    const destDir = path.dirname(destFilePath);

    // Unterordner anlegen falls noetig
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }

    // Duplikat-Check: existiert bereits mit gleicher Groesse?
    if (fs.existsSync(destFilePath)) {
      const existingStat = fs.statSync(destFilePath);
      if (existingStat.size === file.size) {
        copiedCount++;
        copiedBytes += file.size;
        mainWindow?.webContents.send('backup-progress', {
          currentFile: file.relativePath,
          fileIndex: i + 1,
          totalFiles: files.length,
          bytesCopied: copiedBytes,
          totalBytes,
          skipped: true,
        });
        continue;
      }
    }

    try {
      await copyFileWithProgress(file.src, destFilePath, (bytesChunk, fileTotal) => {
        mainWindow?.webContents.send('backup-progress', {
          currentFile: file.relativePath,
          fileIndex: i + 1,
          totalFiles: files.length,
          bytesCopied: copiedBytes + bytesChunk,
          totalBytes,
          skipped: false,
        });
      });
      copiedCount++;
      copiedBytes += file.size;
    } catch (err) {
      errors.push({ file: file.relativePath, error: err.message });
    }
  }

  // Benachrichtigung
  if (Notification.isSupported()) {
    const label = cardIndex > 1 ? `Karte ${cardIndex}` : 'Karte 1';
    new Notification({
      title: 'HotSwap',
      body: `${copiedCount} Dateien gesichert → ${today} (${label})`,
    }).show();
  }

  return {
    success: true,
    copiedCount,
    errorCount: errors.length,
    errors,
    destFolder,
    today,
    cardIndex,
    sourceVolume,
    sourceStats: getFolderSize(sourceVolume),
    destStats: getFolderSize(destFolder),
  };
});

// Beide Ordner im Explorer/Finder öffnen (Quelle + Ziel)
ipcMain.handle('open-info-window', async (event, { sourcePath, destPath }) => {
  try {
    // Quelle: Karte im Explorer/Finder öffnen
    if (sourcePath) {
      await shell.openPath(sourcePath);
    }
    // Ziel: Backup-Ordner öffnen, kurz verzögert damit zwei Fenster erscheinen
    if (destPath) {
      setTimeout(() => {
        shell.openPath(destPath);
      }, 400);
    }
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// Ordner im Finder/Explorer öffnen
ipcMain.handle('reveal-in-explorer', (event, folderPath) => {
  shell.openPath(folderPath);
  return true;
});

// Backup abbrechen
ipcMain.handle('cancel-backup', () => {
  cancelBackup = true;
  return true;
});

// Karte auswerfen
ipcMain.handle('eject-volume', async (event, volumePath) => {
  const { exec } = require('child_process');
  const platform = process.platform;

  return new Promise((resolve) => {
    if (platform === 'darwin') {
      // macOS: diskutil unmount
      exec(`diskutil unmount "${volumePath}"`, (err, stdout, stderr) => {
        if (err) {
          // Fallback: eject
          exec(`diskutil eject "${volumePath}"`, (err2) => {
            if (err2) {
              resolve({ success: false, error: err2.message });
            } else {
              resolve({ success: true });
            }
          });
        } else {
          resolve({ success: true });
        }
      });
    } else if (platform === 'win32') {
      // Windows: mountvol zum sicheren Aushaengen
      const dl = volumePath.slice(0, 2).toUpperCase();
      exec('mountvol ' + dl + ' /p', (err) => {
        if (err) {
          resolve({ success: false, error: err.message });
        } else {
          resolve({ success: true });
        }
      });
    } else {
      resolve({ success: false, error: 'Nicht unterstütztes Betriebssystem' });
    }
  });
});

// Datenmengen-Check: Gesamt + nur Mediendateien
ipcMain.handle('check-sizes', (event, { sourcePath, destPath }) => {
  return {
    source: getFolderSize(sourcePath),
    dest: getFolderSize(destPath),
    sourceMedia: getFolderSize(sourcePath, true),
    destMedia: getFolderSize(destPath, true),
  };
});

// Auto-Watcher: Neue Karten automatisch erkennen
ipcMain.handle('start-watcher', (event, config) => {
  startWatcher(config);
  return true;
});

ipcMain.handle('stop-watcher', () => {
  stopWatcher();
  return true;
});

function startWatcher(config) {
  stopWatcher();
  knownDrives = new Set(getRemovableVolumes().map(v => v.mountPath));

  watchInterval = setInterval(() => {
    const current = getRemovableVolumes();
    const currentPaths = new Set(current.map(v => v.mountPath));

    // Neue Karte erkannt
    for (const vol of current) {
      if (!knownDrives.has(vol.mountPath)) {
        knownDrives.add(vol.mountPath);
        mainWindow?.webContents.send('new-card-detected', {
          name: vol.name,
          mountPath: vol.mountPath,
        });
      }
    }

    // Karte entfernt
    for (const known of knownDrives) {
      if (!currentPaths.has(known)) {
        knownDrives.delete(known);
        mainWindow?.webContents.send('card-removed', { mountPath: known });
      }
    }
  }, 2000);
}

function stopWatcher() {
  if (watchInterval) {
    clearInterval(watchInterval);
    watchInterval = null;
  }
}

// App-Info
ipcMain.handle('get-app-info', () => {
  return {
    platform: process.platform,
    version: app.getVersion(),
    homeDir: os.homedir(),
  };
});
