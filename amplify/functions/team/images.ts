import { randomUUID } from 'node:crypto';
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { type Caller, currentTeamId } from './context';

/**
 * レシピ画像の操作（docs/design.md §7.1）
 *
 * S3 に触れるのはこの Lambda だけ。クライアントはここが発行する署名付き
 * URL に対して直接 PUT / GET する。認可はすべて「key の teamId 部分と
 * 呼び出し元のグループ所属の突き合わせ」で行う。中心規則「認可は teamId と
 * 同名グループへの所属か、の1問」の S3 への延長がこの検証になる。
 *
 * ⚠️ 署名付き URL の実際の寿命は expiresIn ではなく、署名に使った
 * Lambda の一時資格情報の残り寿命で頭打ちになる。長めの値を指定しても
 * 早く切れることがあるため、クライアントは期限切れ時の再取得を持つ。
 */

const s3 = new S3Client();

// バケット名は storage の access ルール（allow.resource）が環境変数で渡す。
// 変数名は defineStorage の name をそのまま使った `<name>_BUCKET_NAME`。
// $amplify/env の生成型はデプロイ後にしか更新されないため process.env で読む。
const bucketName = (): string => {
  const name = process.env.media_BUCKET_NAME;
  if (!name) {
    throw new Error('media_BUCKET_NAME が設定されていません');
  }
  return name;
};

/**
 * キーの形式は media/<teamId>/<uuid>.jpg に固定する。
 * 採番は必ずこの Lambda が行い、クライアントはキーを選べない。
 */
const MEDIA_KEY_PATTERN = /^media\/([0-9a-zA-Z-]+)\/[0-9a-f-]+\.jpg$/;

const teamIdOfKey = (key: string): string => {
  const match = MEDIA_KEY_PATTERN.exec(key);
  if (!match) {
    throw new Error(`不正な画像キーです: ${key}`);
  }
  return match[1];
};

const assertMember = (caller: Caller, teamId: string): void => {
  if (!caller.groups.includes(teamId)) {
    throw new Error('この画像を操作する権限がありません');
  }
};

const UPLOAD_URL_EXPIRES_IN = 300;
const VIEW_URL_EXPIRES_IN = 900;

/** アップロード用（PUT）の URL を発行する。キーは呼び出し元の現チームに採番する */
export const getImageUploadUrl = async (
  caller: Caller,
): Promise<{ key: string; url: string }> => {
  // 採番先は UserProfile の teamId（正）。トークンのグループと食い違う場合は
  // 発行しない。joinTeam 直後の古いトークンで、旧チームへ書き込むのを防ぐ
  const teamId = await currentTeamId(caller.userId);
  assertMember(caller, teamId);

  const key = `media/${teamId}/${randomUUID()}.jpg`;
  const url = await getSignedUrl(
    s3,
    new PutObjectCommand({
      Bucket: bucketName(),
      Key: key,
      ContentType: 'image/jpeg',
    }),
    { expiresIn: UPLOAD_URL_EXPIRES_IN },
  );
  return { key, url };
};

/** 閲覧用（GET）の URL をまとめて発行する。1つでも権限の無い key があれば全体を拒否する */
export const getImageViewUrls = async (
  caller: Caller,
  keys: string[],
): Promise<{ key: string; url: string }[]> => {
  return Promise.all(
    keys.map(async (key) => {
      assertMember(caller, teamIdOfKey(key));
      const url = await getSignedUrl(
        s3,
        new GetObjectCommand({ Bucket: bucketName(), Key: key }),
        { expiresIn: VIEW_URL_EXPIRES_IN },
      );
      return { key, url };
    }),
  );
};

/** 画像を削除する。冪等で、対象が既に無くてもエラーにならない */
export const deleteImage = async (
  caller: Caller,
  key: string,
): Promise<boolean> => {
  assertMember(caller, teamIdOfKey(key));
  await s3.send(new DeleteObjectCommand({ Bucket: bucketName(), Key: key }));
  return true;
};

/**
 * 画像を別チームのプレフィックスへ移す。移動後のキーを返す。
 *
 * moveTeamData（§2.5 手順7）専用。呼び出し元の認可検証は行わない。
 * 「コピー → レコード更新 → 旧オブジェクト削除」の順序を呼び出し側が守る
 * 前提で、ここはコピーだけを行う。途中で失敗しても再実行でコピーは
 * 上書きされるため冪等になる。
 */
export const copyImageToTeam = async (
  key: string,
  toTeamId: string,
): Promise<string> => {
  const suffix = key.slice(key.lastIndexOf('/') + 1);
  const newKey = `media/${toTeamId}/${suffix}`;
  await s3.send(
    new CopyObjectCommand({
      Bucket: bucketName(),
      CopySource: encodeURIComponent(`${bucketName()}/${key}`),
      Key: newKey,
    }),
  );
  return newKey;
};

/** 移送後の旧オブジェクトを消す。失敗は孤児として許容する（§7.1） */
export const deleteImageQuietly = async (key: string): Promise<void> => {
  try {
    await s3.send(new DeleteObjectCommand({ Bucket: bucketName(), Key: key }));
  } catch {
    // 孤児が残るだけで整合性は壊れないため、移送や削除の本流を止めない
  }
};

/**
 * チームの画像をプレフィックスごと削除する（§2.6）。
 *
 * レコード単位でなくプレフィックスで消すのは、ベストエフォート削除の
 * 取りこぼし（孤児）もチーム解散のタイミングで一掃するため。
 */
export const deleteTeamImages = async (teamId: string): Promise<void> => {
  const prefix = `media/${teamId}/`;
  let continuationToken: string | undefined;
  do {
    const listed = await s3.send(
      new ListObjectsV2Command({
        Bucket: bucketName(),
        Prefix: prefix,
        ContinuationToken: continuationToken,
      }),
    );
    const keys = (listed.Contents ?? [])
      .map((object) => object.Key)
      .filter((key): key is string => Boolean(key));
    if (keys.length > 0) {
      await s3.send(
        new DeleteObjectsCommand({
          Bucket: bucketName(),
          Delete: { Objects: keys.map((Key) => ({ Key })) },
        }),
      );
    }
    continuationToken = listed.IsTruncated
      ? listed.NextContinuationToken
      : undefined;
  } while (continuationToken);
};
