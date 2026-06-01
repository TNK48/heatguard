/* ═══════════════════════════════════════════════════
   HEAT GUARD  –  app.js
   GPS + Open-Meteo API + Claude AI (mock/live切替)
   ═══════════════════════════════════════════════════ */

'use strict';

// ── WBGT 計算 ────────────────────────────────────────
function calcWetBulb(Ta, RH) {
  return Ta * Math.atan(0.151977 * Math.pow(RH + 8.313659, 0.5))
       + Math.atan(Ta + RH)
       - Math.atan(RH - 1.676331)
       + 0.00391838 * Math.pow(RH, 1.5) * Math.atan(0.023101 * RH)
       - 4.686035;
}
function calcWBGT(Ta, RH, solar = 400) {
  const Tw = calcWetBulb(Ta, RH);
  const Tg = Ta + 2.0 * Math.pow(solar / 800, 0.25);
  return 0.7 * Tw + 0.2 * Tg + 0.1 * Ta;
}

// ── リスク定義 ─────────────────────────────────────
const RISKS = [
  { max:21,       label:'ほぼ安全', en:'SAFE',       color:'#4ade80', alpha:'rgba(74,222,128,', icon:'☀️', pulse:false },
  { max:25,       label:'注意',     en:'CAUTION',    color:'#facc15', alpha:'rgba(250,204,21,', icon:'⚠️', pulse:false },
  { max:28,       label:'警戒',     en:'WARNING',    color:'#fb923c', alpha:'rgba(251,146,60,', icon:'🔶', pulse:true  },
  { max:31,       label:'厳重警戒', en:'HIGH ALERT', color:'#f87171', alpha:'rgba(248,113,113,',icon:'🚨', pulse:true  },
  { max:Infinity, label:'危険',     en:'DANGER',     color:'#ff3333', alpha:'rgba(255,51,51,',  icon:'💀', pulse:true  },
];
function getRisk(w) { return RISKS.find(r => w < r.max) || RISKS[4]; }

// ── 作業強度定義 ──────────────────────────────────
const WORKS = [
  { id:'rest',     label:'安静',   icon:'🧘', break:60 },
  { id:'light',    label:'軽作業', icon:'🚶', break:45 },
  { id:'moderate', label:'中程度', icon:'🏗️', break:30 },
  { id:'heavy',    label:'重作業', icon:'⛏️', break:15 },
];

// ── プリセット地点（デモ用8月典型値） ─────────────
const PRESETS = [
  { id:'tpirc',   icon:'🌾', label:'T-PIRC農場',        sub:'筑波大学・茨城',  lat:36.107, lon:140.093,
    demo:{ temp:35.2, hum:72, solar:780, wind:1.8, app:41.0, code:1, note:'筑波8月昼（農場・開放地）' } },
  { id:'tsukuba', icon:'🏫', label:'筑波大 東京キャンパス', sub:'文京区大塚',      lat:35.718, lon:139.728,
    demo:{ temp:34.8, hum:68, solar:620, wind:2.1, app:39.5, code:1, note:'都市部・ビル街 8月昼' } },
  { id:'kanda',   icon:'🦝', label:'神田和泉町',           sub:'千代田区',        lat:35.694, lon:139.778,
    demo:{ temp:35.6, hum:70, solar:580, wind:1.5, app:41.8, code:0, note:'都心ヒートアイランド 8月昼' } },
  { id:'niosh',   icon:'🔬', label:'安衛研（登戸）',        sub:'川崎市多摩区',    lat:35.620, lon:139.567,
    demo:{ temp:34.5, hum:71, solar:650, wind:2.4, app:39.8, code:1, note:'川崎市 8月昼' } },
  { id:'osaka',   icon:'🏙️', label:'大阪・梅田',            sub:'都市部・西日本',  lat:34.702, lon:135.496,
    demo:{ temp:36.1, hum:74, solar:700, wind:1.2, app:43.2, code:0, note:'大阪ヒートアイランド 8月昼' } },
  { id:'naha',    icon:'🌺', label:'那覇',                  sub:'沖縄・亜熱帯',    lat:26.212, lon:127.679,
    demo:{ temp:33.8, hum:82, solar:850, wind:4.5, app:41.5, code:0, note:'沖縄8月・高湿度' } },
  { id:'sapporo', icon:'🐻', label:'札幌',                  sub:'北海道・意外と暑い',lat:43.062, lon:141.354,
    demo:{ temp:31.2, hum:58, solar:720, wind:3.2, app:33.8, code:1, note:'札幌8月 近年の猛暑日' } },
];

// ── 緊急対応ステップ ──────────────────────────────
const EMERGENCY_STEPS = [
  { icon:'🏠', title:'涼しい場所へ',   desc:'冷房の効いた室内か、風通しの良い日陰へすぐ移動。' },
  { icon:'👕', title:'衣服をゆるめる', desc:'首・脇・そけい部を冷やす。衣服は脱がせて皮膚を露出させる。' },
  { icon:'💧', title:'水分・塩分補給', desc:'意識があれば経口補水液か水＋塩。意識がなければ経口投与NG。' },
  { icon:'🧊', title:'体を冷やす',     desc:'首・脇の下・太ももの付け根に氷嚢。霧吹き＋うちわで蒸散冷却。' },
  { icon:'📞', title:'119番通報',      desc:'意識がない・けいれん・応答がおかしい場合は迷わず救急車。' },
];

// ── 天気コード→絵文字 ──────────────────────────
function weatherEmoji(c) {
  if (c === 0)  return '☀️';
  if (c <= 3)   return '⛅';
  if (c <= 49)  return '🌫️';
  if (c <= 67)  return '🌧️';
  if (c <= 77)  return '🌨️';
  if (c <= 82)  return '🌦️';
  return '⛈️';
}

// ── AI モックレスポンス ───────────────────────────
function mockAIResponse(userText, ctx) {
  const w = ctx.wbgt;
  const urgent = w >= 28 || /頭|痛|めまい|気分|倒|意識/.test(userText);
  if (urgent && w >= 28) {
    return `🚨 WBGT ${w.toFixed(1)}℃は${ctx.riskLabel}レベルです。すぐに日陰・冷所へ移動し、水分と塩分を補給してください。症状が続く場合は管理者に連絡を。`;
  }
  if (/頭|痛/.test(userText))    return `頭痛は熱中症のⅡ度サインです。今すぐ涼しい場所で安静にして、経口補水液を飲んでください。改善しない場合は医療機関へ。`;
  if (/めまい|くらくら/.test(userText)) return `めまいはⅠ度の症状です。すぐ日陰に移動して横になり、水分補給を。5分経っても改善しなければ管理者に連絡してください。`;
  if (/安全|大丈夫/.test(userText)) return `WBGT ${w.toFixed(1)}℃（${ctx.riskLabel}）・${ctx.workLabel}の条件です。${w >= 28 ? '⚠️ リスクが高い状態です。' + ctx.workBreak + '分ごとの休憩を厳守してください。' : '適切な休憩と水分補給（15〜20分に200ml）を続けてください。'}`;
  if (/水分|飲/.test(userText)) return `現在のWBGT（${w.toFixed(1)}℃）では、15〜20分ごとにコップ1杯（約200ml）が目安です。${w >= 28 ? '塩分（経口補水液）も忘れずに。' : 'のどが渇く前に飲むのがポイントです。'}`;
  return `WBGT ${w.toFixed(1)}℃・${ctx.riskLabel}・${ctx.workLabel}の状況を確認しました。${w >= 25 ? ctx.workBreak + '分ごとの休憩と定期的な水分補給を続けてください。' : '現在は比較的安全な状態です。引き続き体調に注意してください。'}`;
}

// ── Claude API 呼び出し ─────────────────────────
async function callClaudeAPI(messages, ctx) {
  const system = `あなたは熱中症対策の専門AIアシスタントです。
現在の状況:
- 地点: ${ctx.location}  WBGT: ${ctx.wbgt?.toFixed(1)}℃  リスク: ${ctx.riskLabel}
- 気温: ${ctx.temp}℃ / 湿度: ${ctx.hum}% / 日射量: ${ctx.solar}W/m²
- 作業強度: ${ctx.workLabel}  推奨休憩間隔: ${ctx.workBreak}分

【ルール】
- WBGT28℃以上・危険症状あり → 冒頭🚨で1文即答後に具体的行動
- 平常時 → 共感的に対話、具体的な数値と行動を伝える
- ISO 7243・厚労省WBGT指針準拠。「参考情報であり医療診断ではない」旨を必要に応じて記載
- 200文字以内、会話調を優先`;
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 1000, system, messages }),
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
  const data = await res.json();
  return data.content?.[0]?.text ?? '応答を取得できませんでした。';
}

// ══════════════════════════════════════════════════
//  App 本体
// ══════════════════════════════════════════════════
const App = (() => {
  // ── 状態 ──────────────────────────────────────
  let state = {
    temp: 35.2, hum: 72, solar: 780,
    wind: 1.8, appTemp: 41.0, weatherCode: 1,
    wbgt: 0,
    locationName: 'T-PIRC農場',
    activePresetId: 'tpirc',
    workId: 'moderate',
    workMinutes: 0,
    presetsOpen: false,
    aiMode: 'mock',        // 'mock' | 'live'
    chatHistory: [],       // {role, content}[]
    weatherInterval: null,
    workTimer: null,
    weatherNote: '',
  };

  // ── 保存済み地点（localStorage） ──────────────
  function getSaved() {
    try { return JSON.parse(localStorage.getItem('heatguard_locations') || '[]'); }
    catch { return []; }
  }
  function setSaved(arr) {
    localStorage.setItem('heatguard_locations', JSON.stringify(arr));
  }

  // ── 初期化 ─────────────────────────────────────
  function init() {
    buildWorkButtons();
    buildEmergencySteps();
    buildPresetList();
    buildSavedList();
    updateSliders();
    recalc();
    // チャット初期メッセージ
    appendAIMessage('こんにちは！熱中症対策AIです 👋\n現在 T-PIRC農場（筑波）のデモデータで動いています。\n地点を切り替えたり、症状を教えてください！');
    // 作業タイマー
    state.workTimer = setInterval(() => {
      state.workMinutes++;
      updateBreakTimer();
    }, 60000);
  }

  // ── 作業ボタン生成 ─────────────────────────────
  function buildWorkButtons() {
    const grid = document.getElementById('work-grid');
    grid.innerHTML = WORKS.map(w => `
      <button class="work-btn${w.id === state.workId ? ' active' : ''}"
        onclick="App.selectWork('${w.id}')">
        <span class="work-icon">${w.icon}</span>
        <span class="work-name">${w.label}</span>
        <span class="work-break">${w.break}分毎</span>
      </button>`).join('');
  }

  // ── 緊急ステップ生成 ──────────────────────────
  function buildEmergencySteps() {
    const el = document.getElementById('emergency-steps');
    el.innerHTML = EMERGENCY_STEPS.map((s, i) => `
      <div class="emergency-step" id="step-${i}" onclick="App.toggleStep(${i})">
        <div class="step-header">
          <div class="step-num">${i+1}</div>
          <span style="font-size:20px">${s.icon}</span>
          <div class="step-title">${s.title}</div>
          <span class="step-arrow">▼</span>
        </div>
        <div class="step-desc">${s.desc}</div>
      </div>`).join('');
  }

  // ── プリセットリスト生成 ─────────────────────
  function buildPresetList() {
    const el = document.getElementById('preset-list');
    el.innerHTML = PRESETS.map(p => `
      <button class="preset-item${state.activePresetId === p.id ? ' active' : ''}"
        id="preset-${p.id}" onclick="App.selectPreset('${p.id}')">
        <div class="preset-item-row">
          <span class="preset-icon">${p.icon}</span>
          <div>
            <div class="preset-name">${p.label}</div>
            <div class="preset-sub">${p.sub}</div>
          </div>
        </div>
      </button>`).join('');
  }

  // ── 保存済みリスト生成 ────────────────────────
  function buildSavedList() {
    const saved = getSaved();
    const sec = document.getElementById('saved-locations-section');
    const el  = document.getElementById('saved-list');
    if (!saved.length) { sec.classList.add('hidden'); return; }
    sec.classList.remove('hidden');
    el.innerHTML = saved.map((p, i) => `
      <button class="preset-item${state.activePresetId === 'saved_'+i ? ' active' : ''}"
        id="preset-saved_${i}" onclick="App.selectSaved(${i})">
        <div class="preset-item-row">
          <span class="preset-icon">📍</span>
          <div>
            <div class="preset-name">${p.name}</div>
            <div class="preset-sub">${p.lat.toFixed(3)}, ${p.lon.toFixed(3)}</div>
          </div>
          <button class="preset-del" onclick="event.stopPropagation();App.deleteSaved(${i})" title="削除">✕</button>
        </div>
      </button>`).join('');
  }

  // ── スライダー ────────────────────────────────
  function updateSliders() {
    document.getElementById('sl-temp').value  = state.temp;
    document.getElementById('sl-hum').value   = state.hum;
    document.getElementById('sl-solar').value = state.solar;
    document.getElementById('val-temp').textContent  = state.temp.toFixed(1) + '℃';
    document.getElementById('val-hum').textContent   = state.hum + '%';
    document.getElementById('val-solar').textContent = state.solar + ' W/m²';
  }

  function onSlider() {
    state.temp  = parseFloat(document.getElementById('sl-temp').value);
    state.hum   = parseInt(document.getElementById('sl-hum').value);
    state.solar = parseInt(document.getElementById('sl-solar').value);
    document.getElementById('val-temp').textContent  = state.temp.toFixed(1) + '℃';
    document.getElementById('val-hum').textContent   = state.hum + '%';
    document.getElementById('val-solar').textContent = state.solar + ' W/m²';
    recalc();
  }

  // ── WBGT再計算 → UI全更新 ─────────────────────
  function recalc() {
    state.wbgt = calcWBGT(state.temp, state.hum, state.solar);
    const risk = getRisk(state.wbgt);
    applyRiskTheme(risk);
    updateRiskCard(risk);
    updateWBGTBadge(risk);
    updateWeatherBar();
    updateRecommend(risk);
    updateChatContext(risk);
    updateBreakTimer();
  }

  function applyRiskTheme(risk) {
    document.documentElement.style.setProperty('--accent', risk.color);
    // 背景グロー
    document.body.style.setProperty('--accent', risk.color);
  }

  function updateWBGTBadge(risk) {
    document.getElementById('wbgt-value').textContent = state.wbgt.toFixed(1);
    document.getElementById('wbgt-value').style.color = risk.color;
    document.getElementById('wbgt-badge').style.borderColor = risk.color;
    document.getElementById('wbgt-badge').style.boxShadow = `0 0 30px ${risk.alpha}0.3)`;
    document.querySelector('.wbgt-unit').style.color = risk.color;
    // refresh btn
    document.getElementById('refresh-btn').style.borderColor = risk.color;
    document.getElementById('refresh-btn').style.color = risk.color;
  }

  function updateRiskCard(risk) {
    const card = document.getElementById('risk-card');
    card.style.borderColor = risk.color;
    card.style.background  = `${risk.alpha}0.1)`;
    card.style.boxShadow   = `0 0 50px ${risk.alpha}0.3)`;
    card.classList.toggle('pulsing', risk.pulse);
    document.getElementById('risk-icon').textContent     = risk.icon;
    document.getElementById('risk-label').textContent    = risk.label;
    document.getElementById('risk-label').style.color    = risk.color;
    document.getElementById('risk-label-en').textContent = risk.en;
  }

  function updateWeatherBar() {
    const bar = document.getElementById('weather-bar');
    if (!state.locationName || state.locationName === '地点を選択してください') {
      bar.classList.add('hidden'); return;
    }
    bar.classList.remove('hidden');
    document.getElementById('weather-emoji').textContent = weatherEmoji(state.weatherCode);
    document.getElementById('weather-temp').textContent  = state.temp.toFixed(1) + '℃';
    document.getElementById('weather-hum').textContent   = '💧' + state.hum + '%';
    document.getElementById('weather-solar').textContent = '☀️' + state.solar + 'W/m²';
    document.getElementById('weather-wind').textContent  = '💨' + (state.wind ?? '--') + 'm/s';
    document.getElementById('weather-note').textContent  = state.weatherNote ? '📋 ' + state.weatherNote : '';
  }

  function updateRecommend(risk) {
    const w    = state.wbgt;
    const work = WORKS.find(w => w.id === state.workId);
    const mtb  = Math.max(0, work.break - (state.workMinutes % work.break));
    const items = [];
    if (w >= 31)      items.push('🛑 作業を中断し、涼しい場所に避難してください');
    else if (w >= 28) items.push(`⏸️ ${mtb}分以内に休憩（日陰・冷所へ）`);
    else if (w >= 25) items.push(`⏱️ 次の休憩まで ${mtb}分`);
    else              items.push('✅ 通常通り作業できます');
    if (w >= 25) items.push('💧 15〜20分ごとにコップ1杯（200ml）の水');
    if (w >= 28) items.push('🧂 塩分補給も忘れずに（経口補水液推奨）');
    if (w >= 31) items.push('🧊 首・脇・太ももの付け根を冷やす');
    if (state.workId === 'heavy' && w >= 25) items.push('👕 透湿性の高い作業服・ヘルメット内換気を確認');

    const el = document.getElementById('recommend-list');
    el.innerHTML = items.map(t => `<div class="recommend-item">${t}</div>`).join('');
    // カードのボーダー色を更新
    document.getElementById('recommend-card').style.borderColor = risk.color + '60';
    document.getElementById('recommend-card').style.background  = `${risk.alpha}0.08)`;
  }

  function updateBreakTimer() {
    const work = WORKS.find(w => w.id === state.workId);
    const mtb  = Math.max(0, work.break - (state.workMinutes % work.break));
    const timer = document.getElementById('break-timer');
    const alert = document.getElementById('break-alert');
    const risk  = getRisk(state.wbgt);
    const needBreak = mtb === 0 || (state.wbgt > 28 && mtb < 5);
    if (needBreak && state.wbgt > 25) {
      timer.classList.add('hidden');
      alert.classList.remove('hidden');
    } else {
      alert.classList.add('hidden');
      timer.classList.remove('hidden');
      timer.textContent = `次の休憩まで ${mtb}分`;
      timer.style.color = risk.color;
    }
  }

  function updateChatContext(risk) {
    document.getElementById('ctx-wbgt').textContent  = `WBGT ${state.wbgt.toFixed(1)}℃`;
    document.getElementById('ctx-wbgt').style.color  = risk.color;
    const work = WORKS.find(w => w.id === state.workId);
    document.getElementById('ctx-work').textContent  = `${work.icon} ${work.label}`;
    document.getElementById('ctx-risk').textContent  = risk.label;
    document.getElementById('ctx-risk').style.color  = risk.color;
    // タブのアクティブ色
    document.querySelectorAll('.tab-btn.active').forEach(b => {
      b.style.color = risk.color;
      b.style.borderBottomColor = risk.color;
    });
  }

  // ── 地点プリセット選択 ────────────────────────
  function selectPreset(id) {
    const p = PRESETS.find(p => p.id === id);
    if (!p) return;
    setActivePreset(id);
    state.locationName = `${p.icon} ${p.label}`;
    document.getElementById('location-text').textContent = state.locationName;
    // デモデータ適用
    if (p.demo) {
      const d = p.demo;
      state.temp = d.temp; state.hum = d.hum; state.solar = d.solar;
      state.wind = d.wind; state.appTemp = d.app; state.weatherCode = d.code;
      state.weatherNote = d.note;
      document.getElementById('data-source-tag').textContent = 'DEMO';
      document.getElementById('data-source-tag').style.color = '#fb923c';
      document.getElementById('data-source-tag').style.background = 'rgba(251,146,60,0.15)';
    }
    updateSliders();
    recalc();
    state.workMinutes = 0;
  }

  function selectSaved(i) {
    const saved = getSaved();
    const p = saved[i];
    if (!p) return;
    setActivePreset('saved_' + i);
    state.locationName = `📍 ${p.name}`;
    document.getElementById('location-text').textContent = state.locationName;
    // API取得試行
    fetchAndApplyWeather(p.lat, p.lon, 'saved_' + i, '📍 ' + p.name);
  }

  function setActivePreset(id) {
    state.activePresetId = id;
    document.querySelectorAll('.preset-item').forEach(el => el.classList.remove('active'));
    const el = document.getElementById('preset-' + id);
    if (el) el.classList.add('active');
  }

  // ── カスタム地点追加 ──────────────────────────
  function addCustomLocation() {
    const name = document.getElementById('custom-name').value.trim();
    const lat  = parseFloat(document.getElementById('custom-lat').value);
    const lon  = parseFloat(document.getElementById('custom-lon').value);
    if (!name || isNaN(lat) || isNaN(lon)) {
      alert('地点名・緯度・経度をすべて入力してください。');
      return;
    }
    const saved = getSaved();
    saved.push({ name, lat, lon });
    setSaved(saved);
    document.getElementById('custom-name').value = '';
    document.getElementById('custom-lat').value  = '';
    document.getElementById('custom-lon').value  = '';
    buildSavedList();
    // 追加した地点を即選択
    const idx = saved.length - 1;
    selectSaved(idx);
  }

  function deleteSaved(i) {
    const saved = getSaved();
    saved.splice(i, 1);
    setSaved(saved);
    buildSavedList();
    if (state.activePresetId === 'saved_' + i) {
      selectPreset('tpirc');
    }
  }

  // ── GPS 取得 ──────────────────────────────────
  function getGPS() {
    if (!navigator.geolocation) {
      alert('このブラウザはGPSに対応していません。');
      return;
    }
    const locText = document.getElementById('location-text');
    locText.textContent = '📡 GPS取得中...';
    navigator.geolocation.getCurrentPosition(
      async pos => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        // 地名取得（Nominatim）
        let name = `${lat.toFixed(3)}, ${lon.toFixed(3)}`;
        try {
          const r = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=ja`);
          if (r.ok) {
            const d = await r.json();
            const a = d.address;
            name = a.city || a.town || a.village || a.county || a.state || name;
          }
        } catch {}
        state.locationName = '📡 ' + name;
        locText.textContent = state.locationName;
        setActivePreset('gps');
        fetchAndApplyWeather(lat, lon, 'gps', state.locationName);
      },
      err => {
        locText.textContent = state.locationName;
        const msg = {
          1: 'GPS許可が拒否されました。ブラウザの設定で位置情報を許可してください。',
          2: 'GPS信号を取得できませんでした。',
          3: 'GPS取得がタイムアウトしました。',
        }[err.code] || 'GPS取得に失敗しました。';
        alert(msg);
      },
      { enableHighAccuracy: true, timeout: 12000 }
    );
  }

  // ── Open-Meteo API 取得 ──────────────────────
  async function fetchAndApplyWeather(lat, lon, presetId, name) {
    const tag   = document.getElementById('data-source-tag');
    const btn   = document.getElementById('refresh-btn');
    btn.disabled = true;
    btn.textContent = '…';
    tag.textContent = '取得中';
    tag.style.color = '#facc15';
    try {
      const params = new URLSearchParams({
        latitude: lat, longitude: lon,
        current: 'temperature_2m,relative_humidity_2m,shortwave_radiation,apparent_temperature,weather_code,wind_speed_10m',
        timezone: 'Asia/Tokyo',
      });
      const res  = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const c    = data.current;
      state.temp        = Math.round(c.temperature_2m * 10) / 10;
      state.hum         = Math.round(c.relative_humidity_2m);
      state.solar       = Math.round(c.shortwave_radiation ?? 400);
      state.wind        = Math.round(c.wind_speed_10m * 10) / 10;
      state.appTemp     = Math.round(c.apparent_temperature * 10) / 10;
      state.weatherCode = c.weather_code;
      const now = new Date().toLocaleTimeString('ja-JP', { hour:'2-digit', minute:'2-digit' });
      state.weatherNote = `Open-Meteo リアルタイム取得 (${now})`;
      tag.textContent = 'LIVE';
      tag.style.color = '#4ade80';
      tag.style.background = 'rgba(74,222,128,0.15)';
      updateSliders();
      recalc();
      state.workMinutes = 0;
      // 自動更新（20分）
      clearInterval(state.weatherInterval);
      state.weatherInterval = setInterval(() => fetchAndApplyWeather(lat, lon, presetId, name), 20 * 60 * 1000);
    } catch (e) {
      console.warn('Open-Meteo取得失敗:', e);
      // フォールバック：プリセットのデモデータ
      const preset = PRESETS.find(p => p.id === presetId);
      if (preset?.demo) {
        const d = preset.demo;
        state.temp = d.temp; state.hum = d.hum; state.solar = d.solar;
        state.wind = d.wind; state.weatherCode = d.code;
        state.weatherNote = `⚠️ API取得失敗 → デモデータ使用（${d.note}）`;
      } else {
        state.weatherNote = '⚠️ 気象データ取得失敗。スライダーで調整してください。';
      }
      tag.textContent = 'DEMO';
      tag.style.color = '#fb923c';
      tag.style.background = 'rgba(251,146,60,0.15)';
      updateSliders();
      recalc();
    } finally {
      btn.disabled = false;
      btn.textContent = '↻';
    }
  }

  function refreshWeather() {
    // アクティブな地点を再取得
    const preset = PRESETS.find(p => p.id === state.activePresetId);
    if (preset) fetchAndApplyWeather(preset.lat, preset.lon, preset.id, state.locationName);
    else if (state.activePresetId?.startsWith('saved_')) {
      const idx   = parseInt(state.activePresetId.replace('saved_', ''));
      const saved = getSaved()[idx];
      if (saved) fetchAndApplyWeather(saved.lat, saved.lon, state.activePresetId, state.locationName);
    }
  }

  // ── タブ切替 ─────────────────────────────────
  function switchTab(id) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.tab-btn').forEach(el => {
      el.classList.remove('active');
      el.style.color = '';
      el.style.borderBottomColor = '';
    });
    document.getElementById('tab-' + id).classList.remove('hidden');
    const btn = document.querySelector(`[data-tab="${id}"]`);
    if (btn) {
      btn.classList.add('active');
      const risk = getRisk(state.wbgt);
      btn.style.color = risk.color;
      btn.style.borderBottomColor = risk.color;
    }
    if (id === 'chat') scrollChatToBottom();
  }

  // ── プリセットパネル開閉 ─────────────────────
  function togglePresets() {
    state.presetsOpen = !state.presetsOpen;
    const panel = document.getElementById('preset-panel');
    const arrow = document.getElementById('preset-arrow');
    panel.classList.toggle('hidden', !state.presetsOpen);
    arrow.textContent = state.presetsOpen ? '▲' : '▼';
    if (state.presetsOpen) buildSavedList();
  }

  // ── 緊急ステップ開閉 ─────────────────────────
  function toggleStep(i) {
    const el = document.getElementById('step-' + i);
    el.classList.toggle('open');
    const arrow = el.querySelector('.step-arrow');
    arrow.textContent = el.classList.contains('open') ? '▲' : '▼';
  }

  // ── 作業強度選択 ─────────────────────────────
  function selectWork(id) {
    state.workId = id;
    state.workMinutes = 0;
    buildWorkButtons();
    updateBreakTimer();
    updateRecommend(getRisk(state.wbgt));
    updateChatContext(getRisk(state.wbgt));
  }

  // ── AIモード切替 ─────────────────────────────
  function toggleAIMode() {
    state.aiMode = state.aiMode === 'mock' ? 'live' : 'mock';
    const btn  = document.getElementById('ai-toggle');
    const mode = document.getElementById('ctx-mode');
    btn.textContent = `AIモード: ${state.aiMode === 'mock' ? 'モック' : 'Claude API'}`;
    mode.textContent = state.aiMode === 'mock' ? 'MOCK' : 'LIVE AI';
    mode.classList.toggle('live', state.aiMode === 'live');
  }

  // ── チャット ─────────────────────────────────
  function appendAIMessage(text) {
    const risk = getRisk(state.wbgt);
    const el = document.createElement('div');
    el.className = 'msg-ai';
    el.innerHTML = `
      <div class="ai-avatar" style="border-color:${risk.color};background:${risk.alpha}0.1)">🌡️</div>
      <div class="bubble-ai" style="border-color:${risk.alpha}0.35)">${text.replace(/\n/g, '<br>')}</div>`;
    document.getElementById('chat-messages').appendChild(el);
    scrollChatToBottom();
  }
  function appendUserMessage(text) {
    const el = document.createElement('div');
    el.className = 'msg-user';
    el.innerHTML = `<div class="bubble-user">${text}</div>`;
    document.getElementById('chat-messages').appendChild(el);
    scrollChatToBottom();
  }
  function appendTyping() {
    const risk = getRisk(state.wbgt);
    const el = document.createElement('div');
    el.className = 'msg-ai'; el.id = 'typing-indicator';
    el.innerHTML = `
      <div class="ai-avatar" style="border-color:${risk.color};background:${risk.alpha}0.1)">🌡️</div>
      <div class="bubble-ai" style="border-color:${risk.alpha}0.35)"><span class="typing-dots">●●●</span></div>`;
    document.getElementById('chat-messages').appendChild(el);
    scrollChatToBottom();
  }
  function removeTyping() {
    const el = document.getElementById('typing-indicator');
    if (el) el.remove();
  }
  function scrollChatToBottom() {
    const el = document.getElementById('chat-messages');
    el.scrollTop = el.scrollHeight;
  }

  async function sendChat() {
    const input = document.getElementById('chat-input');
    const text  = input.value.trim();
    if (!text) return;
    input.value = '';
    document.getElementById('send-btn').disabled = true;

    appendUserMessage(text);
    state.chatHistory.push({ role: 'user', content: text });
    appendTyping();

    const work = WORKS.find(w => w.id === state.workId);
    const ctx  = {
      wbgt:      state.wbgt,
      riskLabel: getRisk(state.wbgt).label,
      workLabel: work.label,
      workBreak: work.break,
      temp:      state.temp,
      hum:       state.hum,
      solar:     state.solar,
      location:  state.locationName,
    };

    let reply;
    try {
      if (state.aiMode === 'live') {
        reply = await callClaudeAPI(
          state.chatHistory.map(m => ({ role: m.role, content: m.content })),
          ctx
        );
      } else {
        await new Promise(r => setTimeout(r, 600)); // モック遅延
        reply = mockAIResponse(text, ctx);
      }
    } catch (e) {
      reply = `⚠️ AI応答に失敗しました（${e.message}）。モックモードに切り替えて再試行してください。`;
    }

    removeTyping();
    appendAIMessage(reply);
    state.chatHistory.push({ role: 'assistant', content: reply });
    document.getElementById('send-btn').disabled = false;
  }

  function quickSend(text) {
    document.getElementById('chat-input').value = text;
    sendChat();
    switchTab('chat');
  }

  // ── 公開API ──────────────────────────────────
  return {
    init,
    onSlider,
    switchTab,
    togglePresets,
    selectPreset,
    selectSaved,
    deleteSaved,
    addCustomLocation,
    getGPS,
    refreshWeather,
    selectWork,
    toggleStep,
    toggleAIMode,
    sendChat,
    quickSend,
  };
})();

// 起動
document.addEventListener('DOMContentLoaded', () => App.init());
