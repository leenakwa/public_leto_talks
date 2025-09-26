// ======================
//  Config & Utilities
// ======================

// Цвета в CSS — палитра школы. Лого школы НЕ вставляем, используем собственный логотип текста 'leto talks'.

// Характеристики рейтинга. Удобно добавлять/удалять — всё UI строится динамически.
const CHARACTERISTICS = [
  { key: 'clarity', name: 'Понятно объясняет' },
  { key: 'humor', name: 'Чувство юмора' },
  { key: 'strict', name: 'Строгость' },
  { key: 'favorites', name: 'Есть любимчики' },
];

// Карта для «человечного» отображения отделов
const DEPARTMENTS = [
  'Математика','Физика','Информатика','Химия','Биология',
  'Иностранные языки','Гуманитарные науки','Экономика','Искусство','Физкультура'
];

// ---------- Helpers ----------
const $ = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));

function html(strings, ...values) {
  return strings.reduce((acc, s, i) => acc + s + (values[i] ?? ''), '');
}

function fmtStars(value) {
  const v = Math.round(value * 10) / 10;
  return html`<span class="rating" title="${v} / 5"><span class="star">★</span>${v}</span>`;
}

function formatDate(ts) {
  const dt = new Date(ts);
  return dt.toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short' });
}

function slugify(s){ return String(s).toLowerCase().replace(/\s+/g,'-'); }

function overallRating(t) {
  return 5;
}

function characteristicAvg(t, key){
  return 5;
}

// ======================
//  Data Layer
// ======================

// Стартовые 10 «рандомных» учителей (фото — чёрный квадрат)
const START_TEACHERS = (() => {
  const names = [
    ['Иван','Петров','Алексеевич','Математика',['Алгебра','Геометрия']],
    ['Елена','Сидорова','Игоревна','Физика',['Механика','Электричество']],
    ['Сергей','Кузнецов','Владимирович','Информатика',['Python','Алгоритмы']],
    ['Мария','Иванова','Павловна','Химия',['Неорганическая','Органическая']],
    ['Анна','Смирнова','Олеговна','Иностранные языки',['Английский B2','IELTS Prep']],
    ['Павел','Фёдоров','Николаевич','Биология',['Общая биология','Генетика']],
    ['Дарья','Соколова','Сергеевна','Гуманитарные науки',['История','Литература']],
    ['Николай','Орлов','Андреевич','Экономика',['Микроэкономика','Макроэкономика']],
    ['Ольга','Кравцова','Романовна','Искусство',['Графика','Дизайн']],
    ['Артём','Васильев','Михайлович','Физкультура',['Лёгкая атлетика','Игровые виды']],
  ];
  const res = names.map((n,i)=>{
    const r = {};
    for (const c of CHARACTERISTICS) {
      const val = 2.5 + Math.random()*2.5; // 2.5—5.0 случайно
      r[c.key] = { sum: Math.round(val*10)/10, count: 1 };
    }
    return {
      id: 't'+(i+1),
      firstName: n[0], lastName: n[1], patronymic: n[2],
      department: n[3],
      subjects: n[4],
      photo: null, // чёрный квадрат
      ratings: r,
      comments: [
        { text: 'Отлично объясняет материал!', ts: Date.now()-((i+1)*86400000) },
      ],
    };
  });
  return res;
})();

const Storage = {
  load(){
    const saved = localStorage.getItem('letotalks:data');
    if (saved) {
      try { return JSON.parse(saved); } catch(e){ console.warn('bad data', e); }
    }
    const data = { teachers: START_TEACHERS, version: 1 };
    localStorage.setItem('letotalks:data', JSON.stringify(data));
    return data;
  },
  save(data){ localStorage.setItem('letotalks:data', JSON.stringify(data)); }
};

let DB = Storage.load();

// ======================
//  Auth (stub)
// ======================
const Auth = {
  get(){ return JSON.parse(localStorage.getItem('letotalks:auth') || 'null'); },
  set(obj){ localStorage.setItem('letotalks:auth', JSON.stringify(obj)); Auth.render(); },
  toggleLogin(){
    const cur = Auth.get();
    if (cur && cur.loggedIn) {
      Auth.set({ loggedIn: false, email: null });
    } else {
      // По требованиям: просто клик — и залогинен. (Проверку домена добавите позже.)
      Auth.set({ loggedIn: true, email: 'student@student.letovo.ru' });
    }
  },
  isLogged(){ const a = Auth.get(); return a && a.loggedIn; },
  render(){
    const btn = $('#loginBtn');
    const badge = $('#userBadge');
    if (Auth.isLogged()) {
      btn.classList.add('hidden');
      badge.classList.remove('hidden');
      badge.textContent = 'Student';
    } else {
      btn.classList.remove('hidden');
      badge.classList.add('hidden');
    }
  }
};

// ======================
//  Router
// ======================
const Router = {
  routes: [],
  add(pattern, handler){ Router.routes.push({ pattern, handler }); },
  go(path){ location.hash = path; },
  goHome(){ Router.go('/'); },
  match(){
    const hash = location.hash.slice(1) || '/';
    for (const r of Router.routes) {
      const m = hash.match(r.pattern);
      if (m) return r.handler(...m);
    }
    // fallback
    App.viewHome();
  },
  init(){
    window.addEventListener('hashchange', Router.match);
    Router.match();
  }
};

// ======================
//  App Rendering
// ======================
const App = {
  // Navbar dynamic data
  mountNavbar(){
    // fill department select
    const sel = $('#deptSelect');
    sel.innerHTML = '<option value="">Кафедры…</option>' + DEPARTMENTS.map(d => `<option value="${encodeURIComponent(d)}">${d}</option>`).join('');
  },
  search(){
    const q = $('#searchInput').value.trim();
    if (!q) return;
    Router.go(`/search?q=${encodeURIComponent(q)}`);
  },
  goDept(val){
    if (!val) return;
    Router.go(`/department/${val}`);
    // сброс селекта
    $('#deptSelect').value = '';
  },

  viewHome(){
    const el = $('#app');
    const t = DB.teachers;

    // Топ по характеристикам (по 3 превью)
    const charCards = CHARACTERISTICS.map(c => {
      const sorted = [...t].sort((a,b)=> characteristicAvg(b,c.key)-characteristicAvg(a,c.key)).slice(0,3);
      const preview = sorted.map(x => html`
        <div class="teacher-chip">
          <img class="avatar" src="img/sukhov.png" alt="avatar">
          <div>
            <div class="tname">${x.lastName} ${x.firstName}</div>
            <div class="tdept">${x.department}</div>
          </div>
          <div style="margin-left:auto">${fmtStars(characteristicAvg(x,c.key))}</div>
        </div>`).join('');
      return html`
        <div class="card">
          <div class="row space-between">
            <h3 style="margin:0">${c.name}</h3>
            <button class="btn small primary" onclick="Router.go('/top/${c.key}')">Смотреть всех</button>
          </div>
          <div class="hr"></div>
          ${preview}
        </div>`;
    }).join('');

    // Кафедры (по 3 превью, сорт по overall)
    const deptCards = DEPARTMENTS.map(d => {
      const inDept = t.filter(x => x.department===d).sort((a,b)=> overallRating(b)-overallRating(a)).slice(0,3);
      if (inDept.length === 0) return '';
      const preview = inDept.map(x => html`
        <div class="teacher-chip">
          <img class="avatar" src="img/sukhov.png" alt="avatar">
          <div>
            <div class="tname">${x.lastName} ${x.firstName}</div>
            <div class="tdept">${x.department}</div>
          </div>
          <div style="margin-left:auto">${fmtStars(overallRating(x))}</div>
        </div>`).join('');
      return html`
        <div class="card">
          <div class="row space-between">
            <h3 style="margin:0">${d}</h3>
            <button class="btn small primary" onclick="Router.go('/department/${encodeURIComponent(d)}')">Все учителя</button>
          </div>
          <div class="hr"></div>
          ${preview || '<div class="empty">Пока нет учителей</div>'}
        </div>`;
    }).join('');

    el.innerHTML = html`
      <section class="section">
        <h2>Топ по характеристикам</h2>
        <div class="grid">${charCards}</div>
      </section>

      <section class="section">
        <h2>По кафедрам</h2>
        <div class="grid">${deptCards}</div>
      </section>
    `;
  },

  listByCharacteristic(key){
    const el = $('#app');
    const c = CHARACTERISTICS.find(x=>x.key===key);
    if (!c) return Router.go('/');

    const sorted = [...DB.teachers].sort((a,b)=> characteristicAvg(b,key)-characteristicAvg(a,key));
    el.innerHTML = html`
      <section class="section">
        <div class="row space-between wrap">
          <h2>Топ учителей — ${c.name}</h2>
          <div class="list-controls"><a class="link" href="#/">← На главную</a></div>
        </div>
        <div class="list">
          ${sorted.map(t => html`
            <div class="list-item">
              <img class="avatar" src="img/sukhov.png" alt="avatar">
              <div>
                <div class="tname"><span class="link" href="#/teacher/${t.id}">${t.lastName} ${t.firstName} ${t.patronymic}</span></div>
                <div class="meta">${t.department} · ${t.subjects.join(', ')}</div>
              </div>
              <div>${fmtStars(characteristicAvg(t,key))}</div>
            </div>
          `).join('')}
        </div>
      </section>
    `;
  },

  listByDepartment(dept){
    const el = $('#app');
    const dname = decodeURIComponent(dept);
    const inDept = DB.teachers.filter(t => t.department===dname).sort((a,b)=> overallRating(b)-overallRating(a));
    el.innerHTML = html`
      <section class="section">
        <div class="row space-between wrap">
          <h2>Кафедра — ${dname}</h2>
          <div class="list-controls"><a class="link" href="#/">← На главную</a></div>
        </div>
        <div class="list">
          ${inDept.map(t => html`
            <div class="list-item">
              <img class="avatar" src="img/sukhov.png" alt="avatar">
              <div>
                <div class="tname"><span class="link" href="#/teacher/${t.id}">${t.lastName} ${t.firstName} ${t.patronymic}</span></div>
                <div class="meta">${t.subjects.join(', ')}</div>
              </div>
              <div>${fmtStars(overallRating(t))}</div>
            </div>
          `).join('') || '<div class="empty">Пока нет учителей</div>'}
        </div>
      </section>
    `;
  },

  listBySearch(query){
    const el = $('#app');
    const q = (query || '').trim().toLowerCase();
    const matched = DB.teachers.filter(t => (`${t.firstName} ${t.lastName} ${t.patronymic}`).toLowerCase().includes(q));
    el.innerHTML = html`
      <section class="section">
        <div class="row space-between wrap">
          <h2>Результаты поиска: “${q}”</h2>
          <div class="list-controls"><a class="link" href="#/">← На главную</a></div>
        </div>
        <div class="list">
          ${matched.map(t => html`
            <div class="list-item">
              <img class="avatar" src="img/sukhov.png" alt="avatar">
              <div>
                <div class="tname"><a class="link" href="#/teacher/${t.id}">${t.lastName} ${t.firstName} ${t.patronymic}</a></div>
                <div class="meta">${t.department} · ${t.subjects.join(', ')}</div>
              </div>
              <div>${fmtStars(overallRating(t))}</div>
            </div>
          `).join('') || '<div class="empty">Ничего не найдено</div>'}
        </div>
      </section>
    `;
  },

  teacherProfile(tid){
    const el = $('#app');
    const t = DB.teachers.find(x=>x.id===tid);
    if (!t) { Router.go('/'); return; }

    // Блок характеристик с рейтингом
    const charBlocks = CHARACTERISTICS.map(c => {
      const cur = characteristicAvg(t, c.key);
      const groupName = `stars-${c.key}`;
      return html`
        <div class="char-card">
          <h4>${c.name}</h4>
          <div class="current">Средняя: ${fmtStars(cur)} (нажмите, чтобы оценить)</div>
          <div class="stars" role="radiogroup" aria-label="${c.name}">
            ${[5,4,3,2,1].map(v => html`
              <input type="radio" id="${groupName}-${v}" name="${groupName}" value="${v}" ${Auth.isLogged()? '' : 'disabled'} />
              <label for="${groupName}-${v}" title="${v}">★</label>
            `).join('')}
          </div>
        </div>`;
    }).join('');

    // Комментарии
    const commentsHtml = (t.comments && t.comments.length)
      ? t.comments.slice().reverse().map(c => html`
        <div class="comment">
          <div class="meta">Аноним · ${formatDate(c.ts)}</div>
          <div>${c.text.replace(/</g,'&lt;')}</div>
        </div>
      `).join('')
      : '<div class="empty">Комментариев пока нет</div>';

    el.innerHTML = html`
      <section class="section">
        <div class="row space-between wrap">
          <div class="row" style="gap:14px">
            <button class="btn small outline" onclick="history.back()">← Назад</button>
            <h2 style="margin:0">${t.lastName} ${t.firstName} ${t.patronymic}</h2>
          </div>
        </div>

        <div class="profile" style="margin-top:12px">
          <div class="kv">
            <div class="avatar lg"></div>
            <dl>
              <dt>Кафедра</dt><dd>${t.department}</dd>
              <dt>Предметы</dt><dd>${t.subjects.join(', ')}</dd>
              <dt>Общий рейтинг</dt><dd>${fmtStars(overallRating(t))}</dd>
            </dl>
          </div>

          <div class="kv">
            <h3 style="margin:0 0 10px;color:var(--blue-700)">Оценки по характеристикам</h3>
            <div class="char-grid">${charBlocks}</div>
            <div class="hr"></div>
            <div class="comment-box">
              <h3 style="margin:6px 0 8px;color:var(--blue-700)">Оставить комментарий</h3>
              ${Auth.isLogged() 
                ? html`
                    <textarea id="commentText" placeholder="Напишите анонимный отзыв…"></textarea>
                    <div class="row" style="margin-top:8px;justify-content:space-between">
                      <div class="muted">Комментарии видны всем. Личные данные не собираем.</div>
                      <button class="btn primary" onclick="App.submitComment('${t.id}')">Опубликовать</button>
                    </div>
                  `
                : html`<div class="empty">Чтобы оставить комментарий или оценку, войдите: нажмите «Залогиниться» сверху.</div>`
              }
            </div>
            <div class="hr"></div>
            <h3 style="margin:0 0 8px;color:var(--blue-700)">Комментарии</h3>
            <div id="comments">${commentsHtml}</div>
          </div>
        </div>
      </section>
    `;

    // Навесим обработчики на звёзды после рендера
    for (const c of CHARACTERISTICS) {
      for (const v of [1,2,3,4,5]) {
        const id = `stars-${c.key}-${v}`;
        const input = document.getElementById(id);
        if (input) {
          input.addEventListener('change', () => App.rate(t.id, c.key, v));
        }
      }
    }
  },

  rate(tid, key, value){
    if (!Auth.isLogged()) {
      alert('Чтобы оценивать, залогиньтесь (@student.letovo.ru).');
      return;
    }
    const t = DB.teachers.find(x=>x.id===tid);
    if (!t) return;
    if (!t.ratings[key]) t.ratings[key] = { sum: 0, count: 0 };

    // Ограничим по 1 оценке на пользователя на характеристику (перезапись разрешена)
    const userKey = `letotalks:userRatings`;
    const map = JSON.parse(localStorage.getItem(userKey) || '{}');
    const u = map[tid] && map[tid][key];

    if (u) {
      // вычтем предыдущую оценку
      t.ratings[key].sum -= u;
      // count не меняем (перезапись оценки тем же пользователем)
    } else {
      t.ratings[key].count += 1;
    }
    t.ratings[key].sum += Number(value);

    // сохраним «мою оценку»
    if (!map[tid]) map[tid] = {};
    map[tid][key] = Number(value);
    localStorage.setItem(userKey, JSON.stringify(map));

    Storage.save(DB);
    // Обновим экран
    App.teacherProfile(tid);
  },

  submitComment(tid){
    if (!Auth.isLogged()) { alert('Нужно войти.'); return; }
    const t = DB.teachers.find(x=>x.id===tid);
    const txt = $('#commentText').value.trim();
    if (!txt) return alert('Комментарий пуст.');
    if (!t.comments) t.comments = [];
    t.comments.push({ text: txt, ts: Date.now() });
    Storage.save(DB);
    App.teacherProfile(tid);
  },
};

// ======================
//  Import (на будущее)
// ======================
// Можно загрузить CSV с колонками:
// firstName,lastName,patronymic,department,subjects (через |),photo(optional)
// Пример функции: App.importCSV(file)
App.importCSV = async function(file) {
  const text = await file.text();
  const rows = text.split(/\r?\n/).map(r => r.trim()).filter(Boolean);
  const header = rows.shift().split(',').map(s=>s.trim());
  const idx = (name) => header.indexOf(name);
  let idCounter = DB.teachers.length + 1;
  for (const row of rows) {
    const cols = row.split(',').map(s=>s.trim());
    const subjects = (cols[idx('subjects')] || '').split('|').map(s=>s.trim()).filter(Boolean);
    const t = {
      id: 't'+(idCounter++),
      firstName: cols[idx('firstName')] || '',
      lastName: cols[idx('lastName')] || '',
      patronymic: cols[idx('patronymic')] || '',
      department: cols[idx('department')] || '',
      subjects,
      photo: cols[idx('photo')] || null,
      ratings: Object.fromEntries(CHARACTERISTICS.map(c => [c.key, { sum: 0, count: 0 }])),
      comments: []
    };
    DB.teachers.push(t);
  }
  Storage.save(DB);
  alert('Учителя импортированы: ' + (idCounter - 1 - (DB.teachers.length - (idCounter - 1))));
  Router.match();
};

// ======================
//  Routes
// ======================
Router.add(/^\/$/, () => App.viewHome());
Router.add(/^\/top\/([a-z]+)$/, (_, key) => App.listByCharacteristic(key));
Router.add(/^\/department\/(.+)$/, (_, dept) => App.listByDepartment(decodeURIComponent(dept)));
Router.add(/^\/search\?q=(.*)$/, (_, q) => App.listBySearch(decodeURIComponent(q)));


// ======================
//  Init
// ======================
window.addEventListener('DOMContentLoaded', () => {
  document.getElementById('year').textContent = new Date().getFullYear();
  App.mountNavbar();
  Auth.render();
  Router.init();
});
