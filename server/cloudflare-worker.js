/**
 * Claude 프록시 예시 (Cloudflare Workers).
 *
 * 앱 안에 API 키를 넣지 않고, 이 서버에만 키를 둡니다.
 * 앱은 설정의 "AI 서버 주소"에 이 Worker 주소를 넣으면 이쪽으로 요청을 보내요.
 *
 * 배포:
 *   npm create cloudflare@latest tripboard-proxy   (Hello World Worker 선택)
 *   이 파일 내용을 src/index.js에 붙여 넣기
 *   npx wrangler secret put ANTHROPIC_API_KEY      (키 입력)
 *   npx wrangler deploy
 *
 * 공개 출시 전에 꼭 할 것: 로그인한 사용자만 쓰게 인증을 붙이고,
 * 사용자별 하루 요청 수를 제한하세요. 지금 상태로는 주소를 아는 누구나 쓸 수 있어요.
 */
const MODELS = ["claude-sonnet-5-5", "claude-haiku-5-5", "claude-opus-5-5"];

export default {
  async fetch(request, env) {
    const cors = {
      "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "content-type",
    };
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    if (request.method !== "POST") return new Response("Method not allowed", { status: 405, headers: cors });

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: { message: "JSON이 아니에요" } }, 400, cors);
    }
    if (!MODELS.includes(body.model)) return json({ error: { message: "허용되지 않은 모델이에요" } }, 400, cors);
    body.max_tokens = Math.min(Number(body.max_tokens) || 4000, 16000);

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    });
    return new Response(res.body, { status: res.status, headers: { ...cors, "content-type": "application/json" } });
  },
};

function json(data, status, headers) {
  return new Response(JSON.stringify(data), { status, headers: { ...headers, "content-type": "application/json" } });
}
