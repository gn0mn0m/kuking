/* SlideTransition — вперёд: старый уезжает влево с fade, новый въезжает справа; назад — зеркально.
   Только transform и opacity. prefers-reduced-motion — простой fade. */
window.SlideTransition = (function () {
  var live = [];
  var mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };

  function finishAll() {
    live.forEach(function (a) { try { a.finish(); } catch (e) {} });
    live = [];
  }

  function run(stage, oldEl, newEl, dir) {
    finishAll();
    // убрать возможные хвосты от прерванных переходов
    Array.prototype.slice.call(stage.children).forEach(function (c) {
      if (c !== oldEl && c !== newEl) c.remove();
    });
    stage.appendChild(newEl);
    if (!oldEl || !dir || !newEl.animate) { if (oldEl) oldEl.remove(); return; }

    oldEl.style.pointerEvents = 'none';
    oldEl.setAttribute('aria-hidden', 'true');
    var reduce = mq.matches;
    var D = reduce ? 240 : 360;
    var E = 'cubic-bezier(.45,0,.25,1)';
    var outK, inK;
    if (reduce) {
      outK = [{ opacity: 1 }, { opacity: 0 }];
      inK = [{ opacity: 0 }, { opacity: 1 }];
    } else {
      var outX = dir > 0 ? '-26%' : '26%';
      var inX = dir > 0 ? '26%' : '-26%';
      outK = [{ transform: 'translate3d(0,0,0)', opacity: 1 }, { transform: 'translate3d(' + outX + ',0,0)', opacity: 0 }];
      inK = [{ transform: 'translate3d(' + inX + ',0,0)', opacity: 0 }, { transform: 'translate3d(0,0,0)', opacity: 1 }];
    }
    var a1 = oldEl.animate(outK, { duration: D, easing: E, fill: 'forwards' });
    var a2 = newEl.animate(inK, { duration: D, easing: E });
    live.push(a1, a2);
    a1.onfinish = function () { oldEl.remove(); };
    a2.onfinish = function () { live = live.filter(function (a) { return a !== a1 && a !== a2; }); };
  }

  return { run: run };
})();
