const { app, BrowserWindow, session, shell } = require("electron");

const APP_URL = "https://glimpsechat.com";
const APP_ORIGIN = new URL(APP_URL).origin;

function isAppUrl(rawUrl) {
  try {
    return new URL(rawUrl).origin === APP_ORIGIN;
  } catch {
    return false;
  }
}

function openExternal(rawUrl) {
  if (/^https?:\/\//i.test(rawUrl)) {
    void shell.openExternal(rawUrl);
  }
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 360,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: "#f6fbfa",
    title: "Glimpse Chat",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  });

  window.once("ready-to-show", () => window.show());

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isAppUrl(url)) {
      void window.loadURL(url);
    } else {
      openExternal(url);
    }
    return { action: "deny" };
  });

  window.webContents.on("will-navigate", (event, url) => {
    if (!isAppUrl(url)) {
      event.preventDefault();
      openExternal(url);
    }
  });

  void window.loadURL(APP_URL);
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const existingWindow = BrowserWindow.getAllWindows()[0];
    if (existingWindow) {
      if (existingWindow.isMinimized()) existingWindow.restore();
      existingWindow.focus();
    }
  });

  app.whenReady().then(() => {
    const allowedPermissions = new Set(["media", "notifications"]);

    session.defaultSession.setPermissionCheckHandler(
      (_webContents, permission, requestingOrigin) =>
        isAppUrl(requestingOrigin) && allowedPermissions.has(permission)
    );

    session.defaultSession.setPermissionRequestHandler(
      (webContents, permission, callback) => {
        callback(
          isAppUrl(webContents.getURL()) &&
            allowedPermissions.has(permission)
        );
      }
    );

    createWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}
