
(function(){
"use strict";
var $=function(id){return document.getElementById(id);};
/* ==================== 数据同步：文件内置数据 / 本机在线更新缓存 ====================
   优先级：本机缓存的在线更新数据(若比文件内置数据新) > 文件内置数据
   更新地址来自 meta.updateUrl（构建时注入），为空则仅支持“新版文件覆盖同名文件”的分发方式。 */
var OV_KEY='jobsmap_override_v1', UPD_URL='', OV_APPLIED='';
try{UPD_URL=(window.JOBS_DATA&&window.JOBS_DATA.meta&&window.JOBS_DATA.meta.updateUrl)||'';}catch(e){}
try{
  var _ov=JSON.parse(localStorage.getItem(OV_KEY)||'null');
  if(_ov&&_ov.data&&_ov.data.jobs&&_ov.generated){
    var _base=(window.JOBS_DATA&&window.JOBS_DATA.meta&&window.JOBS_DATA.meta.generated)||'';
    if(String(_ov.generated)>String(_base)){window.JOBS_DATA=_ov.data;OV_APPLIED=_ov.generated;}
  }
}catch(e){}

var D=window.JOBS_DATA;
if(!D||!D.jobs){$('list').innerHTML='<div class="warn">未找到 map/jobs-data.js。请保持目录结构：地图 HTML 与 map 文件夹在同一层级。</div>';return;}
var COLORS={'瑞安':'#e8590c','乐清':'#1c7ed6','台州':'#2f9e44','温州市区':'#7048e8'};
var ALL=D.jobs, PLACES=D.places||[];
var JOBS=ALL.filter(function(j){return j.lng!=null&&j.lat!=null;});
var MISS=ALL.filter(function(j){return !(j.lng!=null&&j.lat!=null);});
/* 服务范围外框：温州+台州+宁波（用于初始视野与在线检索结果判定） */
var SERVICE_BBOX=[120.30,27.20,121.85,30.10];
var ONLINE_TILE='https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}';

var mt=[];(D.meta.batches||[]).forEach(function(b){mt.push(b.date+' '+b.region+' '+b.count+'家/'+b.people+'人');});
$('meta').textContent='共 '+ALL.length+' 家 · 已定位 '+JOBS.length+' 家 ｜ '+mt.join(' ｜ ')
  +' ｜ 数据版本 '+((D.meta&&D.meta.generated)||'-')+(OV_APPLIED?'（在线更新）':'');

var map=L.map('map',{zoomControl:false,attributionControl:false,minZoom:3,maxZoom:18,worldCopyJump:false});
L.control.zoom({position:'bottomright'}).addTo(map);
L.control.scale({imperial:false,position:'bottomleft'}).addTo(map);
var B=L.latLngBounds([[D.meta.bbox[1],D.meta.bbox[0]],[D.meta.bbox[3],D.meta.bbox[2]]]);

var online=true, plainMode=false, baseLayer=null, tileErr=0, offlineAuto=false;
/* 离线瓦片是否随包提供：null=未探测，1=有，0=无（拷到别的电脑通常为 0） */
var offlineTiles=null;
function checkOfflineTiles(cb){
  if(offlineTiles!==null){cb(offlineTiles===1);return;}
  var c=L.latLng(27.900,120.800),z=11,n=Math.pow(2,z),la=c.lat*Math.PI/180;
  var tx=Math.floor((c.lng+180)/360*n);
  var ty=Math.floor((1-Math.log(Math.tan(la)+1/Math.cos(la))/Math.PI)/2*n);
  var done=false,img=new Image();
  var fin=function(ok){if(done)return;done=true;offlineTiles=ok?1:0;cb(ok);};
  img.onload=function(){fin(true);};
  img.onerror=function(){fin(false);};
  img.src='map/tiles/'+z+'/'+tx+'_'+ty+'.jpg';
  setTimeout(function(){fin(false);},6000);
}
function applyBase(){
  if(baseLayer){map.removeLayer(baseLayer);baseLayer=null;}
  var mc=$('map');
  if(plainMode){                       /* 兜底：无任何底图，仅浅色网格 */
    /* 必须用 classList 增删 plain，不能整体覆盖 className：
       否则会清掉 Leaflet 的 leaflet-container 类（其 overflow:hidden 负责裁剪瓦片），
       瓦片会溢出到左侧面板上，把面板右侧内容盖住。 */
    if(mc.classList)mc.classList.add('plain');else mc.className='plain';
    if(map.getMinZoom()!==3){map.setMinZoom(3);map.setMaxZoom(18);}
    badge();return;
  }
  /* 同上：只移除 plain，保留 leaflet-container 类 */
  if(mc.classList)mc.classList.remove('plain');else mc.className='';
  if(online){
    baseLayer=L.tileLayer(ONLINE_TILE,{subdomains:'1234',minZoom:3,maxZoom:18,noWrap:false,keepBuffer:3,attribution:'底图 © 高德地图'});
    baseLayer.on('tileerror',function(){tileErr++;if(tileErr>=8&&!offlineAuto){offlineAuto=true;online=false;tileErr=0;applyBase();toast('在线底图加载失败，已改试本地离线瓦片');}});
    baseLayer.addTo(map);
    badge();
    return;
  }
  badge();
  checkOfflineTiles(function(ok){
    if(!ok){plainMode=true;offlineAuto=true;tileErr=0;applyBase();toast('无网络且未随包提供离线瓦片，已切换为极简底图：点位、筛选、距离仍可正常使用');return;}
    baseLayer=L.tileLayer('map/tiles/{z}/{x}_{y}.jpg',{minZoom:11,maxZoom:16,maxNativeZoom:14,bounds:L.latLngBounds([[27.30,120.30],[28.50,121.35]]),noWrap:true,keepBuffer:3,errorTileUrl:''});
    baseLayer.on('tileerror',function(){tileErr++;if(tileErr>=10&&!plainMode){plainMode=true;offlineAuto=true;tileErr=0;applyBase();toast('离线瓦片加载异常，已切换为极简底图');}});
    baseLayer.addTo(map);
    badge();
  });
}
$('netBadge').onclick=function(){
  var k=prompt('高德 Web服务 Key（留空则清除，本机浏览器保存）：',AMAP_KEY||'');
  if(k===null)return;
  k=k.trim();
  try{ if(k)localStorage.setItem('jobsmap_amapkey_v1',k); else localStorage.removeItem('jobsmap_amapkey_v1'); }catch(e){}
  AMAP_KEY=k;AMAP_CACHE={};GEO_CACHE={};
  setNet(k?'amap':'photon');
  toast(k?'已更新高德 Key（本机生效）':'已清除本机 Key，改用 Photon 兜底');
};
$('baseBadge').onclick=function(){    /* 在线 → 离线瓦片 → 极简 → 在线 循环 */
  tileErr=0;offlineAuto=false;
  if(plainMode){plainMode=false;online=true;}
  else if(online){online=false;}
  else{plainMode=true;}
  applyBase();
  if(plainMode){map.setMinZoom(3);map.setMaxZoom(18);map.fitBounds(B,{maxZoom:13});}
  else if(online){map.setMinZoom(3);map.setMaxZoom(18);map.fitBounds(B,{maxZoom:13});}
  else{map.setMinZoom(11);map.setMaxZoom(16);map.fitBounds(B);}
};

var pinLayer=L.layerGroup().addTo(map);
var lineLayer=L.layerGroup().addTo(map);
var pinMarkers={},originMarker=null,origin=null,activeId=null;
var show={'瑞安':true,'乐清':true,'台州':true,'温州市区':true};
/* 企业逐个勾选：未勾选=不参与地图标注与距离筛选；按数据版本本地记忆，数据重建后自动重置为全选 */
var INCL_KEY='jobsmap_incl_v1', incl={};
(function(){
  var raw=null;try{raw=JSON.parse(localStorage.getItem(INCL_KEY)||'null');}catch(e){raw=null;}
  if(raw&&raw.ver===((D.meta&&D.meta.generated)||'')){
    ALL.forEach(function(j){if(raw.ids&&raw.ids[j.id]===0)incl[j.id]=false;});
  }
})();
function saveIncl(){try{var ids={};ALL.forEach(function(j){if(incl[j.id]===false)ids[j.id]=0;});
  localStorage.setItem(INCL_KEY,JSON.stringify({ver:(D.meta&&D.meta.generated)||'',ids:ids}));}catch(e){}}
function isOn(j){return incl[j.id]!==false;}
var CUST_KEY='jobsmap_custom_v1', CUSTOM=[];
try{CUSTOM=JSON.parse(localStorage.getItem(CUST_KEY)||'[]')||[];}catch(e){CUSTOM=[];}
function saveCustom(){try{localStorage.setItem(CUST_KEY,JSON.stringify(CUSTOM));}catch(e){}}

function toast(m){var t=$('toast');t.textContent=m;t.className='on';clearTimeout(t._h);t._h=setTimeout(function(){t.className='';},3200);}
function inService(x,y){return x>=SERVICE_BBOX[0]&&x<=SERVICE_BBOX[2]&&y>=SERVICE_BBOX[1]&&y<=SERVICE_BBOX[3];}
function dist(a,b){var R=6371,p=Math.PI/180,dlat=(b[0]-a[0])*p,dlng=(b[1]-a[1])*p;
  var s=Math.sin(dlat/2)*Math.sin(dlat/2)+Math.cos(a[0]*p)*Math.cos(b[0]*p)*Math.sin(dlng/2)*Math.sin(dlng/2);
  return 2*R*Math.asin(Math.min(1,Math.sqrt(s)));}
function fmt(d){return d<1?(d*1000).toFixed(0)+' m':d.toFixed(1)+' km';}
function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function normKey(s){return String(s==null?'':s).replace(/[\s\u3000·・\-—]/g,'').replace(/[（(].*?[)）]/g,'');}

/* ==================== 底图/在线状态徽标 ==================== */
function badge(){
  var t=plainMode?'极简':(online?'在线':'离线');
  $('baseBadge').textContent='底图：'+t;
  $('baseBadge').className='badge btn'+(plainMode?' busy':(online?' on':''));
}

/* ==================== 本地检索（地名库 + 厂名 + 常用点，离线命中补充） ==================== */
function localSearch(q){
  var nq=normKey(q);
  if(!nq)return [];
  var res=[],seen={};
  function add(n,x,y,kind,rank,src,prec){
    var k=normKey(n)+'|'+Number(x).toFixed(4);
    if(seen[k])return;seen[k]=1;
    res.push({name:n,x:x,y:y,kind:kind,rank:rank,src:src||'local',prec:prec||'fine'});
  }
  CUSTOM.forEach(function(c){add(c.n,c.x,c.y,'常用点',-1000,'custom','fine');});
  PLACES.forEach(function(p){
    var np=normKey(p.n),r=null;
    if(np===nq)r=0;
    else if(np.indexOf(nq)===0)r=1;
    else if(np.indexOf(nq)>0)r=2;
    else if(nq.indexOf(np)>=0&&np.length>=2)r=3;
    if(r===null)return;
    add(p.n,p.x,p.y,(p.t||'地名')+' · 本地库',r*1000-np.length,'local',/^(区县|镇|街道)$/.test(p.t||'')?'coarse':'fine');
  });
  JOBS.forEach(function(j){
    var nj=normKey(j.name),r=null;
    if(nj.indexOf(nq)>=0&&nq.length>=2)r=1;
    else if(nq.indexOf(nj)>=0&&nj.length>=2)r=3.5;
    if(r===null)return;
    add(j.name,j.lng,j.lat,'厂区 · '+j.region,r*1000-nj.length,'job','fine');
  });
  res.sort(function(a,b){return a.rank-b.rank;});
  return res.slice(0,10);
}

/* ==================== 坐标纠偏：WGS84(OSM/Photon) → GCJ-02(高德底图) ==================== */
/* 底图为高德瓦片(GCJ-02)，而 OSM/Photon 返回 WGS84；不纠偏会产生 400~600 m 系统性偏移。 */
var GCJ_A=6378245.0, GCJ_EE=0.00669342162296594323;
function _gcjTLat(x,y){
  var r=-100+2*x+3*y+0.2*y*y+0.1*x*y+0.2*Math.sqrt(Math.abs(x));
  r+=(20*Math.sin(6*x*Math.PI)+20*Math.sin(2*x*Math.PI))*2/3;
  r+=(20*Math.sin(y*Math.PI)+40*Math.sin(y/3*Math.PI))*2/3;
  r+=(160*Math.sin(y/12*Math.PI)+320*Math.sin(y*Math.PI/30))*2/3;
  return r;
}
function _gcjTLng(x,y){
  var r=300+x+2*y+0.1*x*x+0.1*x*y+0.1*Math.sqrt(Math.abs(x));
  r+=(20*Math.sin(6*x*Math.PI)+20*Math.sin(2*x*Math.PI))*2/3;
  r+=(20*Math.sin(x*Math.PI)+40*Math.sin(x/3*Math.PI))*2/3;
  r+=(150*Math.sin(x/12*Math.PI)+300*Math.sin(x/30*Math.PI))*2/3;
  return r;
}
function wgs2gcj(lng,lat){
  if(lng<73.66||lng>135.05||lat<3.86||lat>53.55)return [lng,lat];
  var dLat=_gcjTLat(lng-105,lat-35), dLng=_gcjTLng(lng-105,lat-35);
  var rl=lat/180*Math.PI, m=Math.sin(rl);
  m=1-GCJ_EE*m*m;
  var sm=Math.sqrt(m);
  dLat=(dLat*180)/((GCJ_A*(1-GCJ_EE))/(m*sm)*Math.PI);
  dLng=(dLng*180)/(GCJ_A/sm*Math.cos(rl)*Math.PI);
  return [lng+dLng,lat+dLat];
}

/* ==================== 在线检索 · 高德 Web 服务（首选） ==================== */
/* Key 取用顺序：页面内设置(localStorage) > jobs-data.js 的 meta.amapKey */
var AMAP_KEY=(D.meta&&D.meta.amapKey)||'';
try{var _ak=localStorage.getItem('jobsmap_amapkey_v1');if(_ak)AMAP_KEY=_ak;}catch(e){}
var AMAP_API='https://restapi.amap.com/v3/';
/* 服务范围城市（高德 city 参数一次只能传一个，逐个查询后合并去重）：温州 / 台州 / 宁波 */
var SERVICE_CITIES=['330300','331000','330200'];
var CITY_KW={'温州':'330300','瑞安':'330381','乐清':'330382','永嘉':'330324','平阳':'330326','苍南':'330327',
             '龙港':'330383','文成':'330328','泰顺':'330329','洞头':'330305','鹿城':'330302','龙湾':'330303',
             '瓯海':'330304','台州':'331000','椒江':'331002','黄岩':'331003','路桥':'331004','三门':'331022',
             '天台':'331023','仙居':'331024','温岭':'331081','临海':'331082','玉环':'331083',
             '宁波':'330200','江北':'330205','慈城':'330205','鄞州':'330212','镇海':'330211','北仑':'330206'};
/* 按输入里出现的区县名决定查哪几个市；没有线索时默认查整个服务范围 */
function cityCodes(q){
  var t=normKey(q),out=[];
  Object.keys(CITY_KW).forEach(function(k){if(t.indexOf(k)>=0&&out.indexOf(CITY_KW[k])<0)out.push(CITY_KW[k]);});
  if(!out.length)out=SERVICE_CITIES.slice();
  SERVICE_CITIES.slice().reverse().forEach(function(c){if(out.indexOf(c)<0)out.push(c);});
  return out.slice(0,3);
}
var AMAP_DIST={'瑞安':'330381','乐清':'330382','永嘉':'330324','平阳':'330326','苍南':'330327',
               '龙港':'330383','文成':'330328','泰顺':'330329','洞头':'330305','鹿城':'330302',
               '龙湾':'330303','瓯海':'330304','瓯江口':'330305',
               '台州':'331000','椒江':'331002','黄岩':'331003','路桥':'331004','三门':'331022',
               '天台':'331023','仙居':'331024','温岭':'331081','临海':'331082','玉环':'331083',
               '宁波':'330200','江北':'330205','鄞州':'330212','镇海':'330211','北仑':'330206'};
/* 在招厂区所在区县：命中时加分优先展示 */
var PRIORITY_ADCODE={'330381':1,'330382':1,'331002':1,'331004':1,'331081':1,'331083':1,'331022':1,'330205':1,'330302':1};
/* 服务范围 adcode 前缀：温州 3303 / 台州 3310 / 宁波 3302 */
var SERVICE_PREFIX=['3303','3310','3302'];
var ADCODE_DIST={};for(var _k in AMAP_DIST)ADCODE_DIST[AMAP_DIST[_k]]=_k;
var AMAP_CACHE={};
function inService(lng,lat){return lng>=SERVICE_BBOX[0]&&lng<=SERVICE_BBOX[2]&&lat>=SERVICE_BBOX[1]&&lat<=SERVICE_BBOX[3];}
function amapGet(path,params){
  var qs=[];for(var k in params)qs.push(k+'='+encodeURIComponent(params[k]));
  var url=AMAP_API+path+'?key='+encodeURIComponent(AMAP_KEY)+'&'+qs.join('&');
  if(AMAP_CACHE[url])return AMAP_CACHE[url];
  var p=new Promise(function(resolve){
    var ctl=(typeof AbortController!=='undefined')?new AbortController():null;
    var timer=setTimeout(function(){if(ctl)ctl.abort();},8000);
    fetch(url,{signal:ctl?ctl.signal:undefined}).then(function(r){return r.json();}).then(function(j){
      clearTimeout(timer);
      resolve((j&&String(j.status)==='1')?j:null);
    }).catch(function(){clearTimeout(timer);resolve(null);});
  });
  AMAP_CACHE[url]=p;return p;
}
/* 用户输入中出现的区县名 → adcode（用于结果区域校验，避免同名异地） */
function wantAdm(q){
  var t=normKey(q),best='',bs=-1;
  for(var k in AMAP_DIST){
    if(t.indexOf(k)<0)continue;
    var code=String(AMAP_DIST[k]);
    if(/00$/.test(code))continue;            /* 市级编码不作严格区县校验 */
    if(k.length>bs){bs=k.length;best=code;}  /* 取最长（最具体）匹配，如“三门”优先于“台州” */
  }
  return best;
}
/* 高德返回的区县全名 / 简称 → adcode（POI 接口常缺 adcode 字段，用 adname 兜底） */
function distCode(adname){
  var s2=normKey(String(adname==null?'':adname));
  if(!s2)return '';
  if(AMAP_DIST[s2])return AMAP_DIST[s2];
  var m=s2.match(/([\u4e00-\u9fa5]{2,3})(区|县|市)$/);
  if(m&&AMAP_DIST[m[1]])return AMAP_DIST[m[1]];
  return '';
}
function mkR(name,x,y,adcode,kind,lvl,tc){
  return {name:name,x:x,y:y,adcode:String(adcode||''),kind:kind,lvl:lvl||'',tc:String(tc||''),src:'amap',score:0,prec:'fine'};
}
function poiLevelName(p){
  var tc=String(p.typecode||''),ty=String(p.type||'');
  if(/^19040/.test(tc))return '门牌号';
  if(/^19030/.test(tc))return '道路';
  if(/^1901/.test(tc)||/^1902/.test(tc))return (ty.split(';').pop()||'行政地名');
  if(/公司|厂|工业|园区/.test(ty))return '企业/园区';
  return '兴趣点';
}
function amapGeocode(ctx){
  return Promise.all(ctx.cities.map(function(city){
    return amapGet('geocode/geo',{address:ctx.kw,city:city}).then(function(j){
      if(!j)return [];
      return (j.geocodes||[]).map(function(g){
        var c=String(g.location||'').split(',');if(c.length<2)return null;
        return mkR(g.formatted_address||ctx.kw,+c[0],+c[1],g.adcode||'',
                   '高德 · 地理编码 · '+((g.level&&g.level!=='[]')?g.level:'地址'),g.level,g.typecode);
      }).filter(Boolean);
    });
  })).then(function(a){return [].concat.apply([],a);});
}
function amapTips(ctx){
  return Promise.all(ctx.cities.map(function(city){
    return amapGet('assistant/inputtips',{keywords:ctx.kw,city:city,citylimit:'true',datatype:'all'});
  })).then(function(arr){
    var out=[];
    arr.forEach(function(j){
      if(!j)return;
      (j.tips||[]).forEach(function(t){
        var loc=String(t.location||'');if(loc.indexOf(',')<0)return;
        var c=loc.split(','), nm=t.name||ctx.kw;
        var ad=(typeof t.address==='string')?t.address:'';
        if(ad&&ad.length<=20&&normKey(nm).indexOf(normKey(ad))<0)nm+='（'+ad+'）';
        out.push(mkR(nm,+c[0],+c[1],t.adcode||distCode(t.district)||'','高德 · 输入提示','',t.typecode));
      });
    });
    return out;
  });
}
function amapPoi(ctx){
  return Promise.all(ctx.cities.map(function(city){
    return amapGet('place/text',{keywords:ctx.kw,city:city,citylimit:'true',offset:'10',page:'1',extensions:'base'});
  })).then(function(arr){
    var out=[];
    arr.forEach(function(j){
      if(!j)return;
      (j.pois||[]).forEach(function(p){
        var c=String(p.location||'').split(',');if(c.length<2)return;
        var nm=p.name||ctx.kw, ad=(typeof p.address==='string')?p.address:'';
        if(ad&&ad.length<=20&&normKey(nm).indexOf(normKey(ad))<0)nm+='（'+ad+'）';
        var lv=poiLevelName(p);
        out.push(mkR(nm,+c[0],+c[1],p.adcode||distCode(p.adname)||distCode(p.cityname)||'','高德 · 兴趣点 · '+lv,lv,p.typecode));
      });
    });
    return out;
  });
}
function amapLevelScore(r){
  var lv=String(r.lvl||''),tc=r.tc;
  if(/门牌|门址/.test(lv)||/^19040/.test(tc))return 55;
  if(/^19030[12]/.test(tc))return 30;
  if(/^1903/.test(tc))return 26;
  if(/兴趣点|企业/.test(lv))return 46;
  if(/^190[12]/.test(tc)||/乡镇|街道|区县|城市/.test(lv))return 12;
  return 34;
}
function houseNo(t){
  var all=String(t||'').match(/[0-9]{1,5}\s*号(?!楼|幢|室)/g)||[];
  if(!all.length)return '';
  return (all[all.length-1].match(/[0-9]{1,5}/)||[''])[0];
}
function scoreAmap(r,ctx){
  r.score=amapLevelScore(r);
  var nm=normKey(r.name), sim=ctx.kwc?lcsLen(nm,ctx.kwc)/ctx.kwc.length:0;
  r.score+=Math.round(sim*30);
  if(ctx.kwc){
    if(nm===ctx.kwc)r.score+=26;
    else if(nm.indexOf(ctx.kwc)===0)r.score+=10;
  }
  /* 附属设施（停车位/出入口/站点等）降权，避免压过本体地名 */
  if(/停车(位|场)|出入口|东南门|西北门|东门|南门|地铁|公交|站台|收费站/.test(r.name))r.score-=18;
  var d=r.adcode.slice(0,6), dn=ADCODE_DIST[d]||'';
  var inWZ=(d.length===6)?(SERVICE_PREFIX.indexOf(d.slice(0,4))>=0):inService(r.x,r.y);
  if(!inWZ){r.score-=160;r.kind+=' ⚠超出服务范围';}
  else if(ctx.wantAdm){
    if(d===ctx.wantAdm){r.score+=60;if(dn)r.kind+=' · '+dn;}
    else if(!d){r.kind+=' · 区域待核';}          /* 无编码信息时不做区域否定 */
    else{r.score-=30;r.kind+=' ⚠区域不符'+(dn?'（'+dn+'）':'');}
  }else{
    if(PRIORITY_ADCODE[d])r.score+=25;   /* 在招厂区所在区域优先 */
    if(dn)r.kind+=' · '+dn;
  }
  /* 门牌近似提示：输入 575 号却只解析到 418 号时明确告知，避免误判为精确门牌 */
  if(ctx.hn){
    var rh=houseNo(r.name);
    if(rh&&rh!==ctx.hn)r.kind+=' · 邻近门牌';
  }
  return r;
}

/* ==================== 在线检索 · Photon / OSM（兜底，坐标已纠偏） ==================== */
var TYPE_CN={house:'门牌级',street:'道路',city:'城市',district:'区县',locality:'地名',other:'地点'};
function lcsLen(a,b){var m=0;for(var i=0;i<a.length;i++)for(var j=i+1;j<=a.length;j++){if(j-i>m&&b.indexOf(a.slice(i,j))>=0)m=j-i;}return m;}
var GEO_CACHE={}, WZ_BOX='120.30,27.20,121.85,30.10';
function photonSearch(kw){
  if(GEO_CACHE[kw])return Promise.resolve(GEO_CACHE[kw]);
  return new Promise(function(resolve){
    var url='https://photon.komoot.io/api/?q='+encodeURIComponent(kw)+
      '&limit=8&lang=zh&lat=28.60&lon=121.05&zoom=12&location_bias_scale=0.3&bbox='+WZ_BOX;
    var ctl=(typeof AbortController!=='undefined')?new AbortController():null;
    var timer=setTimeout(function(){if(ctl)ctl.abort();},9000);
    fetch(url,{signal:ctl?ctl.signal:undefined}).then(function(r){return r.json();}).then(function(j){
      clearTimeout(timer);
      var fs=(j&&j.features)||[], out=[], kwc=normKey(kw);
      fs.forEach(function(f){
        var pr=f.properties||{}, c=(f.geometry&&f.geometry.coordinates)||[];
        if(c.length<2)return;
        var nm=pr.name||pr.street||kw;
        var sim=kwc?lcsLen(nm,kwc)/kwc.length:0;
        if(kwc.length>=3&&sim<0.34)return;
        var g=wgs2gcj(c[0],c[1]);
        var good=inService(c[0],c[1]);
        var st=(pr.street&&nm.indexOf(pr.street)<0&&pr.street.length<=10)?pr.street:'';
        var area=[st,pr.city||''].filter(Boolean).join(' ');
        out.push({name:nm+(area?'（'+area+'）':''),x:g[0],y:g[1],src:'photon',adcode:'',
                  kind:'在线解析 · '+((TYPE_CN[pr.type]||'地点'))+(good?'':' ⚠超出服务范围'),
                  score:(good?22:0)+Math.round(sim*25)+(pr.type==='house'?30:(pr.type==='street'?16:8))});
      });
      out.sort(function(a,b){return b.score-a.score;});
      GEO_CACHE[kw]=out;
      resolve(out);
    }).catch(function(){clearTimeout(timer);resolve(null);});
  });
}
/* 检索词降级：整串 → 去省 → 去市 → 行政区+核心 → 核心地名 */
function variants(q){
  var v=[],seen={},s=normKey(q);
  function push(x){x=String(x||'').trim();if(x&&x.length>=2&&!seen[x]){seen[x]=1;v.push(x);}}
  push(s);
  var t=s.replace(/^浙江省?/,'');
  if(t!==s)push(t);
  var core=t,adm=[],m,guard=0;
  while(guard++<4){
    m=core.match(/^[\u4e00-\u9fa5]{2,8}?(省|市|区|县|镇|街道|乡)/);
    if(!m)break;
    core=core.slice(m[0].length);
    if(core.length<2)break;
    adm.push(m[0]);
  }
  var coreNo=core.replace(/[0-9０-９]+号?.*$/,'');
  if(adm.length)push(adm.join('')+' '+coreNo);
  push(coreNo||core);
  if(m=t.match(/[\u4e00-\u9fa5]{2,8}(工业园|工业区|开发区|园区|基地|新区|新城)/))push(m[0]);
  if(m=t.match(/[\u4e00-\u9fa5]{2,8}(路|大道|街|巷)/))push(m[0]);
  if(m=t.match(/[\u4e00-\u9fa5]{2,8}(村|社区)/))push(m[0]);
  return v.slice(0,6);
}

/* ==================== 候选渲染 / 检索主流程 ==================== */
var lastSug=[], sugTimer=null, seq=0;
function dedupe(arr){
  var seen={},out=[];
  arr.forEach(function(r){
    var k=normKey(r.name)+'|'+Number(r.x).toFixed(4)+'|'+Number(r.y).toFixed(4);
    if(seen[k])return;seen[k]=1;out.push(r);
  });
  return out;
}
function renderSug(out){
  var el=$('sug'),html='',list=[];
  var amap=out.amap||[], ph=(out.photon||[]).slice(0,5), loc=out.local||[];
  function rows(arr){
    return arr.map(function(s){
      list.push(s);var i=list.length-1;
      var cls=(s.src==='amap'||s.src==='photon')?'k src-o':'k';
      if(/⚠/.test(s.kind))cls='k src-warn';
      return '<div class="s-it" data-i="'+i+'"><span class="nm">'+esc(s.name)+'</span><span class="'+cls+'">'+esc(s.kind)+'</span></div>';
    }).join('');
  }
  if(amap.length)html+='<div class="s-hd">高德检索（首选 · 门牌/POI 级）</div>'+rows(amap);
  if(ph.length)html+='<div class="s-hd">Photon 在线解析（兜底）</div>'+rows(ph);
  if(loc.length)html+='<div class="s-hd">本地库 / 常用点（离线命中）</div>'+rows(loc);
  if(out.pending)html+='<div class="s-hd">检索中…</div>';
  if(!html){el.className='sug';el.innerHTML='';lastSug=[];return;}
  el.innerHTML=html;el.className='sug on';lastSug=list;
  Array.prototype.forEach.call(el.querySelectorAll('.s-it'),function(d){
    d.onclick=function(){
      var s=lastSug[+d.getAttribute('data-i')];if(!s)return;
      $('q').value=s.name;
      setOrigin(s.y,s.x,s.name,s.kind,s.src);
      map.setView([s.y,s.x],Math.max(map.getZoom(),15));
    };
  });
}
function runSearch(q,cb){
  var my=++seq;
  var local=localSearch(q);
  var ctx={kw:q,kwc:normKey(q),wantAdm:wantAdm(q),hn:houseNo(q),cities:cityCodes(q)};
  var out={local:local,amap:[],photon:[],pending:true,q:q};
  renderSug(out);
  function finish(err){
    if(my!==seq)return;
    out.pending=false;out.err=err||'';
    out.amap=dedupe(out.amap).sort(function(a,b){return b.score-a.score;}).slice(0,8);
    out.photon=dedupe(out.photon).sort(function(a,b){return b.score-a.score;});
    renderSug(out);
    if(!out.amap.length&&!out.photon.length&&!out.local.length){
      $('originInfo').className='origin on';
      $('originInfo').innerHTML='未匹配到「'+esc(q)+'」。'+(err?('原因：'+esc(err)+'。'):'')+
        '可换用镇街/园区/村名，或直接点击地图取点（可用「★ 存为常用点」固定）。';
    }
    if(cb)cb(out);
  }
  function photonFlow(){
    var vs=variants(q), idx=0, tried=0;
    function step(){
      if(my!==seq)return;
      if(idx>=vs.length||tried>=3){setNet(out.photon.length?'photon':'fail');finish(out.photon.length?'':'在线检索不可用');return;}
      var kw=vs[idx++];tried++;
      photonSearch(kw).then(function(res){
        if(my!==seq)return;
        if(res===null){setNet('fail');finish('Photon 请求失败');return;}
        out.photon=out.photon.concat(res);
        if(out.photon.length)  {setNet('photon');finish();}
        else step();
      });
    }
    step();
  }
  if(!AMAP_KEY){setNet('photon');photonFlow();return;}
  Promise.all([amapGeocode(ctx),amapTips(ctx)]).then(function(arr){
    if(my!==seq)return;
    var rs=(arr[0]||[]).concat(arr[1]||[]);
    rs.forEach(function(r){scoreAmap(r,ctx);});
    out.amap=out.amap.concat(rs);
    var hi=false;
    rs.forEach(function(r){if(r.score>=95)hi=true;});
    if(hi){
      setNet('amap');
      if(ctx.kwc.length>=2)finish();
      else finish();
      return;
    }
    amapPoi(ctx).then(function(more){
      if(my!==seq)return;
      more.forEach(function(r){scoreAmap(r,ctx);});
      out.amap=out.amap.concat(more);
      if(out.amap.length){setNet('amap');finish();}
      else{photonFlow();}
    });
  }).catch(function(){
    if(my!==seq)return;
    photonFlow();
  });
}
function setNet(st){
  var el=$('netBadge');
  el.title='点击可设置/更换高德 Web服务 Key（保存在本机浏览器）';
  if(st==='amap'){el.textContent='检索源：高德（门牌级）';el.className='badge btn on';}
  else if(st==='photon'){el.textContent='检索源：Photon（兜底）';el.className='badge btn busy';}
  else if(st==='fail'){el.textContent='在线检索：不可用';el.className='badge btn off';}
  else {el.textContent='检索中…';el.className='badge btn busy';}
}
/* ==================== 地址分享 ==================== */
function jobById(id){for(var i=0;i<JOBS.length;i++){if(JOBS[i].id===id)return JOBS[i];}return null;}
function amapUrl(j){return 'https://uri.amap.com/marker?position='+j.lng+','+j.lat+'&name='+encodeURIComponent(j.name)+'&src=marvis&coordinate=gaode&callnative=1';}
/* 微信/手机点开直接显示位置的链接：高德网页分享页（callnative=0，不唤起 App，微信内可直接打开） */
function wxUrl(j){return 'https://uri.amap.com/marker?position='+j.lng+','+j.lat+'&name='+encodeURIComponent(j.name)+'&src=marvis&coordinate=gaode&callnative=0';}
function tencentUrl(j){return 'https://apis.map.qq.com/uri/v1/marker?marker=coord:'+j.lat+','+j.lng+';title:'+encodeURIComponent(j.name)+';addr:'+encodeURIComponent(locOf(j))+'&referer=marvis';}
function locOf(j){
  if(j.addr)return j.addr;
  if(j.detail){for(var i=0;i<j.detail.length;i++){if(j.detail[i][0]==='位置')return j.detail[i][1];}}
  return '';
}
function addrText(j){
  var t='【厂区】'+j.name;
  var ad=locOf(j);
  if(ad)t+='\n【厂址】'+ad;
  t+='\n【坐标】'+j.lng.toFixed(4)+', '+j.lat.toFixed(4)+'（GCJ-02，已按厂址在高德核对；个别为园区/道路级近似点，请以厂门实际位置为准）';
  t+='\n【微信/手机点开看位置】'+wxUrl(j);
  t+='\n【高德App打开】'+amapUrl(j);
  return t;
}
function copyText(t,msg){
  var tip=msg||'地址已复制，可直接粘贴分享';
  function fb(){
    try{var ta=document.createElement('textarea');ta.value=t;ta.style.position='fixed';ta.style.left='-9999px';document.body.appendChild(ta);ta.select();document.execCommand('copy');document.body.removeChild(ta);toast(tip);}
    catch(e2){toast('复制失败，请手动选中文本');}
  }
  try{
    if(navigator.clipboard&&window.isSecureContext){navigator.clipboard.writeText(t).then(function(){toast(tip);},fb);}
    else fb();
  }catch(e){fb();}
}
function shareAddr(id,type){
  var j=jobById(id);if(!j)return;
  if(j.lat==null){toast('该厂厂址待补，暂无法分享位置');return;}
  if(type==='copy'){copyText(addrText(j));return;}
  if(type==='wx'){copyText(addrText(j),'微信链接已复制，粘到微信点开即可看到位置');return;}
  if(type==='amap'){window.open(amapUrl(j),'_blank');return;}
  if(type==='tencent'){window.open(tencentUrl(j),'_blank');return;}
  if(type==='share'){
    var t=addrText(j);
    if(navigator.share){navigator.share({title:j.name+' 厂址',text:t}).catch(function(){});}
    else{copyText(t);}
    return;
  }
}
/* 页面脚本整体在 IIFE 内，需挂到 window 才能被弹窗内联 onclick 调用 */
window.shareAddr=shareAddr;

/* ==================== 起点 / 地图 / 列表 ==================== */
function popupHtml(j){
  var h='<div class="pp"><div class="pp-t"><b>'+esc(j.name)+'</b><span class="tag" style="background:'+(COLORS[j.region]||'#666')+'">'+esc(j.region)+' · 第'+j.no+'号</span></div>';
  var ad=locOf(j);
  if(ad)h+='<div class="pp-a">厂址：'+esc(ad)+'</div>';
  h+='<div class="pp-kv">';
  [['需求',j.headcount],['岗位',j.jobs],['年龄',j.age],['薪资',j.pay],['发薪日',j.payday]].forEach(function(kv){
    if(kv[1])h+='<div class="k">'+kv[0]+'</div><div>'+esc(kv[1])+'</div>';});
  h+='</div>';
  if(j.detail&&j.detail.length){h+='<div class="pp-d">';j.detail.forEach(function(f){
    h+='<div class="pp-dr"><span>'+esc(f[0])+'</span><div>'+esc(f[1])+'</div></div>';});h+='</div>';}
  if(origin)h+='<div class="pp-dist">距起点「'+esc(origin.name)+'」直线 '+fmt(dist([origin.lat,origin.lng],[j.lat,j.lng]))+'</div>';
  h+='<div class="pp-share">';
  h+='<button class="sbtn pri" onclick="shareAddr(\''+j.id+'\',\'copy\')">复制地址</button>';
  h+='<button class="sbtn" onclick="shareAddr(\''+j.id+'\',\'share\')">分享地址</button>';
  h+='<button class="sbtn" onclick="shareAddr(\''+j.id+'\',\'wx\')">微信链接</button>';
  h+='<button class="sbtn" onclick="shareAddr(\''+j.id+'\',\'amap\')">高德打开</button>';
  h+='<button class="sbtn" onclick="shareAddr(\''+j.id+'\',\'tencent\')">腾讯打开</button>';
  h+='</div>';
  h+='</div>';
  return h;
}

JOBS.forEach(function(j){
  var c=COLORS[j.region]||'#495057';
  var m=L.marker([j.lat,j.lng],{icon:L.divIcon({className:'pinwrap',html:'<div class="pin" style="background:'+c+'">'+j.no+'</div>',iconSize:[24,24],iconAnchor:[12,12],popupAnchor:[0,-12]})});
  m.bindPopup(function(){return popupHtml(j);},{maxWidth:360,minWidth:290,autoPan:true});
  m.on('click',function(){activeId=j.id;markActive();});
  m.jid=j.id;
  pinMarkers[j.id]=m;
});
map.on('click',function(e){
  setOrigin(e.latlng.lat,e.latlng.lng,'地图选点 '+e.latlng.lat.toFixed(4)+','+e.latlng.lng.toFixed(4),'手动点选','pick');
});

function refreshPins(){
  pinLayer.clearLayers();
  JOBS.forEach(function(j){if(show[j.region]&&isOn(j))pinMarkers[j.id].addTo(pinLayer);});
}
function drawOrigin(){
  if(originMarker){map.removeLayer(originMarker);originMarker=null;}
  if(!origin)return;
  var isSug=origin.src==='local'||origin.src==='online'||origin.src==='custom';
  originMarker=L.marker([origin.lat,origin.lng],{icon:L.divIcon({className:'pinwrap',html:'<div class="pin-o"></div>',iconSize:[18,18],iconAnchor:[9,9]})}).addTo(map);
  originMarker.bindPopup('<div class="pp"><b>起点：'+esc(origin.name)+'</b><div class="pp-a">'+origin.lat.toFixed(4)+', '+origin.lng.toFixed(4)+'（'+esc(origin.kind||'')+'）</div></div>').openPopup();
  lineLayer.clearLayers();
  var arr=JOBS.filter(function(j){return show[j.region]&&isOn(j);}).map(function(j){return {j:j,d:dist([origin.lat,origin.lng],[j.lat,j.lng])};}).sort(function(a,b){return a.d-b.d;});
  arr.slice(0,12).forEach(function(o){
    L.polyline([[origin.lat,origin.lng],[o.j.lat,o.j.lng]],{color:'#1c7ed6',weight:1.2,opacity:.55,dashArray:'4,4'}).addTo(lineLayer);
  });
  return arr;
}
function setOrigin(lat,lng,name,kind,src){
  origin={lat:lat,lng:lng,name:name,kind:kind||'',src:src||'pick'};
  var el=$('originInfo');
  el.className='origin on';
  el.innerHTML='起点：<b>'+esc(name)+'</b>　<span style="font-weight:400;font-size:11.5px">'+esc(kind||'')+'</span><br>'+lat.toFixed(5)+', '+lng.toFixed(5)+
    '<div class="ops"><span class="save" id="savePt">★ 存为常用点</span><span class="clr" id="clrOrigin">清除起点</span></div>';
  $('savePt').onclick=function(){
    for(var i=0;i<CUSTOM.length;i++){if(normKey(CUSTOM[i].n)===normKey(name)){toast('该常用点已存在');return;}}
    CUSTOM.push({n:name,x:lng,y:lat,kind:kind||'常用点'});saveCustom();toast('已存为常用点：'+name);
  };
  $('clrOrigin').onclick=function(){origin=null;lineLayer.clearLayers();if(originMarker){map.removeLayer(originMarker);originMarker=null;}$('originInfo').className='origin';$('originInfo').innerHTML='';renderList();};
  drawOrigin();
  renderList();
  $('sug').className='sug';
}
function markActive(){
  Array.prototype.forEach.call(document.querySelectorAll('.item'),function(el){
    var id=el.getAttribute('data-id'), j=null;
    for(var i=0;i<ALL.length;i++)if(ALL[i].id===id){j=ALL[i];break;}
    el.className='item'+(id===activeId?' act':'')+((j&&j.lng!=null&&!isOn(j))?' off':'');});
}
function passFilter(j){
  var q=($('qj')?$('qj').value:'').replace(/\s+/g,'').toLowerCase();
  if(!q)return true;
  var hay=(j.name+' '+(j.region||'')+' '+(j.jobs||'')+' '+(j.headcount||'')+' '+(j.pay||'')+' '+(locOf(j)||'')).toLowerCase();
  return hay.indexOf(q)>=0;
}
function updatePickCnt(){
  var on=JOBS.filter(isOn).length,tot=JOBS.length,off=tot-on;
  var el=$('pickCnt');
  if(!el)return;
  el.textContent='已选 '+on+'/'+tot+(off?'（排除 '+off+'）':'');
  el.style.color=off?'#e8590c':'';
  el.style.borderColor=off?'#f6c99a':'';
}
function bindList(){
  Array.prototype.forEach.call(document.querySelectorAll('#list .item'),function(el){
    var id=el.getAttribute('data-id');
    var cb=el.querySelector('.jl');
    if(cb){
      cb.onclick=function(ev){ev.stopPropagation();};
      cb.onchange=function(){
        incl[id]=cb.checked;saveIncl();
        refreshPins();drawOrigin();renderList();
        toast(cb.checked?('已恢复：'+nameOf(id)+'（重新参与筛选）'):('已取消勾选：'+nameOf(id)+'（不参与地图标注与距离筛选）'));
      };
    }
    el.onclick=function(){
      var j=null;
      for(var i=0;i<ALL.length;i++)if(ALL[i].id===id){j=ALL[i];break;}
      if(!j||j.lng==null){alert('该厂厂址原文空缺，暂无法在地图定位。');return;}
      if(!isOn(j)){toast('「'+j.name+'」已取消勾选，不参与筛选；如需查看请先勾选复选框');return;}
      activeId=id;markActive();
      map.setView([j.lat,j.lng],Math.max(map.getZoom(),13));
      pinMarkers[j.id].openPopup();
    };
  });
}
function nameOf(id){for(var i=0;i<ALL.length;i++)if(ALL[i].id===id)return ALL[i].name;return id;}
function renderList(){
  var arr=JOBS.filter(function(j){return show[j.region]&&passFilter(j);}).map(function(j){
    return {j:j,d:origin?dist([origin.lat,origin.lng],[j.lat,j.lng]):null,on:isOn(j)};});
  arr.sort(function(a,b){
    if(a.on!==b.on)return a.on?-1:1;
    if(origin&&a.d!=null&&b.d!=null)return a.d-b.d;
    return (a.j.region===b.j.region)?(a.j.no-b.j.no):(a.j.region<b.j.region?-1:1);
  });
  var h='';
  arr.forEach(function(o){
    var j=o.j,c=COLORS[j.region]||'#495057';
    h+='<div class="item'+(activeId===j.id?' act':'')+(o.on?'':' off')+'" data-id="'+esc(j.id)+'"><div class="i-h">'+
       '<input type="checkbox" class="jl" data-id="'+esc(j.id)+'"'+(o.on?' checked':'')+' title="勾选=参与地图标注与距离筛选">'+
       '<span class="dot" style="background:'+c+'"></span><b>'+esc(j.name)+'</b>'+
       (o.on&&o.d!=null?'<span class="i-d">'+fmt(o.d)+'</span>':'')+'</div>'+
       '<div class="i-sub">'+esc(j.region)+' · '+esc(j.headcount||'')+(j.jobs?' · '+esc(j.jobs):'')+(o.on?'':' · 已取消勾选，不参与筛选')+'</div></div>';
  });
  MISS.filter(passFilter).forEach(function(j){
    h+='<div class="item" data-id="'+esc(j.id)+'"><div class="i-h"><span class="dot" style="background:#b0772a"></span><b>'+esc(j.name)+'</b></div><div class="i-sub miss">厂址待补，暂无法定位 · '+esc(j.headcount||'')+' · '+esc(j.jobs||'')+'</div></div>';
  });
  var lst=$('list'), st=lst.scrollTop;
  lst.innerHTML=h;
  lst.scrollTop=st;
  $('cnt').textContent='（'+arr.length+(MISS.length?' + 待定位 '+MISS.length:'')+'）';
  updatePickCnt();
  bindList();
}
function renderFilters(){
  var h='';
  var _regions=(function(){var seen={},out=[];(D.meta.batches||[]).forEach(function(b){if(b.region&&!seen[b.region]){seen[b.region]=1;out.push(b.region);}});
   (D.jobs||[]).forEach(function(j){if(j.region&&!seen[j.region]){seen[j.region]=1;out.push(j.region);}});return out;})();
  _regions.forEach(function(r){
    var n=JOBS.filter(function(j){return j.region===r;}).length;
    h+='<label><input type="checkbox" checked data-r="'+r+'"><span class="dot" style="background:'+COLORS[r]+'"></span>'+r+'批次（'+n+'）</label>';
  });
  $('filters').innerHTML=h;
  Array.prototype.forEach.call($('filters').querySelectorAll('input'),function(cb){
    cb.onchange=function(){show[cb.getAttribute('data-r')]=cb.checked;refreshPins();drawOrigin();renderList();};
  });
}

/* ==================== 输入交互 ==================== */
$('q').oninput=function(){clearTimeout(sugTimer);sugTimer=setTimeout(function(){runSearch($('q').value);},320);};
$('q').onkeydown=function(e){if(e.key==='Enter'){$('btnGo').click();}}
$('btnGo').onclick=function(){
  var q=$('q').value;if(!q.trim())return;
  runSearch(q,function(out){
    var best=(out.amap&&out.amap[0])||(out.photon&&out.photon[0])||(out.local&&out.local[0]);
    if(!best)return;
    setOrigin(best.y,best.x,best.name,best.kind,best.src);
    map.setView([best.y,best.x],Math.max(map.getZoom(),15));
  });
};
document.addEventListener('click',function(e){if(!$('sug').contains(e.target)&&e.target!==$('q'))$('sug').className='sug';});

$('qj').oninput=function(){renderList();};
$('pickAll').onclick=function(){
  var ids={};JOBS.forEach(function(j){incl[j.id]=true;});
  saveIncl();refreshPins();drawOrigin();renderList();toast('已恢复全部 '+JOBS.length+' 家（全部参与筛选）');
};
$('pickNone').onclick=function(){
  JOBS.forEach(function(j){incl[j.id]=false;});
  saveIncl();refreshPins();drawOrigin();renderList();toast('已取消全部勾选；点「全选」可一键恢复');
};
/* ==================== 在线数据更新 ==================== */
function setUpd(cls,txt){var b=$('updBadge');b.className='badge btn'+(cls?' '+cls:'');b.textContent=txt;}
function updGen(d){return String((d&&d.meta&&d.meta.generated)||(d&&d.generated)||'');}
function storeUpdate(d){try{localStorage.setItem(OV_KEY,JSON.stringify({generated:updGen(d),data:d}));return true;}catch(e){return false;}}
function parseUpd(t){
  if(!t)return null;
  var m=t.match(/window\.JOBS_UPDATE\s*=\s*([\s\S]*?);?\s*$/);
  var o=null;try{o=JSON.parse(m?m[1]:t);}catch(e){o=null;}
  return (o&&o.jobs)?o:null;
}
function fetchUpd(url,cb){
  var u=url+(url.indexOf('?')<0?'?':'&')+'t='+Date.now();
  try{
    fetch(u).then(function(r){return r.text();}).then(function(t){cb(parseUpd(t));}).catch(function(){cb(null);});
  }catch(e){cb(null);}
}
function applyUpd(d){
  if(storeUpdate(d)){toast('已获取新数据，正在刷新…');setTimeout(function(){location.reload();},600);}
  else{toast('无法保存更新数据（浏览器存储不可用）');}
}
function gotUpd(d,auto){
  var ng=updGen(d);
  if(!d||!d.jobs||!ng){setUpd('',OV_APPLIED?'已在线更新':'检查更新');
    if(!auto)toast('检查更新失败：更新地址不可用或返回内容无法识别');return;}
  var base=(D.meta&&D.meta.generated)||'';
  if(base&&ng<=String(base)){setUpd('on','已是最新');
    if(!auto)toast('已是最新数据（'+base+'）');return;}
  setUpd('busy','发现新数据');
  if(auto){toast('发现新数据（'+ng+'），点「发现新数据」按钮可立即应用');return;}
  if(confirm('发现新数据：\n  新版本：'+ng+'\n  当前版本：'+(base||'未知')+'\n\n是否立即更新？（本机勾选状态会按新数据重置为全选）'))applyUpd(d);
}
function checkUpdate(auto){
  if(!UPD_URL){if(!auto)alert('本文件未配置在线更新地址。\n\n当前数据版本：'+((D.meta&&D.meta.generated)||'-')
    +'\n更新方式：请向提供方索取最新版地图文件，直接覆盖本文件（保持文件名不变）即可。\n'
    +'（若同一台电脑上有多份地图文件，只有承载最新内置数据的那个文件会生效）');return;}
  setUpd('busy','检查中…');
  var u=UPD_URL+(UPD_URL.indexOf('?')<0?'?':'&')+'t='+Date.now(),done=false;
  var fin=function(d){if(done)return;done=true;gotUpd(d,auto);};
  window.JOBS_UPDATE=null;
  var sc=document.createElement('script');
  sc.src=u;
  sc.onload=function(){ if(window.JOBS_UPDATE&&window.JOBS_UPDATE.jobs)fin(window.JOBS_UPDATE); else fetchUpd(UPD_URL,fin); };
  sc.onerror=function(){ fetchUpd(UPD_URL,fin); };
  document.head.appendChild(sc);
  setTimeout(function(){if(!done)fetchUpd(UPD_URL,fin);},9000);
}
$('updBadge').onclick=function(){
  if(OV_APPLIED){
    if(confirm('当前显示的是在线更新数据（'+(OV_APPLIED)+'）。\n\n是否清除在线更新缓存，恢复为文件内置数据（'+((D.meta&&D.meta.generated)||'-')+'）？')){
      try{localStorage.removeItem(OV_KEY);}catch(e){}
      toast('已清除在线更新缓存，正在刷新…');setTimeout(function(){location.reload();},600);
    }
    return;
  }
  checkUpdate(false);
};
setUpd(OV_APPLIED?'on':'',OV_APPLIED?'已在线更新':'检查更新');
if(UPD_URL)setTimeout(function(){if(!OV_APPLIED)checkUpdate(true);},3500);

applyBase();map.fitBounds(B,{maxZoom:13});
renderFilters();refreshPins();renderList();
setNet(AMAP_KEY?'amap':'photon');
})();
