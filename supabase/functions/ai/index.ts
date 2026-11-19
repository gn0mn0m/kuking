// Кукинг: нейросеть для всех без ключей. Supabase → Edge Functions → функция ai.
// Ключ GigaChat лежит в секрете GIGACHAT_KEY (Authorization key из личного кабинета Сбера).
// Телефон шлёт сообщения с токеном входа, функция отвечает потоком в формате OpenAI (SSE).
// Сертификат НУЦ Минцифры (Russian Trusted Root CA) зашит ниже; отпечаток SHA-256
// D2:6D:2D:02:31:B7:C3:9F:92:CC:73:85:12:BA:54:10:35:19:E4:40:5D:68:B5:BD:70:3E:97:88:CA:8E:CF:31
// сверен с developers.sber.ru/docs/en/smarthome/c2c/ca.

const CA = `-----BEGIN CERTIFICATE-----
MIIFwjCCA6qgAwIBAgICEAAwDQYJKoZIhvcNAQELBQAwcDELMAkGA1UEBhMCUlUx
PzA9BgNVBAoMNlRoZSBNaW5pc3RyeSBvZiBEaWdpdGFsIERldmVsb3BtZW50IGFu
ZCBDb21tdW5pY2F0aW9uczEgMB4GA1UEAwwXUnVzc2lhbiBUcnVzdGVkIFJvb3Qg
Q0EwHhcNMjIwMzAxMjEwNDE1WhcNMzIwMjI3MjEwNDE1WjBwMQswCQYDVQQGEwJS
VTE/MD0GA1UECgw2VGhlIE1pbmlzdHJ5IG9mIERpZ2l0YWwgRGV2ZWxvcG1lbnQg
YW5kIENvbW11bmljYXRpb25zMSAwHgYDVQQDDBdSdXNzaWFuIFRydXN0ZWQgUm9v
dCBDQTCCAiIwDQYJKoZIhvcNAQEBBQADggIPADCCAgoCggIBAMfFOZ8pUAL3+r2n
qqE0Zp52selXsKGFYoG0GM5bwz1bSFtCt+AZQMhkWQheI3poZAToYJu69pHLKS6Q
XBiwBC1cvzYmUYKMYZC7jE5YhEU2bSL0mX7NaMxMDmH2/NwuOVRj8OImVa5s1F4U
zn4Kv3PFlDBjjSjXKVY9kmjUBsXQrIHeaqmUIsPIlNWUnimXS0I0abExqkbdrXbX
YwCOXhOO2pDUx3ckmJlCMUGacUTnylyQW2VsJIyIGA8V0xzdaeUXg0VZ6ZmNUr5Y
Ber/EAOLPb8NYpsAhJe2mXjMB/J9HNsoFMBFJ0lLOT/+dQvjbdRZoOT8eqJpWnVD
U+QL/qEZnz57N88OWM3rabJkRNdU/Z7x5SFIM9FrqtN8xewsiBWBI0K6XFuOBOTD
4V08o4TzJ8+Ccq5XlCUW2L48pZNCYuBDfBh7FxkB7qDgGDiaftEkZZfApRg2E+M9
G8wkNKTPLDc4wH0FDTijhgxR3Y4PiS1HL2Zhw7bD3CbslmEGgfnnZojNkJtcLeBH
BLa52/dSwNU4WWLubaYSiAmA9IUMX1/RpfpxOxd4Ykmhz97oFbUaDJFipIggx5sX
ePAlkTdWnv+RWBxlJwMQ25oEHmRguNYf4Zr/Rxr9cS93Y+mdXIZaBEE0KS2iLRqa
OiWBki9IMQU4phqPOBAaG7A+eP8PAgMBAAGjZjBkMB0GA1UdDgQWBBTh0YHlzlpf
BKrS6badZrHF+qwshzAfBgNVHSMEGDAWgBTh0YHlzlpfBKrS6badZrHF+qwshzAS
BgNVHRMBAf8ECDAGAQH/AgEEMA4GA1UdDwEB/wQEAwIBhjANBgkqhkiG9w0BAQsF
AAOCAgEAALIY1wkilt/urfEVM5vKzr6utOeDWCUczmWX/RX4ljpRdgF+5fAIS4vH
tmXkqpSCOVeWUrJV9QvZn6L227ZwuE15cWi8DCDal3Ue90WgAJJZMfTshN4OI8cq
W9E4EG9wglbEtMnObHlms8F3CHmrw3k6KmUkWGoa+/ENmcVl68u/cMRl1JbW2bM+
/3A+SAg2c6iPDlehczKx2oa95QW0SkPPWGuNA/CE8CpyANIhu9XFrj3RQ3EqeRcS
AQQod1RNuHpfETLU/A2gMmvn/w/sx7TB3W5BPs6rprOA37tutPq9u6FTZOcG1Oqj
C/B7yTqgI7rbyvox7DEXoX7rIiEqyNNUguTk/u3SZ4VXE2kmxdmSh3TQvybfbnXV
4JbCZVaqiZraqc7oZMnRoWrXRG3ztbnbes/9qhRGI7PqXqeKJBztxRTEVj8ONs1d
WN5szTwaPIvhkhO3CO5ErU2rVdUr89wKpNXbBODFKRtgxUT70YpmJ46VVaqdAhOZ
D9EUUn4YaeLaS8AjSF/h7UkjOibNc4qVDiPP+rkehFWM66PVnP1Msh93tc+taIfC
EYVMxjh8zNbFuoc7fzvvrFILLe7ifvEIUqSVIC/AzplM/Jxw7buXFeGP1qVCBEHq
391d/9RAfaZ12zkwFsl+IKwE/OZxW8AHa9i1p4GO0YSNuczzEm4=
-----END CERTIFICATE-----`;
const OAUTH = 'https://ngw.devices.sberbank.ru:9443/api/v2/oauth';
const CHAT = 'https://gigachat.devices.sberbank.ru/api/v1/chat/completions';
const MODELS = ['GigaChat-3-Ultra', 'GigaChat-2-Max', 'GigaChat-2-Pro', 'GigaChat-2'];

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const client = Deno.createHttpClient({ caCerts: [CA] });
let token = null, tokenExp = 0;

async function getToken() {
  if (token && Date.now() < tokenExp - 60000) return token;
  const key = (Deno.env.get('GIGACHAT_KEY') || '').trim();
  if (!key) throw Object.assign(new Error('В Supabase нет секрета GIGACHAT_KEY'), { status: 500, code: 'no_key' });
  const r = await fetch(OAUTH, {
    method: 'POST', client,
    headers: { Authorization: 'Basic ' + key.replace(/^Basic\s+/i, ''), RqUID: crypto.randomUUID(), 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: 'scope=' + (Deno.env.get('GIGACHAT_SCOPE') || 'GIGACHAT_API_PERS'),
  });
  const t = await r.text();
  if (!r.ok) throw Object.assign(new Error('GigaChat не пустил: ' + t.slice(0, 200)), { status: r.status === 401 ? 401 : 502, code: 'bad_key' });
  const j = JSON.parse(t);
  token = j.access_token; tokenExp = j.expires_at || Date.now() + 25 * 60000;
  return token;
}

async function chat(body, model) {
  const t = await getToken();
  return fetch(CHAT, {
    method: 'POST', client,
    headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify({ model, messages: body.messages, stream: true, max_tokens: Math.min(+body.max_tokens || 16000, 32000), temperature: body.temperature ?? 0.7 }),
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    // кто зовёт: только вошедшие в «Кукинг»
    const auth = req.headers.get('authorization') || '';
    const u = await fetch(Deno.env.get('SUPABASE_URL') + '/auth/v1/user', { headers: { authorization: auth, apikey: req.headers.get('apikey') || Deno.env.get('SUPABASE_ANON_KEY') || '' } });
    if (!u.ok) return json({ error: { message: 'Войди в аккаунт' } }, 401);

    const body = await req.json().catch(() => ({}));
    if (!Array.isArray(body.messages) || !body.messages.length) return json({ error: { message: 'Пустой запрос' } }, 400);

    const list = body.model ? [body.model] : MODELS;
    let res = null, lastErr = '';
    for (const m of list) {
      res = await chat(body, m);
      if (res.status === 401) { token = null; res = await chat(body, m); }
      if (res.ok) break;
      lastErr = await res.text();
      if (res.status !== 404 && res.status !== 402 && !/model|quota|limit|balance/i.test(lastErr)) break; // модели нет или пакет кончился — пробуем следующую
    }
    if (!res || !res.ok) return json({ error: { message: 'GigaChat: ' + lastErr.slice(0, 300) } }, res && res.status === 429 ? 429 : 502);
    return new Response(res.body, { headers: { ...cors, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } });
  } catch (e) {
    return json({ error: { message: String(e && e.message || e) } }, e && e.status || 500);
  }
});
