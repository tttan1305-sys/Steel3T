// Bàn phím ảo (điện thoại / app Android): khi bàn phím bật lên thì
//  - cửa sổ nổi (.fwin) co lại vừa phần màn hình còn thấy được phía trên bàn phím
//  - ô đang nhập tự cuộn lên giữa vùng nhìn thấy
const isEditable = (el: Element | null): el is HTMLElement =>
  !!el && (el instanceof HTMLTextAreaElement || (el instanceof HTMLInputElement && !['checkbox', 'radio', 'button', 'submit', 'range', 'color', 'file'].includes(el.type)) || (el as HTMLElement).isContentEditable);

const base = new Map<number, number>(); // chiều cao lớn nhất đã thấy theo chiều rộng màn hình (dọc / ngang)
let timer = 0;

function vv() {
  const v = window.visualViewport;
  return { h: v ? v.height : window.innerHeight, t: v ? v.offsetTop : 0, w: Math.round(v ? v.width : window.innerWidth) };
}

function reveal() {
  const el = document.activeElement;
  if (!isEditable(el) || !document.documentElement.classList.contains('kb-open')) return;
  const r = el.getBoundingClientRect();
  const { h, t } = vv();
  if (r.top < t + 8 || r.bottom > t + h - 8) el.scrollIntoView({ block: 'center', inline: 'nearest' });
}

function update() {
  const root = document.documentElement;
  const { h, t, w } = vv();
  const b = Math.max(base.get(w) ?? 0, h);
  base.set(w, b);
  const open = isEditable(document.activeElement) && h < b * 0.8;
  root.classList.toggle('kb-open', open);
  root.style.setProperty('--vvh', `${Math.round(h)}px`);
  root.style.setProperty('--vvt', `${Math.round(t)}px`);
  clearTimeout(timer);
  if (open) timer = window.setTimeout(reveal, 80);
}

export function initKeyboard() {
  if (typeof window === 'undefined') return;
  update();
  window.visualViewport?.addEventListener('resize', update);
  window.visualViewport?.addEventListener('scroll', update);
  window.addEventListener('resize', update);
  document.addEventListener('focusin', () => { update(); window.setTimeout(() => { update(); reveal(); }, 350); });
  document.addEventListener('focusout', () => window.setTimeout(update, 50));
}
