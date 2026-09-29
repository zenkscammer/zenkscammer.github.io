const CLICK_PROPERTY_PREFIX = "download_click_";
const FEEDBACK_PROPERTY_PREFIX = "user_feedback_";
const RETENTION_DAYS = 30;
const MAX_STORED_CLICKS = 1000;
const MAX_STORED_FEEDBACK = 300;
const MAX_FEEDBACK_LENGTH = 500;

function doPost(event) {
  if (!event || !event.postData || !event.postData.contents) {
    throw new Error("doPost menerima POST dari web app. Untuk tes manual, jalankan testDoPost.");
  }

  const payload = JSON.parse(event.postData.contents || "{}");
  if (payload.type === "feedback") return saveFeedback(payload);
  if (payload.type !== "click") throw new Error("Unsupported request type.");

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

function saveFeedback(payload) {
  const rating = Number(payload.rating);
  const comment = String(payload.comment || "").trim();

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw new Error("Penilaian harus antara 1 dan 5 bintang.");
  }
  if (!comment || comment.length > MAX_FEEDBACK_LENGTH) {
    throw new Error("Komentar wajib diisi dan maksimal 500 karakter.");
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(5000);
  try {
    const properties = PropertiesService.getScriptProperties();
    const now = Date.now();
    const feedbackKeys = pruneOldFeedback(properties, now);
    while (feedbackKeys.length >= MAX_STORED_FEEDBACK) {
      properties.deleteProperty(feedbackKeys.shift());
    }

    const feedbackKey = FEEDBACK_PROPERTY_PREFIX + now + "_" + Utilities.getUuid();
    properties.setProperty(feedbackKey, JSON.stringify({
      rating: rating,
      comment: comment,
      submittedAt: new Date(now).toISOString()
    }));
  } finally {
    lock.releaseLock();
  }

  return ContentService.createTextOutput("OK");
}

function getRecentFeedback() {
  const lock = LockService.getScriptLock();
  lock.waitLock(5000);
  try {
    const properties = PropertiesService.getScriptProperties();
    const feedbackKeys = pruneOldFeedback(properties, Date.now());
    const feedback = feedbackKeys.map(function (key) {
      return JSON.parse(properties.getProperty(key));
    });
    Logger.log(JSON.stringify(feedback, null, 2));
    return feedback;
  } finally {
    lock.releaseLock();
  }
}

function pruneOldFeedback(properties, now) {
  const cutoff = now - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const allProperties = properties.getProperties();
  const feedbackKeys = Object.keys(allProperties).filter(function (key) {
    return key.indexOf(FEEDBACK_PROPERTY_PREFIX) === 0;
  });

  const retainedKeys = [];
  feedbackKeys.forEach(function (key) {
    const timestamp = Number(key.slice(FEEDBACK_PROPERTY_PREFIX.length).split("_")[0]);
    if (!Number.isFinite(timestamp) || timestamp < cutoff) {
      properties.deleteProperty(key);
    } else {
      retainedKeys.push(key);
    }
  });

  return retainedKeys.sort(function (left, right) {
    return Number(left.slice(FEEDBACK_PROPERTY_PREFIX.length).split("_")[0]) -
      Number(right.slice(FEEDBACK_PROPERTY_PREFIX.length).split("_")[0]);
  });
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
      const record = JSON.parse(allProperties[key]);
      if (record.name) {
        properties.setProperty(key, JSON.stringify({
          clickedAt: record.clickedAt || new Date(timestamp).toISOString()
        }));
      }
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
      contents: JSON.stringify({ type: "click" })
    }
  });
}

function testFeedback() {
  return saveFeedback({
    rating: 5,
    comment: "Tes feedback - hapus setelah tes"
  });
}
