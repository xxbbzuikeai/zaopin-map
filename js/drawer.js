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
  var cnt = document.getElementById('cnt');
  if (!side) return;

  var open = true;
  try { open = localStorage.getItem(KEY) !== '0'; } catch (e) { }

  function apply(v, save) {
    open = !!v;
    side.classList.toggle('closed', !open);
    if (document.body) document.body.classList.toggle('side-closed', !open);
    if (btn) btn.textContent = open ? '⟨ 收起' : '';
    if (save) { try { localStorage.setItem(KEY, open ? '1' : '0'); } catch (e) { } }
    // 侧栏是覆盖层，地图容器尺寸始终不变 → 这里不需要 invalidateSize，
    // 展开/收起时地图完全不动（不重排、不重绘、不位移）。
  }

  if (btn) btn.onclick = function () { apply(false, true); };
  if (tab) tab.onclick = function () { apply(true, true); };
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !open) apply(true, true);
  });

  apply(open, false);
  syncCount();

  // 列表条数变化（搜索结果/勾选/切日期）时同步标签上的数字
  // 账号版是登录后才加载 app.js，这里一直等到 DP1 出现再挂钩
  var iv = setInterval(function () {
    if (window.DP1 && window.DP1.on) {
      window.DP1.on(syncCount);
      syncCount();
      clearInterval(iv);
    }
  }, 400);
})();
