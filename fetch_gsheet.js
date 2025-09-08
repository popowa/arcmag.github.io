    // =========================
    // 使い方（固定値で使う場合）
    // =========================
    // "https://docs.google.com/spreadsheets/d/1ILM5-npmM-WhdnbQC_AhwrGkd4sbMBWHxxh4B5a-3Tg/edit?usp=sharing"
    const DEFAULT_SHEET_ID = "1ILM5-npmM-WhdnbQC_AhwrGkd4sbMBWHxxh4B5a-3Tg";
    const DEFAULT_SHEET_NAME = "list"; // タブ名
    const DEFAULT_TQ = "select *";      // 任意。クエリ未指定時は全列

    const els = {
      sheetId: document.getElementById('sheetId'),
      sheetName: document.getElementById('sheetName'),
      tq: document.getElementById('tq'),
      btn: document.getElementById('loadBtn'),
      status: document.getElementById('status'),
      statusText: document.getElementById('statusText'),
      spinner: document.getElementById('spinner'),
      grid: document.getElementById('grid'),
      error: document.getElementById('error'),
      search: document.getElementById('searchBox'),
    };

    let allRows = []; // フィルタリング用に保持

    // UI 初期状態（固定値を使う場合はここに代入）
    if (typeof DEFAULT_SHEET_ID !== 'undefined') els.sheetId.value = DEFAULT_SHEET_ID;
    if (typeof DEFAULT_SHEET_NAME !== 'undefined') els.sheetName.value = DEFAULT_SHEET_NAME;
    if (typeof DEFAULT_TQ !== 'undefined') els.tq.value = DEFAULT_TQ;

    function setLoading(isLoading, text = "") {
      els.spinner.classList.toggle('hidden', !isLoading);
      els.statusText.textContent = text;
    }

    function showError(msg) {
      els.error.textContent = msg;
      els.error.classList.remove('hidden');
    }
    function clearError() { els.error.classList.add('hidden'); els.error.textContent = ''; }

    function escapeHTML(str) {
      return String(str).replace(/[&<>'"]/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','\'':'&#39;','\"':'&quot;'}[s]));
    }

    function linkify(str) {
      const urlRegex = /\bhttps?:\/\/[^\s)]+/g; // rough
      return String(str).replace(urlRegex, (m) => `<a href="${m}" target="_blank" rel="noopener noreferrer" class="pill">${m}</a>`);
    }

    function buildGVizUrl(sheetId, sheetName, tq) {
      const base = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq`;
      const params = new URLSearchParams();
      params.set('tqx', 'out:json');   // JSON 形式
      if (sheetName) params.set('sheet', sheetName);
      params.set('headers', '1');      // 1行目をヘッダ扱い
      if (tq && tq.trim()) params.set('tq', tq);
      return `${base}?${params.toString()}`;
    }

    function parseGVizResponse(text) {
      // gviz は JSONP 形式: google.visualization.Query.setResponse({...})
      const start = text.indexOf('{');
      const end = text.lastIndexOf('}');
      if (start === -1 || end === -1) throw new Error('Unexpected response format');
      return JSON.parse(text.slice(start, end + 1));
    }

    function normalizeRows(gviz) {
      const table = gviz.table;
      if (!table || !Array.isArray(table.cols) || !Array.isArray(table.rows)) {
        throw new Error('No data table in response');
      }
      const headers = table.cols.map((c, i) => (c && c.label) ? String(c.label).trim() || `Column${i+1}` : `Column${i+1}`);
      const rows = table.rows
        .map(r => r && r.c ? r.c.map(c => (c && (c.f ?? c.v)) ?? '') : [])
        .filter(arr => arr.some(v => v !== '' && v != null));
      return rows.map(arr => Object.fromEntries(headers.map((h, i) => [h, arr[i] ?? ''])));
    }

    // =========================
    // 行 → HTML のテンプレート
    // =========================
    // ▼汎用テンプレート：すべての列を表示
    function defaultRowTemplate(obj) {
      const keys = Object.keys(obj);
      const title = String(obj[keys[0]] ?? '').trim() || '(無題)';
      const body = keys.slice(1).map(k => {
        const val = obj[k] == null ? '' : String(obj[k]);
        return `<div class="pure-u-1-4">${escapeHTML(k)}:</div><div class="pure-u-3-4">${linkify(escapeHTML(val))}</div>`
      }).join('');
      return `<div class="pure-u-1-3">
                <div class="card">
                    <h3>${escapeHTML(title)}</h3>
                    ${body}
                 </div>       
            </div>`;
    }

    function render(rows) {
      els.grid.innerHTML = rows.map(obj => {
        return defaultRowTemplate(obj);
      }).join('');
      els.statusText.textContent = `${rows.length} 件表示`;
    }

    function filterRows(query) {
      if (!query) return allRows;
      const q = query.toLowerCase();
      return allRows.filter(obj => Object.values(obj).some(v => String(v).toLowerCase().includes(q)));
    }

    async function load() {
      clearError();
      const sheetId = els.sheetId.value.trim();
      const sheetName = els.sheetName.value.trim();
      const tq = els.tq.value.trim() || 'select *';
      if (!sheetId) { showError('シートIDを入力してください'); return; }
      setLoading(true, '読み込み中…');
      els.btn.disabled = true;
      try {
        const url = buildGVizUrl(sheetId, sheetName, tq);
        const res = await fetch(url, { credentials: 'omit' });
        if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + res.statusText);
        const text = await res.text();
        const gviz = parseGVizResponse(text);

        // エラーメッセージ（例えば閲覧権限不足など）
        if (gviz.status === 'error' || (gviz.errors && gviz.errors.length)) {
          const msg = (gviz.errors && gviz.errors[0] && gviz.errors[0].detailed_message) || 'Unknown error';
          throw new Error(msg);
        }

        allRows = normalizeRows(gviz);
        render(filterRows(els.search.value));
        setLoading(false, '読み込み完了');
      } catch (err) {
        console.error(err);
        showError('読み込みに失敗しました：' + (err && err.message ? err.message : String(err)) + '\n\n' + '共有設定を「リンクを知っている全員が閲覧可」にしているか確認してください。シート名も正確に指定してください。');
        setLoading(false, 'エラー');
      } finally {
        els.btn.disabled = false;
      }
    }

    els.btn.addEventListener('click', load);

    // Enter で読み込み
    [els.sheetId, els.sheetName, els.tq].forEach(input => input.addEventListener('keydown', e => {
      if (e.key === 'Enter') load();
    }));

    // 絞り込み
    els.search.addEventListener('input', () => render(filterRows(els.search.value)));

    // デモ用途：URLクエリから id, sheet, tq を拾って自動読み込み
    (function bootFromQuery() {
      const u = new URL(location.href);
      const id = u.searchParams.get('id');
      const sheet = u.searchParams.get('sheet');
      const tq = u.searchParams.get('tq');
      if (id) els.sheetId.value = id;
      if (sheet) els.sheetName.value = sheet;
      if (tq) els.tq.value = tq;
      if (id) load();
    })();

  document.addEventListener('DOMContentLoaded', () => {
    load();
  });