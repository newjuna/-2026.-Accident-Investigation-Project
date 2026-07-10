// 사고 발생 현장 대응 가이드 - 탭 전환(사이드바 내비게이션) + 검색 스크립트
document.addEventListener('DOMContentLoaded', () => {

  const panels = document.querySelectorAll('.tab-panel');
  const navMenuItems = document.querySelectorAll('.nav-menu-item');

  function activateTab(target) {
    navMenuItems.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.target === target);
    });
    panels.forEach(panel => {
      panel.classList.toggle('active', panel.dataset.panel === target);
    });
    // 탭 전환 시 스크롤 맨 위로
    const mainEl = document.querySelector('.app-main');
    if (mainEl) mainEl.scrollTo({ top: 0 });
    window.scrollTo({ top: 0 });
    // 상태를 URL 해시에 반영 (뒤로가기/새로고침 대응)
    history.replaceState(null, '', '#' + target);
  }

  /* ---------- 우측 사이드바 내비게이션 열기/닫기 ---------- */
  const navSidebar = document.getElementById('navSidebar');
  const navOverlay = document.getElementById('navOverlay');
  const headerMenuBtn = document.getElementById('headerMenuBtn');
  const navCloseBtn = document.getElementById('navCloseBtn');

  function openNav() {
    if (navSidebar) navSidebar.classList.add('open');
    if (navOverlay) navOverlay.classList.add('open');
  }
  function closeNav() {
    if (navSidebar) navSidebar.classList.remove('open');
    if (navOverlay) navOverlay.classList.remove('open');
  }
  if (headerMenuBtn) headerMenuBtn.addEventListener('click', openNav);
  if (navCloseBtn) navCloseBtn.addEventListener('click', closeNav);
  if (navOverlay) navOverlay.addEventListener('click', closeNav);

  navMenuItems.forEach(btn => {
    btn.addEventListener('click', () => {
      activateTab(btn.dataset.target);
      closeNav();
    });
  });

  // 탭 바에 없는 화면 등으로 이동하는 버튼 (예: 안내 카드의 바로가기 버튼)
  document.querySelectorAll('[data-goto]').forEach(el => {
    el.addEventListener('click', () => activateTab(el.dataset.goto));
  });

  const headerSearchBtn = document.getElementById('headerSearchBtn');
  if (headerSearchBtn) {
    headerSearchBtn.addEventListener('click', () => activateTab('search'));
  }

  // 최초 진입 시 URL 해시가 있으면 해당 탭 활성화
  const validTargets = Array.from(navMenuItems).map(b => b.dataset.target).concat(['search']);
  const initialHash = window.location.hash.replace('#', '');
  if (initialHash && validTargets.includes(initialHash)) {
    activateTab(initialHash);
  }

  /* ---------- 검색 (즉시대응·사고조사·경위서·휴업신청·FAQ 통합) ---------- */
  const searchInput = document.getElementById('searchInput');
  const searchResults = document.getElementById('searchResults');
  const searchTagBtns = document.querySelectorAll('.search-tag-btn');

  function renderResults(list) {
    searchResults.innerHTML = '';

    if (list.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'search-empty';
      empty.textContent = '검색 결과가 없습니다. 다른 키워드로 시도해보세요.';
      searchResults.appendChild(empty);
      return;
    }

    list.forEach(item => {
      const card = document.createElement('div');
      card.className = 'search-result-card';

      const tagEl = document.createElement('span');
      tagEl.className = 'search-result-tag';
      tagEl.textContent = item.tag;

      const qEl = document.createElement('p');
      qEl.className = 'search-result-q';
      qEl.textContent = item.q;

      const aEl = document.createElement('p');
      aEl.className = 'search-result-a';
      aEl.textContent = item.a;

      card.appendChild(tagEl);
      card.appendChild(qEl);
      card.appendChild(aEl);
      searchResults.appendChild(card);
    });
  }

  // 동의어 사전: 실무자가 실제로 검색할 만한 다른 표현들을 매핑
  const SEARCH_SYNONYMS = {
    '씨씨티비': 'cctv', '영상': 'cctv', '영상없음': 'cctv',
    '증빙': '사고조사', '자료확보': '사고조사', '확인자료': '사고조사',
    '인정여부': '사고조사', '불인정': '사고조사', '근무영상': '사고조사',
    '인터뷰': '사고조사', '진술': '사고조사', '진술서': '사고조사',
    '목격자': '사고조사', '직접목격': '사고조사', '사후전달': '사고조사',
    '면담': '사고조사', '보험가입자의견서': '사고조사', '별지': '사고조사',
    '산재조사표': '경위서', '사고보고': '경위서',
    '연차': '휴업신청', '병가': '휴업신청', '산재신청': '휴업신청',
    '공상': '휴업신청', '출퇴근': '휴업신청'
  };

  function expandKeyword(term) {
    const lower = term.toLowerCase();
    return SEARCH_SYNONYMS[lower] ? `${lower} ${SEARCH_SYNONYMS[lower]}` : lower;
  }

  function doSearch(keyword) {
    if (!keyword) {
      searchResults.innerHTML = '<div class="search-empty">검색어를 입력하거나 위 태그를 눌러보세요.</div>';
      return;
    }
    const term = expandKeyword(keyword.trim());
    const terms = term.split(/\s+/).filter(Boolean);
    const filtered = SEARCH_DATA.filter(item => {
      const haystack = (item.q + ' ' + item.a + ' ' + item.tag).toLowerCase();
      return terms.some(t => haystack.includes(t));
    });
    renderResults(filtered);
  }

  if (typeof SEARCH_DATA !== 'undefined' && searchInput) {
    searchInput.addEventListener('input', () => doSearch(searchInput.value));

    searchTagBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        searchInput.value = '';
        const tag = btn.dataset.tag;
        const filtered = SEARCH_DATA.filter(item => item.tag === tag);
        renderResults(filtered);
        searchTagBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });
  }

});
