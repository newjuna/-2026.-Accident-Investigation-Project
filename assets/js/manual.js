/* =========================================================
   매뉴얼 탭 - 챕터 전환 + 통합 검색 + 아코디언 + 서브탭 + FAQ + 라이트박스
   ========================================================= */
document.addEventListener('DOMContentLoaded', () => {

  const manualPanel = document.getElementById('panel-manual');
  if (!manualPanel) return;

  /* ---------- 챕터 칩 전환 ---------- */
  const chapterChips = manualPanel.querySelectorAll('.man-chapter-chip');
  const manSections = manualPanel.querySelectorAll('.man-section');

  function activateChapter(id) {
    manSections.forEach(sec => sec.classList.toggle('active', sec.id === id));
    chapterChips.forEach(chip => chip.classList.toggle('active', chip.dataset.mchapter === id));
    const chapterArea = document.getElementById('manChapterArea');
    if (chapterArea) chapterArea.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  chapterChips.forEach(chip => {
    chip.addEventListener('click', () => activateChapter(chip.dataset.mchapter));
  });

  // 매뉴얼 안의 내부 링크(예: #update2026, #evidence-checklist)를 눌렀을 때
  // 실제 URL 이동 대신 해당 챕터를 활성화합니다.
  manualPanel.addEventListener('click', (e) => {
    const link = e.target.closest('a[href^="#"]');
    if (!link) return;
    const targetId = link.getAttribute('href').slice(1);
    const targetSection = manualPanel.querySelector('#' + targetId);
    if (targetSection && targetSection.classList.contains('man-section')) {
      e.preventDefault();
      activateChapter(targetSection.id);
    } else {
      // man-section이 아닌 세부 앵커(예: #evidence-checklist)면, 그 앵커를 감싸는 챕터를 먼저 열고 스크롤
      const anchorEl = manualPanel.querySelector('#' + targetId);
      if (anchorEl) {
        e.preventDefault();
        const parentSection = anchorEl.closest('.man-section');
        if (parentSection) activateChapter(parentSection.id);
        setTimeout(() => anchorEl.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
      }
    }
  });

  /* ---------- 아코디언 (사고 처리 흐름 / 문서 가이드) ---------- */
  manualPanel.querySelectorAll('.man-accordion-head').forEach(head => {
    head.addEventListener('click', () => {
      const item = head.closest('.man-accordion-item');
      item.classList.toggle('open', !item.classList.contains('open'));
    });
  });

  /* ---------- 서브탭 (매장/사무실 안전점검 사항) ---------- */
  manualPanel.querySelectorAll('.man-subtab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.dataset.tab;
      const nav = btn.closest('.man-subtab-nav');
      const container = btn.closest('.man-checklist-tabs');
      if (!nav || !container) return;

      nav.querySelectorAll('.man-subtab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      container.querySelectorAll('.man-subtab-panel').forEach(p => p.classList.remove('active'));
      const targetPanel = container.querySelector('#tab-' + tabId);
      if (targetPanel) targetPanel.classList.add('active');
    });
  });

  /* ---------- 이미지 라이트박스 (매뉴얼 이미지 확대) ---------- */
  const manLightbox = document.createElement('div');
  manLightbox.className = 'man-lightbox';
  const manLightboxImg = document.createElement('img');
  manLightbox.appendChild(manLightboxImg);
  document.body.appendChild(manLightbox);

  manualPanel.querySelectorAll('.man-img-card img').forEach(img => {
    img.addEventListener('click', () => {
      manLightboxImg.src = img.src;
      manLightboxImg.alt = img.alt;
      manLightbox.classList.add('visible');
    });
  });
  manLightbox.addEventListener('click', () => manLightbox.classList.remove('visible'));

  /* ---------- FAQ 렌더링 + FAQ 자체 검색 ---------- */
  const faqListEl = document.getElementById('faqList');
  const faqSearchInput = document.getElementById('faqSearch');

  function renderFaq(list) {
    if (!faqListEl) return;
    faqListEl.innerHTML = '';
    if (list.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'man-faq-empty';
      empty.textContent = '검색 결과가 없습니다.';
      faqListEl.appendChild(empty);
      return;
    }
    list.forEach(({ item, index }) => {
      const wrap = document.createElement('div');
      wrap.className = 'man-faq-item';

      const qBtn = document.createElement('button');
      qBtn.className = 'man-faq-q';
      qBtn.type = 'button';
      qBtn.innerHTML = `
        <span class="man-faq-num">${index + 1}</span>
        <span class="man-faq-q-text">${item.q}</span>
        <span class="man-faq-arrow">▾</span>
      `;

      const aDiv = document.createElement('div');
      aDiv.className = 'man-faq-a';
      aDiv.textContent = item.a;

      qBtn.addEventListener('click', () => wrap.classList.toggle('open'));

      wrap.appendChild(qBtn);
      wrap.appendChild(aDiv);
      faqListEl.appendChild(wrap);
    });
  }

  if (typeof FAQ_DATA !== 'undefined' && faqListEl) {
    const indexed = FAQ_DATA.map((item, index) => ({ item, index }));
    renderFaq(indexed);

    if (faqSearchInput) {
      faqSearchInput.addEventListener('input', () => {
        const term = faqSearchInput.value.trim().toLowerCase();
        if (!term) { renderFaq(indexed); return; }
        const filtered = indexed.filter(({ item }) =>
          item.q.toLowerCase().includes(term) || item.a.toLowerCase().includes(term)
        );
        renderFaq(filtered);
      });
    }
  }

  /* =========================================================
     매뉴얼 상단 통합 검색
     ---------------------------------------------------------
     SEARCH_DATA(즉시대응/사고조사/경위서/휴업신청)와 FAQ_DATA를 합쳐서
     검색합니다. 검색어가 있으면 챕터 목차 대신 검색 결과 목록을 보여주고,
     검색어를 지우면 다시 챕터 목차로 돌아갑니다.
     ========================================================= */
  const manSearchInput = document.getElementById('manSearchInput');
  const manSearchResults = document.getElementById('manSearchResults');
  const manChapterArea = document.getElementById('manChapterArea');
  const manSearchTagBtns = manualPanel.querySelectorAll('.man-search-tag');

  function buildManualSearchPool() {
    const pool = [];
    if (typeof SEARCH_DATA !== 'undefined') {
      SEARCH_DATA.forEach(item => pool.push({ tag: item.tag, q: item.q, a: item.a }));
    }
    if (typeof FAQ_DATA !== 'undefined') {
      FAQ_DATA.forEach(item => pool.push({ tag: 'FAQ', q: item.q, a: item.a }));
    }
    return pool;
  }
  const MANUAL_SEARCH_POOL = buildManualSearchPool();

  function renderManualSearchResults(list) {
    if (!manSearchResults) return;
    manSearchResults.innerHTML = '';
    if (list.length === 0) {
      manSearchResults.innerHTML = '<div class="search-empty">검색 결과가 없습니다. 다른 키워드로 시도해보세요.</div>';
      return;
    }
    list.forEach(item => {
      const card = document.createElement('div');
      card.className = 'search-result-card';
      card.innerHTML = `
        <span class="search-result-tag">${item.tag}</span>
        <p class="search-result-q">${item.q}</p>
        <p class="search-result-a">${item.a}</p>
      `;
      manSearchResults.appendChild(card);
    });
  }

  function doManualSearch(keyword, tagFilter) {
    const term = (keyword || '').trim().toLowerCase();
    const showingSearch = !!term || (tagFilter && tagFilter !== 'all');

    if (manSearchResults) manSearchResults.style.display = showingSearch ? 'block' : 'none';
    if (manChapterArea) manChapterArea.style.display = showingSearch ? 'none' : 'block';

    if (!showingSearch) return;

    let filtered = MANUAL_SEARCH_POOL;
    if (tagFilter && tagFilter !== 'all') {
      filtered = filtered.filter(item => item.tag === tagFilter);
    }
    if (term) {
      filtered = filtered.filter(item =>
        (item.q + ' ' + item.a + ' ' + item.tag).toLowerCase().includes(term)
      );
    }
    renderManualSearchResults(filtered);
  }

  let currentTagFilter = 'all';

  if (manSearchInput) {
    manSearchInput.addEventListener('input', () => doManualSearch(manSearchInput.value, currentTagFilter));
  }

  manSearchTagBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      manSearchTagBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentTagFilter = btn.dataset.mtag;
      doManualSearch(manSearchInput ? manSearchInput.value : '', currentTagFilter);
    });
  });

});
