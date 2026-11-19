/* Кукинг: тактильный отклик. Android — vibrate, iPhone (iOS 18+) — щелчок системного переключателя. */
(function () {
  var lbl;
  function setup() {
    var i = document.createElement('input'); i.type = 'checkbox'; i.setAttribute('switch', ''); i.id = 'kHap'; i.tabIndex = -1; i.setAttribute('aria-hidden', 'true');
    lbl = document.createElement('label'); lbl.htmlFor = 'kHap'; lbl.setAttribute('aria-hidden', 'true');
    i.style.cssText = lbl.style.cssText = 'position:fixed;left:-200px;top:0;width:1px;height:1px;opacity:0;pointer-events:none';
    document.body.appendChild(i); document.body.appendChild(lbl);
  }
  window.kHaptic = function (ms) {
    try { if (navigator.vibrate && navigator.vibrate(ms || 10)) return; } catch (e) {}
    try { if (!lbl) setup(); lbl.click(); } catch (e) {}
  };
})();
