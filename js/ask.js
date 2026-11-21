/* Кукинг: общий вопрос перед выходом с несохранёнными правками.
   kAskLeave({ save, drop }) — «Сохранить» / «Выйти и стереть» / «Остаться». */
(function () {
  'use strict';
  window.kAskLeave = function (o) {
    if (document.querySelector('.lv-ov')) return;
    var ov = document.createElement('div'); ov.className = 'lv-ov'; ov.setAttribute('role', 'alertdialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-labelledby', 'lvT');
    ov.innerHTML = '<div class="lv-box ask-box"><h3 id="lvT">' + (o.title || 'Сохранить изменения?') + '</h3><p class="small">' + (o.text || 'Ты что-то поменял и не сохранил.') + '</p>' +
      '<button type="button" class="nav-btn primary" data-lv="save">Сохранить</button>' +
      '<button type="button" class="nav-btn lv-drop" data-lv="drop">Выйти и стереть правки</button>' +
      '<button type="button" class="ghost-btn" data-lv="stay">Остаться</button></div>';
    document.body.appendChild(ov);
    requestAnimationFrame(function () { ov.classList.add('on'); });
    if (window.kHaptic) window.kHaptic(12);
    function shut(then) { ov.classList.remove('on'); setTimeout(function () { ov.remove(); if (then) then(); }, 220); }
    ov.addEventListener('click', function (e) {
      var b = e.target.closest('[data-lv]');
      if (!b) { if (e.target === ov) shut(); return; }
      var w = b.getAttribute('data-lv');
      shut(w === 'save' ? o.save : w === 'drop' ? o.drop : null);
    });
    setTimeout(function () { var s = ov.querySelector('[data-lv=save]'); if (s) s.focus(); }, 60);
  };
})();
