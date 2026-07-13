/* =========================================================
   사고조사 탭 — 확인자료(CCTV·공유기록) + 목격자 면담(여러 명) + 검토 결과
   + 결과 문서 자동 생성 + PDF/Teams
   ---------------------------------------------------------
   [핵심 개념]
   1. 목격자 진술을 목격자 본인이 쓰지 않습니다. 면담자(파트장)가
      면담하며 들은 내용을 직접 입력합니다. (목격자끼리 말 맞추는 것 방지)
   2. 목격자 한 명을 입력하고 "이 면담 저장"을 누르면 카드가 접혀
      요약(이름·분류)만 보입니다. "＋ 면담 추가"로 다음 목격자를 이어서
      작성해 화면이 길어지지 않게 합니다.
   3. 모든 입력값은 이 휴대폰(브라우저)에만 저장됩니다(localStorage).
      전국 매장에서 동시에 접속해도 서로 데이터가 섞이지 않습니다.
      (네트워크 통신이 아니라 그 기기 안에만 있는 저장공간이기 때문입니다.
       PDF 저장 또는 Teams 전송을 눌러야 비로소 밖으로 나갑니다.)
   4. "검토 완료"를 누르면 아래 순서로 자동 판단하고, 어떤 결과든
      제출용 문서(초안)를 생성해 PDF/Teams로 남길 수 있게 합니다.
   5. 최종 문구는 "확정"이라는 단어를 쓰지 않고
      "인정 검토 / 불인정 검토 / 추가 확인 필요"로만 표현합니다.
   ========================================================= */

const INV_BASE_KEY = 'fieldGuide_investigation_base';
const INV_WITNESS_KEY = 'fieldGuide_investigation_witnesses';
const INV_CASE_ID_KEY = 'fieldGuide_investigation_caseId';

/*
 * [Teams/기록관리 연동]
 * Google Apps Script를 "웹 앱"으로 배포하면 URL이 하나 생깁니다.
 * (../apps-script/README.md 참고). 그 URL을 아래에 그대로 붙여넣으면
 * "Teams로 전송" 버튼이 실제로 동작합니다.
 * 비워두면 미리보기만 표시되고 실제 전송은 되지 않습니다.
 */
const INV_TEAMS_ENDPOINT_URL = ''; // 예: 'https://script.google.com/macros/s/AKfycb.../exec' (새로 배포한 뒤 여기에 붙여넣기)

document.addEventListener('DOMContentLoaded', () => {

  const panel = document.getElementById('panel-investigation');
  const witnessList = document.getElementById('witnessList');
  if (!panel || !witnessList) return;

  let witnessSeq = 0;

  /* ---------- 유틸 ---------- */
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
  }
  function escapeAttr(str) {
    return escapeHtml(str).replace(/"/g, '&quot;');
  }

  /* =========================================================
     0. 사고 관리번호 (같은 사고건에 추가 정보를 이어서 작성/전송할 때 기준)
     ---------------------------------------------------------
     - 최초 작성 시작 시 자동으로 "INV-YYYYMMDD-XXXX" 형태 번호를 발급합니다.
     - 이 번호는 이 브라우저(localStorage)에 저장되고, 전송할 때 서버로도
       같이 보내집니다. 서버(Apps Script)는 같은 번호가 이미 있으면
       그 행을 덮어쓰고, 없으면 새 행을 추가합니다.
     - "새 사고 작성"을 누르면 지금 입력값을 모두 지우고 새 번호를 발급합니다.
     ========================================================= */
  function generateCaseId() {
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    const datePart = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
    const randomPart = Math.random().toString(16).slice(2, 6);
    return `INV-${datePart}-${randomPart}`;
  }

  function getOrCreateCaseId() {
    let id = localStorage.getItem(INV_CASE_ID_KEY);
    if (!id) {
      id = generateCaseId();
      localStorage.setItem(INV_CASE_ID_KEY, id);
    }
    return id;
  }

  function renderCaseId() {
    const display = document.getElementById('invCaseIdDisplay');
    if (display) display.textContent = getOrCreateCaseId();
  }

  const newCaseBtn = document.getElementById('invNewCaseBtn');
  if (newCaseBtn) {
    newCaseBtn.addEventListener('click', () => {
      const ok = confirm('현재 작성 중인 내용을 모두 지우고 새 사고 작성을 시작합니다. 계속할까요?');
      if (!ok) return;
      localStorage.removeItem(INV_BASE_KEY);
      localStorage.removeItem(INV_WITNESS_KEY);
      localStorage.removeItem(INV_CASE_ID_KEY);
      location.reload();
    });
  }

  renderCaseId();

  /* =========================================================
     1. 기본정보 + 확인자료(CCTV·공유기록) 저장/복원
     ========================================================= */
  const BASE_TEXT_IDS = [
    'invDivision', 'invDept', 'invTeam', 'invStoreName',
    'invAuthorName', 'invVictimName', 'invIncidentPlace',
    'invIncidentDate', 'invIncidentTime', 'invReportImmediateDetail'
  ];
  const BASE_CHECK_IDS = ['invReportImmediate', 'invReportChat'];
  const BASE_RADIO_NAMES = ['invCctv', 'invWorkVideoAbnormal'];

  /* ---------- 조직 정보 3단 연동 드롭다운 (부문 > 부서 > 팀) ---------- */
  const divisionSelect = document.getElementById('invDivision');
  const deptSelect = document.getElementById('invDept');
  const teamSelect = document.getElementById('invTeam');

  function populateDivisions() {
    if (!divisionSelect || typeof ORG_DATA === 'undefined') return;
    Object.keys(ORG_DATA).forEach(div => {
      const opt = document.createElement('option');
      opt.value = div;
      opt.textContent = div;
      divisionSelect.appendChild(opt);
    });
  }

  function populateDepts(selectedDivision, selectedDept) {
    if (!deptSelect) return;
    deptSelect.innerHTML = '';
    if (!selectedDivision || typeof ORG_DATA === 'undefined' || !ORG_DATA[selectedDivision]) {
      deptSelect.innerHTML = '<option value="">부문을 먼저 선택</option>';
      return;
    }
    deptSelect.innerHTML = '<option value="">선택</option>';
    Object.keys(ORG_DATA[selectedDivision]).forEach(dept => {
      const opt = document.createElement('option');
      opt.value = dept;
      opt.textContent = dept;
      if (dept === selectedDept) opt.selected = true;
      deptSelect.appendChild(opt);
    });
  }

  function populateTeams(selectedDivision, selectedDept, selectedTeam) {
    if (!teamSelect) return;
    teamSelect.innerHTML = '';
    const teams = (typeof ORG_DATA !== 'undefined' && ORG_DATA[selectedDivision] && ORG_DATA[selectedDivision][selectedDept]) || null;
    if (!teams) {
      teamSelect.innerHTML = '<option value="">부서를 먼저 선택</option>';
      return;
    }
    teamSelect.innerHTML = '<option value="">선택</option>';
    teams.forEach(team => {
      const opt = document.createElement('option');
      opt.value = team;
      opt.textContent = team;
      if (team === selectedTeam) opt.selected = true;
      teamSelect.appendChild(opt);
    });
  }

  if (divisionSelect) {
    populateDivisions();
    divisionSelect.addEventListener('change', () => {
      populateDepts(divisionSelect.value, '');
      populateTeams('', '', '');
    });
  }
  if (deptSelect) {
    deptSelect.addEventListener('change', () => {
      populateTeams(divisionSelect.value, deptSelect.value, '');
    });
  }

  // 카톡·팀즈 등 증빙 캡처 이미지 (메모리에만 보관; 용량이 커서 localStorage에는
  // 저장하지 않습니다. 새로고침 시 사진은 다시 첨부해야 합니다. 텍스트 입력값은 유지됩니다.)
  let chatImages = []; // [{ name, dataUrl }]

  function readBaseData() {
    const data = {};
    BASE_TEXT_IDS.forEach(id => {
      const el = document.getElementById(id);
      if (el) data[id] = el.value;
    });
    BASE_CHECK_IDS.forEach(id => {
      const el = document.getElementById(id);
      if (el) data[id] = el.checked;
    });
    BASE_RADIO_NAMES.forEach(name => {
      const checked = document.querySelector(`input[name="${name}"]:checked`);
      data[name] = checked ? checked.value : '';
    });
    return data;
  }

  function saveBaseData() {
    try {
      localStorage.setItem(INV_BASE_KEY, JSON.stringify(readBaseData()));
    } catch (e) {
      console.warn('사고조사 기본정보 임시저장 실패:', e);
    }
  }

  function restoreBaseData() {
    let saved;
    try { saved = JSON.parse(localStorage.getItem(INV_BASE_KEY) || '{}'); }
    catch (e) { saved = {}; }

    // 조직 드롭다운은 부문 → 부서 → 팀 순서로 목록을 다시 채운 뒤 값을 선택해야 합니다.
    if (divisionSelect && saved.invDivision) {
      divisionSelect.value = saved.invDivision;
      populateDepts(saved.invDivision, saved.invDept || '');
      populateTeams(saved.invDivision, saved.invDept || '', saved.invTeam || '');
    }

    BASE_TEXT_IDS.forEach(id => {
      if (id === 'invDivision' || id === 'invDept' || id === 'invTeam') return; // 위에서 이미 처리
      const el = document.getElementById(id);
      if (el && saved[id] !== undefined) el.value = saved[id];
    });
    BASE_CHECK_IDS.forEach(id => {
      const el = document.getElementById(id);
      if (el && saved[id] !== undefined) el.checked = !!saved[id];
    });
    BASE_RADIO_NAMES.forEach(name => {
      if (!saved[name]) return;
      const el = document.querySelector(`input[name="${name}"][value="${saved[name]}"]`);
      if (el) el.checked = true;
    });
  }

  // CCTV가 "잘 안 보임" 또는 "없음"일 때만 근무영상 이상행동 질문을 표시
  function refreshConditional() {
    const cctv = (document.querySelector('input[name="invCctv"]:checked') || {}).value;
    const wrap = document.getElementById('invWorkVideoWrap');
    if (wrap) {
      const show = (cctv === 'unclear' || cctv === 'none');
      wrap.style.display = show ? 'block' : 'none';
      if (!show) {
        document.querySelectorAll('input[name="invWorkVideoAbnormal"]').forEach(r => { r.checked = false; });
      }
    }

    // "즉시 보고한 기록 있음" 체크 시 → 어떻게 보고했는지 작성란 표시
    const reportImm = document.getElementById('invReportImmediate');
    const reportImmWrap = document.getElementById('invReportImmediateWrap');
    if (reportImm && reportImmWrap) {
      reportImmWrap.style.display = reportImm.checked ? 'block' : 'none';
    }

    // "카톡/팀즈 등 기록 있음" 체크 시 → 증빙 첨부 영역 표시
    const reportChat = document.getElementById('invReportChat');
    const reportChatWrap = document.getElementById('invReportChatWrap');
    if (reportChat && reportChatWrap) {
      reportChatWrap.style.display = reportChat.checked ? 'block' : 'none';
    }
  }

  function refreshRadioPillStyles() {
    panel.querySelectorAll('.radio-pill').forEach(label => {
      const input = label.querySelector('input[type="radio"]');
      if (input) label.classList.toggle('is-checked', input.checked);
    });
  }

  restoreBaseData();
  refreshConditional();
  refreshRadioPillStyles();

  // 기본정보/확인자료 영역의 입력 변화 감지 (면담 카드 영역은 제외)
  panel.addEventListener('input', (e) => {
    if (e.target.closest('#witnessList')) return;
    saveBaseData();
  });
  panel.addEventListener('change', (e) => {
    if (e.target.closest('#witnessList')) return;
    saveBaseData();
    refreshConditional();
    refreshRadioPillStyles();
  });

  /* ---------- 카톡·팀즈 증빙 캡처 첨부 ---------- */
  const chatFileInput = document.getElementById('invChatFileInput');
  const chatAttachBtn = document.getElementById('invChatAttachBtn');
  const chatPreview = document.getElementById('invChatPreview');
  const IMAGE_MAX_SIDE = 1200;
  const IMAGE_JPEG_QUALITY = 0.68;

  function bytesToSize(bytes) {
    if (!bytes) return '0KB';
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  }

  function dataUrlByteSize(dataUrl) {
    const base64 = String(dataUrl || '').split(',').pop() || '';
    return Math.round(base64.length * 0.75);
  }

  function loadImageFromDataUrl(dataUrl) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = dataUrl;
    });
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = ev => resolve(ev.target.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function compressImageFile(file) {
    const originalDataUrl = await readFileAsDataUrl(file);
    const img = await loadImageFromDataUrl(originalDataUrl);
    const scale = Math.min(1, IMAGE_MAX_SIDE / Math.max(img.width, img.height));
    const width = Math.max(1, Math.round(img.width * scale));
    const height = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    const dataUrl = canvas.toDataURL('image/jpeg', IMAGE_JPEG_QUALITY);
    return {
      name: (file.name || 'capture.jpg').replace(/\.[^.]+$/, '') + '.jpg',
      dataUrl,
      originalBytes: file.size || dataUrlByteSize(originalDataUrl),
      compressedBytes: dataUrlByteSize(dataUrl),
      width,
      height
    };
  }

  function renderChatPreview() {
    if (!chatPreview) return;
    if (chatImages.length === 0) {
      chatPreview.innerHTML = '<p class="attach-empty">첨부된 캡처가 없습니다.</p>';
      return;
    }
    chatPreview.innerHTML = chatImages.map((img, i) => `
      <div class="attach-thumb">
        <img src="${img.dataUrl}" alt="증빙 캡처 ${i + 1}">
        <span class="attach-size">${bytesToSize(img.compressedBytes || dataUrlByteSize(img.dataUrl))}</span>
        <button type="button" class="attach-thumb-remove" data-index="${i}" aria-label="삭제">✕</button>
      </div>
    `).join('');
  }

  if (chatAttachBtn && chatFileInput) {
    chatAttachBtn.addEventListener('click', () => chatFileInput.click());

    chatFileInput.addEventListener('change', async () => {
      const files = Array.from(chatFileInput.files || []);
      if (files.length === 0) return;
      if (chatPreview) chatPreview.innerHTML = '<p class="attach-empty">캡처 이미지를 전송용으로 압축하는 중입니다...</p>';
      for (const file of files) {
        if (!file.type.startsWith('image/')) continue;
        try {
          chatImages.push(await compressImageFile(file));
        } catch (err) {
          console.warn('이미지 압축 실패:', err);
          alert(`이미지 압축에 실패했습니다: ${file.name || '선택한 파일'}`);
        }
      }
      renderChatPreview();
      chatFileInput.value = '';
    });

    chatPreview.addEventListener('click', (e) => {
      const btn = e.target.closest('.attach-thumb-remove');
      if (!btn) return;
      const idx = Number(btn.dataset.index);
      chatImages.splice(idx, 1);
      renderChatPreview();
    });
  }
  renderChatPreview();

  /* =========================================================
     2. 목격자 면담 카드
     ========================================================= */

  // 진술 유형: 직접 근거 / 간접 근거 / 근거 없음 (하나만 선택 - 라디오)
  const STMT_OPTIONS = [
    { value: 'direct', group: '직접 근거', label: '사고 장면을 직접 목격했다' },
    { value: 'aftermath', group: '간접 근거', label: '사고 장면은 못 봤지만, 사고 직후 정황(비명·통증 호소 등)을 봤다' },
    { value: 'secondhand', group: '간접 근거', label: '재해자 또는 다른 직원에게 전해 들었다' },
    { value: 'unaware', group: '근거 없음', label: '사고 사실을 알지 못한다 / 이상행동을 보지 못했다' }
  ];

  // 진술 분류(자동)
  function classify(w) {
    const t = w.stmtType;
    const specific = w.specific === 'yes';
    if (t === 'direct') {
      return specific
        ? { type: 'direct', label: '직접 근거 (구체적)' }
        : { type: 'directVague', label: '직접 근거 (내용 모호)' };
    }
    if (t === 'aftermath') {
      return { type: 'aftermath', label: '간접 근거 (사고 직후 정황)' };
    }
    if (t === 'secondhand') {
      return { type: 'secondhand', label: '간접 근거 (전해 들음)' };
    }
    if (t === 'unaware') {
      return { type: 'unaware', label: '근거 없음 (미인지)' };
    }
    return { type: 'none', label: '미선택' };
  }

  function classifyBadgeClass(type) {
    switch (type) {
      case 'direct': return 'classify-direct';
      case 'directVague': return 'classify-unclear';
      case 'aftermath': return 'classify-semiDirect';
      case 'secondhand': return 'classify-secondhand';
      case 'unaware': return 'classify-unaware';
      default: return 'classify-unclear';
    }
  }

  function witnessCardTemplate(seq, data) {
    data = data || {};
    const stmtRows = STMT_OPTIONS.map(o => `
      <label class="stmt-row">
        <span class="stmt-group stmt-group-${o.value}">${o.group}</span>
        <input type="radio" name="stmtType_${seq}" data-field="stmtType" value="${o.value}" ${data.stmtType === o.value ? 'checked' : ''}>
        <span class="stmt-label">${o.label}</span>
      </label>
    `).join('');

    return `
      <div class="witness-card-head">
        <h4>면담 <span class="witness-seq">${seq}</span></h4>
        <button type="button" class="witness-remove-btn" aria-label="이 면담 삭제">삭제</button>
      </div>

      <label class="form-full">목격자(피면담자) 성명
        <input type="text" data-field="name" value="${escapeAttr(data.name || '')}">
      </label>

      <label class="form-full">사고 당시 이 목격자가 하고 있던 행위
        <input type="text" data-field="activity" placeholder="예: 옆 진열대에서 상품 정리 중" value="${escapeAttr(data.activity || '')}">
      </label>

      <p class="field-label">진술 유형 (하나 선택)</p>
      <div class="stmt-table">
        ${stmtRows}
      </div>

      <p class="field-label">진술 내용이 구체적인가요? <small>(시간·장소·경위를 설명할 수 있는지)</small></p>
      <div class="radio-pill-row">
        <label class="radio-pill"><input type="radio" name="specific_${seq}" data-field="specific" value="yes" ${data.specific === 'yes' ? 'checked' : ''}> 구체적으로 설명함</label>
        <label class="radio-pill"><input type="radio" name="specific_${seq}" data-field="specific" value="no" ${data.specific === 'no' ? 'checked' : ''}> 모호함</label>
      </div>

      <label class="form-full">추가 사항
        <textarea data-field="extra" rows="3" placeholder="면담 시 별도로 추가되어 얻은 내용을 작성하세요.">${escapeHtml(data.extra || '')}</textarea>
      </label>

      <div class="witness-classify-result" data-role="classify"></div>

      <button type="button" class="secondary-btn witness-save-btn" style="margin-top:10px;margin-bottom:0;">이 면담 저장</button>
    `;
  }

  function readCard(card) {
    const seq = card.dataset.seq;
    const get = sel => card.querySelector(sel);
    const stmtEl = card.querySelector(`input[name="stmtType_${seq}"]:checked`);
    const specEl = card.querySelector(`input[name="specific_${seq}"]:checked`);
    return {
      name: get('[data-field="name"]').value,
      activity: get('[data-field="activity"]').value,
      stmtType: stmtEl ? stmtEl.value : '',
      specific: specEl ? specEl.value : '',
      extra: get('[data-field="extra"]').value,
      collapsed: card.classList.contains('collapsed')
    };
  }

  function renderCardClassify(card) {
    const w = readCard(card);
    const c = classify(w);
    const area = card.querySelector('[data-role="classify"]');
    if (area) area.innerHTML = `<span class="classify-badge ${classifyBadgeClass(c.type)}">${c.label}</span>`;
  }

  function collapseCard(card) {
    const w = readCard(card);
    const c = classify(w);
    card.classList.add('collapsed');
    // 접힌 상태의 요약 줄 만들기 (없으면 생성)
    let summary = card.querySelector('.witness-collapsed-summary');
    if (!summary) {
      summary = document.createElement('div');
      summary.className = 'witness-collapsed-summary';
      card.appendChild(summary);
    }
    summary.innerHTML = `
      <span class="witness-collapsed-name">면담 ${card.dataset.seq} · ${escapeHtml(w.name) || '이름 미입력'}</span>
      <span class="classify-badge ${classifyBadgeClass(c.type)}">${c.label}</span>
      <button type="button" class="witness-edit-btn">수정</button>
    `;
  }

  function expandCard(card) {
    card.classList.remove('collapsed');
    const summary = card.querySelector('.witness-collapsed-summary');
    if (summary) summary.remove();
  }

  function saveWitnesses() {
    const cards = Array.from(witnessList.querySelectorAll('.witness-card'));
    const data = cards.map(readCard);
    try { localStorage.setItem(INV_WITNESS_KEY, JSON.stringify(data)); }
    catch (e) { console.warn('면담 임시저장 실패:', e); }
  }

  function addWitnessCard(data) {
    witnessSeq += 1;
    const card = document.createElement('div');
    card.className = 'witness-card';
    card.dataset.seq = witnessSeq;
    card.innerHTML = witnessCardTemplate(witnessSeq, data);
    witnessList.appendChild(card);
    renderCardClassify(card);
    if (data && data.collapsed) collapseCard(card);
    return card;
  }

  function restoreWitnesses() {
    let saved;
    try { saved = JSON.parse(localStorage.getItem(INV_WITNESS_KEY) || '[]'); }
    catch (e) { saved = []; }
    if (saved.length === 0) addWitnessCard();
    else saved.forEach(w => addWitnessCard(w));
  }

  // 면담 카드 영역 이벤트 (입력/저장/수정/삭제)
  witnessList.addEventListener('input', (e) => {
    const card = e.target.closest('.witness-card');
    if (card) renderCardClassify(card);
    saveWitnesses();
  });
  witnessList.addEventListener('change', (e) => {
    const card = e.target.closest('.witness-card');
    if (card) {
      renderCardClassify(card);
      card.querySelectorAll('.radio-pill').forEach(label => {
        const input = label.querySelector('input[type="radio"]');
        if (input) label.classList.toggle('is-checked', input.checked);
      });
    }
    saveWitnesses();
  });
  witnessList.addEventListener('click', (e) => {
    const card = e.target.closest('.witness-card');
    if (!card) return;

    if (e.target.closest('.witness-save-btn')) {
      const w = readCard(card);
      if (!w.name.trim()) { alert('목격자 성명을 입력해주세요.'); return; }
      if (!w.stmtType) { alert('진술 유형을 선택해주세요.'); return; }
      collapseCard(card);
      saveWitnesses();
      return;
    }
    if (e.target.closest('.witness-edit-btn')) {
      expandCard(card);
      saveWitnesses();
      return;
    }
    if (e.target.closest('.witness-remove-btn')) {
      if (witnessList.querySelectorAll('.witness-card').length <= 1) {
        alert('최소 1개의 면담 기록은 남아 있어야 합니다.');
        return;
      }
      card.remove();
      saveWitnesses();
    }
  });

  const addWitnessBtn = document.getElementById('addWitnessBtn');
  if (addWitnessBtn) {
    addWitnessBtn.addEventListener('click', () => {
      // 새 면담을 추가하기 전에, 펼쳐진 카드가 있으면 그대로 두고 새 카드만 추가
      addWitnessCard();
      saveWitnesses();
      const cards = witnessList.querySelectorAll('.witness-card');
      cards[cards.length - 1].scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }

  restoreWitnesses();

  /* =========================================================
     3. 최종 판단 로직
     ========================================================= */
  function computeJudgement() {
    const base = readBaseData();
    const witnesses = Array.from(witnessList.querySelectorAll('.witness-card')).map(readCard);
    const classified = witnesses.map(w => ({ w, c: classify(w) }));

    const hasDirectSpecific = classified.some(x => x.c.type === 'direct');
    const hasDirectVague = classified.some(x => x.c.type === 'directVague');
    const hasAftermath = classified.some(x => x.c.type === 'aftermath');
    const hasReportBackup = base.invReportImmediate || base.invReportChat;
    const onlySecondOrUnaware = classified.length > 0 &&
      classified.every(x => x.c.type === 'secondhand' || x.c.type === 'unaware' || x.c.type === 'none');

    let verdict; // recognized | unrecognized | review
    const reasons = [];

    if (base.invCctv === 'clear') {
      verdict = 'recognized';
      reasons.push('CCTV 영상에 사고 장면이 그대로 확인되었습니다.');
    } else if (base.invWorkVideoAbnormal === 'yes') {
      verdict = 'recognized';
      reasons.push('사고 장면이 확인되는 CCTV 영상은 없으나, 당일 근무 영상에서 통증 호소·이상행동 등 사고 직후 정황이 확인되었습니다.');
    } else if (hasDirectSpecific) {
      verdict = 'recognized';
      reasons.push('사고 장면이 확인되는 CCTV 영상은 없으나, 사고 장면을 직접 목격하고 구체적으로 진술한 목격자가 확인되었습니다.');
    } else if (hasAftermath && hasReportBackup) {
      verdict = 'recognized';
      reasons.push('사고 장면을 직접 목격한 진술은 없으나, 사고 직후 정황을 확인한 간접 진술과 사고 직후 보고기록이 함께 확인되어 인정 방향으로 검토합니다.');
    } else if (onlySecondOrUnaware && !hasReportBackup) {
      verdict = 'unrecognized';
      reasons.push('CCTV에 사고 장면이 확인되지 않았고, 당일 근무 영상에서도 이상행동이 확인되지 않았습니다.');
      reasons.push('목격자 면담 결과 사고 장면을 직접 목격하거나 사고 직후 정황을 확인한 진술은 없으며, 전해 들었다는 수준의 진술만 확인되었습니다.');
      reasons.push('카톡·팀즈 등 사고 직후 보고기록도 확인되지 않아, 현재 확보된 자료만으로는 재해 발생 사실을 객관적으로 확인하기 어렵습니다.');
    } else {
      verdict = 'review';
      if (hasDirectVague) {
        reasons.push('사고 장면을 직접 목격했다는 진술은 있으나, 사고 시간·장소·경위가 구체적으로 확인되지 않았습니다.');
      } else {
        reasons.push('일부 진술이 있으나 직접 목격·정황 확인 등 사실관계를 뒷받침할 근거가 충분하지 않습니다.');
      }
      reasons.push('현재 자료만으로는 인정·불인정을 판단하기 어려워 추가 확인이 필요합니다.');
    }

    return { verdict, reasons, base, witnesses, classified };
  }

  const VERDICT_META = {
    recognized: { label: '인정 검토', icon: '✅', className: 'judge-verdict-ok' },
    unrecognized: { label: '불인정 검토', icon: '🚫', className: 'judge-verdict-no' },
    review: { label: '추가 확인 필요', icon: '⚠️', className: 'judge-verdict-review' }
  };

  /* =========================================================
     4. 결과 문서 자동 생성 — 정식 확인서 형태로 바로 렌더링
     ========================================================= */
  // 목격자 면담 카드에서 이름만 모아 "면담자명" 문자열로 합칩니다. (예: "고길동, 임꺽정, 가나다")
  function collectWitnessNames(classified) {
    return classified
      .map(x => (x.w.name || '').trim())
      .filter(Boolean)
      .join(', ');
  }

  const DOC_VERDICT_META = {
    recognized: { label: '인정 검토', icon: '✅', boxClass: 'doc-verdict-ok' },
    unrecognized: { label: '불인정 검토', icon: '🚫', boxClass: 'doc-verdict-no' },
    review: { label: '추가 확인 필요', icon: '⚠️', boxClass: 'doc-verdict-review' }
  };

  // 불인정/추가확인 문단 (편집 가능 영역의 초기 문구)
  function buildAppendixHtml(result) {
    const b = result.base;
    const storeName = b.invStoreName || '○○점';
    const victimName = b.invVictimName || '재해자';
    const dateStr = b.invIncidentDate || '○○○○-○○-○○';
    const timeStr = b.invIncidentTime || '○○:○○';
    const placeStr = b.invIncidentPlace || '○○ 장소';

    if (result.verdict === 'unrecognized') {
      return `
        <p>${escapeHtml(victimName)}은 ${escapeHtml(dateStr)} ${escapeHtml(timeStr)}경 ${escapeHtml(storeName)} 내 ${escapeHtml(placeStr)}에서 업무 중 부상을 입었다고 주장하고 있으나, 사업장에서 확인 가능한 객관자료를 검토한 결과 재해 발생 사실을 확인하기 어려운 것으로 판단됩니다.</p>
        <p>먼저, 사고 장면이 확인되는 CCTV 영상은 확인되지 않았으며, 당일 근무 영상 확인 결과 통증 호소·이상행동 등 사고 직후 정황도 확인되지 않았습니다.</p>
        <p>또한 당일 근무자 면담 결과, 사고 장면을 직접 목격하였거나 사고 직후 정황을 확인한 진술은 확인되지 않았습니다. 일부 진술은 전해 들었다는 수준에 해당하여 사고 발생 사실을 직접 확인한 자료로 보기 어렵습니다.</p>
        <p>아울러 카톡·팀즈 등 사고 직후 보고기록도 확인되지 않아 현재 확보된 자료만으로는 재해 발생 사실을 객관적으로 확인하기 어렵습니다.</p>
        <p>따라서 사업장에서는 현재 확인 가능한 자료를 기준으로 본 건 재해사실을 인정하기 어렵다는 의견을 제출합니다. 다만 최종 업무상 재해 인정 여부는 근로복지공단의 조사 및 판단에 따릅니다.</p>
      `;
    }
    if (result.verdict === 'review') {
      return `
        <p>현재 확보된 자료만으로는 인정·불인정을 판단하기 어렵습니다. 추가 자료(직접 목격 진술의 구체화, CCTV·보고기록 등)를 확보한 뒤 안전보건팀과 함께 재검토가 필요합니다.</p>
      `;
    }
    return '';
  }

  /**
   * 결과 문서를 정식 확인서 레이아웃(HTML)으로 #invDocPreview에 렌더링합니다.
   * 판단사유/별지 문구는 contenteditable로 두어, 제출 전 직접 다듬을 수 있게 합니다.
   */
  function renderDocPreview(result) {
    const b = result.base;
    const meta = DOC_VERDICT_META[result.verdict];
    const orgStr = [b.invDivision, b.invDept, b.invTeam].filter(Boolean).join(' - ') || '-';
    const storeName = b.invStoreName || '-';
    const victimName = b.invVictimName || '-';
    const author = b.invAuthorName || '-';
    const interviewerNames = collectWitnessNames(result.classified) || '-';
    const dateStr = b.invIncidentDate || '-';
    const timeStr = b.invIncidentTime || '-';
    const placeStr = b.invIncidentPlace || '-';

    const recordLines = [];
    if (b.invReportImmediate) {
      recordLines.push(`즉시 보고 기록 있음${b.invReportImmediateDetail ? ' : ' + escapeHtml(b.invReportImmediateDetail) : ''}`);
    }
    if (b.invReportChat) {
      recordLines.push(`카톡/팀즈 등 기록 있음 (증빙 캡처 ${chatImages.length}건 첨부)`);
    }

    const witnessRows = result.classified.map((x, i) => `
      <tr>
        <td>${escapeHtml(x.w.name) || `목격자${i + 1}`}</td>
        <td>${escapeHtml(x.w.activity) || '-'}</td>
        <td>${escapeHtml(x.c.label)}</td>
        <td>${escapeHtml(x.w.extra) || '-'}</td>
      </tr>
    `).join('');

    const appendixHtml = buildAppendixHtml(result);
    const appendixTitle = result.verdict === 'unrecognized'
      ? '■ 보험가입자의견서 별지 — 재해사실 불인정 사유'
      : (result.verdict === 'review' ? '■ 후속 조치' : '');

    const attachGrid = chatImages.length
      ? `<div class="doc-section"><p class="doc-section-title">■ 첨부 : 공유·보고 기록 캡처</p><div class="doc-attach-grid">${chatImages.map((img, i) => `<img src="${img.dataUrl}" alt="증빙 캡처 ${i + 1}">`).join('')}</div></div>`
      : '';

    document.getElementById('invDocPreview').innerHTML = `
      <div class="doc-header">
        <p class="doc-header-title">사고조사 결과 확인서</p>
        <p class="doc-header-sub">사고 관리번호 : ${escapeHtml(getOrCreateCaseId())}</p>
      </div>

      <div class="doc-verdict-banner ${meta.boxClass}">
        <span>${meta.icon}</span><span>검토 결과 : ${meta.label}</span>
      </div>

      <div class="doc-info-grid">
        <div class="doc-info-cell"><span class="doc-info-label">조직</span><span class="doc-info-value">${escapeHtml(orgStr)}</span></div>
        <div class="doc-info-cell"><span class="doc-info-label">매장명</span><span class="doc-info-value">${escapeHtml(storeName)}</span></div>
        <div class="doc-info-cell"><span class="doc-info-label">재해자</span><span class="doc-info-value">${escapeHtml(victimName)}</span></div>
        <div class="doc-info-cell"><span class="doc-info-label">사고 일시</span><span class="doc-info-value">${escapeHtml(dateStr)} ${escapeHtml(timeStr)}</span></div>
        <div class="doc-info-cell"><span class="doc-info-label">사고 장소</span><span class="doc-info-value">${escapeHtml(placeStr)}</span></div>
        <div class="doc-info-cell"><span class="doc-info-label">작성자</span><span class="doc-info-value">${escapeHtml(author)}</span></div>
        <div class="doc-info-cell"><span class="doc-info-label">면담자명</span><span class="doc-info-value">${escapeHtml(interviewerNames)}</span></div>
      </div>

      <div class="doc-section">
        <p class="doc-section-title">■ 판단 사유</p>
        <ul class="doc-reason-list doc-editable" contenteditable="true">
          ${result.reasons.map(r => `<li>${escapeHtml(r)}</li>`).join('')}
        </ul>
      </div>

      <div class="doc-section">
        <p class="doc-section-title">■ 공유·보고 기록</p>
        <ul class="doc-record-list">
          ${recordLines.length ? recordLines.map(r => `<li>${r}</li>`).join('') : '<li>확인된 보고 기록 없음</li>'}
        </ul>
      </div>

      <div class="doc-section">
        <p class="doc-section-title">■ 목격자 면담 요약</p>
        ${witnessRows ? `
          <table class="doc-witness-table">
            <thead><tr><th>이름</th><th>사고 당시 행위</th><th>분류</th><th>추가사항</th></tr></thead>
            <tbody>${witnessRows}</tbody>
          </table>
        ` : '<p style="font-size:12.5px;color:var(--gray-500);">면담 기록 없음</p>'}
      </div>

      ${appendixHtml ? `
        <div class="doc-section">
          <p class="doc-section-title">${appendixTitle}</p>
          <div class="doc-appendix-box doc-editable" contenteditable="true">${appendixHtml}</div>
        </div>
      ` : ''}

      ${attachGrid}

      <div class="doc-signature-row">
        <span>작성자</span>
        <span class="doc-signature-name">${escapeHtml(author)}</span>
      </div>

      <p class="doc-footer-note">
        본 자료는 사고 당시 사실관계 확인 및 보험가입자의견서 작성 참고를 위한 내부 확인자료입니다. 산재 승인 여부의 최종 판단은 근로복지공단에서 결정합니다.
      </p>
    `;
  }

  // 문서 미리보기(사용자가 직접 수정한 내용 포함)를 순수 텍스트로 변환 — 구글시트 '문서내용' 컬럼 등에 사용
  function docPreviewToPlainText() {
    const preview = document.getElementById('invDocPreview');
    return preview ? preview.innerText.trim() : '';
  }

  function renderResult(result) {
    const meta = VERDICT_META[result.verdict];
    const classifyRows = result.classified.map((x, i) =>
      `<li>면담 ${i + 1} (${escapeHtml(x.w.name) || '이름 미입력'}) — <strong>${x.c.label}</strong></li>`
    ).join('');

    document.getElementById('invResultArea').innerHTML = `
      <div class="judge-result-box ${meta.className}">
        <div class="judge-result-icon">${meta.icon}</div>
        <h3 class="judge-result-title">${meta.label}</h3>
        <ul class="judge-reason-list">
          ${result.reasons.map(r => `<li>${r}</li>`).join('')}
        </ul>
        ${classifyRows ? `<p class="field-label" style="text-align:left;">면담별 분류</p><ul class="judge-reason-list">${classifyRows}</ul>` : ''}
      </div>
    `;

    // 결과 종류와 무관하게 항상 정식 확인서 형태의 문서를 렌더링해 PDF/Teams로 남길 수 있게 함
    const docBox = document.getElementById('invDocBox');
    if (docBox) {
      renderDocPreview(result);
      docBox.style.display = 'block';
    }
  }

  const runBtn = document.getElementById('runInvestigationBtn');
  if (runBtn) {
    runBtn.addEventListener('click', () => {
      const result = computeJudgement();
      window.__investigationResult = result;
      renderResult(result);
      // 결과를 아래로 이어붙이는 대신, 새 화면처럼 전체를 덮는 오버레이로 전환합니다.
      const overlay = document.getElementById('invResultOverlay');
      if (overlay) {
        overlay.classList.add('visible');
        const body = overlay.querySelector('.inv-result-body');
        if (body) body.scrollTo({ top: 0 });
      }
    });
  }

  const invResultBackBtn = document.getElementById('invResultBackBtn');
  if (invResultBackBtn) {
    invResultBackBtn.addEventListener('click', () => {
      const overlay = document.getElementById('invResultOverlay');
      if (overlay) overlay.classList.remove('visible');
    });
  }

  /* =========================================================
     6. Teams 전송 (payload 생성 + 결과문서 이미지 캡처 + 미리보기)
     ========================================================= */

  // 지정 시간(ms) 안에 promise가 끝나지 않으면 강제로 null을 반환합니다.
  // 모바일 브라우저에서 캡처가 멈춰버려도 전송 자체가 영원히 멈추지 않도록 하는 안전장치입니다.
  function withTimeout(promise, ms) {
    return new Promise(resolve => {
      let done = false;
      const timer = setTimeout(() => { if (!done) { done = true; resolve(null); } }, ms);
      promise.then(v => { if (!done) { done = true; clearTimeout(timer); resolve(v); } })
        .catch(() => { if (!done) { done = true; clearTimeout(timer); resolve(null); } });
    });
  }

  function waitForUiPaint() {
    return new Promise(resolve => {
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    });
  }

  function resetLastPdf() {
    window.__lastPdfBlob = null;
    window.__lastDocumentLink = '';
  }

  function getLastPdfBlob() {
    return window.__lastPdfBlob instanceof Blob ? window.__lastPdfBlob : null;
  }

  function setSharePdfAvailability() {
    const btn = document.getElementById('sharePdfBtn');
    if (!btn) return;
    const ready = !!window.__lastDocumentLink;
    btn.disabled = !ready;
    btn.title = ready ? '생성된 PDF를 엽니다.' : 'PDF 링크를 확인하는 중입니다.';
  }

  function updateSubmitOverlay(step, message, progress) {
    const overlay = document.getElementById('submitOverlay');
    const eyebrow = document.getElementById('submitEyebrow');
    const title = document.getElementById('submitTitle');
    const msg = document.getElementById('submitMessage');
    const fill = document.getElementById('submitProgressFill');
    const spinner = document.getElementById('submitSpinner');
    const actions = document.getElementById('submitDoneActions');
    if (!overlay) return;
    overlay.classList.add('visible');
    overlay.setAttribute('aria-hidden', 'false');
    if (eyebrow) eyebrow.textContent = step || '전송 진행 중';
    if (title) title.textContent = progress >= 100 ? '전송 완료' : '잠시만 기다려주세요';
    if (msg) msg.textContent = message || '';
    if (fill) fill.style.width = `${Math.max(5, Math.min(100, progress || 8))}%`;
    if (spinner) spinner.classList.toggle('done', progress >= 100);
    if (actions) actions.style.display = progress >= 100 ? 'flex' : 'none';
  }

  function hideSubmitOverlay() {
    const overlay = document.getElementById('submitOverlay');
    if (!overlay) return;
    overlay.classList.remove('visible');
    overlay.setAttribute('aria-hidden', 'true');
  }

  function drawWrappedText(ctx, text, x, y, maxWidth, lineHeight) {
    const words = String(text || '').replace(/\s+/g, ' ').trim().split(' ');
    const lines = [];
    let line = '';

    words.forEach(word => {
      const candidate = line ? `${line} ${word}` : word;
      if (ctx.measureText(candidate).width <= maxWidth) {
        line = candidate;
        return;
      }
      if (line) lines.push(line);

      if (ctx.measureText(word).width <= maxWidth) {
        line = word;
        return;
      }

      let chunk = '';
      Array.from(word).forEach(ch => {
        const next = chunk + ch;
        if (ctx.measureText(next).width > maxWidth && chunk) {
          lines.push(chunk);
          chunk = ch;
        } else {
          chunk = next;
        }
      });
      line = chunk;
    });

    if (line) lines.push(line);
    lines.forEach((part, i) => ctx.fillText(part, x, y + i * lineHeight));
    return y + Math.max(lines.length, 1) * lineHeight;
  }

  function createCanvasFallbackPdf() {
    if (typeof window.jspdf === 'undefined') return null;

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const result = window.__investigationResult || computeJudgement();
    const b = result.base || {};
    const meta = VERDICT_META[result.verdict] || { label: result.verdict || '-' };
    const pageW = 1240;
    const pageH = 1754;
    const margin = 86;
    const contentW = pageW - margin * 2;
    const fontFamily = '"Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';
    const pages = [];
    let canvas;
    let ctx;
    let y;

    function newPage() {
      canvas = document.createElement('canvas');
      canvas.width = pageW;
      canvas.height = pageH;
      ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, pageW, pageH);
      ctx.fillStyle = '#0D1B36';
      ctx.font = `700 34px ${fontFamily}`;
      ctx.fillText('사고조사 결과 문서', margin, 92);
      ctx.fillStyle = '#E60012';
      ctx.fillRect(margin, 116, contentW, 5);
      y = 165;
      pages.push(canvas);
    }

    function ensure(extraHeight) {
      if (y + extraHeight <= pageH - margin) return;
      newPage();
    }

    function section(title) {
      ensure(92);
      ctx.fillStyle = '#F2F4F7';
      ctx.fillRect(margin, y, contentW, 50);
      ctx.fillStyle = '#0D1B36';
      ctx.font = `700 24px ${fontFamily}`;
      ctx.fillText(title, margin + 24, y + 33);
      y += 78;
    }

    function row(label, value) {
      ctx.font = `700 22px ${fontFamily}`;
      const labelW = 190;
      const startY = y;
      ctx.fillStyle = '#344054';
      ctx.fillText(label, margin + 12, y);
      ctx.font = `400 22px ${fontFamily}`;
      ctx.fillStyle = '#101828';
      y = drawWrappedText(ctx, value || '-', margin + labelW, y, contentW - labelW - 12, 31);
      y = Math.max(y, startY + 34);
    }

    function paragraph(text) {
      ctx.font = `400 22px ${fontFamily}`;
      ctx.fillStyle = '#101828';
      y = drawWrappedText(ctx, text || '-', margin + 12, y, contentW - 24, 32);
      y += 10;
    }

    newPage();

    section('기본 정보');
    [
      ['사고관리번호', getOrCreateCaseId()],
      ['조직', [b.invDivision, b.invDept, b.invTeam].filter(Boolean).join(' - ') || '-'],
      ['매장명', b.invStoreName || '-'],
      ['재해자', b.invVictimName || '-'],
      ['사고일시', `${b.invIncidentDate || '-'} ${b.invIncidentTime || ''}`],
      ['사고장소', b.invIncidentPlace || '-'],
      ['작성자', b.invAuthorName || '-'],
      ['면담자명', collectWitnessNames(result.classified) || '-']
    ].forEach(([label, value]) => {
      ensure(70);
      row(label, value);
    });

    section('검토 결과');
    ctx.fillStyle = result.verdict === 'recognized' ? '#15803d' : (result.verdict === 'unrecognized' ? '#E60012' : '#b45309');
    ctx.font = `700 38px ${fontFamily}`;
    ctx.fillText(meta.label || '-', margin + 12, y);
    y += 62;

    section('판단 사유');
    (result.reasons && result.reasons.length ? result.reasons : ['판단 사유가 없습니다.']).forEach(reason => {
      ensure(90);
      paragraph(`- ${reason}`);
    });

    section('문서 내용');
    docPreviewToPlainText().split(/\n+/).filter(Boolean).forEach(line => {
      ensure(95);
      paragraph(line);
    });

    pages.forEach((page, index) => {
      if (index > 0) pdf.addPage();
      pdf.addImage(page.toDataURL('image/jpeg', 0.86), 'JPEG', 0, 0, 210, 297);
    });

    const rawUri = pdf.output('datauristring');
    const base64Part = rawUri.split(',').pop();
    window.__lastPdfBlob = pdf.output('blob');
    return 'data:application/pdf;base64,' + base64Part;
  }

  // 화면에 보이는 결과문서(#invDocPreview)를 실제 PDF 파일(base64)로 만듭니다.
  // (html2canvas로 이미지를 찍은 뒤 jsPDF A4 여러 페이지에 나눠 붙입니다)
  //
  // [성능 주의] 캡처 안에 카톡·팀즈 첨부 원본 사진(고해상도)까지 포함하면
  // 캡처 용량이 커져 휴대폰에서 화면이 멈춘 것처럼 느려집니다. 그 사진들은
  // 이미 별도 파일로 Drive에 저장되므로, 문서 캡처 시에는 잠깐 숨겨서
  // 문서(글자·표) 부분만 가볍게 캡처합니다.
  function buildDocumentPdf() {
    resetLastPdf();
    const preview = document.getElementById('invDocPreview');
    if (!preview || typeof window.jspdf === 'undefined') {
      return Promise.resolve(null);
    }
    if (typeof html2canvas === 'undefined') {
      return Promise.resolve(createCanvasFallbackPdf());
    }

    const attachGrid = preview.querySelector('.doc-attach-grid');
    const attachSection = attachGrid ? attachGrid.closest('.doc-section') : null;
    const prevDisplay = attachSection ? attachSection.style.display : null;
    if (attachSection) attachSection.style.display = 'none';

    const capturePromise = new Promise(resolve => setTimeout(resolve, 50))
      .then(() => html2canvas(preview, { scale: 1.1, backgroundColor: '#ffffff', logging: false }))
      .then(canvas => {
        const { jsPDF } = window.jspdf;
        const imgData = canvas.toDataURL('image/jpeg', 0.78);
        // 카톡/Teams에서 길쭉한 사용자 정의 PDF가 깨져 보이는 경우가 있어,
        // 표준 A4 페이지 여러 장으로 나눠 생성합니다.
        const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
        const pageWidthMm = 210;
        const pageHeightMm = 297;
        const imgHeightMm = (canvas.height * pageWidthMm) / canvas.width;
        let y = 0;
        let remainingHeight = imgHeightMm;

        pdf.addImage(imgData, 'JPEG', 0, y, pageWidthMm, imgHeightMm);
        remainingHeight -= pageHeightMm;

        while (remainingHeight > 0) {
          pdf.addPage();
          y -= pageHeightMm;
          pdf.addImage(imgData, 'JPEG', 0, y, pageWidthMm, imgHeightMm);
          remainingHeight -= pageHeightMm;
        }

        // jsPDF의 datauristring은 "data:application/pdf;filename=...;base64,..." 형태로
        // 중간에 filename 항목이 끼어있어, 서버(Code.gs)가 기대하는
        // 표준 "data:application/pdf;base64,..." 형태로 정리합니다.
        const rawUri = pdf.output('datauristring');
        const base64Part = rawUri.split(',').pop();
        // "PDF 공유하기" 버튼(카톡/Teams 앱 선택 등 OS 공유시트)에서 쓸 수 있도록
        // 같은 PDF의 Blob도 전역에 보관해둡니다.
        window.__lastPdfBlob = pdf.output('blob');
        return 'data:application/pdf;base64,' + base64Part;
      })
      .catch(() => null)
      .finally(() => {
        if (attachSection && prevDisplay !== null) attachSection.style.display = prevDisplay;
      });

    // 모바일에서 DOM 캡처가 실패하면 깨지지 않는 캔버스 기반 문서 PDF로 대체합니다.
    return withTimeout(capturePromise, 20000)
      .then(docDataUri => docDataUri || createCanvasFallbackPdf());
  }

  function buildAttachmentPayload(b) {
    if (!chatImages.length) return [];
    const dateStr = (b.invIncidentDate || '').replace(/-/g, '') || 'unknown';
    const storeStr = (b.invStoreName || '매장').replace(/[\\/:*?"<>|]/g, '');
    const authorStr = (b.invAuthorName || '작성자').replace(/[\\/:*?"<>|]/g, '');
    return chatImages.map((img, i) => {
      const ext = (img.name && img.name.includes('.')) ? img.name.split('.').pop() : 'jpg';
      return {
        fileName: `${dateStr}_${storeStr}_${authorStr}_${i + 1}.${ext}`,
        dataUrl: img.dataUrl
      };
    });
  }

  function buildAttachmentMeta() {
    return chatImages.map((img, i) => ({
      index: i + 1,
      fileName: img.name || `capture_${i + 1}.jpg`,
      bytes: img.compressedBytes || dataUrlByteSize(img.dataUrl),
      originalBytes: img.originalBytes || 0,
      width: img.width || 0,
      height: img.height || 0
    }));
  }

  /**
   * 이미지 캡처 없이 즉시 만들 수 있는 payload 기본형 (모달 열 때 미리보기용).
   * attachments는 카톡·팀즈 캡처만 포함하고, 결과문서 이미지는 아직 없습니다.
   */
  function buildPayloadBase(result) {
    const b = result.base;
    const meta = VERDICT_META[result.verdict];

    const countByType = { direct: 0, aftermath: 0, secondhand: 0, unaware: 0 };
    result.classified.forEach(x => {
      if (x.c.type === 'direct' || x.c.type === 'directVague') countByType.direct += 1;
      else if (x.c.type === 'aftermath') countByType.aftermath += 1;
      else if (x.c.type === 'secondhand') countByType.secondhand += 1;
      else if (x.c.type === 'unaware') countByType.unaware += 1;
    });

    return {
      caseId: getOrCreateCaseId(),
      title: '사고조사 결과 접수',
      division: b.invDivision,
      department: b.invDept,
      team: b.invTeam,
      storeName: b.invStoreName,
      author: b.invAuthorName,
      interviewerNames: collectWitnessNames(result.classified),
      victim: b.invVictimName,
      incidentDate: b.invIncidentDate,
      incidentTime: b.invIncidentTime,
      incidentPlace: b.invIncidentPlace,
      verdict: meta.label,
      reasons: result.reasons,
      witnessCount: result.witnesses.length,
      directCount: countByType.direct,
      aftermathCount: countByType.aftermath,
      secondhandCount: countByType.secondhand,
      unawareCount: countByType.unaware,
      document: docPreviewToPlainText(),
      note: '본 자료는 내부 확인용이며 최종 산재 판단은 근로복지공단이 결정합니다.',
      attachments: buildAttachmentPayload(b),
      attachmentMeta: buildAttachmentMeta()
    };
  }

  /**
   * Teams/시트로 보낼 전체 payload를 만듭니다.
   * 휴대폰 PDF 생성 실패가 반복되어 전송 자체를 막지 않도록, 결과문서 PDF는
   * Apps Script 서버에서 payload.document 기반으로 생성합니다.
   */
  function buildTeamsPayload() {
    const result = window.__investigationResult || computeJudgement();
    const payload = buildPayloadBase(result);
    payload.serverShouldCreatePdf = true;
    return Promise.resolve(payload);
  }

  function clonePayloadWithoutAttachments(payload) {
    const copy = Object.assign({}, payload);
    copy.attachments = [];
    return copy;
  }

  // payload 미리보기용 요약 텍스트를 만듭니다. (이미지 base64는 절대 넣지 않음 —
  // 거대한 문자열을 화면에 그리면 그 자체로 브라우저가 멈춘 것처럼 느려집니다)
  function buildPreviewSummary(payload) {
    const attachCount = (payload.attachments || []).length;
    return [
      `사고관리번호 : ${payload.caseId}`,
      `조직 : ${[payload.division, payload.department, payload.team].filter(Boolean).join(' - ') || '-'}`,
      `매장명 : ${payload.storeName || '-'}`,
      `재해자 : ${payload.victim || '-'}`,
      `작성자 : ${payload.author || '-'}`,
      `면담자명 : ${payload.interviewerNames || '-'}`,
      `검토결과 : ${payload.verdict}`,
      `첨부파일 : ${attachCount}건`,
      '결과문서 PDF : 서버에서 생성 후 전송 카드에 링크로 첨부',
      '',
      '판단 사유',
      ...(payload.reasons || []).map(r => '- ' + r)
    ].join('\n');
  }

  /* ---------- 모달 화면 상태 전환 (전송 전 / 전송 완료 후) ---------- */
  let isSubmittingResult = false;

  function setSubmitLock(locked) {
    isSubmittingResult = locked;
    const closeRow = document.getElementById('teamsCloseRow');
    const closeBtn = document.getElementById('closeTeamsModalBtn');
    if (locked && closeRow) closeRow.style.display = 'none';
    if (closeBtn) closeBtn.disabled = locked;
  }

  window.addEventListener('beforeunload', (e) => {
    if (!isSubmittingResult) return;
    e.preventDefault();
    e.returnValue = '';
  });

  function setTeamsModalState(state) {
    const preRow = document.getElementById('teamsPreSendRow');
    const postRow = document.getElementById('teamsPostSendRow');
    const homeRow = document.getElementById('teamsHomeRow');
    const closeRow = document.getElementById('teamsCloseRow');
    if (state === 'pre') {
      if (preRow) preRow.style.display = 'flex';
      if (postRow) postRow.style.display = 'none';
      if (homeRow) homeRow.style.display = 'none';
      if (closeRow) closeRow.style.display = 'flex';
    } else if (state === 'sending') {
      if (preRow) preRow.style.display = 'none';
      if (postRow) postRow.style.display = 'none';
      if (homeRow) homeRow.style.display = 'none';
      if (closeRow) closeRow.style.display = 'none';
    } else if (state === 'done') {
      if (preRow) preRow.style.display = 'none';
      if (postRow) postRow.style.display = 'flex';
      if (homeRow) homeRow.style.display = 'flex';
      if (closeRow) closeRow.style.display = 'none';
    }
    setSharePdfAvailability();
  }

  const invTeamsBtn = document.getElementById('invTeamsBtn');
  if (invTeamsBtn) {
    invTeamsBtn.addEventListener('click', () => {
      const preview = document.getElementById('teamsPayloadPreview');
      const statusEl = document.getElementById('teamsSendStatus');
      const noteEl = document.getElementById('teamsModalNote');
      const modal = document.getElementById('teamsModal');

      // 캡처 없이 즉시 열림 — 여기서는 무거운 작업을 하지 않아 멈춤 현상이 없습니다.
      const result = window.__investigationResult || computeJudgement();
      const lightPayload = buildPayloadBase(result);

      if (preview) preview.textContent = buildPreviewSummary(lightPayload);
      if (statusEl) statusEl.textContent = '';
      setTeamsModalState('pre');
      if (noteEl) {
        noteEl.textContent = INV_TEAMS_ENDPOINT_URL
          ? '"전송하기"를 누르면 서버에서 결과문서 PDF를 만들어 링크로 게시하고 기록을 저장합니다.'
          : '전송 연동 주소가 아직 설정되지 않아 미리보기만 가능합니다. (assets/js/investigation.js 상단의 INV_TEAMS_ENDPOINT_URL 값을 설정하세요)';
      }
      if (modal) modal.classList.add('visible');
    });
  }

  // fetch에 제한시간을 걸어, 서버 응답이 오래 걸리거나 안 와도 "전송 중"에서
  // 영원히 멈추지 않게 합니다. (AbortController 사용)
  function fetchWithTimeout(url, options, ms) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    return fetch(url, Object.assign({}, options, { signal: controller.signal }))
      .finally(() => clearTimeout(timer));
  }

  function postToEndpoint(payload, timeoutMs) {
    return fetchWithTimeout(INV_TEAMS_ENDPOINT_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    }, timeoutMs || 60000);
  }

  function getSubmissionStatus(caseId, timeoutMs) {
    return new Promise((resolve, reject) => {
      const cbName = `__submissionStatus_${Date.now()}_${Math.random().toString(16).slice(2)}`;
      const script = document.createElement('script');
      const sep = INV_TEAMS_ENDPOINT_URL.includes('?') ? '&' : '?';
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error('status-timeout'));
      }, timeoutMs || 15000);

      function cleanup() {
        clearTimeout(timer);
        delete window[cbName];
        if (script.parentNode) script.parentNode.removeChild(script);
      }

      window[cbName] = (data) => {
        cleanup();
        resolve(data || {});
      };

      script.onerror = () => {
        cleanup();
        reject(new Error('status-script-error'));
      };
      script.src = `${INV_TEAMS_ENDPOINT_URL}${sep}mode=status&caseId=${encodeURIComponent(caseId)}&callback=${encodeURIComponent(cbName)}&t=${Date.now()}`;
      document.body.appendChild(script);
    });
  }

  async function waitForDocumentLink(caseId, statusEl) {
    for (let i = 0; i < 8; i += 1) {
      if (statusEl) statusEl.textContent = `결과 PDF 링크를 확인하는 중입니다... (${i + 1}/8)`;
      try {
        const status = await getSubmissionStatus(caseId, 12000);
        if (status && status.documentLink) return status.documentLink;
      } catch (err) {
        console.warn('결과 링크 조회 실패:', err);
      }
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
    return '';
  }

  async function runReliableSubmission(payload, statusEl, buttonEl) {
    const attachments = payload.attachments || [];
    const basePayload = clonePayloadWithoutAttachments(payload);
    const totalBytes = attachments.reduce((sum, att) => sum + dataUrlByteSize(att.dataUrl), 0);

    if (statusEl) {
      statusEl.textContent = `1/3 접수 정보를 전송 중입니다. 첨부 ${attachments.length}건 / ${bytesToSize(totalBytes)}`;
    }
    updateSubmitOverlay('1/3 접수 정보 전송', `첨부 ${attachments.length}건 / ${bytesToSize(totalBytes)}\n전송 화면을 닫지 말고 잠시만 기다려주세요.`, 18);
    if (buttonEl) buttonEl.textContent = '⏳ 1/3 접수 중...';
    await postToEndpoint(Object.assign({}, basePayload, { action: 'startSubmission' }), 45000);

    for (let i = 0; i < attachments.length; i += 1) {
      const att = attachments[i];
      if (statusEl) {
        statusEl.textContent = `2/3 캡처 업로드 중입니다. (${i + 1}/${attachments.length}, ${bytesToSize(dataUrlByteSize(att.dataUrl))})`;
      }
      const uploadProgress = attachments.length
        ? 25 + Math.round(((i + 1) / attachments.length) * 45)
        : 70;
      updateSubmitOverlay('2/3 캡처 업로드', `${i + 1}/${attachments.length}번째 캡처를 업로드 중입니다.\n${bytesToSize(dataUrlByteSize(att.dataUrl))}`, uploadProgress);
      if (buttonEl) buttonEl.textContent = `⏳ 2/3 첨부 ${i + 1}/${attachments.length}`;
      await postToEndpoint({
        action: 'uploadAttachment',
        caseId: payload.caseId,
        division: payload.division,
        department: payload.department,
        team: payload.team,
        storeName: payload.storeName,
        attachment: att
      }, 45000);
    }

    if (statusEl) {
      statusEl.textContent = '3/3 서버에서 PDF를 만들고 전송 중입니다... (최대 60초)';
    }
    updateSubmitOverlay('3/3 결과문서 생성', '서버에서 PDF를 만들고 최종 전송 중입니다.', 82);
    if (buttonEl) buttonEl.textContent = '⏳ 3/3 최종 전송 중...';
    await postToEndpoint(Object.assign({}, basePayload, { action: 'finalizeSubmission' }), 60000);
    updateSubmitOverlay('결과 PDF 확인', '생성된 PDF 링크를 확인하는 중입니다.', 92);
    window.__lastDocumentLink = await waitForDocumentLink(payload.caseId, statusEl);
  }

  const sendTeamsNowBtn = document.getElementById('sendTeamsNowBtn');
  if (sendTeamsNowBtn) {
    sendTeamsNowBtn.addEventListener('click', () => {
      const statusEl = document.getElementById('teamsSendStatus');

      if (!INV_TEAMS_ENDPOINT_URL) {
        if (statusEl) {
          statusEl.textContent = '⚠ 전송 연동 주소가 설정되지 않아 실제로 전송되지 않았습니다.';
          statusEl.className = 'teams-send-status teams-send-error';
        }
        return;
      }

      // 로딩 상태를 눈에 보이게 표시 (버튼 문구 변경 + 비활성화)
      resetLastPdf();
      setSharePdfAvailability();
      sendTeamsNowBtn.disabled = true;
      sendTeamsNowBtn.textContent = '⏳ 전송 준비 중...';
      if (statusEl) {
        statusEl.textContent = '휴대폰에서는 PDF를 만들지 않고, 서버에서 결과문서 PDF를 생성합니다.';
        statusEl.className = 'teams-send-status';
      }
      setSubmitLock(true);
      setTeamsModalState('sending');
      updateSubmitOverlay('전송 준비', '안정적인 전송을 준비하고 있습니다.\n화면을 닫지 말고 기다려주세요.', 8);

      // 버튼/상태 문구가 먼저 화면에 그려진 뒤 전송을 시작합니다.
      waitForUiPaint()
        .then(() => buildTeamsPayload())
        .then(payload => {
          sendTeamsNowBtn.textContent = '⏳ 단계별 전송 중...';
          if (statusEl) {
            statusEl.textContent = '모바일 안정 전송을 시작합니다...';
          }
          return runReliableSubmission(payload, statusEl, sendTeamsNowBtn);
        })
        .then(() => {
          if (statusEl) {
            statusEl.textContent = window.__lastDocumentLink
              ? '✅ 전송이 완료되었습니다. 결과보기를 눌러 PDF를 확인하세요.'
              : '✅ 전송은 완료되었습니다. PDF 링크는 전송 카드에서 확인하세요.';
            statusEl.className = window.__lastDocumentLink
              ? 'teams-send-status teams-send-ok'
              : 'teams-send-status';
          }
          // 서버에서 PDF를 만들기 때문에 휴대폰 공유 버튼은 로컬 PDF가 있을 때만 활성화됩니다.
          setTeamsModalState('done');
          if (teamsModalEl) teamsModalEl.classList.remove('visible');
          updateSubmitOverlay(
            '전송 완료',
            window.__lastDocumentLink
              ? '결과보기를 눌러 생성된 PDF를 확인하고 저장할 수 있습니다.'
              : '전송은 완료되었습니다. 전송 카드에서 결과문서 보기를 확인해주세요.',
            100
          );
        })
        .catch(err => {
          if (statusEl) {
            statusEl.textContent = '⚠ 전송에 실패했습니다(시간 초과 포함). 네트워크 상태를 확인한 뒤 다시 시도해주세요.';
            statusEl.className = 'teams-send-status teams-send-error';
          }
          hideSubmitOverlay();
          if (getLastPdfBlob()) setTeamsModalState('done');
          else setTeamsModalState('pre');
        })
        .finally(() => {
          setSubmitLock(false);
          sendTeamsNowBtn.disabled = false;
          sendTeamsNowBtn.textContent = '전송하기';
        });
    });
  }

  /* ---------- 모달 닫기 ---------- */
  const closeTeamsModalBtn = document.getElementById('closeTeamsModalBtn');
  const teamsModalEl = document.getElementById('teamsModal');
  if (closeTeamsModalBtn && teamsModalEl) {
    closeTeamsModalBtn.addEventListener('click', () => {
      teamsModalEl.classList.remove('visible');
    });
  }
  // 모달 바깥(회색 배경) 클릭 시에도 닫힘
  if (teamsModalEl) {
    teamsModalEl.addEventListener('click', (e) => {
      if (isSubmittingResult) return;
      if (e.target === teamsModalEl) teamsModalEl.classList.remove('visible');
    });
  }

  /* =========================================================
     PDF 링크 확인 안내
     ---------------------------------------------------------
     모바일 안정 전송 구조에서는 PDF가 휴대폰이 아니라 Apps Script 서버에서
     생성되어 Drive에 저장됩니다. 링크는 전송된 카드의 "결과문서 보기" 버튼에
     붙으므로, 이 버튼은 사용자를 그 위치로 안내합니다.
     ========================================================= */
  const sharePdfBtn = document.getElementById('sharePdfBtn');
  if (sharePdfBtn) {
    sharePdfBtn.addEventListener('click', () => {
      if (window.__lastDocumentLink) {
        window.open(window.__lastDocumentLink, '_blank', 'noopener');
        return;
      }
      alert('PDF 링크를 아직 확인하지 못했습니다. 전송된 카드의 "결과문서 보기" 버튼에서 확인해주세요.');
    });
  }

  const submitResultBtn = document.getElementById('submitResultBtn');
  if (submitResultBtn) {
    submitResultBtn.addEventListener('click', () => {
      if (window.__lastDocumentLink) {
        window.open(window.__lastDocumentLink, '_blank', 'noopener');
        return;
      }
      alert('PDF 링크를 아직 확인하지 못했습니다. 전송된 카드의 "결과문서 보기" 버튼에서 확인해주세요.');
    });
  }

  const submitHomeBtn = document.getElementById('submitHomeBtn');
  if (submitHomeBtn) {
    submitHomeBtn.addEventListener('click', () => {
      hideSubmitOverlay();
      const homeTarget = document.querySelector('.nav-menu-item[data-target="manual"]') ? 'manual' : 'investigation';
      const homeBtn = document.querySelector(`.nav-menu-item[data-target="${homeTarget}"]`);
      if (homeBtn) homeBtn.click();
    });
  }

  /* ---------- 홈으로 (모달 닫고 즉시대응 화면으로 이동) ---------- */
  const teamsHomeBtn = document.getElementById('teamsHomeBtn');
  if (teamsHomeBtn) {
    teamsHomeBtn.addEventListener('click', () => {
      const modal = document.getElementById('teamsModal');
      if (modal) modal.classList.remove('visible');
      const homeTarget = document.querySelector('.nav-menu-item[data-target="manual"]') ? 'manual' : 'investigation';
      const homeBtn = document.querySelector(`.nav-menu-item[data-target="${homeTarget}"]`);
      if (homeBtn) homeBtn.click();
    });
  }

});
