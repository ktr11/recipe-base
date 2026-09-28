/**
 * アップロード前の画像縮小（docs/design.md §7.1）
 *
 * スマホ写真は原寸で 3〜10MB あり、そのまま S3 に置くと転送・保存コストと
 * 一覧表示の重さに直結する。長辺 1600px・JPEG 品質 0.8（1枚 200〜400KB 目安）
 * まで**ブラウザで**縮小してからアップロードし、原本は保存しない。
 * サムネイルは別に作らず、この1枚を詳細でも一覧でも使い回す。
 */

export const MAX_EDGE_PX = 1600;
export const JPEG_QUALITY = 0.8;

/** 長辺が maxEdge に収まるよう、縦横比を保って縮める。拡大はしない */
export const fitWithin = (
  width: number,
  height: number,
  maxEdge: number,
): { width: number; height: number } => {
  const longest = Math.max(width, height);
  if (longest <= maxEdge) {
    return { width, height };
  }
  const scale = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
};

/**
 * 画像ファイルを縮小して JPEG に変換する。
 *
 * imageOrientation: 'from-image' は EXIF の回転情報の反映。スマホの縦位置
 * 写真が横倒しで保存されるのを防ぐ。HEIC など createImageBitmap が扱えない
 * 形式はここで例外になり、呼び出し側がエラー表示する。
 */
export const resizeToJpeg = async (file: Blob): Promise<Blob> => {
  const bitmap = await createImageBitmap(file, {
    imageOrientation: 'from-image',
  });
  try {
    const { width, height } = fitWithin(bitmap.width, bitmap.height, MAX_EDGE_PX);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('画像の変換に失敗しました');
    }
    context.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
    );
    if (!blob) {
      throw new Error('画像の変換に失敗しました');
    }
    return blob;
  } finally {
    bitmap.close();
  }
};
