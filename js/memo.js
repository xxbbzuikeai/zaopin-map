/* ============================================================
   人员备忘录（右侧可收起抽屉）
   - 记录：姓名 / 电话 / 需要的厂
   - 联动：左侧企业勾选（在招）→ 对应人员卡片绿色；未勾选 → 半透明灰色
   - 点卡片：地图定位到该厂
   数据存在浏览器 localStorage（dp1_memo_v1），不上传。
   ============================================================ */
(function () {
  'use strict';
  var KEY = 'dp1_memo_v1', OPEN_KEY = 'dp1_memo_open';
  var PEOPLE = [], open = false, el = {}, subscribed = false;

  try { PEOPLE = JSON.parse(localStorage.getItem(KEY) || '[]') || []; } catch (e) { PEOPLE = []; }
  if (!Array.isArray(PEOPLE)) PEOPLE = [];
  try { open = localStorage.getItem(OPEN_KEY) === '1'; } catch (e) { }

  function $(id) { return document.getElementById(id); }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(PEOPLE)); } catch (e) { } }
  function jobs() { return (window.DP1 && window.DP1.jobs) ? window.DP1.jobs() : []; }
  function label(j) { return j.name + ' · ' + (j.batch || j.region || ''); }
  function jobById(id) { return (window.DP1 && window.DP1.job) ? window.DP1.job(id) : null; }

  /* 把「厂名/厂名·批次」解析成具体招聘记录：先精确标签，再唯一厂名，最后唯一包含 */
  function findJob(s) {
    var a = jobs(), t = String(s || '').trim(), i, hit = null, n = 0;
    if (!t) return null;
    for (i = 0; i < a.length; i++) { if (label(a[i]) === t) return a[i]; }
    for (i = 0; i < a.length; i++) { if (a[i].name === t) { n++; hit = a[i]; } }
    if (n === 1) return hit;
    n = 0; hit = null;
    for (i = 0; i < a.length; i++) { if (a[i].name.indexOf(t) >= 0) { n++; hit = a[i]; } }
    return n === 1 ? hit : null;
  }

  function norm(p) {
    if (!p || typeof p !== 'object') return null;
    var o = {
      id: p.id || ('m' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)),
      name: String(p.name || '').trim(),
      tel: String(p.tel || '').trim(),
      jid: p.jid || '',
      fac: String(p.fac || '').trim()
    };
    if (!o.name && !o.tel) return null;
    var j = jobById(o.jid);
    if (!j) { j = findJob(o.fac); o.jid = j ? j.id : ''; }
    if (j) o.fac = label(j);
    return o;
  }
  PEOPLE = PEOPLE.map(norm).filter(Boolean);

  function stateOf(p) {
    var j = jobById(p.jid);
    if (!j) return { cls: 'gray', why: '没有匹配到厂，可点「×」删掉重填', j: null };
    var on = (window.DP1 && window.DP1.visible) ? window.DP1.visible(j.id) : false;
    return {
      cls: on ? 'green' : 'gray',
      why: on ? (j.region || '') + ' · ' + (j.batch || '') + ' · 左侧已勾选（在招）'
        : (j.region || '') + ' · ' + (j.batch || '') + ' · 未勾选',
      j: j
    };
  }

  function confirmDo(msg) {
    try {
      if (!window.confirm) return true;
      var r = window.confirm(msg);
      return typeof r === 'boolean' ? r : true;   // 有些内嵌环境 confirm 返回 undefined，按“确认”处理
    } catch (e) { return true; }
  }

  function row(p, st) {
    var d = document.createElement('div');
    d.className = 'who ' + st.cls;
    d.title = st.j ? '点击在地图上定位这家厂' : '厂名没有匹配到招聘数据（可在左侧列表搜一下正确厂名）';

    var h = document.createElement('div'); h.className = 'w-h';
    var b = document.createElement('b'); b.textContent = p.name || '（未填姓名）'; h.appendChild(b);
    var ph = document.createElement('span'); ph.className = 'w-p'; ph.textContent = p.tel || '—';
    if (p.tel) { ph.title = '点击拨号 ' + p.tel; }
    h.appendChild(ph);
    var x = document.createElement('button'); x.type = 'button'; x.className = 'w-x'; x.title = '删除'; x.textContent = '×';
    x.onclick = function (ev) {
      ev.stopPropagation();
      if (!confirmDo('删除「' + (p.name || '该人员') + '」？')) return;
      PEOPLE = PEOPLE.filter(function (q) { return q.id !== p.id; });
      save(); render();
    };
    h.appendChild(x);
    d.appendChild(h);

    var f = document.createElement('div'); f.className = 'w-f';
    var sn = document.createElement('span'); sn.className = 'w-s';
    sn.textContent = st.j ? (st.cls === 'green' ? '在招中' : '未勾选') : '未匹配';
    f.appendChild(sn);
    f.appendChild(document.createTextNode(p.fac || '未指定厂'));
    d.appendChild(f);

    d.onclick = function () {
      if (st.j && window.DP1 && window.DP1.focus) {
        window.DP1.focus(st.j.id);
        if (window.innerWidth < 760) setOpen(false);
      }
    };
    return d;
  }

  function fillDatalist() {
    var dl = el.dl; if (!dl) return;
    var a = jobs().slice().sort(function (x, y) {
      return (x.batch || '').localeCompare(y.batch || '') || (x.region || '').localeCompare(y.region || '');
    });
    dl.textContent = '';
    a.forEach(function (j) {
      var o = document.createElement('option');
      o.value = label(j);
      o.label = (j.headcount || '') + '人 · ' + (j.pay ? String(j.pay).split('；')[0] : '');
      dl.appendChild(o);
    });
  }

  function render() {
    if (!el.list) return;
    var rows = [], nGreen = 0;
    PEOPLE.forEach(function (p) {
      var st = stateOf(p);
      if (st.cls === 'green') nGreen++;
      rows.push({ p: p, st: st });
    });
    rows.sort(function (a, b) { return (a.st.cls === 'green' ? 0 : 1) - (b.st.cls === 'green' ? 0 : 1); });

    el.list.textContent = '';
    if (!rows.length) {
      var d = document.createElement('div'); d.className = 'memo-empty';
      d.innerHTML = '还没有人员。<br>填「姓名 / 电话 / 需要的厂」后点<b>添加</b>。<br><br>左侧勾选在招的厂，<br>对应人员卡片会变成绿色。';
      el.list.appendChild(d);
    } else {
      rows.forEach(function (r) { el.list.appendChild(row(r.p, r.st)); });
    }
    if (el.n) el.n.textContent = String(nGreen);
    if (el.st) el.st.textContent = rows.length ? ('在招 ' + nGreen + ' / 共 ' + rows.length) : '';
    if (el.tab) el.tab.classList.toggle('zero', !nGreen);
    fillDatalist();
  }

  function add() {
    var name = el.name.value.trim(), tel = el.tel.value.trim(), fac = el.fac.value.trim();
    if (!name && !tel) { el.name.focus(); return; }
    var j = findJob(fac);
    PEOPLE.push({
      id: 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      name: name, tel: tel, jid: j ? j.id : '', fac: j ? label(j) : fac
    });
    save();
    el.name.value = ''; el.tel.value = ''; el.fac.value = '';
    el.name.focus();
    render();
  }

  function setOpen(v) {
    open = !!v;
    if (el.panel) el.panel.classList.toggle('open', open);
    if (document.body) document.body.classList.toggle('memo-open', open);
    try { localStorage.setItem(OPEN_KEY, open ? '1' : '0'); } catch (e) { }
    if (open) render();
  }

  function subscribe() {
    if (subscribed) return;
    if (window.DP1 && window.DP1.on) {
      window.DP1.on(render);
      subscribed = true;
      render();
    }
  }

  function init() {
    el.panel = $('memo'); el.tab = $('memoTab'); el.n = $('memoTabN'); el.st = $('memoSt');
    el.list = $('memoList'); el.name = $('memoName'); el.tel = $('memoTel');
    el.fac = $('memoFac'); el.dl = $('memoFacDL');
    if (!el.panel || !el.list) return;

    if ($('memoTab')) $('memoTab').onclick = function () { setOpen(!open); };
    if ($('memoClose')) $('memoClose').onclick = function () { setOpen(false); };
    if ($('memoAdd')) $('memoAdd').onclick = add;
    [el.name, el.tel, el.fac].forEach(function (inp) {
      if (!inp) return;
      inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); add(); } });
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && open) setOpen(false);
    });
    window.addEventListener('storage', function (e) {
      if (e.key !== KEY && e.key !== OPEN_KEY) return;
      try { PEOPLE = (JSON.parse(localStorage.getItem(KEY) || '[]') || []).map(norm).filter(Boolean); } catch (err) { }
      render();
    });

    setOpen(open);
    render();
    subscribe();
    var tries = 0, iv = setInterval(function () {
      subscribe();
      if (subscribed || ++tries > 40) { clearInterval(iv); if (!subscribed) render(); }
    }, 250);
  }

  window.DP1Memo = {
    people: function () { return PEOPLE.slice(); },
    add: add, render: render, setOpen: setOpen,
    state: function (id) {
      var p = PEOPLE.filter(function (q) { return q.id === id; })[0];
      return p ? stateOf(p) : null;
    }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
