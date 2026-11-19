/* ProgressBar — сегменты как в сторис: пройденные залиты, текущий подсвечен, будущие полупрозрачные.
   Тап по сегменту — переход на шаг. */
window.ProgressBar = function (root, opts) {
  var segs = [];
  root.innerHTML = '';
  root.setAttribute('role', 'tablist');
  for (var i = 0; i < opts.count; i++) {
    (function (i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'pb-seg future';
      b.title = opts.labels[i];
      b.setAttribute('aria-label', 'Шаг ' + (i + 1) + ': ' + opts.labels[i]);
      b.innerHTML = '<span class="pb-track"><span class="pb-fill"></span></span>';
      b.addEventListener('click', function () { opts.onSelect(i); });
      root.appendChild(b);
      segs.push(b);
    })(i);
  }
  return {
    update: function (idx) {
      segs.forEach(function (s, i) {
        s.classList.toggle('done', i < idx);
        s.classList.toggle('current', i === idx);
        s.classList.toggle('future', i > idx);
        s.setAttribute('aria-current', i === idx ? 'step' : 'false');
      });
    }
  };
};
