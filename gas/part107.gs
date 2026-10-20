/**
 * 英語版（米国のドローン資格 Part 107）のショートを、毎日 YouTube に出す仕組み。
 * 日本語版とは別のスプレッドシート・別の YouTube チャンネルで動きます（日本語版には触れません）。
 *
 * はじめに1回だけ：enSetup を実行 →「許可」→ 英語用のチャンネルを選ぶ。
 * あとは1時間ごとに自動で動きます（台本の受け取り・その日の動画の投稿・再生数の記録）。
 * 手で動かすとき：uploadTodayNow（今日の分を今すぐ出す）、recordNow（再生数を今すぐ記録）。
 */
const EN_CONF = {
  REPO: 'drone-rulebook/part107-quiz',        // 動画の置き場（GitHub）
  UPLOAD_HOUR: 9,                              // 毎日この時（日本時間）に、その日の動画を出す（米国の夕方〜夜）
  INBOX_FOLDER: 'part107_inbox',               // 台本を受け取る Google ドライブのフォルダ（enSetup が作る）
  SHEET: '台本', SHEET_VIDEOS: '数字_動画', SHEET_CHANNEL: '数字_チャンネル', SHEET_LOG: 'ログ',
  STYLES: ['モーション', '黒板', 'ノート'],     // 台本IDの数字で日替わり（動画づくりと同じ順）
  TAGS: ['Part 107', 'Part 107 test', 'FAA Part 107', 'drone license', 'remote pilot', 'drone pilot', 'drone test'],
  DESCRIPTION: [
    'One Part 107 trick question a day for the FAA Remote Pilot knowledge test.',
    'Unofficial practice question based on 14 CFR Part 107 and FAA public materials. Always check the current rules.',
    '',
    '#Part107 #DronePilot #Shorts',
  ].join('\n'),
  MIN_BYTES: 100 * 1024, MAX_BYTES: 40 * 1024 * 1024,
};
const EN_HEAD = ['台本ID', '公開予定日', '問題ID', 'タイトル', '問題1行目', '問題2行目', '選択肢A', '選択肢B', '選択肢C',
  '正解', 'ひっかけ', '状態', '動画URL', '投稿日時', 'メモ', '根拠', '解説'];

// ---------- はじめに1回 ----------
function enSetup() {
  const ss = SpreadsheetApp.getActive();
  enSheet_(EN_CONF.SHEET, EN_HEAD);
  enSheet_(EN_CONF.SHEET_VIDEOS, ['記録日', '台本ID', '問題ID', 'タイトル', '見た目', '公開日', '公開からの日数', '再生', '高評価', 'コメント', '動画ID']);
  enSheet_(EN_CONF.SHEET_CHANNEL, ['記録日', '登録者', '総再生', '動画数']);
  enSheet_(EN_CONF.SHEET_LOG, ['日時', '内容']);
  const first = ss.getSheets()[0];
  if (first && first.getName() !== EN_CONF.SHEET && first.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(first);
  const folder = enInbox_(true);
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'enHourly').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('enHourly').timeBased().everyHours(1).create();
  let name;
  try { name = enCheckChannel_(); }
  catch (e) { enLog_(e.message); throw e; }
  const msg = '準備できました。投稿先のチャンネル：' + name + '／台本の受け取りフォルダ：' + folder.getName() + '（' + folder.getId() + '）';
  enLog_(msg);
  return msg;
}

// ---------- 1時間ごと ----------
function enHourly() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  try {
    try { enImport_(); } catch (e) { enNotify_('台本の受け取り', e); }
    const hour = Number(Utilities.formatDate(new Date(), 'Asia/Tokyo', 'H'));
    if (hour >= EN_CONF.UPLOAD_HOUR) {
      try { enUpload_({}); } catch (e) { enNotify_('YouTube への投稿', e); }
      try { enRecord_({}); } catch (e) { enNotify_('再生数の記録', e); }
    }
  } finally { lock.releaseLock(); }
}

function uploadTodayNow() { return enUpload_({ force: true }); }
function recordNow() { return enRecord_({ force: true }); }
function importNow() { return enImport_(); }

// ---------- 台本の受け取り（ドライブの inbox_*.json → 台本シート） ----------
function enImport_() {
  const sh = enSheet_(EN_CONF.SHEET, EN_HEAD);
  let added = 0, files = 0;
  // ① 置き場（GitHub）の inbox/queue.json（まとめて作った問題。問題IDで重なりを除く）
  const q = UrlFetchApp.fetch('https://raw.githubusercontent.com/' + EN_CONF.REPO + '/main/inbox/queue.json', { muteHttpExceptions: true });
  if (q.getResponseCode() === 200) {
    let data = null;
    try { data = JSON.parse(q.getContentText()); } catch (e) { enLog_('置き場の queue.json が読めません'); }
    if (data && data.format === 'part107-inbox/v1' && Array.isArray(data.scripts)) {
      const n = enAppend_(sh, data.scripts.filter(x => String(x.qid || '').trim()));
      if (n) enLog_('置き場から台本を受け取りました：' + n + '本');
      added += n;
    }
  }
  // ② ドライブの受け取りフォルダの inbox_*.json（毎週の補充）
  const folder = enInbox_(false);
  if (!folder) return '受け取り ' + added + '本（ドライブの受け取りフォルダがありません。enSetup を実行してください）';
  const it = folder.getFiles();
  while (it.hasNext()) {
    const f = it.next();
    const name = f.getName();
    if (!/^inbox_.*\.json$/.test(name)) continue;
    files++;
    let data;
    try { data = JSON.parse(f.getBlob().getDataAsString('UTF-8')); }
    catch (e) { f.setName('error_' + name); enLog_('読めない受け取りファイル：' + name); continue; }
    if (!data || data.format !== 'part107-inbox/v1' || !Array.isArray(data.scripts)) { f.setName('error_' + name); enLog_('形式が違う受け取りファイル：' + name); continue; }
    added += enAppend_(sh, data.scripts);
    f.setName('done_' + name);
  }
  if (files) enLog_('台本を受け取りました：' + added + '本（ファイル ' + files + ' 個）');
  return '受け取り ' + added + '本';
}

function enAppend_(sh, scripts) {
  const rows = sh.getDataRange().getValues();
  const head = rows[0];
  const col = k => head.indexOf(k);
  const ids = new Set(), qids = new Set();
  let maxN = 0, last = enToday_();
  rows.slice(1).forEach(r => {
    const id = String(r[col('台本ID')] || '').trim();
    if (!id) return;
    ids.add(id); qids.add(String(r[col('問題ID')] || '').trim());
    const m = id.match(/(\d+)$/); if (m) maxN = Math.max(maxN, Number(m[1]));
    const d = enDate_(r[col('公開予定日')]); if (d && d > last) last = d;
  });
  let n = 0;
  scripts.forEach(s => {
    const need = ['q1', 'a', 'b', 'c', 'answer', 'trap', 'title'];
    if (need.some(k => !String(s[k] || '').trim())) return;
    if (!/^[ABC]$/.test(String(s.answer).trim().toUpperCase())) return;
    const qid = String(s.qid || '').trim();
    if (qid && qids.has(qid)) return;                 // 同じ問題は入れない
    maxN++; while (ids.has('e' + String(maxN).padStart(3, '0'))) maxN++;
    const id = 'e' + String(maxN).padStart(3, '0');
    last = enAddDays_(last, 1);
    const row = new Array(head.length).fill('');
    const put = (k, v) => { if (col(k) >= 0) row[col(k)] = v; };
    put('台本ID', id); put('公開予定日', last); put('問題ID', qid || id.toUpperCase()); put('タイトル', String(s.title).slice(0, 95));
    put('問題1行目', s.q1); put('問題2行目', s.q2 || ''); put('選択肢A', s.a); put('選択肢B', s.b); put('選択肢C', s.c);
    put('正解', String(s.answer).trim().toUpperCase()); put('ひっかけ', s.trap); put('状態', '待ち'); put('根拠', s.basis || '');
    put('解説', s.explain || '');
    sh.appendRow(row);
    ids.add(id); if (qid) qids.add(qid); n++;
  });
  return n;
}

// ---------- 今日の動画を YouTube に出す ----------
function enUpload_(opts) {
  const today = enToday_();
  const sh = enSheet_(EN_CONF.SHEET, EN_HEAD);
  const rows = sh.getDataRange().getValues();
  const head = rows[0], col = k => head.indexOf(k);
  let target = -1;
  for (let i = 1; i < rows.length; i++) {
    if (enDate_(rows[i][col('公開予定日')]) === today && String(rows[i][col('状態')]).trim() === '待ち') { target = i; break; }
  }
  if (target < 0) return '今日の分はありません（または投稿済み）';
  const r = rows[target];
  const id = String(r[col('台本ID')]).trim();
  if (String(r[col('メモ')] || '').indexOf('止める') >= 0) return id + '：メモに「止める」があるので出しません';
  const url = 'https://raw.githubusercontent.com/' + EN_CONF.REPO + '/main/videos/' + encodeURIComponent(id) + '.mp4';
  const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true });
  const code = res.getResponseCode();
  if (code === 404) {
    const hour = Number(Utilities.formatDate(new Date(), 'Asia/Tokyo', 'H'));
    if (hour >= 22) throw new Error(id + ' の動画がまだ置き場にありません（' + url + '）');
    return id + '：動画がまだ無いので、次の時間にもう一度試します';
  }
  if (code !== 200) throw new Error('動画を取れませんでした（' + code + '）：' + url);
  enCheckChannel_();
  const blob = res.getBlob().setName(id + '.mp4').setContentType('video/mp4');
  const size = blob.getBytes().length;
  if (size < EN_CONF.MIN_BYTES || size > EN_CONF.MAX_BYTES) throw new Error(id + ' の動画の大きさがおかしいです（' + size + ' バイト）');
  const explain = String(r[col('解説')] || '').trim(), basis = String(r[col('根拠')] || '').trim();
  const desc = (explain ? 'Answer: ' + String(r[col('正解')]).trim() + '. ' + explain + '\n' : '') + (basis ? 'Source: ' + basis + '\n' : '')
    + (explain || basis ? '\n' : '') + EN_CONF.DESCRIPTION;
  const video = YouTube.Videos.insert({
    snippet: { title: String(r[col('タイトル')]).slice(0, 100), description: desc.slice(0, 4900), tags: EN_CONF.TAGS,
      categoryId: '27', defaultLanguage: 'en', defaultAudioLanguage: 'en' },
    status: { privacyStatus: 'public', selfDeclaredMadeForKids: false, embeddable: true },
  }, 'snippet,status', blob);
  sh.getRange(target + 1, col('動画URL') + 1).setValue('https://youtube.com/shorts/' + video.id);
  sh.getRange(target + 1, col('状態') + 1).setValue('投稿済み');
  sh.getRange(target + 1, col('投稿日時') + 1).setValue(Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm'));
  enLog_('YouTube に出しました：' + id + ' https://youtube.com/shorts/' + video.id);
  return id + ' を出しました：https://youtube.com/shorts/' + video.id;
}

// ---------- 再生数の記録（1日1回） ----------
function enRecord_(opts) {
  const today = enToday_();
  const props = PropertiesService.getScriptProperties();
  if (!opts.force && props.getProperty('EN_REC_' + today)) return '今日は記録済み';
  const rows = enSheet_(EN_CONF.SHEET, EN_HEAD).getDataRange().getValues();
  const head = rows[0], col = k => head.indexOf(k);
  const list = [];
  rows.slice(1).forEach(r => {
    const m = String(r[col('動画URL')] || '').match(/(?:shorts\/|[?&]v=|youtu\.be\/)([A-Za-z0-9_-]{11})/);
    if (!m || String(r[col('メモ')] || '').indexOf('限定公開') >= 0) return;
    const id = String(r[col('台本ID')]).trim(), n = Number((id.match(/(\d+)$/) || [0, 0])[1]);
    list.push({ vid: m[1], id, qid: r[col('問題ID')], title: r[col('タイトル')], look: EN_CONF.STYLES[n % EN_CONF.STYLES.length], date: enDate_(r[col('公開予定日')]) });
  });
  const stats = {};
  for (let i = 0; i < list.length; i += 50) {
    const res = YouTube.Videos.list('statistics', { id: list.slice(i, i + 50).map(x => x.vid).join(','), maxResults: 50 });
    (res.items || []).forEach(it => stats[it.id] = it.statistics || {});
  }
  const sv = enSheet_(EN_CONF.SHEET_VIDEOS, null);
  list.forEach(x => {
    const s = stats[x.vid]; if (!s) return;
    const days = x.date ? Math.round((new Date(today) - new Date(x.date)) / 864e5) : '';
    sv.appendRow([today, x.id, x.qid, x.title, x.look, x.date || '', days, Number(s.viewCount || 0), Number(s.likeCount || 0), Number(s.commentCount || 0), x.vid]);
  });
  const ch = (YouTube.Channels.list('statistics', { mine: true }).items || [])[0];
  if (ch) {
    const st = ch.statistics || {};
    enSheet_(EN_CONF.SHEET_CHANNEL, null).appendRow([today, Number(st.subscriberCount || 0), Number(st.viewCount || 0), Number(st.videoCount || 0)]);
  }
  props.setProperty('EN_REC_' + today, '1');
  return '記録しました：動画 ' + Object.keys(stats).length + '本' + (ch ? '／登録者 ' + (ch.statistics.subscriberCount || 0) + '人' : '');
}

// 投稿先が日本語版のチャンネルなら止める（許可のときに英語用のチャンネルを選び忘れた場合の安全装置）
function enCheckChannel_() {
  const ch = (YouTube.Channels.list('snippet', { mine: true }).items || [])[0];
  const title = ch ? String(ch.snippet.title) : '';
  if (!ch || title === 'ドローンのルール帳' || /[ぁ-んァ-ヶ一-龠]/.test(title)) {
    throw new Error('投稿先のチャンネルが英語用ではありません（' + (title || 'なし') + '）。enSetup をもう一度実行し、許可の画面で英語用のチャンネルを選んでください');
  }
  return title;
}

// ---------- 小さな道具 ----------
function enSheet_(name, header) {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if (header && sh.getLastRow() === 0) { sh.appendRow(header); sh.setFrozenRows(1); }
  return sh;
}
function enInbox_(create) {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('EN_INBOX_ID');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) {} }
  const it = DriveApp.getFoldersByName(EN_CONF.INBOX_FOLDER);
  const f = it.hasNext() ? it.next() : (create ? DriveApp.createFolder(EN_CONF.INBOX_FOLDER) : null);
  if (f) props.setProperty('EN_INBOX_ID', f.getId());
  return f;
}
function enToday_() { return Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd'); }
function enDate_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, 'Asia/Tokyo', 'yyyy-MM-dd');
  const m = String(v || '').trim().replace(/\//g, '-').match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  return m ? m[1] + '-' + m[2].padStart(2, '0') + '-' + m[3].padStart(2, '0') : '';
}
function enAddDays_(ymd, n) {
  const d = new Date(ymd + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function enLog_(text) {
  try { enSheet_(EN_CONF.SHEET_LOG, ['日時', '内容']).appendRow([Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm'), text]); } catch (e) {}
}
function enNotify_(what, e) {
  enLog_('失敗：' + what + '：' + (e && e.message ? e.message : e));
  const props = PropertiesService.getScriptProperties();
  const key = 'EN_MAIL_' + what + '_' + enToday_();
  if (props.getProperty(key)) return;
  props.setProperty(key, '1');
  try {
    MailApp.sendEmail(Session.getEffectiveUser().getEmail(), '【英語版ショート】' + what + 'に失敗しました',
      what + 'に失敗しました。\n\n' + (e && e.message ? e.message : e) + '\n\nスプレッドシートの「ログ」に記録があります。同じ失敗のお知らせは1日1回までです。');
  } catch (err) {}
}
