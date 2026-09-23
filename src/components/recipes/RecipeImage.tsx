'use client';

import { Image as ImageIcon } from 'lucide-react';

/**
 * レシピ画像の表示（docs/design.md §7.1）
 *
 * next/image は使わない。画像はアップロード時に縮小済みで、署名付き URL は
 * 取得のたびにクエリが変わるため最適化キャッシュがほぼ効かず、設定コスト
 * だけ払って利点を受け取れない。レイアウトシフトは呼び出し側の固定比率
 * コンテナ（aspect-[4/3]）が防ぐ。
 *
 * url が無い場合（画像なし、または URL 取得前）は同サイズのプレースホルダを
 * 出し、Grid の整列を保つ。
 */
export default function RecipeImage({
  url,
  alt,
  onExpired,
}: {
  url: string | undefined;
  alt: string;
  /** 署名付き URL の期限切れ時に呼ばれる。再取得は useImageUrls が間引く */
  onExpired?: () => void;
}) {
  if (!url) {
    return (
      <div
        aria-hidden
        className="flex h-full w-full items-center justify-center bg-base-200 text-base-content/30"
      >
        <ImageIcon size={32} />
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- §7.1: 縮小済み画像 + 短命な署名付き URL のため next/image の最適化は使わない
    <img
      src={url}
      alt={alt}
      loading="lazy"
      className="h-full w-full object-cover"
      onError={onExpired}
    />
  );
}
