/** ホームとフロアの一括取得には、末尾slashの有無によらず店舗IDを渡す。 */
export function initialStorePath(pathname: string) {
  const match = /^\/admin\/stores\/([^/]+)(?:\/(floor))?\/?$/.exec(pathname);
  const storeId = match?.[1];
  if (!storeId) return undefined;
  return { storeId: decodeURIComponent(storeId), home: !match[2] };
}
