import { Login } from "./login";
// 旧登録・パスワード再設定URLでもメールログインを案内する。
export function EmailAccess(_props: { register?: boolean }) {
  return <Login />;
}
