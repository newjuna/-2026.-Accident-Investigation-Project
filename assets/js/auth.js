/* =========================================================
   로그인(비밀번호 4자리) + 초기 로딩(시스템 최적화 중) 처리
   ---------------------------------------------------------
   - 이 페이지는 GitHub Pages에 공개되어 누구나 URL을 알면 접속할 수 있으므로,
     최소한의 접근 제한으로 비밀번호 4자리를 둡니다. (ID 없음, 임시 비밀번호 0000)
   - 비밀번호는 이 파일에서만 확인하며, 서버로 전송하지 않습니다.
   - 로그인 유지 시간은 3시간입니다. 3시간이 지나면 다시 비밀번호를 입력해야 합니다.
   - 로그인에 성공하면 "시스템 최적화 중입니다" 로딩 화면을 잠깐 보여주면서
     이미지 등 리소스를 미리 불러옵니다. 이후 화면 전환 시 로딩이 느껴지지 않게
     하기 위한 장치입니다.
   ========================================================= */

const AUTH_PASSCODE = '0000';
const AUTH_STORAGE_KEY = 'fieldGuide_auth_expiresAt';
const AUTH_SESSION_HOURS = 3; // 로그인 유지 시간(시간 단위). 이후 자동 로그아웃(재입력 필요)

document.addEventListener('DOMContentLoaded', () => {

  const loginOverlay = document.getElementById('loginOverlay');
  const bootOverlay = document.getElementById('bootOverlay');
  const pinDotsWrap = document.getElementById('loginPinDots');
  const pinDots = pinDotsWrap ? Array.from(pinDotsWrap.querySelectorAll('.login-pin-dot')) : [];
  const loginError = document.getElementById('loginError');
  const loginKeypad = document.getElementById('loginKeypad');
  const loginBox = document.querySelector('.login-box');

  let enteredPin = '';

  function isSessionValid() {
    const expiresAt = Number(localStorage.getItem(AUTH_STORAGE_KEY) || 0);
    return expiresAt > Date.now();
  }

  function startSession() {
    const expiresAt = Date.now() + AUTH_SESSION_HOURS * 60 * 60 * 1000;
    localStorage.setItem(AUTH_STORAGE_KEY, String(expiresAt));
  }

  function renderPinDots() {
    pinDots.forEach((dot, i) => dot.classList.toggle('filled', i < enteredPin.length));
  }

  function resetPin() {
    enteredPin = '';
    renderPinDots();
  }

  function showLoginError(msg) {
    if (loginError) loginError.textContent = msg;
    if (loginBox) {
      loginBox.classList.add('login-shake');
      setTimeout(() => loginBox.classList.remove('login-shake'), 400);
    }
  }

  function tryLogin() {
    if (enteredPin === AUTH_PASSCODE) {
      startSession();
      if (loginError) loginError.textContent = '';
      hideLoginShowBoot();
    } else {
      showLoginError('비밀번호가 올바르지 않습니다.');
      resetPin();
    }
  }

  if (loginKeypad) {
    loginKeypad.addEventListener('click', (e) => {
      const btn = e.target.closest('.login-key');
      if (!btn) return;
      const key = btn.dataset.key;

      if (key === 'clear') {
        resetPin();
        if (loginError) loginError.textContent = '';
        return;
      }
      if (key === 'back') {
        enteredPin = enteredPin.slice(0, -1);
        renderPinDots();
        return;
      }
      if (enteredPin.length >= 4) return;
      enteredPin += key;
      renderPinDots();
      if (enteredPin.length === 4) {
        setTimeout(tryLogin, 120); // 마지막 자리 입력 표시가 보이도록 살짝 지연
      }
    });
  }

  /* =========================================================
     초기 로딩 화면 (시스템 최적화 중)
     ---------------------------------------------------------
     로그인 성공 직후(또는 이미 로그인된 상태로 재접속 시) 잠깐 보여주면서
     페이지의 이미지 리소스를 미리 로드합니다. 이렇게 하면 이후 매뉴얼 탭 등을
     이동할 때 이미지 로딩으로 인한 지연이 느껴지지 않습니다.
     ========================================================= */
  const BOOT_MIN_MS = 1400; // 최소 노출 시간 (너무 빨리 사라지면 "최적화" 느낌이 안 남)
  const bootTextEl = document.getElementById('bootText');
  const bootFillEl = document.getElementById('bootProgressFill');

  const BOOT_MESSAGES = [
    '시스템 최적화 중입니다',
    '최신 매뉴얼 데이터를 불러오는 중입니다',
    '거의 다 됐습니다'
  ];

  function preloadImages() {
    const urls = new Set();
    document.querySelectorAll('img[src]').forEach(img => urls.add(img.src));
    // data-src 등 lazy 속성도 있으면 포함 (현재는 src 그대로 사용 중)
    const promises = Array.from(urls).map(src => new Promise(resolve => {
      const img = new Image();
      img.onload = resolve;
      img.onerror = resolve;
      img.src = src;
    }));
    return Promise.all(promises);
  }

  function runBoot() {
    if (bootOverlay) bootOverlay.style.display = 'flex';

    let msgIndex = 0;
    if (bootTextEl) bootTextEl.textContent = BOOT_MESSAGES[0];
    const msgInterval = setInterval(() => {
      msgIndex = (msgIndex + 1) % BOOT_MESSAGES.length;
      if (bootTextEl) bootTextEl.textContent = BOOT_MESSAGES[msgIndex];
    }, 700);

    let progress = 0;
    const progressInterval = setInterval(() => {
      progress = Math.min(progress + Math.random() * 18, 92);
      if (bootFillEl) bootFillEl.style.width = progress + '%';
    }, 220);

    const startTime = Date.now();
    preloadImages().then(() => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(BOOT_MIN_MS - elapsed, 0);
      setTimeout(() => {
        clearInterval(msgInterval);
        clearInterval(progressInterval);
        if (bootFillEl) bootFillEl.style.width = '100%';
        setTimeout(() => {
          if (bootOverlay) {
            bootOverlay.classList.add('hide');
            setTimeout(() => { bootOverlay.style.display = 'none'; }, 400);
          }
          showGuidePopup();
        }, 200);
      }, remaining);
    });
  }

  function hideLoginShowBoot() {
    if (loginOverlay) loginOverlay.style.display = 'none';
    runBoot();
  }

  /* =========================================================
     "사고 발생 시 꼭 숙지해야 할 사항" 안내 팝업
     ---------------------------------------------------------
     로딩이 끝난 직후 한 번 띄우며, 안내 문구가 0.6초 간격으로 하나씩
     나타납니다. 모든 문구가 나타나야 "확인했습니다" 버튼이 눌립니다.
     ========================================================= */
  function showGuidePopup() {
    const overlay = document.getElementById('guideOverlay');
    const closeBtn = document.getElementById('guideCloseBtn');
    if (!overlay) return;

    overlay.style.display = 'flex';

    const stepIds = ['gStep0', 'gStep1', 'gStep2', 'gStep3'];
    stepIds.forEach((id, i) => {
      setTimeout(() => {
        const el = document.getElementById(id);
        if (el) {
          el.classList.remove('guide-step-hidden');
          el.classList.add('guide-step-visible');
        }
        if (i === stepIds.length - 1 && closeBtn) {
          closeBtn.disabled = false;
        }
      }, 400 + 600 * (i + 1));
    });

    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        overlay.style.display = 'none';
      });
    }
  }

  /* ---------- 시작 시 세션 확인 ---------- */
  if (isSessionValid()) {
    if (loginOverlay) loginOverlay.style.display = 'none';
    runBoot();
  } else {
    if (bootOverlay) bootOverlay.style.display = 'none';
    // 로그인 화면은 기본적으로 표시된 상태(CSS)이므로 별도 처리 불필요
  }

});
