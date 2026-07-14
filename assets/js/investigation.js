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
      "인정 검토 / 불인정 검토" 두 가지로만 표현합니다.
   ========================================================= */

const INV_BASE_KEY = 'fieldGuide_investigation_base';
const INV_WITNESS_KEY = 'fieldGuide_investigation_witnesses';
const INV_CASE_ID_KEY = 'fieldGuide_investigation_caseId';
const INV_DOWNLOAD_TOKEN_KEY = 'fieldGuide_investigation_downloadToken';

/*
 * [Teams/기록관리 연동]
 * Google Apps Script를 "웹 앱"으로 배포하면 URL이 하나 생깁니다.
 * (../apps-script/README.md 참고). 그 URL을 아래에 그대로 붙여넣으면
 * "Teams로 전송" 버튼이 실제로 동작합니다.
 * 비워두면 미리보기만 표시되고 실제 전송은 되지 않습니다.
 */
const INV_TEAMS_ENDPOINT_URL = 'https://script.google.com/macros/s/AKfycbxQ8t-oSMh97agNb48SOXaZMMhvzLr7JIkZirRNWgWJ8X4Jo-ZN0lBHtHEMqV3K_4U/exec'; // 예: 'https://script.google.com/macros/s/AKfycb.../exec' (새로 배포한 뒤 여기에 붙여넣기)

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

  function generateDownloadToken() {
    const bytes = new Uint8Array(24);
    if (window.crypto && window.crypto.getRandomValues) {
      window.crypto.getRandomValues(bytes);
      return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
    }
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
  }

  function getOrCreateDownloadToken() {
    let token = localStorage.getItem(INV_DOWNLOAD_TOKEN_KEY);
    if (!token) {
      token = generateDownloadToken();
      localStorage.setItem(INV_DOWNLOAD_TOKEN_KEY, token);
    }
    return token;
  }

  function buildDownloadUrl(caseId, token) {
    if (!INV_TEAMS_ENDPOINT_URL || !caseId || !token) return '';
    const sep = INV_TEAMS_ENDPOINT_URL.includes('?') ? '&' : '?';
    return `${INV_TEAMS_ENDPOINT_URL}${sep}mode=result&caseId=${encodeURIComponent(caseId)}&token=${encodeURIComponent(token)}&t=${Date.now()}`;
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
      localStorage.removeItem(INV_DOWNLOAD_TOKEN_KEY);
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
    'invIncidentDate', 'invIncidentTime', 'invReportImmediateDetail', 'invWorkVideoDetail', 'invWorkVideoUnavailableReason'
  ];
  const BASE_CHECK_IDS = ['invReportImmediate', 'invReportChat', 'invNoWitness'];
  const BASE_RADIO_NAMES = ['invCctv', 'invWorkVideoAvailable', 'invWorkVideoAbnormal', 'invReportRecord'];

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

  // 사고 장면이 직접 확인되지 않을 때 당일의 다른 근무영상 확보 여부와 관찰 결과를 확인
  function refreshConditional() {
    const cctv = (document.querySelector('input[name="invCctv"]:checked') || {}).value;
    const wrap = document.getElementById('invWorkVideoWrap');
    const available = (document.querySelector('input[name="invWorkVideoAvailable"]:checked') || {}).value;
    const observationWrap = document.getElementById('invWorkVideoObservationWrap');
    const unavailableWrap = document.getElementById('invWorkVideoUnavailableWrap');
    if (wrap) {
      const show = (cctv === 'unclear' || cctv === 'none');
      wrap.style.display = show ? 'block' : 'none';
      wrap.classList.toggle('is-visible', show);
      if (!show) {
        clearValidation(document.getElementById('invWorkVideoAvailableGroup'));
        clearValidation(document.getElementById('invWorkVideoObservationGroup'));
        clearValidation(document.getElementById('invWorkVideoDetailWrap'));
        document.querySelectorAll('input[name="invWorkVideoAvailable"], input[name="invWorkVideoAbnormal"]').forEach(r => { r.checked = false; });
        const detail = document.getElementById('invWorkVideoDetail');
        const reason = document.getElementById('invWorkVideoUnavailableReason');
        if (detail) detail.value = '';
        if (reason) reason.value = '';
      }
    }
    if (observationWrap) {
      const showObservation = (cctv === 'unclear' || cctv === 'none') && available === 'yes';
      observationWrap.style.display = showObservation ? 'block' : 'none';
      if (!showObservation) {
        clearValidation(document.getElementById('invWorkVideoObservationGroup'));
        clearValidation(document.getElementById('invWorkVideoDetailWrap'));
        document.querySelectorAll('input[name="invWorkVideoAbnormal"]').forEach(r => { r.checked = false; });
        const detail = document.getElementById('invWorkVideoDetail');
        if (detail) detail.value = '';
      }
    }
    if (unavailableWrap) {
      const showUnavailable = (cctv === 'unclear' || cctv === 'none') && available === 'no';
      unavailableWrap.style.display = showUnavailable ? 'block' : 'none';
      if (!showUnavailable) {
        const reason = document.getElementById('invWorkVideoUnavailableReason');
        if (reason) reason.value = '';
      }
    }

    // 공유기록 선택에 따라 첨부 또는 기타사항 입력란을 표시합니다.
    const reportImm = document.getElementById('invReportImmediate');
    const reportImmWrap = document.getElementById('invReportImmediateWrap');
    const reportChat = document.getElementById('invReportChat');
    const reportChatWrap = document.getElementById('invReportChatWrap');
    const reportChoice = (document.querySelector('input[name="invReportRecord"]:checked') || {}).value;
    if (reportChat) reportChat.checked = reportChoice === 'yes';
    if (reportImm) reportImm.checked = reportChoice === 'other';
    if (reportImmWrap) {
      const showOther = reportChoice === 'other';
      reportImmWrap.style.display = showOther ? 'block' : 'none';
      reportImmWrap.classList.toggle('is-visible', showOther);
      if (!showOther) {
        const detail = document.getElementById('invReportImmediateDetail');
        if (detail) detail.value = '';
      }
    }
    if (reportChatWrap) {
      const showAttachment = reportChoice === 'yes';
      reportChatWrap.style.display = showAttachment ? 'block' : 'none';
      reportChatWrap.classList.toggle('is-visible', showAttachment);
    }
  }

  function refreshRadioPillStyles() {
    panel.querySelectorAll('.radio-pill').forEach(label => {
      const input = label.querySelector('input[type="radio"], input[type="checkbox"]');
      if (input) label.classList.toggle('is-checked', input.checked);
    });
  }

  function openSimpleModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.add('visible');
  }

  function closeSimpleModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove('visible');
  }

  function bindSimpleModal(openId, modalId, closeId) {
    const openBtn = document.getElementById(openId);
    const closeBtn = document.getElementById(closeId);
    const modal = document.getElementById(modalId);
    if (openBtn) openBtn.addEventListener('click', () => openSimpleModal(modalId));
    if (closeBtn) closeBtn.addEventListener('click', () => closeSimpleModal(modalId));
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) closeSimpleModal(modalId);
      });
    }
  }

  function setSeqActive(name, active) {
    const el = panel.querySelector(`[data-inv-reveal="${name}"]`);
    if (el) el.classList.toggle('active', active);
  }

  function updateInfoRevealState() {
    setSeqActive('division', true);
    setSeqActive('dept', hasValue('invDivision'));
    setSeqActive('team', hasValue('invDept'));
    setSeqActive('store', hasValue('invTeam'));
    setSeqActive('author', hasValue('invStoreName'));
    setSeqActive('date', hasValue('invAuthorName'));
  }

  function getFlowStep(stepName) {
    return panel.querySelector(`.inv-flow-step[data-inv-step="${stepName}"]`);
  }

  function setInvestigationStep(stepName) {
    panel.querySelectorAll('.inv-flow-step').forEach(step => {
      step.classList.toggle('active', step.dataset.invStep === stepName);
    });
    panel.querySelectorAll('[data-inv-progress]').forEach(item => {
      item.classList.toggle('active', item.dataset.invProgress === stepName);
    });
    const activeStep = getFlowStep(stepName);
    if (activeStep) activeStep.scrollIntoView({ behavior: 'smooth', block: 'start' });
    updateInvestigationFlowState();
    if (stepName === 'evidence') {
      let guideSeenRecently = false;
      try {
        const seenUntil = Number(localStorage.getItem(VIDEO_GUIDE_SEEN_UNTIL_KEY) || 0);
        guideSeenRecently = seenUntil > Date.now();
      } catch (e) {}
      if (!guideSeenRecently) {
        if (videoGuideTimer) clearTimeout(videoGuideTimer);
        videoGuideTimer = setTimeout(() => { videoGuideTimer = null; openVideoGuide(); }, 320);
      }
    }
  }

  function hasValue(id) {
    const el = document.getElementById(id);
    return !!(el && String(el.value || '').trim());
  }

  function isInfoStepReady() {
    return ['invDivision', 'invDept', 'invTeam', 'invStoreName', 'invAuthorName', 'invIncidentDate'].every(hasValue);
  }

  function isEvidenceStepReady() {
    const cctv = (document.querySelector('input[name="invCctv"]:checked') || {}).value;
    if (!cctv) return false;
    if (cctv === 'clear') return true;
    const available = (document.querySelector('input[name="invWorkVideoAvailable"]:checked') || {}).value;
    if (!available) return false;
    if (available === 'no') return true;
    const observation = (document.querySelector('input[name="invWorkVideoAbnormal"]:checked') || {}).value;
    if (!observation) return false;
    if (observation === 'other') {
      return !!String((document.getElementById('invWorkVideoDetail') || {}).value || '').trim();
    }
    return true;
  }

  function clearValidation(target) {
    if (!target) return;
    const box = target.matches('input,select,textarea') ? (target.closest('[data-inv-validation-group], .form-full, .conditional-block, fieldset') || target) : target;
    box.classList.remove('inv-validation-error', 'inv-validation-shake');
    const msg = box.querySelector(':scope > .inv-validation-message');
    if (msg) msg.remove();
  }

  function flagValidation(target, message) {
    if (!target) return false;
    const box = target.matches('input,select,textarea') ? (target.closest('[data-inv-validation-group], .form-full, .conditional-block, fieldset') || target) : target;
    box.classList.remove('inv-validation-shake');
    void box.offsetWidth;
    box.classList.add('inv-validation-error', 'inv-validation-shake');
    let msg = box.querySelector(':scope > .inv-validation-message');
    if (!msg) {
      msg = document.createElement('p');
      msg.className = 'inv-validation-message';
      box.appendChild(msg);
    }
    msg.textContent = message;
    box.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const focusable = target.matches('input,select,textarea') ? target : target.querySelector('input,select,textarea,button');
    if (focusable) setTimeout(() => focusable.focus({ preventScroll: true }), 350);
    setTimeout(() => box.classList.remove('inv-validation-shake'), 500);
    return false;
  }

  function validateInfoStep() {
    const required = [
      ['invDivision','부문을 선택해 주세요.'], ['invDept','부서를 선택해 주세요.'],
      ['invTeam','팀을 선택해 주세요.'], ['invStoreName','매장명을 입력해 주세요.'],
      ['invAuthorName','작성자명을 입력해 주세요.'], ['invIncidentDate','사고 발생일을 입력해 주세요.']
    ];
    for (const [id,msg] of required) {
      const el = document.getElementById(id);
      if (!el || !String(el.value || '').trim()) return flagValidation(el, msg);
    }
    return true;
  }

  function validateEvidenceStep() {
    const cctv = document.querySelector('input[name="invCctv"]:checked');
    const cctvBox = document.querySelector('input[name="invCctv"]')?.closest('fieldset');
    if (!cctv) return flagValidation(cctvBox, 'CCTV 확인 결과를 선택해 주세요.');
    if (cctv.value === 'clear') return true;
    const available = document.querySelector('input[name="invWorkVideoAvailable"]:checked');
    const availableGroup = document.getElementById('invWorkVideoAvailableGroup');
    if (!available) return flagValidation(availableGroup, '사고 당일의 다른 근무영상 확보 여부를 선택해 주세요.');
    if (available.value === 'no') return true;
    const observation = document.querySelector('input[name="invWorkVideoAbnormal"]:checked');
    const observationGroup = document.getElementById('invWorkVideoObservationGroup');
    if (!observation) return flagValidation(observationGroup, '확보한 영상에서 확인되는 모습을 선택해 주세요.');
    if (observation.value === 'other') {
      const detail = document.getElementById('invWorkVideoDetail');
      if (!String(detail?.value || '').trim()) return flagValidation(detail, '기타 사항의 확인 내용을 작성해 주세요.');
    }
    return true;
  }

  function validateRecordStep() {
    const selected = document.querySelector('input[name="invReportRecord"]:checked');
    const choiceGroup = document.getElementById('invReportChoiceGroup');
    const fieldset = document.getElementById('invReportFieldset') || document.querySelector('input[name="invReportRecord"]')?.closest('fieldset');
    if (!selected) return flagValidation(choiceGroup || fieldset, '공유 기록 유무를 선택해 주세요.');
    if (selected.value === 'yes' && chatImages.length === 0) {
      const attach = document.getElementById('invReportChatWrap');
      return flagValidation(attach || choiceGroup || fieldset, '공유 기록 이미지를 첨부해 주세요.');
    }
    if (selected.value === 'other') {
      const detail = document.getElementById('invReportImmediateDetail');
      if (!String(detail?.value || '').trim()) return flagValidation(detail, '기타 공유·보고 내용을 작성해 주세요.');
    }
    return true;
  }

  function updateInvestigationFlowState() {
    const infoReady = isInfoStepReady();
    const infoHint = document.getElementById('invInfoHint');
    if (infoHint) {
      infoHint.textContent = infoReady
        ? '정보 입력이 완료되었습니다. 다음 단계로 이동하세요.'
        : '필수 정보를 입력한 뒤 다음을 눌러 주세요.';
      infoHint.classList.toggle('ready', infoReady);
    }
    updateInfoRevealState();
  }

  panel.querySelectorAll('[data-inv-next]').forEach(btn => {
    btn.disabled = false;
    btn.addEventListener('click', () => {
      const current = btn.closest('.inv-flow-step')?.dataset.invStep;
      const valid = current === 'info' ? validateInfoStep()
        : current === 'evidence' ? validateEvidenceStep()
        : current === 'record' ? validateRecordStep() : true;
      if (!valid) return;
      setInvestigationStep(btn.dataset.invNext);
    });
  });

  panel.querySelectorAll('[data-inv-back]').forEach(btn => {
    btn.addEventListener('click', () => {
      setInvestigationStep(btn.dataset.invBack);
    });
  });

  // 상단 진행 탭도 '다음' 버튼과 동일한 필수항목 검증을 거칩니다.
  const FLOW_ORDER = ['info', 'evidence', 'record', 'witness'];
  function activeFlowStepName() {
    return panel.querySelector('.inv-flow-step.active')?.dataset.invStep || 'info';
  }
  function validateBeforeProgressMove(targetStep) {
    const currentIndex = FLOW_ORDER.indexOf(activeFlowStepName());
    const targetIndex = FLOW_ORDER.indexOf(targetStep);
    if (targetIndex <= currentIndex) return true;
    if (currentIndex <= 0 && targetIndex > 0 && !validateInfoStep()) { setInvestigationStep('info'); return false; }
    if (currentIndex <= 1 && targetIndex > 1 && !validateEvidenceStep()) { setInvestigationStep('evidence'); return false; }
    if (currentIndex <= 2 && targetIndex > 2 && !validateRecordStep()) { setInvestigationStep('record'); return false; }
    return true;
  }
  panel.querySelectorAll('[data-inv-progress]').forEach(tab => {
    tab.setAttribute('role', 'button');
    tab.setAttribute('tabindex', '0');
    const move = () => {
      const target = tab.dataset.invProgress;
      if (!validateBeforeProgressMove(target)) return;
      setInvestigationStep(target);
    };
    tab.addEventListener('click', move);
    tab.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        move();
      }
    });
  });

  panel.addEventListener('input', e => clearValidation(e.target));
  panel.addEventListener('change', e => {
    clearValidation(e.target);
    if (e.target && e.target.name === 'invReportRecord') {
      clearValidation(document.getElementById('invReportChoiceGroup'));
      clearValidation(document.getElementById('invReportChatWrap'));
      clearValidation(document.getElementById('invReportImmediateWrap'));
    }
    updateInvestigationFlowState();
  });

  bindSimpleModal('invGuideBtn', 'invGuideModal', 'invGuideCloseBtn');
  bindSimpleModal('invCaseHelpBtn', 'invCaseHelpModal', 'invCaseHelpCloseBtn');
  const VIDEO_GUIDE_SEEN_UNTIL_KEY = 'daiso_inv_video_guide_seen_until';
  const VIDEO_GUIDE_SUPPRESS_MS = 5 * 60 * 1000;
  let videoGuideRunning = false;
  let videoGuideTimer = null;
  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  async function typeInto(el, text, speed) {
    if (!el) return;
    el.textContent = '';
    el.classList.add('is-typing');
    for (const ch of text) {
      el.textContent += ch;
      await sleep(speed);
    }
    el.classList.remove('is-typing');
  }

  async function openVideoGuide() {
    const modal = document.getElementById('invCctvHelpModal');
    if (videoGuideRunning || (modal && modal.classList.contains('visible'))) return;
    videoGuideRunning = true;
    const grid = document.getElementById('invVideoExampleGrid');
    const action = document.getElementById('invVideoGuideAction');
    const closeBtn = document.getElementById('invCctvHelpCloseBtn');
    const reading = action && action.querySelector('.inv-guide-reading');
    if (!modal) { videoGuideRunning = false; return; }
    modal.classList.add('visible');
    modal.setAttribute('aria-hidden', 'false');
    if (grid) grid.classList.remove('visible');
    if (action) action.classList.remove('ready');
    if (closeBtn) closeBtn.style.display = 'none';
    if (reading) reading.style.display = 'block';
    await typeInto(document.getElementById('invTypeLine1'), '사고 장면만 확인하지 마세요.', 42);
    await sleep(500);
    await typeInto(document.getElementById('invTypeLine2'), '사고 주장 시점 전후의 행동 변화와 지속 여부를 함께 확인해 주세요.', 32);
    await sleep(500);
    await typeInto(document.getElementById('invTypeLine3'), '판단이 어려운 경우 안전보건팀으로 문의해 주시기 바랍니다.', 32);
    await sleep(500);
    if (grid) grid.classList.add('visible');
    await sleep(350);
    if (reading) reading.style.display = 'none';
    if (closeBtn) closeBtn.style.display = 'inline-flex';
    if (action) action.classList.add('ready');
    videoGuideRunning = false;
  }

  function closeVideoGuide() {
    if (videoGuideTimer) { clearTimeout(videoGuideTimer); videoGuideTimer = null; }
    const modal = document.getElementById('invCctvHelpModal');
    if (modal) {
      modal.classList.remove('visible');
      modal.setAttribute('aria-hidden', 'true');
    }
    try {
      localStorage.setItem(VIDEO_GUIDE_SEEN_UNTIL_KEY, String(Date.now() + VIDEO_GUIDE_SUPPRESS_MS));
    } catch (e) {}
    videoGuideRunning = false;
    setTimeout(() => {
      ['invTypeLine1','invTypeLine2','invTypeLine3'].forEach(id => { const el=document.getElementById(id); if(el){el.textContent='';el.classList.remove('is-typing');} });
      const grid=document.getElementById('invVideoExampleGrid'); if(grid) grid.classList.remove('visible');
      const action=document.getElementById('invVideoGuideAction'); if(action) action.classList.remove('ready');
    }, 220);
  }

  const videoGuideBtn = document.getElementById('invCctvHelpBtn');
  const videoGuideCloseBtn = document.getElementById('invCctvHelpCloseBtn');
  if (videoGuideBtn) videoGuideBtn.addEventListener('click', openVideoGuide);
  if (videoGuideCloseBtn) videoGuideCloseBtn.addEventListener('click', closeVideoGuide);
  bindSimpleModal('invRecordHelpBtn', 'invRecordHelpModal', 'invRecordHelpCloseBtn');
  bindSimpleModal('invWitnessHelpBtn', 'invWitnessHelpModal', 'invWitnessHelpCloseBtn');

  restoreBaseData();
  const savedBaseForReport = readBaseData();
  if (!savedBaseForReport.invReportRecord) {
    const reportChatSaved = document.getElementById('invReportChat')?.checked;
    const reportImmediateSaved = document.getElementById('invReportImmediate')?.checked;
    const legacyValue = reportChatSaved ? 'yes' : (reportImmediateSaved ? 'other' : '');
    const savedReportRadio = document.querySelector(`input[name="invReportRecord"][value="${legacyValue}"]`);
    if (savedReportRadio) savedReportRadio.checked = true;
  }
  refreshConditional();
  refreshRadioPillStyles();
  updateInvestigationFlowState();

  // 기본정보/확인자료 영역의 입력 변화 감지 (면담 카드 영역은 제외)
  panel.addEventListener('input', (e) => {
    if (e.target.closest('#witnessList')) return;
    saveBaseData();
    updateInvestigationFlowState();
  });
  panel.addEventListener('change', (e) => {
    if (e.target.closest('#witnessList')) return;
    saveBaseData();
    refreshConditional();
    refreshRadioPillStyles();
    updateInvestigationFlowState();
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
     2. 목격자 면담 — 한 질문씩 넘기는 대화형 방식
     ========================================================= */

  function nowInterviewParts() {
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    return {
      date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
      time: `${pad(d.getHours())}:${pad(d.getMinutes())}`
    };
  }

  const WITNESS_STEPS = [
    { key: 'basic', title: '면담 기본정보' },
    { key: 'direct', title: '사고 장면을 직접 보셨나요?' },
    { key: 'aftermath', title: '사고 직후 모습은 보셨나요?' },
    { key: 'heard', title: '재해사실의 사고 이야기를 어떻게 들으셨나요?' },
    { key: 'work', title: '사고 이후에도 계속 일하는 모습을 보셨나요?' },
    { key: 'extra', title: '추가로 남길 내용이 있나요?' },
    { key: 'review', title: '입력한 면담 내용을 확인해 주세요.' }
  ];

  function getWitnessSteps(w) {
    // 사고 장면을 직접 목격한 경우에는 중복 질문인
    // '사고 직후 모습'과 '사고 이야기를 들었는지' 단계를 생략합니다.
    if (w && w.sawAccident === 'yes') {
      return WITNESS_STEPS.filter(step => !['aftermath', 'heard'].includes(step.key));
    }
    return WITNESS_STEPS;
  }

  function normalizeWitnessData(data) {
    const now = nowInterviewParts();
    data = data || {};
    // 이전 버전 임시저장값을 단순화된 선택지에 맞게 자동 변환합니다.
    if (data.sawAccident === 'unknown') data.sawAccident = 'no';
    if (data.sawAftermath === 'no' || data.sawAftermath === 'uncertain') data.sawAftermath = 'unknown';
    if (data.heardFrom === 'other' && !data.heardDetail) data.heardFrom = 'colleague';
    return {
      name: data.name || '',
      interviewDate: data.interviewDate || now.date,
      interviewTime: data.interviewTime || now.time,
      activity: data.activity || '',
      sawAccident: data.sawAccident || '',
      accidentDetail: data.accidentDetail || '',
      sawAftermath: data.sawAftermath || '',
      aftermathKind: data.aftermathKind || '',
      aftermathDetail: data.aftermathDetail || '',
      heardFrom: data.heardFrom || '',
      heardWhen: data.heardWhen || '',
      heardDetail: data.heardDetail || '',
      workAfter: data.workAfter || '',
      workDetail: data.workDetail || '',
      extraStatus: data.extraStatus || '',
      extra: data.extra || '',
      confirmed: !!data.confirmed,
      currentStep: Number.isInteger(data.currentStep) ? data.currentStep : 0,
      collapsed: !!data.collapsed
    };
  }

  function deriveWitnessType(w) {
    if (w.sawAccident === 'yes') return { type: 'direct', label: '사고 장면 직접 목격' };
    if (w.sawAftermath === 'clear') return { type: 'aftermath', label: '사고 직후 이상 모습 확인' };
    if (w.sawAftermath === 'unknown') return { type: 'aftermathUnclear', label: '사고 직후 모습 불명확' };
    if (w.heardFrom === 'victim') return { type: 'secondhand', label: '재해자에게 직접 들음' };
    if (w.heardFrom === 'colleague' || w.heardFrom === 'other') return { type: 'secondhand', label: '다른 사람에게 전달받음' };
    if (w.sawAccident === 'no' || w.sawAftermath === 'no') return { type: 'unaware', label: '직접 확인한 사고 정황 없음' };
    return { type: 'unknown', label: '잘 모르겠음 / 확인하지 못함' };
  }

  function classify(w) {
    return deriveWitnessType(w);
  }

  function classifyBadgeClass(type) {
    switch (type) {
      case 'direct': return 'classify-direct';
      case 'aftermath': return 'classify-semiDirect';
      case 'aftermathUnclear': return 'classify-unclear';
      case 'secondhand': return 'classify-secondhand';
      case 'unaware': return 'classify-unaware';
      default: return 'classify-unclear';
    }
  }

  function choice(name, value, text, checked, hint = '') {
    return `<label class="witness-choice"><input type="radio" name="${name}" value="${value}" ${checked ? 'checked' : ''}><span class="witness-choice-copy"><b>${text}</b>${hint ? `<small>${hint}</small>` : ''}</span></label>`;
  }

  function witnessStepHtml(seq, w, stepIndex) {
    const steps = getWitnessSteps(w);
    const safeIndex = Math.max(0, Math.min(stepIndex, steps.length - 1));
    const step = steps[safeIndex];
    const n = (field) => `${field}_${seq}`;
    let body = '';

    if (step.key === 'basic') {
      body = `
        <label class="form-full">면담자명
          <input type="text" data-field="name" value="${escapeAttr(w.name)}" placeholder="목격자 성명을 입력해 주세요">
        </label>
        <div class="witness-date-row">
          <label>면담 날짜<input type="date" data-field="interviewDate" value="${escapeAttr(w.interviewDate)}"></label>
          <label>면담 시간<input type="time" data-field="interviewTime" value="${escapeAttr(w.interviewTime)}"></label>
        </div>
        <label class="form-full">사고 당시 무엇을 하고 있었나요?
          <input type="text" data-field="activity" value="${escapeAttr(w.activity)}" placeholder="예: 옆 진열대에서 상품 정리 중">
        </label>`;
    }

    if (step.key === 'direct') {
      body = `<div class="witness-choice-list">
        ${choice(n('sawAccident'), 'yes', '네', w.sawAccident === 'yes', '사고가 발생하는 순간을 직접 봄')}
        ${choice(n('sawAccident'), 'no', '아니오', w.sawAccident === 'no', '사고 순간은 보지 못함')}
        ${choice(n('sawAccident'), 'other', '기타 사항', w.sawAccident === 'other', '일부 장면만 봤거나 설명이 필요한 경우')}
      </div>
      ${(w.sawAccident === 'yes' || w.sawAccident === 'other') ? `<label class="form-full witness-conditional">${w.sawAccident === 'yes' ? '직접 본 상황을 적어주세요.' : '기타 사항을 적어주세요.'}
        <textarea data-field="accidentDetail" rows="4" placeholder="${w.sawAccident === 'yes' ? '예: 하부장 진열대를 넘어가다가 허리를 잡고 멈추는 모습을 봤어요.' : '선택 입력 항목입니다. 작성할 내용이 없으면 비워두세요.'}">${escapeHtml(w.accidentDetail)}</textarea>
      </label>` : ''}`;
    }

    if (step.key === 'aftermath') {
      body = `<div class="witness-choice-list">
        ${choice(n('sawAftermath'), 'clear', '네', w.sawAftermath === 'clear', '아픈 부위를 잡거나 작업을 멈추는 등 평소와 다른 모습을 봄')}
        ${choice(n('sawAftermath'), 'unknown', '보지 못했거나 기억나지 않음', w.sawAftermath === 'unknown', '사고 직후를 확인하지 못했거나 정확히 기억나지 않음')}
        ${choice(n('sawAftermath'), 'other', '기타 사항', w.sawAftermath === 'other', '일부 모습만 봤거나 추가 설명이 필요한 경우')}
      </div>
      ${w.sawAftermath === 'other' ? `<label class="form-full witness-conditional">추가 설명이 있는 경우 적어주세요.
        <textarea data-field="aftermathDetail" rows="4" placeholder="기타 사항의 내용을 입력해 주세요.">${escapeHtml(w.aftermathDetail)}</textarea>
      </label>` : ''}`;
    }

    if (step.key === 'heard') {
      body = `<div class="witness-choice-list">
        ${choice(n('heardFrom'), 'victim', '재해자에게 직접 들었어요', w.heardFrom === 'victim', '재해자가 본인에게 사고 내용을 말함')}
        ${choice(n('heardFrom'), 'colleague', '동료 직원에게 들었어요', w.heardFrom === 'colleague', '동료 직원이 사고 내용을 전달함')}
        ${choice(n('heardFrom'), 'none', '듣지 못했거나 기억나지 않아요', w.heardFrom === 'none', '사고 이야기를 듣지 못했거나 정확히 기억나지 않음')}
        ${choice(n('heardFrom'), 'other', '기타 사항', w.heardFrom === 'other', '다른 방법으로 전달받은 내용을 작성')}
      </div>
      ${w.heardFrom && w.heardFrom !== 'none' ? `<label class="form-full witness-conditional">들은 내용을 간단히 적어주세요.
        <textarea data-field="heardDetail" rows="4" placeholder="선택 입력 항목입니다. 작성할 내용이 없으면 비워두고 다음으로 넘어가세요.">${escapeHtml(w.heardDetail)}</textarea>
      </label>` : ''}`;
    }

    if (step.key === 'work') {
      body = `<div class="witness-choice-list">
        ${choice(n('workAfter'), 'continued', '네', w.workAfter === 'continued', '평소처럼 업무를 계속하는 모습을 봄')}
        ${choice(n('workAfter'), 'stopped', '아니오', w.workAfter === 'stopped', '일을 멈추거나 쉬는 모습을 봄')}
        ${choice(n('workAfter'), 'unknown', '이후 모습을 보지 못했거나 기억나지 않음', w.workAfter === 'unknown', '이후 근무 상태를 확인하지 못함')}
        ${choice(n('workAfter'), 'other', '기타 사항', w.workAfter === 'other', '추가 설명이 필요한 경우')}
      </div>
      ${w.workAfter === 'other' ? `<label class="form-full witness-conditional">추가 설명이 있는 경우 적어주세요.
        <textarea data-field="workDetail" rows="4" placeholder="기타 사항의 내용을 입력해 주세요.">${escapeHtml(w.workDetail)}</textarea>
      </label>` : ''}`;
    }

    if (step.key === 'extra') {
      body = `<div class="witness-optional-note">
        추가로 확인한 내용이 있는 경우에만 작성해 주세요.<br>
        <strong>작성하지 않아도 다음 단계로 넘어갈 수 있습니다.</strong>
      </div>
      <label class="form-full witness-conditional witness-optional-field">추가 내용
        <textarea data-field="extra" rows="4" placeholder="선택 입력 항목입니다. 작성할 내용이 없으면 비워두세요.">${escapeHtml(w.extra)}</textarea>
      </label>`;
    }

    if (step.key === 'review') {
      const c = deriveWitnessType(w);
      body = `<div class="witness-review-summary">
        <dl>
          <div><dt>면담자</dt><dd>${escapeHtml(w.name) || '-'}</dd></div>
          <div><dt>면담일시</dt><dd>${escapeHtml(w.interviewDate)} ${escapeHtml(w.interviewTime)}</dd></div>
          <div><dt>직접 목격</dt><dd>${w.sawAccident === 'yes' ? '직접 봄' : w.sawAccident === 'no' ? '보지 못함' : '기타 사항'}</dd></div>
          ${w.sawAccident === 'yes' ? '' : `<div><dt>사고 직후 모습</dt><dd>${w.sawAftermath === 'clear' ? '평소와 다른 모습 확인' : w.sawAftermath === 'other' ? '기타 사항' : '보지 못했거나 기억나지 않음'}</dd></div>
          <div><dt>사고 이야기</dt><dd>${w.heardFrom === 'victim' ? '재해자에게 직접 들음' : w.heardFrom === 'colleague' ? '동료 직원에게 들음' : w.heardFrom === 'other' ? '기타 방법으로 전달받음' : '듣지 못했거나 기억나지 않음'}</dd></div>`}
          <div><dt>사고 이후 근무</dt><dd>${w.workAfter === 'stopped' ? '업무 중단 또는 휴식' : w.workAfter === 'continued' ? '평소처럼 업무 계속' : w.workAfter === 'other' ? '기타 사항' : '확인하지 못함'}</dd></div>
        </dl>
        <span class="classify-badge ${classifyBadgeClass(c.type)}">${c.label}</span>
      </div>
`;
    }

    return `<div class="witness-wizard-step" data-witness-step="${safeIndex}">
      <div class="witness-progress"><span>${safeIndex + 1} / ${steps.length}</span><div><i style="width:${((safeIndex + 1) / steps.length) * 100}%"></i></div></div>
      <h5>${step.title}</h5>
      <div class="witness-step-body">${body}</div>
    </div>`;
  }

  function witnessCardTemplate(seq, data) {
    const w = normalizeWitnessData(data);
    return `
      <div class="witness-card-head">
        <h4>면담 <span class="witness-seq">${seq}</span></h4>
        <button type="button" class="witness-remove-btn" aria-label="이 면담 삭제">삭제</button>
      </div>
      <div class="witness-wizard-host">${witnessStepHtml(seq, w, w.currentStep)}</div>
      <div class="witness-wizard-actions">
        <button type="button" class="secondary-btn witness-prev-btn" ${w.currentStep === 0 ? 'disabled' : ''}>← 이전</button>
        ${w.currentStep < getWitnessSteps(w).length - 1
          ? '<button type="button" class="primary-btn witness-next-btn">다음 →</button>'
          : '<button type="button" class="primary-btn witness-save-btn">면담내용 저장하기</button>'}
      </div>
      <div class="witness-classify-result" data-role="classify"></div>`;
  }

  function readCard(card) {
    const raw = card.__witnessData || normalizeWitnessData();
    return { ...raw, collapsed: card.classList.contains('collapsed') };
  }

  function syncVisibleFields(card) {
    const w = card.__witnessData;
    if (!w) return;
    card.querySelectorAll('[data-field]').forEach(el => {
      const key = el.dataset.field;
      if (el.type === 'checkbox') w[key] = el.checked;
      else w[key] = el.value;
    });
    const seq = card.dataset.seq;
    const radioFields = ['sawAccident','sawAftermath','heardFrom','workAfter'];
    radioFields.forEach(key => {
      const checked = card.querySelector(`input[name="${key}_${seq}"]:checked`);
      if (checked) w[key] = checked.value;
    });
  }

  function renderWitnessStep(card) {
    const w = card.__witnessData;
    const host = card.querySelector('.witness-wizard-host');
    if (host) host.innerHTML = witnessStepHtml(card.dataset.seq, w, w.currentStep);
    const actions = card.querySelector('.witness-wizard-actions');
    if (actions) actions.innerHTML = `
      <button type="button" class="secondary-btn witness-prev-btn" ${w.currentStep === 0 ? 'disabled' : ''}>← 이전</button>
      ${w.currentStep < getWitnessSteps(w).length - 1
        ? '<button type="button" class="primary-btn witness-next-btn">다음 →</button>'
        : '<button type="button" class="primary-btn witness-save-btn">면담내용 저장하기</button>'}`;
    renderCardClassify(card);
  }

  function validateWitnessStep(w) {
    const steps = getWitnessSteps(w);
    const step = steps[Math.max(0, Math.min(w.currentStep, steps.length - 1))];
    switch (step.key) {
      case 'basic':
        if (!w.name.trim()) return '면담자명을 입력해 주세요.';
        if (!w.interviewDate || !w.interviewTime) return '면담 날짜와 시간을 확인해 주세요.';
        return '';
      case 'direct':
        if (!w.sawAccident) return '답변을 선택해 주세요.';
        if (w.sawAccident === 'yes' && !w.accidentDetail.trim()) return '직접 본 상황을 간단히 작성해 주세요.';
        if (w.sawAccident === 'other' && !w.accidentDetail.trim()) return '기타 사항의 내용을 작성해 주세요.';
        return '';
      case 'aftermath':
        if (!w.sawAftermath) return '답변을 선택해 주세요.';
        if (w.sawAftermath === 'other' && !w.aftermathDetail.trim()) return '기타 사항의 내용을 작성해 주세요.';
        return '';
      case 'heard':
        if (!w.heardFrom) return '답변을 선택해 주세요.';
        if (w.heardFrom === 'other' && !w.heardDetail.trim()) return '기타 사항의 내용을 작성해 주세요.';
        return '';
      case 'work':
        if (!w.workAfter) return '답변을 선택해 주세요.';
        if (w.workAfter === 'other' && !w.workDetail.trim()) return '기타 사항의 내용을 작성해 주세요.';
        return '';
      case 'extra':
        return '';
      case 'review': return '';
      default: return '';
    }
  }

  function clearWitnessValidation(card) {
    card.querySelectorAll('.witness-validation-error, .witness-validation-shake').forEach(el => {
      el.classList.remove('witness-validation-error', 'witness-validation-shake');
    });
    const old = card.querySelector('.witness-validation-message');
    if (old) old.remove();
  }

  function showWitnessValidation(card, message) {
    clearWitnessValidation(card);
    const stepBody = card.querySelector('.witness-step-body');
    if (!stepBody) return;
    let target = stepBody.querySelector('.witness-choice-list, .witness-conditional, input, textarea') || stepBody;
    target.classList.add('witness-validation-error', 'witness-validation-shake');
    const note = document.createElement('p');
    note.className = 'witness-validation-message';
    note.textContent = message;
    target.insertAdjacentElement('afterend', note);
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const focusable = target.matches('input,textarea') ? target : target.querySelector('input:not([type="radio"]), textarea');
    if (focusable) setTimeout(() => focusable.focus({ preventScroll: true }), 280);
    setTimeout(() => target.classList.remove('witness-validation-shake'), 500);
  }

  function renderCardClassify(card) {
    const w = readCard(card);
    const c = classify(w);
    const area = card.querySelector('[data-role="classify"]');
    if (area) area.innerHTML = card.classList.contains('collapsed')
      ? `<span class="classify-badge ${classifyBadgeClass(c.type)}">${c.label}</span>`
      : '';
  }

  function collapseCard(card) {
    const w = readCard(card);
    const c = classify(w);
    card.classList.add('collapsed');
    let summary = card.querySelector('.witness-collapsed-summary');
    if (!summary) {
      summary = document.createElement('div');
      summary.className = 'witness-collapsed-summary';
      card.appendChild(summary);
    }
    summary.innerHTML = `
      <span class="witness-collapsed-name">면담 ${card.dataset.seq} · ${escapeHtml(w.name) || '이름 미입력'}</span>
      <span class="classify-badge ${classifyBadgeClass(c.type)}">${c.label}</span>
      <button type="button" class="witness-edit-btn">수정</button>`;
  }

  function expandCard(card) {
    card.classList.remove('collapsed');
    const summary = card.querySelector('.witness-collapsed-summary');
    if (summary) summary.remove();
    renderWitnessStep(card);
  }

  function saveWitnesses() {
    const data = Array.from(witnessList.querySelectorAll('.witness-card')).map(readCard);
    try { localStorage.setItem(INV_WITNESS_KEY, JSON.stringify(data)); }
    catch (e) { console.warn('면담 임시저장 실패:', e); }
  }

  function addWitnessCard(data) {
    witnessSeq += 1;
    const card = document.createElement('div');
    card.className = 'witness-card';
    card.dataset.seq = witnessSeq;
    card.__witnessData = normalizeWitnessData(data);
    card.innerHTML = witnessCardTemplate(witnessSeq, card.__witnessData);
    witnessList.appendChild(card);
    renderCardClassify(card);
    if (card.__witnessData.collapsed) collapseCard(card);
    return card;
  }

  function restoreWitnesses() {
    let saved;
    try { saved = JSON.parse(localStorage.getItem(INV_WITNESS_KEY) || '[]'); }
    catch (e) { saved = []; }
    if (saved.length === 0) addWitnessCard();
    else saved.forEach(w => addWitnessCard(w));
  }

  witnessList.addEventListener('input', (e) => {
    const card = e.target.closest('.witness-card');
    if (!card) return;
    syncVisibleFields(card);
    clearWitnessValidation(card);
    saveWitnesses();
  });

  witnessList.addEventListener('change', (e) => {
    const card = e.target.closest('.witness-card');
    if (!card) return;
    syncVisibleFields(card);
    clearWitnessValidation(card);
    const key = e.target.name ? e.target.name.split('_')[0] : '';
    if (['sawAccident','sawAftermath','heardFrom','workAfter'].includes(key)) {
      renderWitnessStep(card);
    }
    saveWitnesses();
  });

  witnessList.addEventListener('click', (e) => {
    const card = e.target.closest('.witness-card');
    if (!card) return;
    syncVisibleFields(card);
    const w = card.__witnessData;

    if (e.target.closest('.witness-next-btn')) {
      const msg = validateWitnessStep(w);
      if (msg) { showWitnessValidation(card, msg); return; }
      w.currentStep = Math.min(getWitnessSteps(w).length - 1, w.currentStep + 1);
      renderWitnessStep(card);
      card.scrollIntoView({ behavior: 'smooth', block: 'start' });
      saveWitnesses();
      return;
    }
    if (e.target.closest('.witness-prev-btn')) {
      w.currentStep = Math.max(0, w.currentStep - 1);
      renderWitnessStep(card);
      card.scrollIntoView({ behavior: 'smooth', block: 'start' });
      saveWitnesses();
      return;
    }
    if (e.target.closest('.witness-save-btn')) {
      const msg = validateWitnessStep(w);
      if (msg) { showWitnessValidation(card, msg); return; }
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
      addWitnessCard();
      saveWitnesses();
      const cards = witnessList.querySelectorAll('.witness-card');
      cards[cards.length - 1].scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  function findWitnessStepError(w) {
    const steps = getWitnessSteps(w);
    for (let i = 0; i < steps.length; i += 1) {
      const step = steps[i];
      let message = '';
      if (step.key === 'basic') {
        if (!w.name.trim()) message = '면담자명을 입력해 주세요.';
        else if (!w.interviewDate || !w.interviewTime) message = '면담 날짜와 시간을 확인해 주세요.';
      } else if (step.key === 'direct') {
        if (!w.sawAccident) message = '답변을 선택해 주세요.';
        else if (w.sawAccident === 'yes' && !w.accidentDetail.trim()) message = '직접 본 상황을 간단히 작성해 주세요.';
        else if (w.sawAccident === 'other' && !w.accidentDetail.trim()) message = '기타 사항의 내용을 작성해 주세요.';
      } else if (step.key === 'aftermath') {
        if (!w.sawAftermath) message = '답변을 선택해 주세요.';
        else if (w.sawAftermath === 'other' && !w.aftermathDetail.trim()) message = '기타 사항의 내용을 작성해 주세요.';
      } else if (step.key === 'heard') {
        if (!w.heardFrom) message = '답변을 선택해 주세요.';
        else if (w.heardFrom === 'other' && !w.heardDetail.trim()) message = '기타 사항의 내용을 작성해 주세요.';
      } else if (step.key === 'work') {
        if (!w.workAfter) message = '답변을 선택해 주세요.';
        else if (w.workAfter === 'other' && !w.workDetail.trim()) message = '기타 사항의 내용을 작성해 주세요.';
      }
      if (message) return { stepIndex: i, message };
    }
    return null;
  }

  function validateAllWitnessCards() {
    const cards = Array.from(witnessList.querySelectorAll('.witness-card'));
    for (const card of cards) {
      syncVisibleFields(card);
      const w = card.__witnessData;
      const error = findWitnessStepError(w);
      if (!error) continue;
      if (card.classList.contains('collapsed')) expandCard(card);
      w.currentStep = error.stepIndex;
      renderWitnessStep(card);
      showWitnessValidation(card, error.message);
      saveWitnesses();
      return false;
    }
    return true;
  }

  const noWitnessCheckbox = document.getElementById('invNoWitness');
  const witnessPresenceRadios = Array.from(document.querySelectorAll('input[name="invWitnessPresence"]'));

  function refreshNoWitnessState(showNotice = false) {
    const active = !!(noWitnessCheckbox && noWitnessCheckbox.checked);
    panel.classList.toggle('witness-none-active', active);
    witnessPresenceRadios.forEach(radio => {
      radio.checked = active ? radio.value === 'no' : radio.value === 'yes';
      const label = radio.closest('.radio-pill');
      if (label) label.classList.toggle('is-checked', radio.checked);
    });

    let notice = document.getElementById('invWitnessDraftNotice');
    const presenceBox = document.querySelector('.witness-presence-box');
    if (!notice && presenceBox) {
      notice = document.createElement('p');
      notice.id = 'invWitnessDraftNotice';
      notice.className = 'inv-witness-draft-notice';
      presenceBox.insertAdjacentElement('afterend', notice);
    }
    if (notice) {
      const hasDraft = witnessList.querySelectorAll('.witness-card').length > 0;
      notice.textContent = active
        ? (hasDraft ? '기존 면담내용은 임시 보관되며, 현재 판단과 결과서에는 포함되지 않습니다.' : '목격자 없음으로 처리되어 면담내용은 판단과 결과서에 포함되지 않습니다.')
        : (showNotice && hasDraft ? '임시 보관된 면담내용을 다시 표시했습니다.' : '');
      notice.classList.toggle('visible', !!notice.textContent);
      notice.classList.toggle('is-restored', !active && !!notice.textContent);
    }
  }

  witnessPresenceRadios.forEach(radio => {
    radio.addEventListener('change', () => {
      if (!radio.checked || !noWitnessCheckbox) return;
      const wasNoWitness = noWitnessCheckbox.checked;
      noWitnessCheckbox.checked = radio.value === 'no';
      refreshNoWitnessState(wasNoWitness && radio.value === 'yes');
      saveBaseData();
    });
  });

  if (noWitnessCheckbox) {
    noWitnessCheckbox.addEventListener('change', () => {
      refreshNoWitnessState(!noWitnessCheckbox.checked);
      saveBaseData();
    });
  }

  restoreWitnesses();
  refreshNoWitnessState();

  /* =========================================================
     3. 최종 판단 로직
     ========================================================= */
  function computeJudgement() {
    const base = readBaseData();
    const witnesses = noWitnessCheckbox && noWitnessCheckbox.checked
      ? []
      : Array.from(witnessList.querySelectorAll('.witness-card')).map(readCard);
    const classified = witnesses.map(w => ({ w, c: classify(w) }));

    const direct = classified.filter(x => x.c.type === 'direct');
    const aftermath = classified.filter(x => x.c.type === 'aftermath');
    const aftermathUnclear = classified.filter(x => x.c.type === 'aftermathUnclear');
    const secondhand = classified.filter(x => x.c.type === 'secondhand');
    const unaware = classified.filter(x => x.c.type === 'unaware');
    const unknown = classified.filter(x => x.c.type === 'unknown');

    const reportChoice = base.invReportRecord || (base.invReportChat ? 'yes' : (base.invReportImmediate ? 'other' : 'no'));
    const hasReportAttachment = reportChoice === 'yes' && chatImages.length > 0;
    const hasReportStatement = reportChoice === 'yes' || reportChoice === 'other';
    const directWitness = direct.length > 0;
    const clearAftermath = aftermath.length > 0;
    const normalWorkVideo = base.invWorkVideoAbnormal === 'normal';
    const unclearWorkVideo = base.invWorkVideoAbnormal === 'uncertain';
    const clearWorkVideo = base.invWorkVideoAbnormal === 'clear';
    const clearCctv = base.invCctv === 'clear';

    // 서로 강하게 엇갈리는 자료가 있을 때만 수동 판단으로 전환합니다.
    const conflictReasons = [];
    if (directWitness && normalWorkVideo) {
      conflictReasons.push('목격자는 사고 장면을 직접 봤다고 진술했으나, 사고 이후 영상에서는 평소와 다른 행동이 확인되지 않았습니다.');
    }
    if (clearCctv && normalWorkVideo) {
      conflictReasons.push('CCTV에서는 사고 장면이 확인되었으나, 사고 이후 영상에서는 평소와 다른 행동이 확인되지 않았습니다.');
    }
    if (clearWorkVideo && classified.length > 0 && classified.every(x => x.c.type === 'unaware' || x.c.type === 'unknown')) {
      conflictReasons.push('사고 이후 영상에서는 통증 또는 이상 행동이 확인되었으나, 면담자들은 해당 정황을 보지 못했거나 기억하지 못한다고 답변했습니다.');
    }
    const hasConflict = conflictReasons.length > 0;

    const recognized =
      clearCctv ||
      directWitness ||
      (clearWorkVideo && hasReportAttachment) ||
      (clearAftermath && hasReportAttachment);

    const verdict = recognized ? 'recognized' : 'unrecognized';
    const reasons = [];

    if (clearCctv) reasons.push('CCTV 영상에서 재해자가 주장한 사고 장면이 확인되었습니다.');
    else if (base.invCctv === 'unclear') reasons.push('CCTV 영상은 있으나 재해자가 주장한 사고 장면은 확인되지 않았습니다.');
    else if (base.invCctv === 'none') reasons.push('사고 장면을 확인할 수 있는 CCTV 영상은 확보되지 않았습니다.');

    if (base.invWorkVideoAvailable === 'no') {
      reasons.push('사고 당일의 다른 근무영상도 확보하지 못해 사고 전후의 행동 변화와 지속 여부를 확인할 수 없었습니다.' + (base.invWorkVideoUnavailableReason ? ` ${base.invWorkVideoUnavailableReason}` : ''));
    } else if (clearWorkVideo) {
      reasons.push('사고 당일 근무영상에서 사고 직후 통증 호소 또는 평소와 다른 행동이 확인되었습니다.' + (base.invWorkVideoDetail ? ` 확인내용: ${base.invWorkVideoDetail}` : ''));
    } else if (unclearWorkVideo) {
      reasons.push('사고 주장 이후 일부 행동은 확인되었으나, 해당 행동이 사고로 인한 통증 행동인지 명확하지 않았습니다.' + (base.invWorkVideoDetail ? ` 확인내용: ${base.invWorkVideoDetail}` : ''));
    } else if (normalWorkVideo) {
      reasons.push('사고 주장 이후 영상에서 보행 이상·작업 중단·통증 호소 등 평소와 다른 행동은 확인되지 않았습니다.' + (base.invWorkVideoDetail ? ` 확인내용: ${base.invWorkVideoDetail}` : ''));
    }

    if (direct.length > 0) {
      reasons.push('목격자 면담 결과 사고 장면을 직접 목격하였다는 진술이 확인되었습니다. (별첨)');
    } else if (classified.length === 0) {
      reasons.push('사고 장면을 직접 확인한 목격자는 없는 것으로 확인되었습니다. (별첨)');
    } else {
      reasons.push('목격자 면담 결과 사고 장면을 직접 목격하였다는 진술은 확인되지 않았습니다. (별첨)');
    }

    if (aftermath.length > 0) reasons.push('일부 면담자는 사고 직후 평소와 다른 모습을 확인했다고 답변했습니다.');
    if (aftermathUnclear.length > 0) reasons.push('일부 면담자는 사고 직후 모습을 보았으나 평소와 다른 행동인지는 판단하기 어렵다고 답변했습니다.');
    if (secondhand.length > 0) reasons.push('일부 내용은 재해자 또는 다른 사람에게 전달받은 내용으로 확인되었습니다.');
    if (unaware.length > 0) reasons.push('일부 면담자는 사고 장면이나 사고 직후 특이 행동을 보지 못했다고 답변했습니다.');
    if (unknown.length > 0) reasons.push('일부 면담 항목은 잘 모르겠거나 기억나지 않는다고 답변하여 사실관계를 확인하기 어려웠습니다.');

    if (reportChoice === 'yes' && hasReportAttachment) {
      // 첨부 이미지는 결과서에 실제로 표시되므로 별도의 중복 문구는 넣지 않습니다.
    } else if (reportChoice === 'other') {
      reasons.push(base.invReportImmediateDetail
        ? `카톡·팀즈 등 별도 기록은 없으나, ${base.invReportImmediateDetail.trim()}`
        : '카톡·팀즈 등 별도 기록 외의 방법으로 사고 사실이 공유된 것으로 확인되었습니다.');
    } else {
      reasons.push('카톡·팀즈·문자 등 확인 가능한 사고 보고 또는 공유 기록은 확인되지 않았습니다.');
    }

    if (recognized) {
      reasons.push('확보된 영상·목격자 진술·보고기록을 종합할 때 업무 중 사고 발생 사실을 인정할 수 있는 자료가 확인되었습니다.');
    } else {
      reasons.push('현재 확보된 객관자료만으로는 재해자가 주장하는 업무 중 사고 발생 사실을 확인하기 어려워 불인정 방향으로 검토합니다.');
    }

    return {
      verdict,
      reasons,
      base,
      witnesses,
      classified,
      hasConflict,
      conflictReasons,
      manualReason: '',
      manualReviewed: false
    };
  }

  const VERDICT_META = {
    recognized: { label: '인정 검토', icon: '✅', className: 'judge-verdict-ok' },
    unrecognized: { label: '불인정 검토', icon: '🚫', className: 'judge-verdict-no' }
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

  // 불인정일 때 판단사유를 바탕으로 보험가입자의견서 별지 초안을 자동 생성합니다.
  function buildAppendixHtml(result) {
    if (result.verdict !== 'unrecognized') return '';

    if (result.manualReviewed && result.manualReason) {
      return result.manualReason
        .split(/\n+/)
        .map(line => line.trim())
        .filter(Boolean)
        .map(line => `<p>${escapeHtml(line)}</p>`)
        .join('');
    }

    const reasonParagraphs = result.reasons
      .filter(reason => !reason.startsWith('현재 확보된 객관자료만으로는'))
      .map(reason => `<p>${escapeHtml(reason)}</p>`)
      .join('');

    return `
      <p>재해자는 업무 수행 중 부상을 입었다고 주장하고 있으나, 사업장에서 확인 가능한 CCTV·당일 근무 영상·목격자 면담·사고 보고 및 공유 기록을 검토한 결과는 다음과 같습니다.</p>
      ${reasonParagraphs}
      <p>이와 같은 재해 사실에 대하여 회사는 현재까지 확인된 자료와 관련 진술을 종합적으로 고려하였으며, 업무상 재해 해당 여부에 대한 신중한 검토를 요청드리고자 본 별지를 첨부합니다. 귀 공단의 면밀한 사실관계 확인과 판단을 요청드립니다.</p>
    `;
  }

  /**
   * 결과 문서를 정식 확인서 레이아웃(HTML)으로 #invDocPreview에 렌더링합니다.
   * 판단사유/별지 문구는 contenteditable로 두어, 제출 전 직접 다듬을 수 있게 합니다.
   */
  function witnessAnswerText(w, key) {
    const maps = {
      sawAccident: { yes: '네', no: '아니오', other: '기타 사항' },
      sawAftermath: { clear: '네', unknown: '보지 못했거나 기억나지 않음', other: '기타 사항' },
      aftermathKind: { pain: '아픈 부위를 계속 잡거나 작업을 멈췄어요', stretch: '잠깐 스트레칭하거나 쉬었어요', other: '기타 사항' },
      heardFrom: { victim: '재해자에게 직접 들었어요', colleague: '동료 직원에게 들었어요', none: '듣지 못했거나 기억나지 않아요', other: '기타 사항' },
      heardWhen: { sameDay: '사고 직후 또는 당일', later: '다음 날 이후', unknown: '잘 기억나지 않아요' },
      workAfter: { stopped: '아니오', continued: '네', unknown: '이후 모습을 보지 못했거나 기억나지 않음', other: '기타 사항' },
      reportSeen: { direct: '직접 보고하거나 연락하는 것을 봤어요', heard: '보고했다는 이야기만 들었어요', unknown: '확인하지 못했어요 / 잘 모르겠어요' },
      extraStatus: { yes: '있어요', no: '없어요', unknown: '잘 모르겠어요' }
    };
    return (maps[key] && maps[key][w[key]]) || '-';
  }

  function buildWitnessInterviewPages(result) {
    if (!result.classified.length) return '';
    return result.classified.map((x, i) => {
      const w = x.w;
      const rows = [
        ['면담자명', w.name || `목격자 ${i + 1}`],
        ['면담일시', [w.interviewDate, w.interviewTime].filter(Boolean).join(' ') || '-'],
        ['사고 당시 무엇을 하고 있었나요?', w.activity || '-'],
        ['사고 장면을 직접 보셨나요?', witnessAnswerText(w, 'sawAccident')],
        ...(w.sawAccident === 'yes'
          ? [['직접 본 상황', w.accidentDetail || '-']]
          : [
              ...(w.sawAccident === 'other' && w.accidentDetail ? [['직접 목격 관련 추가 설명', w.accidentDetail]] : []),
              ['사고 직후 평소와 다른 모습을 보셨나요?', witnessAnswerText(w, 'sawAftermath')],
              ...(w.sawAftermath === 'other' && w.aftermathDetail ? [['추가 설명', w.aftermathDetail]] : []),
              ['재해사실의 사고 이야기를 어떻게 들으셨나요?', witnessAnswerText(w, 'heardFrom')],
              ...(w.heardFrom && w.heardFrom !== 'none' && w.heardDetail ? [['들은 내용', w.heardDetail]] : [])
            ]),
        ['사고 이후에도 계속 일하는 모습을 보셨나요?', witnessAnswerText(w, 'workAfter')],
        ...(w.workAfter === 'other' && w.workDetail ? [['추가 설명', w.workDetail]] : []),
        ...(w.extra ? [['추가로 남긴 내용', w.extra]] : [])
      ];
      return `<section class="doc-witness-page">
        <div class="doc-header doc-subpage-header">
          <p class="doc-header-title">목격자 면담 확인서</p>
          <p class="doc-header-sub">사고 관리번호 : ${escapeHtml(getOrCreateCaseId())} · 면담 ${i + 1}</p>
        </div>
        <div class="doc-interview-sheet">
          ${rows.map(([q,a], idx) => `<div class="doc-interview-row"><div class="doc-interview-q">${idx + 1}. ${escapeHtml(q)}</div><div class="doc-interview-a">${escapeHtml(a)}</div></div>`).join('')}
        </div>
        <p class="doc-interview-confirm">위 내용은 면담 대상자의 답변을 기준으로 작성했으며, 확인하지 못한 내용은 임의로 추측하지 않았습니다.</p>
      </section>`;
    }).join('');
  }

  function renderDocPreview(result) {
    const b = result.base;
    const orgStr = [b.invDivision, b.invDept, b.invTeam].filter(Boolean).join(' - ') || '-';
    const storeName = b.invStoreName || '-';
    const victimName = b.invVictimName || '-';
    const author = b.invAuthorName || '-';
    const interviewerNames = collectWitnessNames(result.classified) || '-';
    const dateStr = b.invIncidentDate || '-';
    const timeStr = b.invIncidentTime || '-';
    const placeStr = b.invIncidentPlace || '-';

    const appendixHtml = buildAppendixHtml(result);
    const attachGrid = chatImages.length
      ? `<div class="doc-section"><p class="doc-section-title">■ 첨부 : 공유·보고 기록 캡처</p><div class="doc-attach-grid">${chatImages.map((img, i) => `<img src="${img.dataUrl}" alt="증빙 캡처 ${i + 1}">`).join('')}</div></div>`
      : '';
    const witnessPages = buildWitnessInterviewPages(result);

    document.getElementById('invDocPreview').innerHTML = `
      <section class="doc-main-page">
        <div class="doc-header">
          <p class="doc-header-title">사고조사 결과 확인서</p>
          <p class="doc-header-sub">사고 관리번호 : ${escapeHtml(getOrCreateCaseId())}</p>
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
          <p class="doc-section-title">■ 목격자 면담</p>
          <p class="doc-witness-summary">총 ${result.classified.length}명 면담 완료${result.classified.length ? '<br>※ 세부 면담내용은 다음 페이지를 참조해 주세요.' : ''}</p>
        </div>
        ${appendixHtml ? `<div class="doc-section doc-appendix-section"><p class="doc-section-title">■ 보험가입자의견서 별지 — 재해사실 불인정 사유</p><div class="doc-appendix-box">${appendixHtml}</div></div>` : ''}
        ${attachGrid}
        <div class="doc-signature-row"><span>작성자</span><span class="doc-signature-name">${escapeHtml(author)}</span></div>
        <p class="doc-footer-note">본 자료는 사고 당시 사실관계 확인 및 보험가입자의견서 작성 참고를 위한 내부 확인자료입니다. 산재 승인 여부의 최종 판단은 근로복지공단에서 결정합니다.</p>
      </section>
      ${witnessPages}`;
  }

  // 문서 미리보기(사용자가 직접 수정한 내용 포함)를 순수 텍스트로 변환 — 구글시트 '문서내용' 컬럼 등에 사용
  function normalizeDocPreview(result, author) {
    const preview = document.getElementById('invDocPreview');
    if (!preview) return;
    const title = preview.querySelector('.doc-header-title');
    if (title) title.textContent = '사고조사 결과 확인서';

    const verdict = preview.querySelector('.doc-verdict-banner');
    if (verdict) verdict.remove();

    const cells = Array.from(preview.querySelectorAll('.doc-info-cell'));
    if (cells[4]) cells[4].remove();
    const authorCell = Array.from(preview.querySelectorAll('.doc-info-cell')).find(cell => cell.textContent.indexOf(author) !== -1);
    if (authorCell && !preview.querySelector('[data-doc-written-at]')) {
      const written = document.createElement('div');
      written.className = 'doc-info-cell';
      written.setAttribute('data-doc-written-at', 'true');
      written.innerHTML = '<span class="doc-info-label">작성일</span><span class="doc-info-value">' + escapeHtml(new Date().toLocaleDateString('ko-KR')) + '</span>';
      authorCell.after(written);
    }

    if (result.verdict !== 'unrecognized') {
      preview.querySelectorAll('.doc-appendix-box').forEach(box => {
        const section = box.closest('.doc-section');
        if (section) section.remove();
      });
    }

    const footer = preview.querySelector('.doc-footer-note');
    if (footer) footer.textContent = '산재 승인 여부의 최종 판단은 근로복지공단에서 결정합니다.';
  }

  function addSignatureWrittenDate() {
    const preview = document.getElementById('invDocPreview');
    if (!preview) return;
    preview.querySelectorAll('[data-doc-written-at]').forEach(el => {
      const cell = el.closest('.doc-info-cell');
      if (cell) cell.remove();
    });
    const signature = preview.querySelector('.doc-signature-row');
    if (signature && !preview.querySelector('[data-doc-sign-date]')) {
      const writtenLabel = document.createElement('span');
      writtenLabel.textContent = '작성일';
      const written = document.createElement('span');
      written.className = 'doc-written-date';
      written.setAttribute('data-doc-sign-date', 'true');
      written.textContent = new Date().toLocaleDateString('ko-KR');
      signature.prepend(writtenLabel, written);
    }
  }

  function docPreviewToPlainText() {
    const preview = document.getElementById('invDocPreview');
    return preview ? preview.innerText.trim() : '';
  }

  function docPreviewToServerHtml() {
    const preview = document.getElementById('invDocPreview');
    if (!preview) return '';
    const clone = preview.cloneNode(true);
    // 첨부 이미지는 이미 별도 업로드되므로 대용량 base64를 다시 전송하지 않습니다.
    clone.querySelectorAll('.doc-attach-grid img').forEach(img => img.removeAttribute('src'));
    return clone.innerHTML.trim();
  }

  function renderResult(result) {
    // 상단의 인정/불인정 대형 판정 박스는 표시하지 않고 확인서만 보여줍니다.
    const resultArea = document.getElementById('invResultArea');
    if (resultArea) resultArea.innerHTML = '';

    const docBox = document.getElementById('invDocBox');
    if (docBox) {
      renderDocPreview(result);
      normalizeDocPreview(result, result.base.invAuthorName || '-');
      addSignatureWrittenDate();
      docBox.style.display = 'block';
    }
  }

  function showInvestigationResult(result) {
    window.__investigationResult = result;
    renderResult(result);
    const overlay = document.getElementById('invResultOverlay');
    if (overlay) {
      overlay.classList.add('visible');
      const body = overlay.querySelector('.inv-result-body');
      if (body) body.scrollTo({ top: 0 });
    }
    setTimeout(() => {
      const editableTargets = document.querySelectorAll('#invDocPreview .reason-highlight-target');
      editableTargets.forEach(target => {
        target.classList.remove('reason-highlight');
        void target.offsetWidth;
        target.classList.add('reason-highlight');
      });
      setTimeout(() => editableTargets.forEach(target => target.classList.remove('reason-highlight')), 6200);
    }, 350);
  }

  function buildUnrecognizedDraft(result) {
    const body = result.reasons
      .filter(r => !r.startsWith('현재 확보된 객관자료만으로는') && !r.startsWith('확보된 영상·목격자'))
      .join('\n');
    const conflict = result.conflictReasons.length ? `\n${result.conflictReasons.join('\n')}` : '';
    return `${body}${conflict}\n이와 같은 재해 사실에 대하여 회사는 현재까지 확인된 자료와 관련 진술을 종합적으로 고려하였으며, 업무상 재해 해당 여부에 대한 신중한 검토를 요청드리고자 본 별지를 첨부합니다. 귀 공단의 면밀한 사실관계 확인과 판단을 요청드립니다.`.trim();
  }

  function openFinalReview(result) {
    const guide = document.getElementById('invReviewGuideOverlay');
    const reason = document.getElementById('invConflictReason');
    const reasonWrap = document.getElementById('invConflictReasonWrap');
    const confirm = document.getElementById('invConflictConfirm');
    const confirmText = document.getElementById('invConflictConfirmText');
    const radios = Array.from(document.querySelectorAll('input[name="invManualVerdict"]'));
    const saveBtn = document.getElementById('invReviewGuideOkBtn');
    const title = document.getElementById('invReviewGuideTitle');
    const message = document.getElementById('invReviewGuideMessage');
    const eyebrow = document.getElementById('invReviewGuideEyebrow');
    const draft = buildUnrecognizedDraft(result);

    window.__conflictDraft = draft;
    if (reason) reason.value = draft;
    if (confirm) confirm.checked = false;
    radios.forEach(r => {
      r.checked = r.value === result.verdict;
      const label = r.closest('.radio-pill');
      if (label) label.classList.toggle('is-checked', r.checked);
    });
    if (saveBtn) saveBtn.disabled = false;
    if (eyebrow) eyebrow.textContent = result.hasConflict ? '확인자료 재검토 필요' : '최종 판단 확인';
    if (title) title.textContent = result.hasConflict ? '확인자료 간 내용이 서로 다릅니다.' : '조사 결과를 확인해 주세요.';
    if (message) message.textContent = result.hasConflict
      ? 'CCTV, 목격자 면담 및 첨부자료를 다시 확인한 후 최종 판단을 선택해 주세요.'
      : '입력한 자료를 바탕으로 시스템이 판단 방향을 제안했습니다. 최종 판단을 확인해 주세요.';
    const selected = document.querySelector('input[name="invManualVerdict"]:checked');
    if (confirmText) confirmText.textContent = selected && selected.value === 'unrecognized'
      ? '자동 생성된 재해사실 불인정 사유서의 전체 내용을 확인하였습니다.'
      : 'CCTV, 공유기록, 목격자 면담 및 첨부자료를 확인하고 최종 판단했습니다.';
    if (reasonWrap) reasonWrap.style.display = selected && selected.value === 'unrecognized' ? '' : 'none';

    if (guide) {
      guide.classList.add('visible');
      guide.setAttribute('aria-hidden', 'false');
      const box = guide.querySelector('.submit-box');
      if (box) box.scrollTop = 0;
    }
    refreshConflictSaveState();
  }

  function refreshConflictSaveState() {
    const reason = document.getElementById('invConflictReason');
    const reasonWrap = document.getElementById('invConflictReasonWrap');
    const confirm = document.getElementById('invConflictConfirm');
    const verdict = document.querySelector('input[name="invManualVerdict"]:checked');
    const saveBtn = document.getElementById('invReviewGuideOkBtn');
    const isUnrecognized = !!(verdict && verdict.value === 'unrecognized');
    if (reasonWrap) reasonWrap.style.display = isUnrecognized ? '' : 'none';
    const changed = !!(reason && reason.value.trim() && reason.value.trim() !== String(window.__conflictDraft || '').trim());
    if (saveBtn) saveBtn.disabled = false;
    const note = document.getElementById('invConflictEditNote');
    if (note) note.classList.toggle('done', isUnrecognized && changed);
  }

  document.querySelectorAll('input[name="invWorkVideoAbnormal"]').forEach(radio => {
    radio.addEventListener('change', () => {
      const wrap = document.getElementById('invWorkVideoDetailWrap');
      if (wrap) wrap.style.display = radio.checked && radio.value === 'other' ? '' : 'none';
      if (radio.checked && radio.value !== 'other') {
        clearValidation(document.getElementById('invWorkVideoDetailWrap'));
        const detail = document.getElementById('invWorkVideoDetail');
        if (detail) detail.value = '';
      }
    });
  });

  const runBtn = document.getElementById('runInvestigationBtn');
  if (runBtn) {
    runBtn.addEventListener('click', () => {
      if (!validateRecordStep()) { setInvestigationStep('record'); return; }
      const presence = document.querySelector('input[name="invWitnessPresence"]:checked');
      const presenceBox = document.querySelector('.witness-presence-box');
      if (!presence) { flagValidation(presenceBox, '목격자 유무를 선택해 주세요.'); return; }
      if (presence.value === 'yes' && witnessList && witnessList.querySelectorAll('.witness-card').length === 0) {
        flagValidation(document.getElementById('addWitnessBtn'), '목격자 면담을 1명 이상 작성해 주세요.'); return;
      }
      if (presence.value === 'yes' && !validateAllWitnessCards()) return;
      const result = computeJudgement();
      window.__pendingInvestigationResult = result;
      openFinalReview(result);
    });
  }

  function closeFinalReview() {
    const guide = document.getElementById('invReviewGuideOverlay');
    if (guide) {
      guide.classList.remove('visible');
      guide.setAttribute('aria-hidden', 'true');
    }
  }

  const reviewCloseBtn = document.getElementById('invReviewGuideCloseBtn');
  if (reviewCloseBtn) reviewCloseBtn.addEventListener('click', closeFinalReview);

  const conflictReason = document.getElementById('invConflictReason');
  const conflictConfirm = document.getElementById('invConflictConfirm');
  if (conflictReason) conflictReason.addEventListener('input', refreshConflictSaveState);
  if (conflictConfirm) conflictConfirm.addEventListener('change', () => { clearValidation(conflictConfirm); refreshConflictSaveState(); });
  document.querySelectorAll('input[name="invManualVerdict"]').forEach(radio => {
    radio.addEventListener('change', () => {
      document.querySelectorAll('input[name="invManualVerdict"]').forEach(r => {
        const label = r.closest('.radio-pill');
        if (label) label.classList.toggle('is-checked', r.checked);
      });
      const confirm = document.getElementById('invConflictConfirm');
      if (confirm) confirm.checked = false;
      const confirmText = document.getElementById('invConflictConfirmText');
      if (confirmText) confirmText.textContent = radio.value === 'unrecognized'
        ? '자동 생성된 재해사실 불인정 사유서의 전체 내용을 확인하였습니다.'
        : 'CCTV, 공유기록, 목격자 면담 및 첨부자료를 확인하고 최종 판단했습니다.';
      clearValidation(document.querySelector('.inv-confirm-check'));
      refreshConflictSaveState();
    });
  });

  const invReviewGuideOkBtn = document.getElementById('invReviewGuideOkBtn');
  if (invReviewGuideOkBtn) {
    invReviewGuideOkBtn.addEventListener('click', () => {
      const result = window.__pendingInvestigationResult || computeJudgement();
      const verdict = document.querySelector('input[name="invManualVerdict"]:checked');
      const reason = document.getElementById('invConflictReason');
      if (!verdict) { flagValidation(document.getElementById('invConflictChoice'), '최종 판단을 선택해 주세요.'); return; }
      const confirm = document.getElementById('invConflictConfirm');
      if (!confirm || !confirm.checked) { flagValidation(document.querySelector('.inv-confirm-check'), verdict.value === 'unrecognized' ? '불인정 사유서 확인 여부를 체크해 주세요.' : '최종 판단 확인 여부를 체크해 주세요.'); return; }

      result.verdict = verdict.value;
      result.manualReason = verdict.value === 'unrecognized' && reason ? reason.value.trim() : '';
      result.manualReviewed = true;
      window.__pendingInvestigationResult = result;

      const guide = document.getElementById('invReviewGuideOverlay');
      if (guide) {
        guide.classList.remove('visible');
        guide.setAttribute('aria-hidden', 'true');
      }
      showInvestigationResult(result);
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
    window.__lastDownloadUrl = '';
  }

  function getLastPdfBlob() {
    return window.__lastPdfBlob instanceof Blob ? window.__lastPdfBlob : null;
  }

  function setSharePdfAvailability() {
    const btn = document.getElementById('sharePdfBtn');
    if (!btn) return;
    const ready = !!(window.__lastDownloadUrl || window.__lastDocumentLink);
    btn.disabled = !ready;
    btn.title = ready ? '생성된 PDF를 열거나 다운로드합니다.' : 'PDF 링크를 확인하는 중입니다.';
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
      .then(async () => {
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
        const pageWidthMm = 210;
        const pageHeightMm = 297;
        const sections = Array.from(preview.querySelectorAll(':scope > .doc-main-page, :scope > .doc-witness-page'));
        const captureTargets = sections.length ? sections : [preview];
        let firstPdfPage = true;

        for (const target of captureTargets) {
          const canvas = await html2canvas(target, { scale: 1.1, backgroundColor: '#ffffff', logging: false });
          const imgData = canvas.toDataURL('image/jpeg', 0.78);
          const imgHeightMm = (canvas.height * pageWidthMm) / canvas.width;
          let y = 0;
          let remainingHeight = imgHeightMm;

          if (!firstPdfPage) pdf.addPage();
          firstPdfPage = false;
          pdf.addImage(imgData, 'JPEG', 0, y, pageWidthMm, imgHeightMm);
          remainingHeight -= pageHeightMm;

          while (remainingHeight > 0) {
            pdf.addPage();
            y -= pageHeightMm;
            pdf.addImage(imgData, 'JPEG', 0, y, pageWidthMm, imgHeightMm);
            remainingHeight -= pageHeightMm;
          }
        }

        const rawUri = pdf.output('datauristring');
        const base64Part = rawUri.split(',').pop();
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
      if (x.c.type === 'direct') countByType.direct += 1;
      else if (x.c.type === 'aftermath' || x.c.type === 'aftermathUnclear') countByType.aftermath += 1;
      else if (x.c.type === 'secondhand') countByType.secondhand += 1;
      else if (x.c.type === 'unaware') countByType.unaware += 1;
    });

    return {
      caseId: getOrCreateCaseId(),
      downloadToken: getOrCreateDownloadToken(),
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
      reasons: result.manualReviewed && result.manualReason ? [result.manualReason] : result.reasons,
      witnessCount: result.witnesses.length,
      directCount: countByType.direct,
      aftermathCount: countByType.aftermath,
      secondhandCount: countByType.secondhand,
      unawareCount: countByType.unaware,
      document: docPreviewToPlainText(),
      documentHtml: docPreviewToServerHtml(),
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
    window.__lastDownloadUrl = window.__lastDocumentLink
      ? buildDownloadUrl(payload.caseId, payload.downloadToken)
      : '';
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
            statusEl.textContent = window.__lastDownloadUrl
              ? '✅ 전송이 완료되었습니다. 결과보기를 눌러 PDF를 열거나 다운로드하세요.'
              : '✅ 전송은 완료되었습니다. PDF 링크는 전송 카드에서 확인하세요.';
            statusEl.className = window.__lastDownloadUrl
              ? 'teams-send-status teams-send-ok'
              : 'teams-send-status';
          }
          // 서버에서 PDF를 만들기 때문에 휴대폰 공유 버튼은 로컬 PDF가 있을 때만 활성화됩니다.
          setTeamsModalState('done');
          if (teamsModalEl) teamsModalEl.classList.remove('visible');
          updateSubmitOverlay(
            '전송 완료',
            window.__lastDownloadUrl
              ? '결과보기를 눌러 생성된 PDF를 열거나 다운로드할 수 있습니다.'
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
      const url = window.__lastDownloadUrl || window.__lastDocumentLink;
      if (url) {
        window.open(url, '_blank', 'noopener');
        return;
      }
      alert('PDF를 아직 확인하지 못했습니다. 전송이 끝난 뒤 다시 눌러주세요.');
    });
  }

  const submitResultBtn = document.getElementById('submitResultBtn');
  if (submitResultBtn) {
    submitResultBtn.addEventListener('click', () => {
      const url = window.__lastDownloadUrl || window.__lastDocumentLink;
      if (url) {
        window.open(url, '_blank', 'noopener');
        return;
      }
      alert('PDF를 아직 확인하지 못했습니다. 전송이 끝난 뒤 다시 눌러주세요.');
    });
  }

  const submitHomeBtn = document.getElementById('submitHomeBtn');
  if (submitHomeBtn) {
    submitHomeBtn.addEventListener('click', () => {
      hideSubmitOverlay();
      const homeBtn = document.querySelector('.nav-menu-item[data-target="home"]');
      if (homeBtn) homeBtn.click();
    });
  }

  /* ---------- 홈으로 (모달 닫고 즉시대응 화면으로 이동) ---------- */
  const teamsHomeBtn = document.getElementById('teamsHomeBtn');
  if (teamsHomeBtn) {
    teamsHomeBtn.addEventListener('click', () => {
      const modal = document.getElementById('teamsModal');
      if (modal) modal.classList.remove('visible');
      const homeBtn = document.querySelector('.nav-menu-item[data-target="home"]');
      if (homeBtn) homeBtn.click();
    });
  }

});
