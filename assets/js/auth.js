/* =========================================================
   로그인(비밀번호 4자리) 처리
   ---------------------------------------------------------
   - 이 페이지는 GitHub Pages에 공개되어 누구나 URL을 알면 접속할 수 있으므로,
     최소한의 접근 제한으로 비밀번호 4자리를 둡니다. (ID 없음, 임시 비밀번호 0000)
   - 비밀번호는 이 파일에서만 확인하며, 서버로 전송하지 않습니다.
   - 로그인 유지 시간은 5분입니다. 5분이 지나면 다시 비밀번호를 입력해야 합니다.
   - 로그인에 성공하면 "시스템 최적화 중입니다" 로딩 화면을 잠깐 보여주면서
     이미지 등 리소스를 미리 불러옵니다. 이후 화면 전환 시 로딩이 느껴지지 않게
     하기 위한 장치입니다.
   ========================================================= */

const AUTH_PASSCODE = '0000';
const AUTH_STORAGE_KEY = 'fieldGuide_auth_expiresAt';
const AUTH_SESSION_MINUTES = 5; // 로그인 유지 시간(분 단위). 이후 자동 로그아웃(재입력 필요)

document.addEventListener('DOMContentLoaded', () => {

  const loginOverlay = document.getElementById('loginOverlay');
  const bootOverlay = document.getElementById('bootOverlay');
  const pinDotsWrap = document.getElementById('loginPinDots');
  const pinDots = pinDotsWrap ? Array.from(pinDotsWrap.querySelectorAll('.login-pin-dot')) : [];
  const loginError = document.getElementById('loginError');
  const loginKeypad = document.getElementById('loginKeypad');
  const loginBox = document.querySelector('.login-box');

  let enteredPin = '';
  let sessionExpiryTimer = null;

  function isSessionValid() {
    const expiresAt = Number(localStorage.getItem(AUTH_STORAGE_KEY) || 0);
    return expiresAt > Date.now();
  }

  function showLoginForExpiredSession() {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    if (sessionExpiryTimer) {
      clearTimeout(sessionExpiryTimer);
      sessionExpiryTimer = null;
    }
    if (bootOverlay) {
      bootOverlay.classList.remove('hide');
      bootOverlay.style.display = 'none';
    }
    if (loginOverlay) loginOverlay.style.display = 'flex';
    resetPin();
    if (loginError) loginError.textContent = '보안을 위해 5분이 지나 다시 로그인이 필요합니다.';
  }

  function scheduleSessionExpiry(expiresAt) {
    if (sessionExpiryTimer) clearTimeout(sessionExpiryTimer);
    const remaining = Math.max(Number(expiresAt || 0) - Date.now(), 0);
    sessionExpiryTimer = setTimeout(showLoginForExpiredSession, remaining);
  }

  function startSession() {
    const expiresAt = Date.now() + AUTH_SESSION_MINUTES * 60 * 1000;
    localStorage.setItem(AUTH_STORAGE_KEY, String(expiresAt));
    scheduleSessionExpiry(expiresAt);
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

  function hideLoginShowBoot() {
    if (loginOverlay) loginOverlay.style.display = 'none';
    if (bootOverlay) {
      bootOverlay.classList.remove('hide');
      bootOverlay.style.display = 'none';
    }
  }

  /* ---------- 시작 시 세션 확인 ---------- */
  if (isSessionValid()) {
    const expiresAt = Number(localStorage.getItem(AUTH_STORAGE_KEY) || 0);
    scheduleSessionExpiry(expiresAt);
    if (loginOverlay) loginOverlay.style.display = 'none';
    hideLoginShowBoot();
  } else {
    if (bootOverlay) bootOverlay.style.display = 'none';
    // 로그인 화면은 기본적으로 표시된 상태(CSS)이므로 별도 처리 불필요
  }

});
