/**
 * The report's only script: tooltips and the trend-chart crosshair.
 * The report is fully readable without it (all values are in tables).
 * Text from the data is inserted with textContent, never innerHTML.
 */
export const SCRIPT = String.raw`
(function () {
  var tipEl = document.createElement('div');
  tipEl.id = 'tooltip';
  tipEl.setAttribute('role', 'tooltip');
  document.body.appendChild(tipEl);

  function place(x, y) {
    var r = tipEl.getBoundingClientRect();
    var left = x + 14, top = y + 14;
    if (left + r.width > window.innerWidth - 8) left = x - r.width - 14;
    if (top + r.height > window.innerHeight - 8) top = y - r.height - 14;
    tipEl.style.left = Math.max(8, left) + 'px';
    tipEl.style.top = Math.max(8, top) + 'px';
  }
  function show(lines, x, y) {
    tipEl.replaceChildren();
    lines.forEach(function (line, i) {
      var row = document.createElement('div');
      if (typeof line === 'string') {
        row.textContent = line;
        if (i === 0) row.className = 't-title';
      } else {
        row.className = 't-row';
        var key = document.createElement('span');
        key.className = 'lkey line ' + line.cls;
        var value = document.createElement('strong');
        value.textContent = line.value;
        var label = document.createElement('span');
        label.textContent = line.label;
        row.append(key, value, label);
      }
      tipEl.appendChild(row);
    });
    tipEl.style.display = 'block';
    place(x, y);
  }
  function hide() { tipEl.style.display = 'none'; }

  document.querySelectorAll('[data-tip]').forEach(function (el) {
    var lines = (el.getAttribute('data-tip') || '').split('\n');
    el.addEventListener('pointermove', function (e) { show(lines, e.clientX, e.clientY); });
    el.addEventListener('pointerleave', hide);
    el.addEventListener('focus', function () { var r = el.getBoundingClientRect(); show(lines, r.right, r.top); });
    el.addEventListener('blur', hide);
  });

  var num = new Intl.NumberFormat('en-US');
  var day = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  function fmtDate(iso) { return day.format(new Date(iso + 'T00:00:00Z')); }

  document.querySelectorAll('figure[data-trend]').forEach(function (fig) {
    var data = JSON.parse(fig.querySelector('.trend-data').textContent);
    var svg = fig.querySelector('svg');
    var hit = svg.querySelector('.hit');
    var cross = svg.querySelector('.crosshair');
    function move(e) {
      var pt = svg.createSVGPoint();
      pt.x = e.clientX; pt.y = e.clientY;
      var loc = pt.matrixTransform(svg.getScreenCTM().inverse());
      var idx = Math.round(((loc.x - data.left) / (data.right - data.left)) * (data.n - 1));
      idx = Math.max(0, Math.min(data.n - 1, idx));
      var x = data.left + (idx / (data.n - 1)) * (data.right - data.left);
      cross.setAttribute('x1', x); cross.setAttribute('x2', x);
      cross.setAttribute('visibility', 'visible');
      var lines = ['Day ' + (idx + 1) + ' of ' + data.n];
      var c = data.current[idx], p = data.previous[idx];
      if (c) lines.push({ cls: 's-cur', value: num.format(c[1]), label: fmtDate(c[0]) });
      if (p) lines.push({ cls: 's-prev', value: num.format(p[1]), label: fmtDate(p[0]) });
      show(lines, e.clientX, e.clientY);
    }
    hit.addEventListener('pointermove', move);
    hit.addEventListener('pointerleave', function () { cross.setAttribute('visibility', 'hidden'); hide(); });
  });

  window.addEventListener('beforeprint', function () {
    document.querySelectorAll('details').forEach(function (el) { el.open = true; });
  });
})();
`;
