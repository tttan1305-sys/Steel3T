// Thanh lệnh vẽ 2D (補助線) bên trái vùng xem – hiện ở mọi tab
import { useState } from 'react';
import type { Project } from './model';
import type { Tool } from './PlateEditor';

const I = (d: string) => (
  <svg viewBox="0 0 20 20" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
);
export const CAD_TOOLS: { t: Tool; label: string; key: string; icon: JSX.Element }[] = [
  { t: 'line', label: '単独/連続線', key: 'L', icon: I('M3 16 L9 6 L17 12') },
  { t: 'para', label: '平行線', key: 'SS', icon: I('M3 14 L14 3 M7 17 L17 7') },
  { t: 'perp', label: '垂線', key: 'VG', icon: I('M3 16 H17 M10 16 V3') },
  { t: 'angle', label: '角度線', key: 'G', icon: I('M3 16 H17 M3 16 L14 5 M8 16 A5 5 0 0 0 7 12') },
  { t: 'offset', label: '間隔線', key: 'O', icon: I('M3 5 H17 M3 10 H17 M3 15 H17') },
  { t: 'rect', label: '矩形', key: 'REC', icon: I('M3 5 H17 V15 H3 Z') },
  { t: 'circle', label: '円', key: 'C', icon: I('M10 3 A7 7 0 1 0 10.01 3') },
  { t: 'move', label: '移動', key: 'M', icon: I('M10 2 V18 M2 10 H18 M10 2 L7 5 M10 2 L13 5 M18 10 L15 7 M18 10 L15 13') },
  { t: 'copy', label: '複写', key: 'CO', icon: I('M3 7 H12 V17 H3 Z M7 3 H17 V13') },
  { t: 'trim', label: 'トリム', key: 'TR', icon: I('M3 10 H9 M12 10 H17 M10 3 V17') },
  { t: 'extend', label: '延長', key: 'EX', icon: I('M3 10 H15 M17 3 V17 M12 7 L15 10 L12 13') },
  { t: 'fillet', label: 'R取り', key: 'F', icon: I('M3 17 V9 A6 6 0 0 1 9 3 H17') },
  { t: 'erase', label: '削除', key: 'E', icon: I('M5 5 L15 15 M15 5 L5 15') },
  { t: 'measure', label: '計測', key: 'DI', icon: I('M2 13 L13 2 L18 7 L7 18 Z M6 9 L8 11 M9 6 L11 8 M12 3 L14 5') },
];

export default function CadBar({ p, active, onTool, onPlanes, toggleHidden, onEditPlane }: {
  p: Project;
  /** tên 作業平面 đang vẽ */
  active?: string;
  onTool: (t: Tool) => void;
  onPlanes: () => void;
  toggleHidden: (id: string) => void;
  onEditPlane: (id: string) => void;
}) {
  const [layers, setLayers] = useState(false);
  const planes = p.planes ?? [];
  return (
    <div className="cad-bar" onPointerDown={(e) => e.stopPropagation()}>
      <button title="作業面 – tạo / chọn mặt phẳng làm việc" onClick={onPlanes}>{I('M2 7 L10 3 L18 7 L10 11 Z M2 12 L10 16 L18 12')}<span>作業面</span></button>
      <button title="レイヤー – bật / tắt 補助線 theo mặt phẳng" className={layers ? 'on' : ''} onClick={() => setLayers(!layers)}>{I('M3 6 H17 M3 10 H17 M3 14 H17')}<span>ﾚｲﾔｰ</span></button>
      <div className="cad-sep" />
      {CAD_TOOLS.map((x) => (
        <button key={x.t} title={`${x.label} (${x.key})${active ? ` – trên ${active}` : ''}`} onClick={() => onTool(x.t)}>
          {x.icon}
          <span>{x.label.replace('単独/連続線', '線')}</span>
        </button>
      ))}
      {layers && (
        <div className="cad-pop">
          <b>レイヤー (作業平面)</b>
          {!planes.length && <div className="muted small">Chưa có. Bấm một lệnh vẽ, mặt phẳng theo khung nhìn hiện tại sẽ tự tạo.</div>}
          {planes.map((pl) => (
            <div key={pl.id} className="cad-layer">
              <label><input type="checkbox" checked={!pl.hidden} onChange={() => toggleHidden(pl.id)} /> {pl.name}</label>
              <span className="muted small">{pl.ents.length}</span>
              <button className="link" onClick={() => { onEditPlane(pl.id); setLayers(false); }}>Vẽ</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
