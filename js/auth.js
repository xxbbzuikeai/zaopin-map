/* 登录门 + 会话 + 心跳（试用版）；登录成功后才加载 app.js / memo.js */
(function () {
  'use strict';
  var booted = false;

  function $(id) { return document.getElementById(id); }

  /* 静态托管域名与接口不同域时，用 window.DP1_API_BASE 指向网关地址 */
  var API_BASE = (typeof window !== 'undefined' && window.DP1_API_BASE) || '';

  var TOKEN_KEY = 'dp1_api_token';
  function getToken() { try { return localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; } }
  function setToken(t) { try { if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY); } catch (e) {} }

  function api(url, opts) {
    var o = Object.assign({ cache: 'no-store', credentials: 'include' }, opts || {});
    o.headers = Object.assign({
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + getToken()
    }, o.headers || {});
    return fetch(API_BASE + url, o)
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { j._code = r.status; return j; }); });
  }

  /* ---------------- 登录门 ---------------- */
  function buildGate() {
    var g = document.createElement('div');
    g.id = 'loginGate';
    g.innerHTML =
      '<div class="lg-card">' +
      '<div class="lg-logo">在招厂区位置地图</div>' +
      '<div class="lg-sub">内部数据 · 请先登录 &nbsp;·&nbsp; <a href="/admin">管理员后台</a></div>' +
      '<div class="lg-tabs"><button type="button" data-tab="login" class="on">登录</button>' +
      '<button type="button" data-tab="reg">注册</button></div>' +
      '<form id="lgForm">' +
      '<input id="lgUser" placeholder="用户名" autocomplete="username">' +
      '<input id="lgPw" type="password" placeholder="密码" autocomplete="current-password">' +
      '<button type="submit" id="lgBtn">登录</button>' +
      '</form>' +
      '<div class="lg-msg" id="lgMsg"></div>' +
      '<div class="lg-foot">注册后需管理员在后台「通过」才能查看数据。<br>忘记密码：让管理员重置。</div>' +
      '</div>';
    document.body.appendChild(g);

    var tab = 'login';
    var tabs = g.querySelectorAll('.lg-tabs button');
    tabs.forEach(function (b) {
      b.onclick = function () {
        tab = b.getAttribute('data-tab');
        tabs.forEach(function (x) { x.classList.toggle('on', x === b); });
        $('lgBtn').textContent = tab === 'login' ? '登录' : '提交注册';
        $('lgPw').autocomplete = tab === 'login' ? 'current-password' : 'new-password';
        $('lgMsg').textContent = '';
        $('lgMsg').className = 'lg-msg';
      };
    });

    $('lgForm').onsubmit = function (ev) {
      ev.preventDefault();
      var name = $('lgUser').value.trim(), pw = $('lgPw').value;
      if (!name || !pw) { msg('请填用户名和密码', false); return; }
      $('lgBtn').disabled = true;
      api(tab === 'login' ? '/api/login' : '/api/register', {
        method: 'POST', body: JSON.stringify({ username: name, password: pw })
      }).then(function (j) {
        $('lgBtn').disabled = false;
        if (!j.ok) { msg(j.error || '操作失败', false); return; }
        if (j.token) setToken(j.token);
        if (tab === 'reg') {
          tabs[0].click();   // 切回登录页（切换会清空提示，所以提示放在后面）
          msg('注册成功，等管理员通过后就能登录', true);
          return;
        }
        location.reload();
      }).catch(function () { $('lgBtn').disabled = false; msg('网络错误，请重试', false); });
    };
    g.addEventListener('keydown', function (e) { if (e.key === 'Escape') e.stopPropagation(); });
    return g;
  }

  function msg(t, ok) {
    var m = $('lgMsg');
    if (!m) return;
    m.textContent = t;
    m.className = 'lg-msg' + (ok ? ' ok' : '');
  }

  /* ---------------- 顶部账号条 ---------------- */
  function chip(user) {
    var c = $('whoChip');
    if (!c) {
      c = document.createElement('div');
      c.id = 'whoChip';
      document.body.appendChild(c);
    }
    c.style.display = 'flex';
    c.innerHTML = '';
    var b = document.createElement('b'); b.textContent = user.username; c.appendChild(b);
    var dot = document.createElement('span');
    dot.title = '在线'; dot.textContent = '●';
    dot.style.cssText = 'color:#4ad17c;font-size:10px';
    c.appendChild(dot);
    if (user.role === 'admin') {
      var a = document.createElement('a'); a.className = 'adm'; a.href = '/admin'; a.textContent = '后台';
      c.appendChild(a);
    }
    var out = document.createElement('button');
    out.className = 'out'; out.type = 'button'; out.textContent = '退出';
    out.onclick = function () {
      api('/api/logout', { method: 'POST' }).then(function () { setToken(''); location.reload(); });
    };
    c.appendChild(out);
  }

  /* ---------------- 加载脚本 ---------------- */
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src; s.onload = resolve; s.onerror = reject;
      document.body.appendChild(s);
    });
  }

  function heartbeat() {
    api('/api/heartbeat', { method: 'POST' }).then(function (j) {
      if (j._code === 401) {
        // 会话被停用/过期 → 回登录门
        var c = $('whoChip'); if (c) c.style.display = 'none';
        if (!$('loginGate')) { document.body.innerHTML = ''; buildGate(); }
        else $('loginGate').hidden = false;
        var b = $('loginGate');
        if (b) b.hidden = false;
        msg('会话已失效，请重新登录', false);
      }
    }).catch(function () { });
  }

  function boot(user) {
    if (booted) return;
    booted = true;
    var g = $('loginGate'); if (g) g.remove();
    chip(user);
    loadScript('js/app.js').then(function () {
      return loadScript('js/memo.js');
    }).then(function () {
      heartbeat();
      setInterval(heartbeat, 30000);
    }).catch(function (e) {
      console.error('加载页面脚本失败', e);
      document.getElementById('list').innerHTML = '<div class="warn">页面脚本加载失败，请刷新重试</div>';
    });
  }

  function init() {
    api('/api/me').then(function (j) {
      if (j && j.ok && j.user && j.user.status === 'active') { boot(j.user); return; }
      var g = buildGate();
      if (j && j.user && j.user.status === 'pending') msg('账号还在等管理员审核', false);
    }).catch(function () {
      buildGate();
      msg('连接服务器失败，请确认服务已启动', false);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
