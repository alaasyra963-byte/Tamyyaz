import { githubConfig } from "./config.js";
import { formatBytes, formatDate } from "../js/format.js";

const API_BASE = "https://api.github.com";
const TOKEN_KEY = "tamyyaz_admin_token";
const repoFullName = `${githubConfig.owner}/${githubConfig.repo}`;

const loginView = document.getElementById("login-view");
const dashboardView = document.getElementById("dashboard-view");
const loginForm = document.getElementById("login-form");
const loginError = document.getElementById("login-error");
const rememberCheckbox = document.getElementById("remember-token");
const logoutBtn = document.getElementById("logout-btn");
const repoHint = document.getElementById("repo-hint");
const repoLabel = document.getElementById("repo-label");
const uploadForm = document.getElementById("upload-form");
const uploadBtn = document.getElementById("upload-btn");
const uploadProgress = document.getElementById("upload-progress");
const progressBar = uploadProgress.querySelector(".progress-bar");
const uploadStatus = document.getElementById("upload-status");
const releaseTbody = document.querySelector("#admin-release-list tbody");

repoHint.textContent = repoFullName;
repoLabel.textContent = repoFullName;

function getToken() {
  return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY);
}

function setToken(token, remember) {
  if (remember) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    sessionStorage.setItem(TOKEN_KEY, token);
  }
}

function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
}

function ghHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

async function verifyToken(token) {
  const res = await fetch(`${API_BASE}/repos/${repoFullName}`, {
    headers: ghHeaders(token),
  });
  if (!res.ok) throw new Error("invalid-token-or-repo");
  const data = await res.json();
  if (!data.permissions || !data.permissions.push) throw new Error("no-write-access");
}

function showLogin() {
  loginView.hidden = false;
  dashboardView.hidden = true;
}

function showDashboard() {
  loginView.hidden = true;
  dashboardView.hidden = false;
  loadReleases();
}

async function init() {
  const token = getToken();
  if (!token) {
    showLogin();
    return;
  }
  try {
    await verifyToken(token);
    showDashboard();
  } catch {
    clearToken();
    showLogin();
  }
}

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  loginError.hidden = true;
  const token = document.getElementById("token-input").value.trim();
  if (!token) return;
  try {
    await verifyToken(token);
    setToken(token, rememberCheckbox.checked);
    loginForm.reset();
    showDashboard();
  } catch (err) {
    loginError.textContent = "التوكن غير صالح أو لا يملك صلاحية الكتابة على هذا المستودع.";
    loginError.hidden = false;
  }
});

logoutBtn.addEventListener("click", () => {
  clearToken();
  showLogin();
});

// --- releases.json manifest helpers (committed straight to the repo) ---

function decodeBase64(b64) {
  const binary = atob(b64.replace(/\n/g, ""));
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder("utf-8").decode(bytes);
}

function encodeBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary);
}

async function fetchManifest() {
  const res = await fetch(`${API_BASE}/repos/${repoFullName}/contents/releases.json`, {
    headers: ghHeaders(getToken()),
    cache: "no-store",
  });
  if (res.status === 404) return { sha: null, releases: [] };
  if (!res.ok) throw new Error("تعذّر قراءة releases.json من المستودع.");
  const data = await res.json();
  return { sha: data.sha, releases: JSON.parse(decodeBase64(data.content)) };
}

async function writeManifest(releases, sha, message) {
  const res = await fetch(`${API_BASE}/repos/${repoFullName}/contents/releases.json`, {
    method: "PUT",
    headers: { ...ghHeaders(getToken()), "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      content: encodeBase64(JSON.stringify(releases, null, 2)),
      sha: sha || undefined,
    }),
  });
  if (!res.ok) throw new Error("تعذّر تحديث releases.json.");
}

// --- upload (create GitHub Release + attach the APK + update manifest) ---

function uploadAssetWithProgress(uploadUrl, file, token, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", uploadUrl);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.setRequestHeader("Accept", "application/vnd.github+json");
    xhr.setRequestHeader("X-GitHub-Api-Version", "2022-11-28");
    xhr.setRequestHeader("Content-Type", "application/vnd.android.package-archive");
    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) onProgress((e.loaded / e.total) * 100);
    });
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText));
      } else {
        reject(new Error("فشل رفع ملف APK."));
      }
    };
    xhr.onerror = () => reject(new Error("فشل رفع ملف APK — تحقق من الاتصال."));
    xhr.send(file);
  });
}

uploadForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const fileInput = document.getElementById("apk-file");
  const version = document.getElementById("version-input").value.trim();
  const notes = document.getElementById("notes-input").value.trim();
  const file = fileInput.files[0];
  const token = getToken();

  if (!file) return;
  if (!file.name.toLowerCase().endsWith(".apk")) {
    showUploadStatus("الملف يجب أن يكون بصيغة APK.", false);
    return;
  }

  uploadBtn.disabled = true;
  uploadProgress.hidden = false;
  progressBar.style.width = "0%";
  showUploadStatus("جارٍ إنشاء الإصدار على GitHub...", null);

  try {
    const releaseRes = await fetch(`${API_BASE}/repos/${repoFullName}/releases`, {
      method: "POST",
      headers: { ...ghHeaders(token), "Content-Type": "application/json" },
      body: JSON.stringify({
        tag_name: `v${version}`,
        name: version,
        body: notes || undefined,
      }),
    });
    if (!releaseRes.ok) {
      const errBody = await releaseRes.json().catch(() => ({}));
      throw new Error(
        errBody.errors?.[0]?.code === "already_exists"
          ? "رقم الإصدار هذا منشور مسبقاً — استخدم رقماً جديداً."
          : errBody.message || "فشل إنشاء الإصدار على GitHub."
      );
    }
    const release = await releaseRes.json();

    showUploadStatus("جارٍ رفع ملف APK...", null);
    const uploadUrl = release.upload_url.replace("{?name,label}", `?name=${encodeURIComponent(file.name)}`);
    const asset = await uploadAssetWithProgress(uploadUrl, file, token, (pct) => {
      progressBar.style.width = `${pct}%`;
    });

    showUploadStatus("جارٍ تحديث قائمة الإصدارات...", null);
    const { sha, releases } = await fetchManifest();
    releases.unshift({
      version,
      notes,
      fileName: file.name,
      sizeBytes: file.size,
      uploadedAt: new Date().toISOString(),
      downloadUrl: asset.browser_download_url,
      releaseId: release.id,
      tag: release.tag_name,
    });
    await writeManifest(releases, sha, `Publish release ${version}`);

    showUploadStatus("تم نشر الإصدار بنجاح.", true);
    uploadForm.reset();
    uploadProgress.hidden = true;
    loadReleases();
  } catch (err) {
    console.error(err);
    showUploadStatus(err.message || "حدث خطأ أثناء النشر.", false);
  } finally {
    uploadBtn.disabled = false;
  }
});

function showUploadStatus(text, success) {
  uploadStatus.hidden = false;
  uploadStatus.textContent = text;
  uploadStatus.className =
    success === true ? "status-text success" : success === false ? "status-text error-text" : "status-text";
}

// --- list + delete ---

async function loadReleases() {
  const { releases } = await fetchManifest();
  releaseTbody.replaceChildren(...releases.map(buildAdminRow));
}

function buildAdminRow(release) {
  const tr = document.createElement("tr");

  const versionTd = document.createElement("td");
  versionTd.textContent = release.version;

  const dateTd = document.createElement("td");
  dateTd.textContent = formatDate(release.uploadedAt);

  const sizeTd = document.createElement("td");
  sizeTd.textContent = formatBytes(release.sizeBytes);

  const actionTd = document.createElement("td");
  const delBtn = document.createElement("button");
  delBtn.textContent = "حذف";
  delBtn.className = "delete-btn";
  delBtn.addEventListener("click", () => deleteRelease(release));
  actionTd.appendChild(delBtn);

  tr.append(versionTd, dateTd, sizeTd, actionTd);
  return tr;
}

async function deleteRelease(release) {
  if (!confirm(`حذف الإصدار ${release.version}؟ لا يمكن التراجع عن هذا الإجراء.`)) return;
  const token = getToken();
  try {
    if (release.releaseId) {
      await fetch(`${API_BASE}/repos/${repoFullName}/releases/${release.releaseId}`, {
        method: "DELETE",
        headers: ghHeaders(token),
      });
    }
    if (release.tag) {
      await fetch(`${API_BASE}/repos/${repoFullName}/git/refs/tags/${release.tag}`, {
        method: "DELETE",
        headers: ghHeaders(token),
      }).catch(() => {});
    }
    const { sha, releases } = await fetchManifest();
    const updated = releases.filter((r) => r.releaseId !== release.releaseId);
    await writeManifest(updated, sha, `Remove release ${release.version}`);
    loadReleases();
  } catch (err) {
    console.error(err);
    alert("تعذّر حذف الإصدار بالكامل — تحقق من GitHub يدوياً.");
  }
}

init();
