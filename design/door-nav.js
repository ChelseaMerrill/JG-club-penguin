(function () {
  if (window.__doorNav) return; window.__doorNav = 1;
  var tip = document.createElement('div');
  tip.style.cssText = "position:fixed;z-index:9999;pointer-events:none;display:none;padding:5px 12px;background:#161719;border:2px solid #00BDFF;border-radius:999px;font:400 12px Anton,sans-serif;letter-spacing:.16em;color:#00BDFF;white-space:nowrap;transform:translate(-50%,-150%)";
  var fade = document.createElement('div');
  fade.style.cssText = "position:fixed;inset:0;z-index:9998;background:#0E1013;opacity:0;pointer-events:none;transition:opacity 250ms ease";
  function mount() { document.body.appendChild(tip); document.body.appendChild(fade); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
  function door(el) { return el && el.closest ? el.closest('[data-door]') : null; }
  document.addEventListener('mouseover', function (e) {
    var d = door(e.target);
    if (!d) { tip.style.display = 'none'; return; }
    var locked = d.hasAttribute('data-door-locked');
    tip.textContent = locked ? d.getAttribute('data-door') + ' · UNDER CONSTRUCTION' : 'CLICK TO ENTER · ' + d.getAttribute('data-door');
    tip.style.color = locked ? '#B3B6C9' : '#00BDFF';
    tip.style.borderColor = locked ? '#494949' : '#00BDFF';
    tip.style.display = 'block';
  });
  document.addEventListener('mousemove', function (e) {
    if (tip.style.display === 'block') { tip.style.left = e.clientX + 'px'; tip.style.top = e.clientY + 'px'; }
  });
  document.addEventListener('click', function (e) {
    var d = door(e.target) || (e.target.closest && e.target.closest('a[data-exit]'));
    if (!d) return;
    if (d.hasAttribute('data-door-locked')) { e.preventDefault(); tip.textContent = 'UNDER CONSTRUCTION'; return; }
    var href = d.getAttribute('href');
    if (!href) return;
    e.preventDefault();
    tip.style.display = 'none';
    fade.style.opacity = '1';
    setTimeout(function () { window.location.href = href; }, 260);
  }, true);
})();
