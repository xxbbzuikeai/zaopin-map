/* ============================================================
   左侧栏抽屉：默认展开，点「⟨ 收起」缩回左边缘；
   收起后左边缘出现竖排「筛选」标签，点它展开。
   状态记在 localStorage（dp1_side_open），不上传。
   ============================================================ */
(function () {
  'use strict';
  var KEY = 'dp1_side_open';
  var side = document.getElementById('side');
  var tab = document.getElementById('sideTab');
  var btn = document.getElementById('sideCollapse');
  var badge = document.getElementById('sideTabN');
  var cnt = document.getElementById('cnt');
  if (!side) return;

  var open = true;
  try { open = localStorage.getItem(KEY) !== '0'; } catch (e) { }

  function syncCount() {
    if (!badge) return;
    var m = cnt ? String(cnt.textContent || '').match(/\d+/) : null;
    badge.textContent = m ? m[0] : '';
  }

  function apply(v, save) {
    open = !!v;
    side.classList.toggle('closed', !open);
    if (document.body) document.body.classList.toggle('side-closed', !open);
    if (btn) btn.textContent = open ? '⟨ 收起' : '';
    if (save) { try { localStorage.setItem(KEY, open ? '1' : '0'); } catch (e) { } }
    // 等宽度过渡结束再让地图重算尺寸（Leaflet 监听 window resize）
    setTimeout(function () {
      try { window.dispatchEvent(new Event('resize')); } catch (e) {}
    }, 240);
    if (open) syncCount();
  }

  if (btn) btn.onclick = function () { apply(false, true); };
  if (tab) tab.onclick = function () { apply(true, true); };
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !open) apply(true, true);
  });

  apply(open, false);
  syncCount();

  // 列表条数变化（搜索结果/勾选/切日期）时同步标签上的数字
  var tries = 0, iv = setInterval(function () {
    if (window.DP1 && window.DP1.on) {
      window.DP1.on(syncCount);
      clearInterval(iv);
    } else if (++tries > 40) clearInterval(iv);
  }, 250);
})();
