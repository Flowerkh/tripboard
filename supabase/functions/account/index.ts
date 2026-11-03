/**
 * Tripboard account server (Supabase Edge Function "account").
 *
 * Things that need the Auth admin API, so they cannot run in the app:
 *   admin  rename    — change a member's nickname (user_metadata.display_name)
 *   admin  sign_out  — log a member out on every device
 *   admin  ban       — ban for 7 or 30 days or for good (also logs them out), with a reason only admins see
 *   admin  unban
 *   admin  delete    — delete a member's account
 *   member delete_me — delete your own account
 *
 * Deleting stops the account's share links, drops the text of its filtered chats, unlinks the Kakao app
 * when KAKAO_ADMIN_KEY is set, then deletes the user (trips, limits go with it; AI usage stays nameless).
 * Admin accounts cannot be banned, logged out or deleted here. A ban also ends the member's sessions,
 * so their open screens lose the login and the "ai" function turns them away.
 */
import { createClient } from "npm:@supabase/supabase-js@2";

const SECRET = (() => {
  try { return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}").default as string | undefined; } catch { return undefined; }
})() ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db = createClient(Deno.env.get("SUPABASE_URL")!, SECRET, { auth: { persistSession: false, autoRefreshToken: false } });
const KAKAO_ADMIN_KEY = Deno.env.get("KAKAO_ADMIN_KEY") ?? "";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, "content-type": "application/json" } });
const fail = (error: string, status = 400) => json({ error }, status);

const NAME_MAX = 20;
const REASON_MAX = 100;
const FOREVER = "876000h"; // 100 years
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isAdmin = async (uid: string) => !!(await db.from("admins").select("user_id").eq("user_id", uid).maybeSingle()).data;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return fail("POST only", 405);
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: auth, error: authErr } = token ? await db.auth.getUser(token) : { data: null, error: true };
  if (authErr || !auth?.user) return json({ code: "login", error: "다시 로그인해 주세요." }, 401);
  const me = auth.user.id;
  let body: any;
  try { body = await req.json(); } catch { return fail("요청을 읽지 못했어요."); }
  try {
    if (body.action === "delete_me") {
      if (await isAdmin(me)) return fail("관리자 계정은 탈퇴할 수 없어요. 다른 관리자를 먼저 정해 주세요.", 403);
      console.log("delete_me", me);
      return json({ ok: true, ...(await deleteAccount(me)) });
    }
    if (!(await isAdmin(me))) return fail("관리자만 할 수 있어요.", 403);
    const uid = String(body.user_id ?? "");
    if (!UUID.test(uid)) return fail("회원을 찾지 못했어요.");
    const { data: target } = await db.auth.admin.getUserById(uid);
    if (!target?.user) return fail("회원을 찾지 못했어요.", 404);

    if (body.action === "rename") {
      const name = String(body.name ?? "").replace(/\s+/g, " ").trim();
      if (!name || [...name].length > NAME_MAX) return fail(`닉네임은 1~${NAME_MAX}자로 써 주세요.`);
      const { error } = await db.auth.admin.updateUserById(uid, { user_metadata: { display_name: name } });
      if (error) throw error;
      return json({ ok: true, name });
    }

    // everything below acts against the member, so never against an admin (yourself included)
    if (await isAdmin(uid)) return fail("관리자 계정에는 할 수 없어요.", 403);
    console.log(body.action, uid, "by", me);

    if (body.action === "sign_out") {
      const { data: n, error } = await db.rpc("account_end_sessions", { p_user: uid });
      if (error) throw error;
      return json({ ok: true, sessions: n });
    }
    if (body.action === "ban") {
      const days = Number(body.days);
      if (![0, 7, 30].includes(days)) return fail("정지 기간을 골라 주세요.");
      const reason = String(body.reason ?? "").trim().slice(0, REASON_MAX);
      const { data, error } = await db.auth.admin.updateUserById(uid, { ban_duration: days ? `${days * 24}h` : FOREVER });
      if (error) throw error;
      const { error: e2 } = await db.from("member_limits").upsert({ user_id: uid, ban_reason: reason, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
      if (e2) throw e2;
      await db.rpc("account_end_sessions", { p_user: uid });
      return json({ ok: true, banned_until: (data.user as { banned_until?: string }).banned_until ?? null });
    }
    if (body.action === "unban") {
      const { error } = await db.auth.admin.updateUserById(uid, { ban_duration: "none" });
      if (error) throw error;
      await db.from("member_limits").update({ ban_reason: "" }).eq("user_id", uid);
      return json({ ok: true });
    }
    if (body.action === "delete") return json({ ok: true, ...(await deleteAccount(uid)) });
    return fail("unknown action");
  } catch (e) {
    console.error(e);
    return json({ code: "server", error: `서버 오류: ${(e as Error).message}` }, 500);
  }
});

async function deleteAccount(uid: string) {
  const { data: cleaned, error } = await db.rpc("account_cleanup", { p_user: uid });
  if (error) throw error;
  const kakao = await unlinkKakao(uid);
  const { error: delErr } = await db.auth.admin.deleteUser(uid);
  if (delErr) throw delErr;
  return { shares: (cleaned as { shares: number }).shares, kakao };
}

/** Disconnect the Kakao app so a later sign-up asks for consent again. Optional: needs the Kakao admin key. */
async function unlinkKakao(uid: string): Promise<"unlinked" | "skipped" | "failed"> {
  if (!KAKAO_ADMIN_KEY) return "skipped";
  const { data } = await db.auth.admin.getUserById(uid);
  const kakao = data?.user?.identities?.find((i) => i.provider === "kakao");
  const kakaoId = (kakao?.identity_data?.provider_id ?? kakao?.identity_data?.sub ?? kakao?.id) as string | undefined;
  if (!kakaoId) return "skipped";
  try {
    const res = await fetch("https://kapi.kakao.com/v1/user/unlink", {
      method: "POST",
      headers: { authorization: `KakaoAK ${KAKAO_ADMIN_KEY}`, "content-type": "application/x-www-form-urlencoded;charset=utf-8" },
      body: new URLSearchParams({ target_id_type: "user_id", target_id: String(kakaoId) }),
    });
    if (!res.ok) console.error("kakao unlink", res.status, await res.text());
    return res.ok ? "unlinked" : "failed";
  } catch (e) {
    console.error("kakao unlink", e);
    return "failed";
  }
}
