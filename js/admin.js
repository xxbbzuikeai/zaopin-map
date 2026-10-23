/* 后台管理（试用版）：概览 / 审核 / 封禁 / 踢下线 / 重置密码 / 建号 / 事件 */
(function () {
  'use strict';
  var isAdmin = false, timer = null;

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  var API_BASE = (typeof window !== 'undefined' && window.DP1_API_BASE) || '';
  /* 后台专用令牌：与会话网站分开存（sessionStorage），关掉浏览器就失效 */
  var PANEL_KEY = 'dp1_panel_token';
  function token() { try { return sessionStorage.getItem(PANEL_KEY) || ''; } catch (e) { return ''; } }
  function setToken(v) { try { v ? sessionStorage.setItem(PANEL_KEY, v) : sessionStorage.removeItem(PANEL_KEY); } catch (e) {} }
  function api(url, body) {
    var opt = { cache: 'no-store', credentials: 'include', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token() } };
    if (body !== undefined) { opt.method = 'POST'; opt.body = JSON.stringify(body); }
    return fetch(API_BASE + url, opt).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) { j._code = r.status; return j; });
    });
  }
  function act(name, id, extra) {
    var b = Object.assign({ id: id }, extra || {});
    return api('/api/admin/' + name, b).then(function (j) {
      if (!j.ok) { alert(j.error || '操作失败'); return j; }
      return j;
    });
  }

  function showLogin(err) {
    $('loginBox').style.display = 'block';
    $('main').style.display = 'none';
    $('loginMsg').textContent = err || '';
    $('lbtn').onclick = function () {
      $('lbtn').disabled = true;
      api('/api/login', { username: $('lu').value.trim(), password: $('lp').value }).then(function (j) {
        $('lbtn').disabled = false;
        if (!j.ok) { $('loginMsg').textContent = j.error || '登录失败'; return; }
        if (!j.user || j.user.role !== 'admin') { setToken(''); $('loginMsg').textContent = '这个账号不是管理员，不能进后台'; return; }
        setToken(j.token || '');
        location.reload();
      });
    };
    $('lp').onkeydown = function (e) { if (e.key === 'Enter') $('lbtn').click(); };
  }

  function stat(k, v, cls) {
    return '<div class="stat ' + (cls || '') + '"><div class="k">' + k + '</div><div class="v">' + v + '</div></div>';
  }

  function render(d) {
    var s = d.stats;
    $('srvTime').textContent = '数据时间 ' + d.server_time;
    $('stats').innerHTML =
      stat('当前在线', s.online, 'on') + stat('已通过', s.active) +
      stat('待审核', s.pending, 'pen') + stat('已停用', s.revoked, 'rvk') + stat('账号总数', s.total);
    $('statsHint').textContent = d.allow_register ? '允许自助注册' : '自助注册已关闭';

    var pend = d.users.filter(function (u) { return u.status === 'pending'; });
    $('pendingCard').style.display = pend.length ? 'block' : 'none';
    $('pendingN').textContent = pend.length ? '（' + pend.length + '）' : '';
    $('pendingBody').innerHTML = pend.map(function (u) {
      return '<tr class="pending"><td>' + esc(u.username) + '</td><td>' + esc(u.created) +
        '</td><td>' + esc(u.last_ip || '—') + '</td><td><div class="ops">' +
        '<button class="good" data-a="approve" data-id="' + u.id + '">通过</button>' +
        '<button class="danger" data-a="delete" data-id="' + u.id + '">拒绝并删除</button>' +
        '</div></td></tr>';
    }).join('');

    $('usersN').textContent = '（' + d.users.length + '）';
    $('userBody').innerHTML = d.users.map(function (u) {
      var st = { active: '已通过', pending: '待审核', revoked: '已停用' }[u.status] || u.status;
      var ops = [];
      if (u.status === 'pending') ops.push('<button class="good" data-a="approve" data-id="' + u.id + '">通过</button>');
      if (u.status === 'active') ops.push('<button class="danger" data-a="revoke" data-id="' + u.id + '">停用</button>');
      if (u.status === 'revoked') ops.push('<button class="good" data-a="restore" data-id="' + u.id + '">恢复</button>');
      if (u.online) ops.push('<button data-a="kick" data-id="' + u.id + '">踢下线</button>');
      ops.push('<button data-a="resetpw" data-id="' + u.id + '">重置密码</button>');
      ops.push('<button data-a="role" data-id="' + u.id + '" data-role="' + (u.role === 'admin' ? 'viewer' : 'admin') + '">' +
        (u.role === 'admin' ? '降为查看' : '设为管理') + '</button>');
      ops.push('<button class="danger" data-a="delete" data-id="' + u.id + '">删除</button>');
      return '<tr class="' + (u.status === 'revoked' ? 'revoked' : '') + '">' +
        '<td>' + esc(u.username) + '</td>' +
        '<td><span class="badge ' + u.status + '">' + st + '</span></td>' +
        '<td>' + (u.role === 'admin' ? '<span class="badge admin">管理员</span>' : '<span class="small">查看者</span>') + '</td>' +
        '<td><span class="dot ' + (u.online ? 'on' : '') + '"></span>' + (u.online ? '在线' : '离线') + '</td>' +
        '<td>' + esc(u.last_seen_ago) + '</td>' +
        '<td>' + esc(u.last_login) + '</td>' +
        '<td class="small">' + esc(u.last_ip || '—') + '</td>' +
        '<td><div class="ops">' + ops.join('') + '</div></td></tr>';
    }).join('');

    $('allowReg').checked = !!d.allow_register;
    $('logs').innerHTML = d.events.map(function (e) {
      return '<div>' + esc(e.ts) + ' · <span class="k">' + esc(e.username || '—') + '</span> · ' +
        esc(e.kind) + (e.detail ? ' · ' + esc(e.detail) : '') + (e.ip ? ' · ' + esc(e.ip) : '') + '</div>';
    }).join('') || '<div class="small">暂无事件</div>';
  }

  function load() {
    api('/api/admin/overview').then(function (j) {
      if (!j.ok) { showLogin(j._code === 403 ? '当前账号不是管理员' : (j.error || '')); return; }
      $('loginBox').style.display = 'none';
      $('main').style.display = 'block';
      render(j);
    }).catch(function () { showLogin('连接失败'); });
  }

  function bind() {
    document.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-a]');
      if (!b) return;
      var a = b.getAttribute('data-a'), id = b.getAttribute('data-id');
      if (a === 'delete' && !confirm('删除这个账号？此操作不可恢复')) return;
      if (a === 'role') {
        act('role', id, { role: b.getAttribute('data-role') }).then(load);
        return;
      }
      if (a === 'resetpw') {
        var pw = prompt('输入新密码（留空自动生成 6 位随机密码）');
        if (pw === null) return;
        act('resetpw', id, { password: pw }).then(function (j) {
          if (j.ok) { alert('新密码：' + j.password + '\n请私下发给对方，并让对方改掉'); load(); }
        });
        return;
      }
      act(a, id).then(load);
    });

    $('allowReg').onchange = function () {
      api('/api/admin/allow_register', { allow: $('allowReg').checked }).then(load);
    };

    $('createForm').onsubmit = function (ev) {
      ev.preventDefault();
      api('/api/admin/create', {
        username: $('cUser').value.trim(), password: $('cPw').value, role: $('cRole').value
      }).then(function (j) {
        if (!j.ok) { $('createMsg').textContent = j.error || '失败'; return; }
        $('createMsg').textContent = '已创建，密码：' + j.password;
        $('cUser').value = ''; $('cPw').value = '';
        load();
      });
    };

    $('logoutBtn').onclick = function (e) {
      e.preventDefault();
      api('/api/logout', {}).then(function () { setToken(''); location.href = '/'; });
    };
  }

  function init() {
    /* 后台每次进来都要单独登录，不复用网站登录态 */
    if (!token()) { showLogin('请先用管理员账号登录'); return; }
    api('/api/me').then(function (j) {
      if (!j.ok || !j.user || j.user.role !== 'admin') {
        setToken('');
        showLogin(!j.ok ? '后台登录已失效，请重新登录' : '当前账号不是管理员，请用管理员账号登录');
        return;
      }
      isAdmin = true;
      $('main').style.display = 'block';
      bind();
      load();
      timer = setInterval(function () { if (isAdmin) load(); }, 5000);
    }).catch(function () { showLogin('连接服务器失败'); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
