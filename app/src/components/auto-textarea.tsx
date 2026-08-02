"use client";

import { useEffect, useRef } from "react";

/**
 * 入力量に応じて高さが伸びるテキストエリア。
 * rows で指定した行数を最小の高さとし、それを超える入力があれば自動的に拡大する。
 */
export function AutoTextarea({
  rows = 3,
  value,
  onChange,
  ...rest
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { rows?: number }) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const resize = (el: HTMLTextAreaElement) => {
    el.style.height = "auto";
    // 最小の高さ(rows分)は CSS の min-height に任せ、内容がそれを超えたら伸ばす
    el.style.height = `${el.scrollHeight}px`;
  };

  // 初期表示時と、外から値が入れ替わったとき(先週コピーなど)に高さを合わせる
  useEffect(() => {
    if (ref.current) resize(ref.current);
  }, [value]);

  return (
    <textarea
      {...rest}
      ref={ref}
      rows={rows}
      value={value}
      onChange={(e) => {
        resize(e.currentTarget);
        onChange?.(e);
      }}
      onInput={(e) => resize(e.currentTarget)}
      style={{ ...rest.style, overflow: "hidden", resize: "none" }}
    />
  );
}
