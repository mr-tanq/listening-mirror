const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function withCors(headers = {}) {
  return { ...headers, ...CORS_HEADERS };
}

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: withCors({ "Content-Type": "application/json; charset=utf-8", ...extraHeaders }),
  });
}
const url = new URL(request.url);

if (request.method === "OPTIONS") {
  return new Response(null, { status: 204, headers: withCors() });
}
return new Response(r.body, {
  headers: withCors({
    "Content-Type": r.headers.get("Content-Type") || "image/jpeg",
    "Cache-Control": "public, max-age=604800",
  }),
});
if (url.pathname === "/api/now") {
  const data = await getNowFromLastFm(env); // ό,τι έχεις ήδη
  return json(data);
}

if (url.pathname === "/api/recent") {
  const data = await getRecent(env, url.searchParams);
  return json(data);
}

if (url.pathname === "/api/top") {
  const data = await getTop(env, url.searchParams);
  return json(data);
}

if (url.pathname === "/api/reflection") {
  const body = await request.json();
  const data = await makeReflection(env, body);
  return json(data);
}

return new Response("Not found", { status: 404, headers: withCors() });
