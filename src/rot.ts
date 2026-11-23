// Chế độ "xoay ngang" bằng CSS (điện thoại không xoay được màn hình / app khoá dọc):
// toàn bộ .app xoay 90° theo chiều kim đồng hồ → đổi toạ độ con trỏ về hệ toạ độ trang chưa xoay.
export const isRot = () => typeof document !== 'undefined' && document.documentElement.classList.contains('force-land');

/** điểm màn hình → điểm trong trang (chưa xoay) */
export function localPt(cx: number, cy: number): [number, number] {
  return isRot() ? [cy, window.innerWidth - cx] : [cx, cy];
}
/** khung phần tử trong trang (chưa xoay) */
export function localRect(el: Element): { left: number; top: number; width: number; height: number } {
  const r = el.getBoundingClientRect();
  return isRot() ? { left: r.top, top: window.innerWidth - r.right, width: r.height, height: r.width } : { left: r.left, top: r.top, width: r.width, height: r.height };
}
