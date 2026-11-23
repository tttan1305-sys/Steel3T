// Ô hình minh hoạ cố định (góc phải cửa sổ sửa mối nối): các hình trong card được đưa vào đây bằng portal
import React, { createContext, useContext } from 'react';
import { createPortal } from 'react-dom';

export const FigCtx = createContext<HTMLElement | null>(null);

export function Fig({ children }: { children: React.ReactNode }) {
  const el = useContext(FigCtx);
  return el ? createPortal(children, el) : <>{children}</>;
}
