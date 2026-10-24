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
    // 过渡期间逐帧让 Leaflet 按当前宽度重排：地图跟着侧栏一起平滑变宽，
    // 而不是动画结束才跳一下（pan:false 保持中心像素不动，不会抽动）。
    smoothResize(280);
    if (open) syncCount();
  }

  function raf(fn) {
    return (window.requestAnimationFrame || function (f) { return setTimeout(f, 16); })(fn);
  }

  /* 侧栏宽度在过渡，地图容器也在跟着变，逐帧 invalidateSize 才能贴着动画走 */
  function smoothResize(ms) {
    var t0 = Date.now();
    function step() {
      if (window.DP1 && window.DP1.invalidate) { try { window.DP1.invalidate(); } catch (e) { } }
      if (Date.now() - t0 < ms) raf(step);
    }
    raf(step);
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
