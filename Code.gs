const CLICK_PROPERTY_PREFIX = "download_click_";
const RETENTION_DAYS = 30;
const MAX_STORED_CLICKS = 1000;

function doPost(event) {
  if (!event || !event.postData || !event.postData.contents) {
    throw new Error("doPost menerima POST dari web app. Untuk tes manual, jalankan testDoPost.");
  }

  const payload = JSON.parse(event.postData.contents || "{}");
  const name = String(payload.name || "").trim();

  if (!name || name.length > 100) {
    throw new Error("Nama wajib diisi dan maksimal 100 karakter.");
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(5000);
  try {
    const properties = PropertiesService.getScriptProperties();
    const now = Date.now();
    const clickKeys = pruneOldClicks(properties, now);
    while (clickKeys.length >= MAX_STORED_CLICKS) {
      properties.deleteProperty(clickKeys.shift());
    }

    const clickKey = CLICK_PROPERTY_PREFIX + now + "_" + Utilities.getUuid();
    properties.setProperty(clickKey, JSON.stringify({
      name: name,
      clickedAt: new Date(now).toISOString()
    }));
  } finally {
    lock.releaseLock();
  }

  return ContentService.createTextOutput("OK");
}

function getRecentClicks() {
  const lock = LockService.getScriptLock();
  lock.waitLock(5000);
  try {
    const properties = PropertiesService.getScriptProperties();
    const clickKeys = pruneOldClicks(properties, Date.now());
    const clicks = clickKeys.map(function (key) {
      return JSON.parse(properties.getProperty(key));
    });
    Logger.log(JSON.stringify(clicks, null, 2));
    return clicks;
  } finally {
    lock.releaseLock();
  }
}

function pruneOldClicks(properties, now) {
  const cutoff = now - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const allProperties = properties.getProperties();
  const clickKeys = Object.keys(allProperties).filter(function (key) {
    return key.indexOf(CLICK_PROPERTY_PREFIX) === 0;
  });

  const retainedKeys = [];
  clickKeys.forEach(function (key) {
    const timestamp = Number(key.slice(CLICK_PROPERTY_PREFIX.length).split("_")[0]);
    if (!Number.isFinite(timestamp) || timestamp < cutoff) {
      properties.deleteProperty(key);
    } else {
      retainedKeys.push(key);
    }
  });

  return retainedKeys.sort(function (left, right) {
    return Number(left.slice(CLICK_PROPERTY_PREFIX.length).split("_")[0]) -
      Number(right.slice(CLICK_PROPERTY_PREFIX.length).split("_")[0]);
  });
}

function testDoPost() {
  return doPost({
    postData: {
      contents: JSON.stringify({ name: "Tes Apps Script - hapus setelah tes" })
    }
  });
}
