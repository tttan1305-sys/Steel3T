// Enter trong form nhập (các dòng .mrow): ô đang chọn (ô nhập, nút đang tô xanh, ô chọn) → chuyển sang ô / dòng tiếp theo
const FIELD = 'input:not([type=checkbox]):not([type=radio]):not([disabled]), select:not([disabled])';

const visible = (el: HTMLElement) => !!el.offsetParent && getComputedStyle(el).visibility !== 'hidden';

/** ô đầu tiên của 1 dòng: nút đang bật (.on) của nhóm nút, nếu không thì ô nhập / ô chọn đầu tiên */
function firstIn(row: Element): HTMLElement | null {
  const body = row.querySelector('.mrow-body') ?? row;
  const cands = [...body.querySelectorAll<HTMLElement>(`${FIELD}, button.on:not([disabled])`)].filter(visible);
  return cands[0] ?? null;
}

export function installEnterNext() {
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Enter' || e.shiftKey || e.ctrlKey || e.altKey || e.metaKey || e.isComposing) return;
    const t = e.target as HTMLElement | null;
    if (!t || t.tagName === 'TEXTAREA') return;
    // form master (項目名 / 設定値): Enter → ô kế tiếp; ô cuối → nút Tạo (Enter trên nút: tạo cây mới, quay về ô 部材名)
    const form = t.closest('.enter-form');
    if (form && t.tagName !== 'BUTTON') {
      e.preventDefault();
      setTimeout(() => {
        const all = [...form.querySelectorAll<HTMLElement>(FIELD)].filter(visible).filter((el) => !el.closest('.jis-combo:not(.ref-combo)') || el.tagName === 'INPUT');
        const i = all.indexOf(t);
        if (i >= 0 && i < all.length - 1) return focus(all[i + 1]);
        const btn = form.querySelector<HTMLButtonElement>('[data-enter-confirm]');
        if (btn) btn.focus();
      }, 0);
      return;
    }
    const row = t.closest('.mrow');
    if (!row) return;
    const root = row.closest('section, .section, .card, aside, form') ?? document.body;
    setTimeout(() => {
      // còn ô nhập phía sau trong cùng dòng (vd nút 細幅 → ô kích thước, 左側 → 右側) → sang ô đó trước
      const after = [...row.querySelectorAll<HTMLElement>(FIELD)].filter((el) => el !== t && visible(el) && !!(t.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING));
      if (after.length) return focus(after[0]);
      const rows = [...root.querySelectorAll('.mrow')];
      for (let i = rows.indexOf(row) + 1; i < rows.length; i++) {
        const el = firstIn(rows[i]);
        if (el) return focus(el);
      }
      // hết dòng → nút xác nhận của form (Thêm vào master / Áp dụng / OK…); Enter trên nút → thực hiện rồi quay về dòng đầu
      const scope = root.closest('aside') ?? root;
      const btn = [...scope.querySelectorAll<HTMLButtonElement>('[data-enter-submit], button.primary')]
        .find((b) => visible(b) && !b.disabled && !b.closest('.mrow') && !!(row.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING));
      if (btn) {
        btn.dataset.enterCycle = '1';
        cycleRoot = root;
        btn.focus();
        btn.scrollIntoView({ block: 'nearest' });
        return;
      }
      backToFirst(root);
    }, 0);
  };
  /** form vừa đi hết vòng (để Enter trên nút xác nhận quay về dòng đầu) */
  let cycleRoot: Element | null = null;
  const backToFirst = (root: Element) => {
    const rows = [...root.querySelectorAll('.mrow')];
    for (const r of rows) {
      const el = firstIn(r);
      if (el) return focus(el);
    }
  };
  // Enter trên nút xác nhận (được đưa tới từ dòng cuối): để nút tự chạy, sau đó về dòng đầu (nếu thao tác chưa tự đưa con trỏ đi chỗ khác)
  const onConfirm = (e: KeyboardEvent) => {
    if (e.key !== 'Enter') return;
    const b = e.target as HTMLElement | null;
    if (!b || b.tagName !== 'BUTTON' || b.dataset.enterCycle !== '1') return;
    delete b.dataset.enterCycle;
    const root = cycleRoot;
    cycleRoot = null;
    if (!root) return;
    setTimeout(() => {
      const a = document.activeElement;
      if (!a || a === document.body || a === b) {
        const r2 = root.isConnected ? root : null;
        if (r2) backToFirst(r2);
      }
    }, 120);
  };
  document.addEventListener('keydown', onConfirm, true);
  const focus = (el: HTMLElement) => {
    el.focus();
    if (el instanceof HTMLInputElement) el.select();
    el.scrollIntoView({ block: 'nearest' });
  };
  document.addEventListener('keydown', onKey);
  return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('keydown', onConfirm, true); };
}
