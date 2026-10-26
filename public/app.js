// Multimodal Document Intelligence Platform Client Logic

// Auto-detect backend port: Route requests to port 3000 if opened on VS Code Live Server (port 5500)
const API_BASE = (window.location.protocol === 'file:' || (window.location.port && window.location.port !== '3000'))
  ? 'http://localhost:3000'
  : '';

let activeDocuments = [];
let currentSchemaResult = null;
let currentUser = null;
let authToken = localStorage.getItem('docIntelAuthToken') || null;
let isRegisterMode = false;

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  setupNavigation();
  setupUploadDropzone();
  setupEventListeners();
  setupAuth();
});

// --- Tab Navigation ---
function setupNavigation() {
  const tabs = document.querySelectorAll('.nav-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));

      tab.classList.add('active');
      const targetId = tab.getAttribute('data-tab');
      const targetPane = document.getElementById(targetId);
      if (targetPane) {
        targetPane.classList.add('active');
      }
    });
  });
}

function switchTab(tabId) {
  const tabBtn = document.querySelector(`.nav-tab[data-tab="${tabId}"]`);
  if (tabBtn) {
    tabBtn.click();
  }
}

// --- Authentication Flow ---
async function setupAuth() {
  const authForm = document.getElementById('authForm');
  const authSwitchBtn = document.getElementById('authSwitchBtn');
  const fillDemoBtn = document.getElementById('fillDemoCredentialsBtn');
  const signOutBtn = document.getElementById('signOutBtn');
  const workspaceSelect = document.getElementById('authWorkspaceSelect');

  if (workspaceSelect) {
    workspaceSelect.addEventListener('change', () => {
      const highlight = document.getElementById('highlightWorkspaceText');
      if (highlight) {
        highlight.textContent = workspaceSelect.options[workspaceSelect.selectedIndex].text;
      }
    });
  }

  if (authSwitchBtn) {
    authSwitchBtn.addEventListener('click', toggleAuthMode);
  }

  if (fillDemoBtn) {
    fillDemoBtn.addEventListener('click', () => {
      document.getElementById('authUserIdInput').value = 'analyst@enterprise.com';
      document.getElementById('authPasswordInput').value = 'Password123';
      handleAuthSubmit();
    });
  }

  if (authForm) {
    authForm.addEventListener('submit', (e) => {
      e.preventDefault();
      handleAuthSubmit();
    });
  }

  const authSubmitBtn = document.getElementById('authSubmitBtn');
  if (authSubmitBtn) {
    authSubmitBtn.addEventListener('click', handleAuthSubmit);
  }

  if (signOutBtn) {
    signOutBtn.addEventListener('click', handleLogout);
  }

  // Check existing session
  if (authToken) {
    try {
      const res = await fetch(`${API_BASE}/api/auth/me`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.user) {
          setAuthenticatedState(data.user);
          return;
        }
      }
    } catch (e) {
      console.warn('Session verification notice:', e);
    }
    // Invalid token
    localStorage.removeItem('docIntelAuthToken');
    authToken = null;
  }

  setLoggedOutState();
}

function toggleAuthMode() {
  isRegisterMode = !isRegisterMode;
  const title = document.getElementById('authCardTitle');
  const subtitle = document.getElementById('authCardSubtitle');
  const submitBtn = document.getElementById('authSubmitBtn');
  const prompt = document.getElementById('authSwitchPrompt');
  const switchBtn = document.getElementById('authSwitchBtn');
  const errorAlert = document.getElementById('authErrorAlert');

  errorAlert.style.display = 'none';

  if (isRegisterMode) {
    title.textContent = 'Create Workspace Account';
    subtitle.textContent = 'Register with your verified email address and password.';
    submitBtn.textContent = 'Register Account';
    prompt.textContent = 'Already registered?';
    switchBtn.textContent = 'Sign in to existing account';
  } else {
    title.textContent = 'Platform login';
    subtitle.textContent = 'Choose your workspace role, then sign in or register.';
    submitBtn.textContent = 'Login';
    prompt.textContent = 'Not registered?';
    switchBtn.textContent = 'Create an account';
  }
}

function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function validateAuthInputs(email, password) {
  if (!email || !isValidEmail(email)) {
    return 'Please enter a valid email address (e.g. user@example.com).';
  }
  if (!password || password.length < 8) {
    return 'Password must be at least 8 characters long.';
  }
  const hasLetter = /[a-zA-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  if (!hasLetter || !hasNumber) {
    return 'Password must contain at least one letter and at least one number.';
  }
  return null;
}

async function handleAuthSubmit() {
  const userId = document.getElementById('authUserIdInput').value.trim();
  const password = document.getElementById('authPasswordInput').value;
  const role = document.getElementById('authRoleSelect').value;
  const workspace = document.getElementById('authWorkspaceSelect').value;
  const errorAlert = document.getElementById('authErrorAlert');
  const submitBtn = document.getElementById('authSubmitBtn');

  const clientError = validateAuthInputs(userId, password);
  if (clientError) {
    errorAlert.textContent = clientError;
    errorAlert.style.display = 'block';
    return;
  }

  errorAlert.style.display = 'none';
  submitBtn.disabled = true;
  submitBtn.textContent = 'Authenticating...';

  const endpoint = isRegisterMode ? `${API_BASE}/api/auth/register` : `${API_BASE}/api/auth/login`;

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, password, role, workspace })
    });

    const rawText = await res.text();
    let data = null;
    try {
      data = rawText ? JSON.parse(rawText) : null;
    } catch {
      data = null;
    }

    submitBtn.disabled = false;
    submitBtn.textContent = isRegisterMode ? 'Register Account' : 'Secure Login';

    if (res.ok && data && data.success) {
      authToken = data.token;
      localStorage.setItem('docIntelAuthToken', authToken);
      setAuthenticatedState(data.user);
    } else {
      if (res.status === 405) {
        errorAlert.textContent = 'Port 5500 is a static previewer. Please run "npm run dev" in your terminal and open http://localhost:3000 in your browser.';
      } else {
        errorAlert.textContent = (data && data.error) ? data.error : (rawText || `Server error (Status ${res.status})`);
      }
      errorAlert.style.display = 'block';
    }
  } catch (err) {
    submitBtn.disabled = false;
    submitBtn.textContent = isRegisterMode ? 'Register Account' : 'Secure Login';
    errorAlert.textContent = 'Could not connect to Node.js backend. Please ensure "npm run dev" is running in your terminal at http://localhost:3000.';
    errorAlert.style.display = 'block';
  }
}

function setAuthenticatedState(user) {
  currentUser = user;
  document.getElementById('authSection').style.display = 'none';
  document.getElementById('workspaceWrapper').style.display = 'block';
  document.getElementById('headerAuthStatus').style.display = 'none';
  document.getElementById('headerWorkspaceStatus').style.display = 'flex';

  const userBadge = document.getElementById('userProfileBadge');
  if (userBadge) {
    userBadge.textContent = `${user.userId} (${user.role || 'Analyst'})`;
  }

  // Load platform workspace data
  fetchStatus();
  fetchDocuments();
}

async function handleLogout() {
  if (authToken) {
    try {
      await fetch(`${API_BASE}/api/auth/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: authToken })
      });
    } catch (e) {
      console.warn('Logout network notice:', e);
    }
  }

  authToken = null;
  currentUser = null;
  localStorage.removeItem('docIntelAuthToken');
  setLoggedOutState();
}

function setLoggedOutState() {
  document.getElementById('authSection').style.display = 'block';
  document.getElementById('workspaceWrapper').style.display = 'none';
  document.getElementById('headerAuthStatus').style.display = 'block';
  document.getElementById('headerWorkspaceStatus').style.display = 'none';
  document.getElementById('authPasswordInput').value = '';
}

// --- Fetch Platform Status ---
async function fetchStatus() {
  try {
    const res = await fetch(`${API_BASE}/api/status`);
    const data = await res.json();

    const statusBadge = document.getElementById('engineStatusBadge');
    if (statusBadge) {
      statusBadge.textContent = 'Engine: Autonomous Local Mode';
      statusBadge.style.backgroundColor = 'rgba(255, 255, 255, 0.15)';
    }

    const docCountBadge = document.getElementById('docCountBadge');
    if (docCountBadge) {
      docCountBadge.textContent = `Documents: ${data.documentCount || 0}`;
    }
  } catch (err) {
    console.error('Status fetch error:', err);
  }
}

// --- Fetch and Render Documents ---
async function fetchDocuments() {
  try {
    const res = await fetch(`${API_BASE}/api/documents`);
    const data = await res.json();
    activeDocuments = data.documents || [];
    renderDocumentsTable(activeDocuments);
    updateDocumentDropdowns(activeDocuments);
    fetchStatus();
  } catch (err) {
    console.error('Documents fetch error:', err);
  }
}

function renderDocumentsTable(docs) {
  const tbody = document.getElementById('documentsTableBody');
  if (!docs || docs.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align: center; padding: 24px; font-style: italic;">
          No documents indexed yet. Upload files above or click "Load Sample Test Suite".
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = docs.map(doc => {
    const uploadedTime = new Date(doc.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const isMultimodal = doc.metadata.isMultimodal ? ' (Multimodal)' : '';
    return `
      <tr>
        <td><strong>${escapeHtml(doc.fileName)}</strong></td>
        <td>${escapeHtml(doc.docType.toUpperCase())}${isMultimodal}</td>
        <td>${escapeHtml(doc.metadata.detectedType || 'General')}</td>
        <td>${doc.metadata.wordCount ? doc.metadata.wordCount.toLocaleString() : 0}</td>
        <td>${doc.metadata.estimatedTokens ? doc.metadata.estimatedTokens.toLocaleString() : 0}</td>
        <td>${doc.chunksCount}</td>
        <td>${uploadedTime}</td>
        <td>
          <div class="btn-group">
            <button class="btn btn-secondary btn-sm" onclick="inspectDocument('${doc.id}')">Inspect</button>
            <button class="btn btn-sm" onclick="triggerAnalyzeDoc('${doc.id}')">Analyze</button>
            <button class="btn btn-secondary btn-sm" onclick="triggerSchemaDoc('${doc.id}')">Schema</button>
            <button class="btn btn-danger btn-sm" onclick="deleteDocument('${doc.id}')">Delete</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function updateDocumentDropdowns(docs) {
  const selects = ['intelDocSelect', 'qaDocScope', 'schemaDocSelect', 'compareDoc1', 'compareDoc2'];
  selects.forEach(selectId => {
    const select = document.getElementById(selectId);
    if (!select) return;

    const currentValue = select.value;
    let html = '';

    if (selectId === 'qaDocScope') {
      html = '<option value="">Search Across Entire Corpus (All Documents)</option>';
    } else if (selectId.startsWith('compare')) {
      html = `<option value="">-- Choose ${selectId === 'compareDoc1' ? 'Document A' : 'Document B'} --</option>`;
    } else {
      html = '<option value="">-- Choose an indexed document --</option>';
    }

    docs.forEach(doc => {
      html += `<option value="${doc.id}">${escapeHtml(doc.fileName)} (${doc.docType.toUpperCase()})</option>`;
    });

    select.innerHTML = html;
    if (currentValue && docs.some(d => d.id === currentValue)) {
      select.value = currentValue;
    }
  });
}

// --- Upload Dropzone Handling ---
function setupUploadDropzone() {
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('fileInput');

  ['dragenter', 'dragover'].forEach(eventName => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.add('dragover');
    }, false);
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.remove('dragover');
    }, false);
  });

  dropzone.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    const files = dt.files;
    if (files && files.length > 0) {
      uploadFiles(files);
    }
  });

  dropzone.addEventListener('click', (e) => {
    if (e.target.tagName !== 'BUTTON' && e.target !== fileInput) {
      fileInput.click();
    }
  });

  fileInput.addEventListener('change', () => {
    if (fileInput.files && fileInput.files.length > 0) {
      uploadFiles(fileInput.files);
      fileInput.value = '';
    }
  });
}

async function uploadFiles(fileList) {
  const statusMsg = document.getElementById('uploadStatusMessage');
  statusMsg.textContent = `Uploading and indexing ${fileList.length} file(s)...`;
  statusMsg.style.color = 'var(--header)';

  const formData = new FormData();
  for (let i = 0; i < fileList.length; i++) {
    formData.append('documents', fileList[i]);
  }

  try {
    const res = await fetch(`${API_BASE}/api/upload`, {
      method: 'POST',
      body: formData
    });

    const rawText = await res.text();
    let result = null;
    try {
      result = rawText ? JSON.parse(rawText) : null;
    } catch {
      result = null;
    }

    if (res.ok && result && result.success) {
      statusMsg.textContent = `Successfully processed and indexed ${result.count} document(s).`;
      statusMsg.style.color = '#1b5e20';
      fetchDocuments();
    } else {
      const errorDetail = (result && result.error) ? result.error : (rawText || `HTTP Status ${res.status}`);
      statusMsg.textContent = `Upload error: ${errorDetail}`;
      statusMsg.style.color = '#b71c1c';
    }
  } catch (err) {
    statusMsg.textContent = `Upload failed: ${err.message}`;
    statusMsg.style.color = '#b71c1c';
  }
}

// --- Document Action Helpers ---
async function deleteDocument(docId) {
  if (!confirm('Are you sure you want to remove this document from the intelligence corpus?')) return;
  try {
    const res = await fetch(`${API_BASE}/api/documents/${docId}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      fetchDocuments();
    }
  } catch (err) {
    alert('Failed to delete document: ' + err.message);
  }
}

async function inspectDocument(docId) {
  try {
    const res = await fetch(`${API_BASE}/api/documents/${docId}`);
    const doc = await res.json();

    document.getElementById('modalDocTitle').textContent = `Inspection: ${doc.fileName}`;
    document.getElementById('modalDocMeta').innerHTML = `
      <strong>Format:</strong> ${doc.docType.toUpperCase()} &bull;
      <strong>Classification:</strong> ${doc.metadata.detectedType} &bull;
      <strong>Words:</strong> ${doc.metadata.wordCount ? doc.metadata.wordCount.toLocaleString() : 0} &bull;
      <strong>Est. Tokens:</strong> ${doc.metadata.estimatedTokens ? doc.metadata.estimatedTokens.toLocaleString() : 0} &bull;
      <strong>Chunks:</strong> ${doc.chunks.length}
    `;
    document.getElementById('modalDocText').textContent = doc.extractedText || 'No text extracted.';

    const chunksHtml = doc.chunks.map((c, i) => `
      <div class="source-citation" style="margin-bottom: 8px;">
        <div class="source-title">Chunk ${i + 1} (Characters ${c.charStart} to ${c.charEnd})</div>
        <div style="font-size: 13px;">${escapeHtml(c.text)}</div>
      </div>
    `).join('');
    document.getElementById('modalDocChunks').innerHTML = chunksHtml;

    document.getElementById('docModal').classList.add('active');
  } catch (err) {
    alert('Failed to inspect document: ' + err.message);
  }
}

function closeDocModal() {
  document.getElementById('docModal').classList.remove('active');
}

function triggerAnalyzeDoc(docId) {
  switchTab('tab-intelligence');
  const sel = document.getElementById('intelDocSelect');
  sel.value = docId;
  runIntelligenceAnalysis();
}

function triggerSchemaDoc(docId) {
  switchTab('tab-schema');
  const sel = document.getElementById('schemaDocSelect');
  sel.value = docId;
}

// --- Tab 2: Document Intelligence Execution ---
async function runIntelligenceAnalysis() {
  const docId = document.getElementById('intelDocSelect').value;
  if (!docId) {
    alert('Please select a target document from the dropdown.');
    return;
  }

  const loadingNotice = document.getElementById('intelLoadingNotice');
  const resultsContainer = document.getElementById('intelResultsContainer');

  loadingNotice.style.display = 'inline-block';
  resultsContainer.style.display = 'none';

  try {
    const res = await fetch(`${API_BASE}/api/documents/${docId}/analyze`, { method: 'POST' });
    const data = await res.json();
    loadingNotice.style.display = 'none';

    if (data.success && data.analysis) {
      const a = data.analysis;
      document.getElementById('intelCategory').textContent = a.documentClassification || 'Unclassified';
      document.getElementById('intelConfidence').textContent = a.confidenceScore ? `${Math.round(a.confidenceScore * 100)}%` : '90%';
      document.getElementById('intelTone').textContent = a.sentimentAndTone || 'Formal';
      document.getElementById('intelProvider').textContent = a.provider || 'Intelligence Engine';
      document.getElementById('intelSummary').textContent = a.executiveSummary || 'No summary available.';

      // Entities
      const entities = a.keyEntities || {};
      renderEntityList('intelOrgs', entities.organizations);
      renderEntityList('intelDates', entities.dates);
      renderEntityList('intelMonetary', entities.monetaryValues);
      renderEntityList('intelMetrics', entities.keyMetrics);
      renderEntityList('intelPeople', entities.people);

      // Actions
      const actionsList = document.getElementById('intelActionItems');
      if (a.actionItems && a.actionItems.length > 0) {
        actionsList.innerHTML = a.actionItems.map(item => `<li>${escapeHtml(item)}</li>`).join('');
      } else {
        actionsList.innerHTML = '<li>No specific action items identified.</li>';
      }

      // Risks
      const risksList = document.getElementById('intelRisks');
      if (a.potentialRisksOrFlags && a.potentialRisksOrFlags.length > 0) {
        risksList.innerHTML = a.potentialRisksOrFlags.map(risk => `<li>${escapeHtml(risk)}</li>`).join('');
      } else {
        risksList.innerHTML = '<li>No compliance risks or ambiguities detected.</li>';
      }

      resultsContainer.style.display = 'block';
    } else {
      alert('Analysis failed: ' + (data.error || 'Unknown error'));
    }
  } catch (err) {
    loadingNotice.style.display = 'none';
    alert('Analysis error: ' + err.message);
  }
}

function renderEntityList(elemId, items) {
  const container = document.getElementById(elemId);
  if (!items || items.length === 0) {
    container.innerHTML = '<em>None detected</em>';
    return;
  }
  container.innerHTML = items.map(i => `<span class="entity-tag">${escapeHtml(i)}</span>`).join('');
}

// --- Tab 3: Q&A / Semantic RAG ---
function setQueryPrompt(text) {
  document.getElementById('qaInput').value = text;
  submitQuery();
}

async function submitQuery() {
  const input = document.getElementById('qaInput');
  const question = input.value.trim();
  if (!question) return;

  const docScope = document.getElementById('qaDocScope').value;
  const chatWindow = document.getElementById('chatWindow');
  const loadingNotice = document.getElementById('qaLoadingNotice');

  // Append user query
  appendChatMessage('User Inquiry', question);
  input.value = '';
  loadingNotice.style.display = 'inline-block';

  try {
    const res = await fetch(`${API_BASE}/api/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, docId: docScope || null })
    });
    const data = await res.json();
    loadingNotice.style.display = 'none';

    if (data.success) {
      appendChatMessage('Intelligence Assistant (' + data.provider + ')', data.answer, data.sources);
    } else {
      appendChatMessage('Error', data.error || 'Failed to answer inquiry');
    }
  } catch (err) {
    loadingNotice.style.display = 'none';
    appendChatMessage('Error', 'Query processing error: ' + err.message);
  }
}

function appendChatMessage(sender, text, sources = null) {
  const chatWindow = document.getElementById('chatWindow');
  const msgDiv = document.createElement('div');
  msgDiv.className = 'chat-message';

  let sourcesHtml = '';
  if (sources && sources.length > 0) {
    sourcesHtml = '<div style="margin-top: 10px;"><strong>Grounding Citations:</strong>';
    sources.forEach((s, idx) => {
      sourcesHtml += `
        <div class="source-citation">
          <div class="source-title">Source Fragment ${idx + 1} (Score: ${s.score})</div>
          <div>${escapeHtml(s.textSnippet)}</div>
        </div>
      `;
    });
    sourcesHtml += '</div>';
  }

  msgDiv.innerHTML = `
    <div class="chat-sender">${escapeHtml(sender)}</div>
    <div class="chat-text">${escapeHtml(text)}</div>
    ${sourcesHtml}
  `;

  chatWindow.appendChild(msgDiv);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

// --- Tab 4: Schema Extractor ---
async function runSchemaExtraction() {
  const docId = document.getElementById('schemaDocSelect').value;
  if (!docId) {
    alert('Please select a target document for schema extraction.');
    return;
  }

  const schemaType = document.getElementById('schemaTypeSelect').value;
  let customDef = null;

  if (schemaType === 'custom') {
    try {
      customDef = JSON.parse(document.getElementById('customSchemaInput').value);
    } catch {
      alert('Custom schema contains invalid JSON. Please correct it.');
      return;
    }
  }

  const loadingNotice = document.getElementById('schemaLoadingNotice');
  const resultsContainer = document.getElementById('schemaResultsContainer');

  loadingNotice.style.display = 'inline-block';
  resultsContainer.style.display = 'none';

  try {
    const res = await fetch(`${API_BASE}/api/schema/extract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ docId, schemaType, customSchema: customDef })
    });
    const data = await res.json();
    loadingNotice.style.display = 'none';

    if (data.success && data.result) {
      currentSchemaResult = data.result.extractedData;
      renderSchemaOutput(data.result.extractedData);
      resultsContainer.style.display = 'block';
    } else {
      alert('Schema extraction failed: ' + (data.error || 'Unknown error'));
    }
  } catch (err) {
    loadingNotice.style.display = 'none';
    alert('Schema extraction error: ' + err.message);
  }
}

function renderSchemaOutput(data) {
  const tbody = document.getElementById('schemaTableBody');
  const rows = [];

  for (const [key, val] of Object.entries(data)) {
    let displayVal = val;
    if (typeof val === 'object' && val !== null) {
      displayVal = `<pre style="margin:0; font-size:12px;">${escapeHtml(JSON.stringify(val, null, 2))}</pre>`;
    } else {
      displayVal = escapeHtml(String(val));
    }
    rows.push(`
      <tr>
        <td><strong>${escapeHtml(key)}</strong></td>
        <td>${displayVal}</td>
      </tr>
    `);
  }

  tbody.innerHTML = rows.join('');
  document.getElementById('schemaRawJson').textContent = JSON.stringify(data, null, 2);
}

// --- Tab 5: Document Comparison ---
async function runDocumentComparison() {
  const docId1 = document.getElementById('compareDoc1').value;
  const docId2 = document.getElementById('compareDoc2').value;

  if (!docId1 || !docId2) {
    alert('Please select both Document A and Document B to compare.');
    return;
  }
  if (docId1 === docId2) {
    alert('Please choose two distinct documents for comparison.');
    return;
  }

  const loadingNotice = document.getElementById('compareLoadingNotice');
  const resultsContainer = document.getElementById('compareResultsContainer');

  loadingNotice.style.display = 'inline-block';
  resultsContainer.style.display = 'none';

  try {
    const res = await fetch(`${API_BASE}/api/compare`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ docId1, docId2 })
    });
    const data = await res.json();
    loadingNotice.style.display = 'none';

    if (data.success && data.synthesis) {
      const s = data.synthesis;
      const lex = s.lexical;

      document.getElementById('doc1Title').textContent = `Doc A: ${lex.doc1.name}`;
      document.getElementById('doc1Type').textContent = lex.doc1.type;
      document.getElementById('doc1Words').textContent = lex.doc1.wordCount.toLocaleString();
      document.getElementById('doc1Tokens').textContent = lex.doc1.estimatedTokens.toLocaleString();
      renderEntityList('doc1UniqueTerms', lex.doc1.uniqueKeyTerms);

      document.getElementById('doc2Title').textContent = `Doc B: ${lex.doc2.name}`;
      document.getElementById('doc2Type').textContent = lex.doc2.type;
      document.getElementById('doc2Words').textContent = lex.doc2.wordCount.toLocaleString();
      document.getElementById('doc2Tokens').textContent = lex.doc2.estimatedTokens.toLocaleString();
      renderEntityList('doc2UniqueTerms', lex.doc2.uniqueKeyTerms);

      document.getElementById('compareSimilarity').textContent = `${lex.comparison.similarityPercentage}% Lexical Overlap`;
      document.getElementById('compareExecutiveSummary').textContent = s.executiveComparison || 'No summary available.';
      renderEntityList('compareSharedKeywords', lex.comparison.sharedKeyTerms);

      const diffList = document.getElementById('compareDifferences');
      if (s.keyDifferences && s.keyDifferences.length > 0) {
        diffList.innerHTML = s.keyDifferences.map(d => `<li>${escapeHtml(d)}</li>`).join('');
      } else {
        diffList.innerHTML = '<li>No substantial differences detected.</li>';
      }

      const recList = document.getElementById('compareRecommendations');
      if (s.recommendations && s.recommendations.length > 0) {
        recList.innerHTML = s.recommendations.map(r => `<li>${escapeHtml(r)}</li>`).join('');
      } else {
        recList.innerHTML = '<li>No recommendations recorded.</li>';
      }

      resultsContainer.style.display = 'block';
    } else {
      alert('Comparison failed: ' + (data.error || 'Unknown error'));
    }
  } catch (err) {
    loadingNotice.style.display = 'none';
    alert('Comparison error: ' + err.message);
  }
}

// --- Seed Sample Test Suite ---
async function seedSampleSuite() {
  const statusMsg = document.getElementById('uploadStatusMessage');
  statusMsg.textContent = 'Ingesting sample multimodal test suite (Contract, Commercial Invoice, Research Synthesis)...';
  statusMsg.style.color = 'var(--header)';

  try {
    const res = await fetch(`${API_BASE}/api/seed-samples`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      statusMsg.textContent = `Successfully seeded ${data.seeded.length} sample documents into index.`;
      statusMsg.style.color = '#1b5e20';
      fetchDocuments();
    } else {
      statusMsg.textContent = 'Seed error: ' + data.error;
      statusMsg.style.color = '#b71c1c';
    }
  } catch (err) {
    statusMsg.textContent = 'Seed failed: ' + err.message;
    statusMsg.style.color = '#b71c1c';
  }
}

// --- Setup Event Listeners ---
function setupEventListeners() {
  document.getElementById('refreshDocsBtn').addEventListener('click', fetchDocuments);
  document.getElementById('seedSamplesBtn').addEventListener('click', seedSampleSuite);
  document.getElementById('runIntelBtn').addEventListener('click', runIntelligenceAnalysis);
  document.getElementById('qaSubmitBtn').addEventListener('click', submitQuery);
  document.getElementById('qaInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submitQuery();
  });

  const schemaTypeSelect = document.getElementById('schemaTypeSelect');
  schemaTypeSelect.addEventListener('change', () => {
    document.getElementById('customSchemaGroup').style.display = 
      schemaTypeSelect.value === 'custom' ? 'block' : 'none';
  });

  document.getElementById('runSchemaBtn').addEventListener('click', runSchemaExtraction);
  document.getElementById('runCompareBtn').addEventListener('click', runDocumentComparison);

  // Copy and download buttons for schema
  document.getElementById('copySchemaJsonBtn').addEventListener('click', () => {
    if (!currentSchemaResult) return;
    navigator.clipboard.writeText(JSON.stringify(currentSchemaResult, null, 2))
      .then(() => alert('Structured JSON copied to clipboard!'))
      .catch(err => alert('Copy failed: ' + err.message));
  });

  document.getElementById('downloadSchemaJsonBtn').addEventListener('click', () => {
    if (!currentSchemaResult) return;
    const blob = new Blob([JSON.stringify(currentSchemaResult, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `extracted_schema_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
