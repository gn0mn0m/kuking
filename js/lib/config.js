window.KUKING_CONFIG = {
  version: '5.0.0',
  // Адрес сервера. Пусто — тот же сервер, с которого открыто приложение (location.origin):
  // фронтенд и API раздаёт один Caddy на российском VPS (deploy/), адреса /auth/v1, /rest/v1, /functions/v1.
  // Если API на другом адресе — впиши его сюда полностью, без слеша в конце.
  supabaseUrl: '',
  // Старое облако Supabase — только для копии на GitHub Pages, пока идёт переезд. После переезда строку можно удалить.
  legacyCloudUrl: 'https://akwijavguhthhxpdjgfq.supabase.co',
  supabaseAnonKey: 'sb_publishable_SuPpHmpSzJYEyUpKDrJ5zw_FR-V3MAj' // публичный ключ; свой сервер его не проверяет, но store.js ждёт непустое значение
};
(function (c) {
  // store.js, ai.js и social.js читают supabaseUrl после этого файла — подставляем адрес до них
  if (c.supabaseUrl) return;
  var gh = /\.github\.io$/.test(location.hostname);
  c.supabaseUrl = gh && c.legacyCloudUrl ? c.legacyCloudUrl : location.origin;
})(window.KUKING_CONFIG);
