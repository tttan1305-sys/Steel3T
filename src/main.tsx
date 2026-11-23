import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';
import { initKeyboard } from './keyboard';

initKeyboard();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// Làm nổi đường dim (data-dk) tương ứng với ô đang nhập (data-dim)
const clearHi = () => document.querySelectorAll('.dim-hi').forEach((e) => e.classList.remove('dim-hi'));
document.addEventListener('focusin', (e) => {
  clearHi();
  const t = e.target as HTMLElement | null;
  const host = t?.closest?.('[data-dim]') as HTMLElement | null;
  const keys = host?.dataset.dim?.split(/\s+/).filter(Boolean);
  if (!keys?.length) return;
  const root: ParentNode = (host!.closest('.jed') as HTMLElement | null) ?? (host!.closest('.card, .jcard') as HTMLElement | null) ?? document;
  root.querySelectorAll<SVGElement>('[data-dk]').forEach((el) => {
    const ks = (el.getAttribute('data-dk') ?? '').split(/\s+/);
    if (keys.some((k) => ks.includes(k))) el.classList.add('dim-hi');
  });
  // đưa đường dim đang làm nổi vào tầm nhìn của khung hình (nếu khung có thanh cuộn)
  const first = root.querySelector<SVGElement>('.jed-fig .dim-hi');
  first?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
});
document.addEventListener('focusout', () => setTimeout(() => { if (!(document.activeElement as HTMLElement | null)?.closest?.('[data-dim]')) clearHi(); }, 0));

// Cài như app (PWA): chỉ khi chạy trên trang web riêng (không phải trong khung claude.ai / file máy)
if ('serviceWorker' in navigator && location.protocol === 'https:' && !/claude\.ai|claudeusercontent/.test(location.hostname) && window.top === window.self && !(window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.()) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => { /* bỏ qua */ }); });
}
