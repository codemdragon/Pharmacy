/* ==========================================================================
   WEBSITE MANAGER - Admin Panel
   Phase 0: shell  |  Phase 2: editor + push/restore + autosave + search
   --------------------------------------------------------------------------
   - Signs in with a GitHub fine-grained token (Contents: Read/Write).
   - Loads content.json (live), keeps a draft copy that autosaves to
     localStorage so a refresh never loses work.
   - "Push to Website" backs up the live file to content.backup.json, then
     publishes the draft. "Restore previous version" swaps them back.
   ========================================================================== */
'use strict';

var REPO = 'codemdragon/Pharmacy';
var BRANCH = 'main';
var TOKEN_KEY = 'pharmacy_admin_token';
var DRAFT_KEY = 'pharmacy_cms_draft';

var ghToken = '';
var USER_LOGIN = '';

/* ======================== SMALL HELPERS ======================== */
function escHtml(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escAttr(s) {
    return escHtml(s).replace(/"/g, '&quot;');
}

function b64encode(str) {
    return btoa(unescape(encodeURIComponent(str)));
}

function b64decode(b64) {
    return decodeURIComponent(escape(atob(b64)));
}

function deepClone(o) { return JSON.parse(JSON.stringify(o)); }

/* stored draft over live clone: objects merge, arrays/primitives override */
function deepMerge(base, over) {
    if (Array.isArray(over)) return deepClone(over);
    if (over !== null && typeof over === 'object') {
        var out = (base !== null && typeof base === 'object' && !Array.isArray(base))
            ? deepMerge({}, base) : {};
        Object.keys(over).forEach(function (k) { out[k] = deepMerge(out[k], over[k]); });
        return out;
    }
    return over;
}

/* count changed leaf values (ignores _meta) */
function diffCount(a, b) {
    var n = 0;
    function walk(x, y) {
        var ox = (x !== null && typeof x === 'object');
        var oy = (y !== null && typeof y === 'object');
        if (ox || oy) {
            if (Array.isArray(x) || Array.isArray(y)) {
                var L = Math.max(x ? x.length : 0, y ? y.length : 0);
                for (var i = 0; i < L; i++) walk(x ? x[i] : undefined, y ? y[i] : undefined);
            } else {
                var seen = {};
                Object.keys(x || {}).concat(Object.keys(y || {})).forEach(function (k) {
                    if (k.charAt(0) !== '_') seen[k] = 1;
                });
                Object.keys(seen).forEach(function (k) {
                    walk(x ? x[k] : undefined, y ? y[k] : undefined);
                });
            }
        } else if (x !== y) n++;
    }
    walk(a, b);
    return n;
}

function getPath(obj, path) {
    try {
        return path.split('.').reduce(function (o, k) { return o == null ? undefined : o[k]; }, obj);
    } catch (e) { return undefined; }
}

function setPath(obj, path, value) {
    var keys = path.split('.');
    var cur = obj;
    for (var i = 0; i < keys.length - 1; i++) {
        if (cur[keys[i]] === undefined) cur[keys[i]] = {};
        cur = cur[keys[i]];
    }
    cur[keys[keys.length - 1]] = value;
}

/* ======================== AUTH ======================== */
var AdminAuth = {

    init: function () {
        ghToken = localStorage.getItem(TOKEN_KEY) || '';
        if (ghToken) {
            this.validate(function (ok) {
                if (ok) AdminCMS.init(function () { AdminUI.showApp(); });
                else AdminUI.showLogin();
            });
        } else {
            AdminUI.showLogin();
        }
    },

    login: function () {
        var input = document.getElementById('token-input');
        var err = document.getElementById('login-error');
        var btn = document.getElementById('login-btn');
        var token = (input.value || '').trim();

        err.classList.remove('show');
        if (!token) {
            err.textContent = 'Please paste your access key first.';
            err.classList.add('show');
            return;
        }

        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Connecting...';
        ghToken = token;

        this.validate(function (ok, message) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-link"></i> Connect';
            if (ok) {
                localStorage.setItem(TOKEN_KEY, ghToken);
                AdminCMS.init(function () { AdminUI.showApp(); });
                AdminUI.toast('Connected! Welcome aboard.');
            } else {
                ghToken = '';
                err.textContent = message || 'That key did not work. Double-check it has access to ' + REPO + ' with "Contents: Read and write".';
                err.classList.add('show');
            }
        });
    },

    validate: function (cb) {
        fetch('https://api.github.com/user', {
            headers: { 'Authorization': 'Bearer ' + ghToken, 'Accept': 'application/vnd.github+json' }
        }).then(function (uRes) {
            if (uRes.status !== 200) {
                cb(false, 'This key is invalid or has expired. Please generate a new one.');
                return null;
            }
            return uRes.json().then(function (user) {
                USER_LOGIN = user.login || '';
                return fetch('https://api.github.com/repos/' + REPO, {
                    headers: { 'Authorization': 'Bearer ' + ghToken, 'Accept': 'application/vnd.github+json' }
                });
            });
        }).then(function (res) {
            if (!res) return;
            if (res.status === 200) cb(true);
            else if (res.status === 403 || res.status === 404)
                cb(false, 'This key cannot see ' + REPO + '. Make sure it is fine-grained, set to "Only select repositories", with this repo selected.');
            else cb(false, 'GitHub returned an unexpected response (' + res.status + ').');
        }).catch(function () {
            cb(false, 'Could not reach GitHub. Check your internet connection and try again.');
        });
    },

    logout: function () {
        localStorage.removeItem(TOKEN_KEY);
        ghToken = '';
        AdminUI.showLogin();
        AdminUI.toast('Signed out. Your key was removed from this browser.');
    }
};

/* ======================== CMS DATA LAYER ======================== */
var AdminCMS = {

    live: null,
    draft: null,
    loadError: null,
    _saveTimer: null,

    init: function (cb) {
        var self = this;
        this.live = null;
        this.draft = null;
        this.loadError = null;

        this.ghGetJson('content.json', function (err, data) {
            if (err) {
                self.loadError = 'Could not load the website content from GitHub (' + err + ').';
                self.live = {};
            } else {
                self.live = data;
            }
            var stored = null;
            try { stored = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); } catch (e) { /* ignore */ }
            self.draft = stored ? deepMerge(deepClone(self.live), stored) : deepClone(self.live);
            cb();
        });
    },

    /* ---- GitHub file helpers ---- */
    ghGetJson: function (path, cb) {
        fetch('https://api.github.com/repos/' + REPO + '/contents/' + path + '?ref=' + BRANCH + '&t=' + Date.now(), {
            headers: { 'Authorization': 'Bearer ' + ghToken, 'Accept': 'application/vnd.github+json' }
        }).then(function (res) {
            if (res.status === 404) return cb('not found', null);
            if (!res.ok) return cb('HTTP ' + res.status, null);
            return res.json().then(function (json) {
                try { cb(null, JSON.parse(b64decode(json.content))); }
                catch (e) { cb('bad json', null); }
            });
        }).catch(function () { cb('network', null); });
    },

    ghPutJson: function (path, obj, message, cb) {
        var self = this;
        fetch('https://api.github.com/repos/' + REPO + '/contents/' + path + '?ref=' + BRANCH, {
            headers: { 'Authorization': 'Bearer ' + ghToken, 'Accept': 'application/vnd.github+json' }
        }).then(function (res) {
            /* 404 simply means the file does not exist yet -> no sha needed */
            return res.status === 404 ? null : res.json();
        }).then(function (json) {
            var body = {
                message: message,
                branch: BRANCH,
                content: b64encode(JSON.stringify(obj, null, 2))
            };
            if (json && json.sha) body.sha = json.sha;
            return fetch('https://api.github.com/repos/' + REPO + '/contents/' + path, {
                method: 'PUT',
                headers: {
                    'Authorization': 'Bearer ' + ghToken,
                    'Accept': 'application/vnd.github+json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(body)
            });
        }).then(function (res) {
            if (res.ok) cb(null);
            else if (res.status === 409) cb('conflict');
            else cb('HTTP ' + res.status);
        }).catch(function () { cb('network'); });
    },

    /* ---- draft editing ---- */
    get: function (path) { return getPath(this.draft, path); },

    set: function (path, value) {
        setPath(this.draft, path, value);

        /* phone tap-to-call number derives automatically from the display number */
        if (path === 'store.phone') {
            setPath(this.draft, 'store.phoneHref', (value || '').replace(/[^+0-9]/g, ''));
        }
        this.autosave();
    },

    setNum: function (path, value) {
        var n = parseFloat(value);
        setPath(this.draft, path, isNaN(n) ? 0 : n);
        this.autosave();
    },

    listOp: function (path, op, index, defaults) {
        var arr = getPath(this.draft, path) || [];
        if (op === 'add') arr.push(deepClone(defaults || ''));
        if (op === 'remove') arr.splice(index, 1);
        if (op === 'up' && index > 0) arr.splice(index - 1, 0, arr.splice(index, 1)[0]);
        if (op === 'down' && index < arr.length - 1) arr.splice(index + 1, 0, arr.splice(index, 1)[0]);
        setPath(this.draft, path, arr);
        this.autosave();
        AdminUI.rerenderTab();
    },

    autosave: function () {
        var self = this;
        clearTimeout(this._saveTimer);
        this._saveTimer = setTimeout(function () {
            try { localStorage.setItem(DRAFT_KEY, JSON.stringify(self.draft)); } catch (e) { /* storage full */ }
            AdminUI.updateDraftBadge();
        }, 300);
        AdminUI.updateDraftBadge();
    },

    clearStoredDraft: function () {
        localStorage.removeItem(DRAFT_KEY);
    },

    changes: function () {
        return this.live ? diffCount(this.live, this.draft) : 0;
    },

    /* ---- publish ---- */
    push: function () {
        var self = this;
        if (this.loadError) return AdminUI.toast(this.loadError);
        var n = this.changes();
        if (n === 0) return AdminUI.toast('No unpublished changes - you are all caught up!');

        AdminUI.confirm(
            'Push to Website?',
            'You have ' + n + ' unpublished change' + (n > 1 ? 's' : '') +
            '. This will update the live website (it goes live about a minute after pushing). ' +
            'The current version is backed up automatically, so you can restore it.',
            'Yes, push it',
            function () { self.doPush(); }
        );
    },

    doPush: function () {
        var self = this;
        var btn = document.getElementById('push-btn');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Pushing...';

        /* prepare metadata + derived values */
        this.draft.store = this.draft.store || {};
        this.draft.store.phoneHref = (this.draft.store.phone || '').replace(/[^+0-9]/g, '');
        this.draft._meta = this.draft._meta || {};
        this.draft._meta.version = ((this.live && this.live._meta && this.live._meta.version) || 0) + 1;
        this.draft._meta.lastPushed = new Date().toISOString();
        this.draft._meta.pushedBy = USER_LOGIN || 'admin';

        /* 1 - back up current live version */
        this.ghPutJson('content.backup.json', this.live,
            'Backup website content (v' + ((this.live._meta && this.live._meta.version) || 0) + ')',
            function (err) {
                if (err) return self.pushFail(btn, 'Backing up failed: ' + err);

                /* 2 - publish the new version */
                self.ghPutJson('content.json', self.draft,
                    'Update website content (v' + self.draft._meta.version + ')',
                    function (err2) {
                        if (err2) return self.pushFail(btn, 'Publishing failed: ' + err2);
                        self.live = deepClone(self.draft);
                        self.clearStoredDraft();
                        btn.disabled = false;
                        btn.innerHTML = '<i class="fas fa-rocket"></i> Push to Website';
                        AdminUI.updateDraftBadge();
                        AdminUI.rerenderTab();
                        AdminUI.toast('Pushed! Your changes are going live. 🎉');
                    });
            });
    },

    pushFail: function (btn, msg) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-rocket"></i> Push to Website';
        AdminUI.toast(msg + (msg.indexOf('conflict') !== -1 ? ' - the website changed meanwhile, reloading content.' : ''));
        if (msg.indexOf('conflict') !== -1) {
            var self = this;
            this.clearStoredDraft();
            this.init(function () { AdminUI.rerenderTab(); AdminUI.updateDraftBadge(); });
        }
    },

    /* ---- restore (swap live <-> backup) ---- */
    restore: function () {
        var self = this;
        this.ghGetJson('content.backup.json', function (err, backup) {
            if (err || !backup) {
                return AdminUI.toast('No previous version found yet - it is created the first time you push.');
            }
            AdminUI.confirm(
                'Restore the previous version?',
                'This puts back the version from before the last push. Anything published after that will be replaced. Your current unpublished drafts are also cleared.',
                'Yes, restore it',
                function () {
                    self.ghPutJson('content.json', backup, 'Restore previous website version', function (e1) {
                        if (e1) return AdminUI.toast('Restore failed: ' + e1);
                        self.ghPutJson('content.backup.json', self.live, 'Backup version before restore', function () {
                            self.live = backup;
                            self.draft = deepClone(backup);
                            self.clearStoredDraft();
                            AdminUI.updateDraftBadge();
                            AdminUI.rerenderTab();
                            AdminUI.toast('Previous version restored. The website is updating.');
                        });
                    });
                }
            );
        });
    },

    discardDraft: function () {
        var self = this;
        AdminUI.confirm(
            'Discard your unpublished changes?',
            'This throws away every unpublished edit and goes back to the live website content. This cannot be undone.',
            'Yes, discard',
            function () {
                self.draft = deepClone(self.live);
                self.clearStoredDraft();
                AdminUI.updateDraftBadge();
                AdminUI.rerenderTab();
                AdminUI.toast('Unpublished changes discarded.');
            }
        );
    }
};

/* ======================== UI ======================== */
var AdminUI = {

    currentTab: 'dashboard',
    searchView: false,

    TAB_TITLES: {
        dashboard: 'Dashboard',
        home: 'Home',
        myhealth: 'My Health',
        services: 'Pharmacy Services',
        location: 'Where Are We',
        who: 'Who We Are',
        contact: 'Contact',
        footer: 'Footer',
        loading: 'Loading Screens',
        settings: 'Settings'
    },

    /* which admin section owns which content paths (for search jumps) */
    sectionForPath: function (path) {
        if (path.indexOf('home.') === 0) return 'home';
        if (path.indexOf('whoWeAre.') === 0) return 'who';
        if (path.indexOf('servicesPages.') === 0) return 'services';
        if (path.indexOf('contactPage.') === 0) return 'contact';
        if (path.indexOf('locationPage.') === 0) return 'location';
        if (path.indexOf('store.hours') === 0 ||
            /^store\.(lat|lng|zoom|mapsUrl|plusCode|addressLine1|addressLine2)/.test(path)) return 'location';
        if (path.indexOf('store.') === 0) return 'contact';
        if (path.indexOf('footer.') === 0) return 'footer';
        return 'dashboard';
    },

    showLogin: function () {
        document.getElementById('screen-login').style.display = 'flex';
        document.getElementById('screen-app').classList.remove('on');
    },

    showApp: function () {
        document.getElementById('screen-login').style.display = 'none';
        document.getElementById('screen-app').classList.add('on');
        document.getElementById('push-btn').disabled = false;
        this.switchTab('dashboard');
        this.updateDraftBadge();
    },

    switchTab: function (tab) {
        this.currentTab = tab;
        this.searchView = false;

        document.querySelectorAll('.nav-item').forEach(function (btn) {
            btn.classList.toggle('active', btn.getAttribute('data-tab') === tab);
        });

        document.getElementById('topbar-title').textContent =
            this.TAB_TITLES[tab] || 'Dashboard';

        var panel = document.getElementById('panel');
        panel.scrollTop = 0;

        if (tab === 'dashboard') this.renderDashboard();
        else if (tab === 'home') this.renderHome();
        else if (tab === 'services') this.renderServices();
        else if (tab === 'who') this.renderWho();
        else if (tab === 'contact') this.renderContact();
        else if (tab === 'location') this.renderLocation();
        else if (tab === 'footer') this.renderFooter();
        else if (tab === 'settings') this.renderSettings();
        else this.renderComingSoon(tab);
    },

    rerenderTab: function () {
        if (this.searchView) { this.renderSearch(this._lastQuery || ''); return; }
        this.switchTab(this.currentTab);
    },

    /* ============ FIELD BUILDERS ============ */
    fld: function (path, label, opts) {
        opts = opts || {};
        var v = AdminCMS.get(path);
        if (v == null) v = '';
        var input;
        if (opts.area) {
            input = '<textarea class="fld" rows="' + (opts.rows || 3) + '" data-path="' + path + '" ' +
                'oninput="AdminCMS.set(\'' + path + '\', this.value)">' + escHtml(v) + '</textarea>';
        } else {
            input = '<input class="fld" type="' + (opts.type || 'text') + '" value="' + escAttr(v) + '" data-path="' + path + '" ' +
                'oninput="AdminCMS.set(\'' + path + '\', this.value)">';
        }
        return '<div class="form-field"><label>' + label + '</label>' + input +
            (opts.hint ? '<p class="hint">' + opts.hint + '</p>' : '') + '</div>';
    },

    numFld: function (path, label, opts) {
        opts = opts || {};
        var v = AdminCMS.get(path);
        if (v == null) v = '';
        return '<div class="form-field"><label>' + label + '</label>' +
            '<input class="fld" type="number" step="any" value="' + escAttr(v) + '" data-path="' + path + '" ' +
            'oninput="AdminCMS.setNum(\'' + path + '\', this.value)">' +
            (opts.hint ? '<p class="hint">' + opts.hint + '</p>' : '') + '</div>';
    },

    /* listEditor: items are objects with named fields, or plain strings */
    listEditor: function (path, addLabel, fields, defaults) {
        var arr = AdminCMS.get(path);
        if (!Array.isArray(arr)) arr = [];
        var isPlain = fields.length === 1 && !fields[0].key;

        var rows = arr.map(function (item, i) {
            var inputs = fields.map(function (f) {
                var ip = isPlain ? path + '.' + i : path + '.' + i + '.' + f.key;
                var v = isPlain ? item : (item ? item[f.key] : '');
                if (f.type === 'select') {
                    var opts = f.options.map(function (o) {
                        return '<option value="' + escAttr(o[0]) + '"' + (v === o[0] ? ' selected' : '') + '>' + escHtml(o[1]) + '</option>';
                    }).join('');
                    return '<select class="fld" data-path="' + ip + '" onchange="AdminCMS.set(\'' + ip + '\', this.value)">' + opts + '</select>';
                }
                return '<input class="fld" value="' + escAttr(v == null ? '' : v) + '" data-path="' + ip + '" ' +
                    'oninput="AdminCMS.set(\'' + ip + '\', this.value)" placeholder="' + escAttr(f.label) + '">';
            }).join('');
            return '<div class="list-row">' +
                '<span class="row-num">' + (i + 1) + '</span>' + inputs +
                '<div class="row-actions">' +
                '<button class="mini-btn" title="Move up" onclick="AdminCMS.listOp(\'' + path + '\',\'up\',' + i + ')"><i class="fas fa-arrow-up"></i></button>' +
                '<button class="mini-btn" title="Move down" onclick="AdminCMS.listOp(\'' + path + '\',\'down\',' + i + ')"><i class="fas fa-arrow-down"></i></button>' +
                '<button class="mini-btn danger" title="Remove" onclick="AdminCMS.listOp(\'' + path + '\',\'remove\',' + i + ')"><i class="fas fa-trash"></i></button>' +
                '</div></div>';
        }).join('');

        return rows +
            '<button class="add-btn" onclick="AdminCMS.listOp(\'' + path + '\',\'add\',0,' +
            escAttr(JSON.stringify(defaults == null ? '' : defaults)) + ')"><i class="fas fa-plus"></i> ' + addLabel + '</button>';
    },

    card: function (icon, title, sub, body) {
        return '<div class="edit-card"><h4><i class="fas ' + icon + '"></i>' + title + '</h4>' +
            (sub ? '<p class="card-sub">' + sub + '</p>' : '') + body + '</div>';
    },

    /* ============ DASHBOARD ============ */
    renderDashboard: function () {
        var v = (AdminCMS.live && AdminCMS.live._meta && AdminCMS.live._meta.version) || 0;
        var pushed = AdminCMS.live && AdminCMS.live._meta && AdminCMS.live._meta.lastPushed;
        var pushedTxt = pushed ? new Date(pushed).toLocaleString() : 'never yet';
        var changes = AdminCMS.changes();

        document.getElementById('panel').innerHTML = `
            <div class="welcome-card">
                <h2>Welcome back${USER_LOGIN ? ', ' + escHtml(USER_LOGIN) : ''}</h2>
                <p>Make your changes on the left - they save automatically and nothing goes live
                   until you press <strong>Push to Website</strong>.</p>
            </div>

            <div class="stat-grid">
                <div class="stat-card">
                    <div class="stat-icon icon-orange"><i class="fas fa-cloud-arrow-up"></i></div>
                    <div class="stat-value">${changes}</div>
                    <div class="stat-label">Unpublished changes</div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon icon-grey"><i class="fas fa-clock-rotate-left"></i></div>
                    <div class="stat-value sm" style="font-size:1.05rem;">Version ${v}</div>
                    <div class="stat-label">Last pushed: ${pushedTxt}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon icon-green"><i class="fas fa-circle-check"></i></div>
                    <div class="stat-value" style="font-size:1.05rem;">Connected</div>
                    <div class="stat-label">${REPO}</div>
                </div>
            </div>

            <h4 class="section-heading">Quick actions</h4>
            <div class="panel-grid">
                <button class="action-card" onclick="AdminUI.switchTab('contact')">
                    <i class="fas fa-address-book"></i>
                    <h4>Contact details</h4>
                    <p>Phone, email, address and the contact form - updates everywhere at once.</p>
                </button>
                <button class="action-card" onclick="AdminUI.switchTab('location')">
                    <i class="fas fa-map-marker-alt"></i>
                    <h4>Location & hours</h4>
                    <p>Address, map position and weekly opening hours for the Where Are We page.</p>
                </button>
                <button class="action-card" onclick="AdminUI.switchTab('footer')">
                    <i class="fas fa-shoe-prints"></i>
                    <h4>Footer</h4>
                    <p>Every link, heading and line of text in the website footer.</p>
                </button>
                <button class="action-card" onclick="AdminCMS.restore()">
                    <i class="fas fa-clock-rotate-left"></i>
                    <h4>Restore previous version</h4>
                    <p>Put back the website content from before the last push.</p>
                </button>
            </div>

            ${changes > 0 ? `
            <div class="edit-card">
                <h4><i class="fas fa-triangle-exclamation" style="color:var(--warn)"></i>You have unpublished changes</h4>
                <p class="card-sub">They are saved in this browser only. Push them to make them live, or discard them to start fresh from the live version.</p>
                <button class="danger-btn" onclick="AdminCMS.discardDraft()"><i class="fas fa-rotate-left"></i> Discard unpublished changes</button>
            </div>` : ''}

            <div class="how-card">
                <h4 class="section-heading" style="margin-top:0;">How this works</h4>
                <div class="how-steps">
                    <div class="how-step"><div class="num">1</div><h4>Make changes</h4><p>Pick a section and edit anything. Every change saves automatically as a draft in this browser.</p></div>
                    <div class="how-step"><div class="num">2</div><h4>Review</h4><p>The orange badge shows unpublished changes. You can always restore the previous version.</p></div>
                    <div class="how-step"><div class="num">3</div><h4>Push to Website</h4><p>Press the orange button and your changes go live on the website in about a minute.</p></div>
                </div>
            </div>`;
    },

    /* ============ HOME ============ */
    renderHome: function () {
        var self = this;
        var slides = '';
        for (var i = 0; i < 3; i++) {
            slides += this.card('fa-image', 'Slide ' + (i + 1), 'The big rotating banner on the homepage. Use a direct image link (a .jpg or .png URL).', `
                ${this.fld('home.slides.' + i + '.image', 'Background image link', { hint: 'Paste a direct link to an image. Uploads arrive in a later update.' })}
                ${this.fld('home.slides.' + i + '.title', 'Big heading')}
                ${this.fld('home.slides.' + i + '.text', 'Small text')}
                <div class="field-row">
                    ${this.fld('home.slides.' + i + '.btnLabel', 'Button text')}
                    ${this.fld('home.slides.' + i + '.btnHref', 'Button link', { hint: 'Where the button goes, e.g. services/prescriptions.html' })}
                </div>`);
        }

        var cards = '';
        for (var j = 0; j < 3; j++) {
            cards += this.card('fa-square-poll-horizontal', 'Card ' + (j + 1), 'One of the three service cards under "Pharmacy Services".', `
                ${this.fld('home.services.cards.' + j + '.image', 'Image link')}
                ${this.fld('home.services.cards.' + j + '.title', 'Card title')}
                ${this.fld('home.services.cards.' + j + '.text', 'Card text', { area: true, rows: 2 })}
                <div class="field-row">
                    ${this.fld('home.services.cards.' + j + '.linkLabel', 'Link text')}
                    ${this.fld('home.services.cards.' + j + '.linkHref', 'Link')}
                </div>`);
        }

        document.getElementById('panel').innerHTML =
            this.card('fa-images', 'Homepage banner slides', 'The three slides rotate automatically on the homepage.', slides) +
            this.card('fa-award', 'Quality banner', 'The "Quality Guaranteed" section.', `
                <div class="field-row">
                    ${this.fld('home.quality.title', 'Heading')}
                    ${this.fld('home.quality.sub', 'Subtitle')}
                </div>
                ${this.fld('home.quality.text', 'Text', { area: true, rows: 3 })}
                <div class="field-row">
                    ${this.fld('home.quality.btnLabel', 'Button text')}
                    ${this.fld('home.quality.btnHref', 'Button link')}
                </div>`) +
            this.card('fa-list', 'Services section', 'The heading and three cards in the middle of the homepage.', `
                <div class="field-row">
                    ${this.fld('home.services.heading', 'Heading')}
                    ${this.fld('home.services.subheading', 'Subtitle')}
                </div>`) + cards +
            this.card('fa-envelope', 'Email signup', 'The blue subscribe box near the bottom of the homepage.', `
                ${this.fld('home.subscription.title', 'Heading')}
                ${this.fld('home.subscription.text', 'Text', { area: true, rows: 2 })}
                <div class="field-row">
                    ${this.fld('home.subscription.placeholder', 'Email box placeholder')}
                    ${this.fld('home.subscription.btnLabel', 'Button text')}
                </div>`);
    },

    /* ============ PHARMACY SERVICES ============ */
    SVC_HUBS: [
        { key: 'prescriptions', name: 'Prescriptions', icon: 'fa-prescription' },
        { key: 'vaccinations', name: 'Vaccinations', icon: 'fa-syringe' },
        { key: 'assessments_monitoring', name: 'Assessments & Monitoring', icon: 'fa-heart-pulse' },
        { key: 'medication_customization', name: 'Medication Customization', icon: 'fa-mortar-pestle' },
        { key: 'wellness_consultation', name: 'Wellness Consultation', icon: 'fa-leaf' }
    ],

    renderServices: function () {
        var hub = this._svcHub || 'prescriptions';
        var pills = this.SVC_HUBS.map(function (h) {
            return '<button class="pill' + (h.key === hub ? ' active' : '') + '" onclick="AdminUI.renderServiceHub(\'' + h.key + '\')">' +
                '<i class="fas ' + h.icon + '"></i> ' + h.name + '</button>';
        }).join('');
        document.getElementById('panel').innerHTML =
            '<div class="pill-row">' + pills + '</div>' +
            this.svcHubCards(hub);
    },

    renderServiceHub: function (key) {
        this._svcHub = key;
        this.renderServices();
    },

    svcHubCards: function (hub) {
        var k = 'servicesPages.' + hub;
        var html = this.card('fa-flag', 'Page banner', 'The blue banner at the top of the page.', `
            ${this.fld(k + '.bannerTitle', 'Title')}
            ${AdminCMS.get(k + '.bannerSub') != null ? this.fld(k + '.bannerSub', 'Subtitle') : ''}`);

        if (AdminCMS.get(k + '.introHeading') != null) {
            html += this.card('fa-book-open', 'Intro', 'The first text block under the banner. The phone button always uses the number from Where Are We.', `
                ${this.fld(k + '.introHeading', 'Heading')}
                ${this.fld(k + '.introPara1', 'Paragraph 1', { area: true, rows: 3 })}
                ${AdminCMS.get(k + '.introPara2') != null ? this.fld(k + '.introPara2', 'Paragraph 2', { area: true, rows: 3 }) : ''}
                ${this.fld(k + '.introImg', 'Photo link')}`);
        }

        var blocks = AdminCMS.get(k + '.blocks') || [];
        for (var i = 0; i < blocks.length; i++) {
            html += this.card('fa-layer-group', 'Section ' + (i + 1) + (blocks[i] && blocks[i].heading ? ' - ' + blocks[i].heading : ''),
                'One of the photo-and-text rows on this page.', `
                ${this.fld(k + '.blocks.' + i + '.heading', 'Heading')}
                ${this.fld(k + '.blocks.' + i + '.text', 'Text', { area: true, rows: 3 })}
                <div class="field-row">
                    ${this.fld(k + '.blocks.' + i + '.btnLabel', 'Button text')}
                    ${this.fld(k + '.blocks.' + i + '.btnHref', 'Button link')}
                </div>
                ${this.fld(k + '.blocks.' + i + '.img', 'Photo link')}`);
        }

        var boxes = AdminCMS.get(k + '.infoBoxes') || [];
        for (var b = 0; b < boxes.length; b++) {
            html += this.card('fa-circle-info', 'Good to know ' + (b + 1), 'One of the grey info boxes.', `
                ${this.fld(k + '.infoBoxes.' + b + '.heading', 'Heading')}
                ${this.fld(k + '.infoBoxes.' + b + '.text', 'Text', { area: true, rows: 3 })}`);
        }

        if (hub === 'vaccinations') {
            html += this.card('fa-store', 'Visit us box', 'This box always shows the address, hours, phone and map link from the Where Are We section - no need to edit it here.', '');
            html += this.card('fa-syringe', 'Vaccines available', 'The grid of vaccine tiles. Add or remove vaccines with the buttons - each tile keeps its little icon.', `
                ${this.fld(k + '.vaccinesHeading', 'Section heading')}
                ${this.fld(k + '.vaccinesIntro', 'Section intro', { area: true, rows: 2 })}
                ${this.listEditor(k + '.vaccines', 'Add a vaccine', [{ key: 'name', label: 'Vaccine name' }], { icon: 'fa-syringe', name: 'New vaccine' })}
                ${this.fld(k + '.vaccinesNote', 'Small note under the grid')}`);
            var fam = AdminCMS.get(k + '.familyCards') || [];
            var famHtml = this.fld(k + '.familyHeading', 'Section heading') + this.fld(k + '.familyIntro', 'Section intro', { area: true, rows: 2 });
            for (var f = 0; f < fam.length; f++) {
                famHtml += this.fld(k + '.familyCards.' + f + '.title', 'Card ' + (f + 1) + ' title') +
                    this.fld(k + '.familyCards.' + f + '.text', 'Card ' + (f + 1) + ' text', { area: true, rows: 3 }) +
                    '<div class="field-row">' +
                    this.fld(k + '.familyCards.' + f + '.linkLabel', 'Card ' + (f + 1) + ' link text') +
                    this.fld(k + '.familyCards.' + f + '.linkHref', 'Card ' + (f + 1) + ' link') +
                    '</div>';
            }
            html += this.card('fa-people-roof', 'Protection for your family', 'The three cards about flu, travel and other disease protection.', famHtml);
        }

        if (AdminCMS.get(k + '.suggestedHeading') != null) {
            var sug = '<div class="field-row">' +
                this.fld(k + '.suggestedHeading', 'Heading') +
                this.fld(k + '.suggestedSub', 'Subtitle') + '</div>';
            var sc = AdminCMS.get(k + '.suggestedCards') || [];
            for (var c = 0; c < sc.length; c++) {
                sug += this.fld(k + '.suggestedCards.' + c + '.title', 'Card ' + (c + 1) + ' title') +
                    this.fld(k + '.suggestedCards.' + c + '.text', 'Card ' + (c + 1) + ' text', { area: true, rows: 2 }) +
                    '<div class="field-row">' +
                    this.fld(k + '.suggestedCards.' + c + '.linkLabel', 'Card ' + (c + 1) + ' link text') +
                    this.fld(k + '.suggestedCards.' + c + '.linkHref', 'Card ' + (c + 1) + ' link') +
                    '</div>';
            }
            html += this.card('fa-lightbulb', 'Suggested services', 'The three cards at the bottom of the page.', sug);
        }

        return html;
    },

    /* ============ WHO WE ARE ============ */
    renderWho: function () {
        var timeline = '';
        for (var i = 0; i < 4; i++) {
            timeline += this.card('fa-clock-rotate-left', 'Milestone ' + (i + 1), 'One step of the history timeline.', `
                <div class="field-row">
                    ${this.fld('whoWeAre.timeline.' + i + '.year', 'Year')}
                    ${this.fld('whoWeAre.timeline.' + i + '.title', 'Title')}
                </div>
                ${this.fld('whoWeAre.timeline.' + i + '.text', 'Text', { area: true, rows: 2 })}`);
        }

        document.getElementById('panel').innerHTML =
            this.card('fa-flag', 'Banner', 'The blue banner at the top of the page.', `
                <div class="field-row">
                    ${this.fld('whoWeAre.bannerTitle', 'Title')}
                    ${this.fld('whoWeAre.bannerSub', 'Subtitle')}
                </div>`) +
            this.card('fa-book-open', 'Intro story', 'The main story at the top of the page.', `
                ${this.fld('whoWeAre.introHeading', 'Heading')}
                ${this.fld('whoWeAre.introPara1', 'Paragraph 1', { area: true, rows: 3 })}
                ${this.fld('whoWeAre.introPara2', 'Paragraph 2', { area: true, rows: 4 })}
                ${this.fld('whoWeAre.introPara3', 'Paragraph 3 (short line)', { area: true, rows: 2 })}
                ${this.fld('whoWeAre.introImg', 'Photo link')}
                <div class="field-row">
                    ${this.fld('whoWeAre.ctaCallLabel', 'Call button text')}
                    ${this.fld('whoWeAre.ctaWhereLabel', 'Where Are We button text')}
                </div>`) +
            this.card('fa-store', 'Your Markham story', 'The section about this pharmacy specifically.', `
                ${this.fld('whoWeAre.localHeading', 'Heading')}
                ${this.fld('whoWeAre.localPara1', 'Paragraph 1', { area: true, rows: 4 })}
                ${this.fld('whoWeAre.localPara2', 'Paragraph 2', { area: true, rows: 3 })}
                ${this.fld('whoWeAre.localImg', 'Photo link')} `) +
            this.card('fa-clock-rotate-left', 'History timeline', 'The four milestones with year badges.', timeline) +
            this.card('fa-network-wired', 'McKesson section', 'The network box near the bottom.', `
                ${this.fld('whoWeAre.mckessonHeading', 'Heading')}
                ${this.fld('whoWeAre.mckessonText', 'Text', { area: true, rows: 5 })}`) +
            this.card('fa-scale-small', 'Small print', 'The disclaimer line at the very bottom.', `
                ${this.fld('whoWeAre.disclaimer', 'Disclaimer text', { area: true, rows: 2 })}`);
    },

    /* ============ CONTACT ============ */
    renderContact: function () {
        var html =
            this.card('fa-store', 'Store details', 'These details update the contact page, the Where Are We page, and every call button across the website.', `
                ${this.fld('store.name', 'Pharmacy name')}
                <div class="field-row">
                    ${this.fld('store.phone', 'Phone number', { hint: 'Shown on the site and used by every "Call now" button. The tap-to-call number is set automatically.' })}
                    ${this.fld('store.badge', 'Badge text', { hint: 'Small green badge, e.g. "Open Now".' })}
                </div>
                ${this.fld('store.email', 'Email (optional)', { hint: 'Leave empty to hide the email row on the contact page.' })}
            `) +
            this.card('fa-envelope-open-text', 'Contact page texts', 'The wording on the Contact Us page.', `
                <div class="field-row">
                    ${this.fld('contactPage.bannerTitle', 'Banner title')}
                    ${this.fld('contactPage.bannerSub', 'Banner subtitle')}
                </div>
                ${this.fld('contactPage.formHeading', 'Form heading')}
                ${this.fld('contactPage.formIntro', 'Form intro text', { area: true })}
                ${this.fld('contactPage.formNote', 'Small note under the button', { area: true, rows: 2 })}
                ${this.fld('contactPage.formspreeId', 'Formspree form ID', { hint: 'Create a free form at <a href="https://formspree.io" target="_blank" rel="noopener">formspree.io</a>, then paste the ID here (it looks like "xwkgabcd"). Until then the form button will not send.' })}
            `) +
            this.card('fa-list-check', 'Contact form topics', 'The options in the "What can we help you with?" dropdown.', this.listEditor('contactPage.topics', 'Add a topic', [{ label: 'Topic' }], 'New topic'));
        document.getElementById('panel').innerHTML = html;
    },

    /* ============ LOCATION ============ */
    renderLocation: function () {
        var hours = AdminCMS.get('store.hours') || [];
        var hourRows = hours.map(function (row, i) {
            return '<div class="list-row">' +
                '<span class="row-num">' + (i + 1) + '</span>' +
                '<input class="fld" style="max-width:150px" value="' + escAttr(row.day) + '" data-path="store.hours.' + i + '.day" oninput="AdminCMS.set(\'store.hours.' + i + '.day\', this.value)">' +
                '<input class="fld" value="' + escAttr(row.time) + '" data-path="store.hours.' + i + '.time" oninput="AdminCMS.set(\'store.hours.' + i + '.time\', this.value)">' +
                '</div>';
        }).join('');

        var html =
            this.card('fa-map-location-dot', 'Address & map', 'Where the pharmacy is and where the map points. Used on the Where Are We page and the Contact page.', `
                <div class="field-row">
                    ${this.fld('store.addressLine1', 'Street address')}
                    ${this.fld('store.addressLine2', 'City & postal code')}
                </div>
                ${this.fld('store.mapsUrl', 'Google Maps link', { hint: 'Open your listing in Google Maps, click Share → Copy link, and paste it here.' })}
                ${this.fld('store.plusCode', 'Plus code (optional)', { hint: 'The short code Google shows for your location, e.g. "WP4M+M7 Markham".' })}
                <div class="field-row">
                    ${this.numFld('store.lat', 'Map latitude')}
                    ${this.numFld('store.lng', 'Map longitude')}
                </div>
                ${this.numFld('store.zoom', 'Map zoom', { hint: 'How close the map starts. Around 15 is street level.' })}
            `) +
            this.card('fa-image', 'Page banner', 'The big blue banner at the top of the Where Are We page.', `
                <div class="field-row">
                    ${this.fld('locationPage.bannerTitle', 'Banner title')}
                    ${this.fld('locationPage.bannerSub', 'Banner subtitle')}
                </div>
            `) +
            this.card('fa-clock', 'Weekly opening hours', 'Shown as a list on the Where Are We page and as a summary on the Contact page. Today\'s row is highlighted automatically.', hourRows +
                '<p class="hint">Order is Monday to Sunday. Write "Closed" for days you are closed. To change the order or number of rows, edit in the next update.</p>');
        document.getElementById('panel').innerHTML = html;
    },

    /* ============ FOOTER ============ */
    renderFooter: function () {
        var self = this;
        var columns = AdminCMS.get('footer.columns') || [];

        var colHtml = columns.map(function (col, ci) {
            return self.card('fa-list', 'Column ' + (ci + 1), 'Heading and links for this footer column.', `
                ${self.fld('footer.columns.' + ci + '.heading', 'Column heading')}
                <label style="display:block;font-size:0.76rem;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-light);margin:10px 0 8px;">Links</label>
                ${self.listEditor('footer.columns.' + ci + '.links', 'Add a link',
                    [{ key: 'label', label: 'Text' }, { key: 'href', label: 'Link (e.g. services/prescriptions.html or https://...)' }],
                    { label: 'New link', href: '#' })}
            `);
        }).join('');

        var html =
            this.card('fa-pen', 'Footer texts', 'General wording at the bottom of every page.', `
                ${this.fld('footer.socialHeading', '"Follow us" heading')}
                ${this.fld('footer.bottomText', 'Copyright line', { area: true, rows: 2 })}
            `) + colHtml +
            this.card('fa-hashtag', 'Social links', 'Your social profiles shown as icon buttons.', this.listEditor('footer.social', 'Add a social link', [
                { key: 'icon', label: 'Icon', type: 'select', options: SOCIAL_ICONS },
                { key: 'label', label: 'Name' },
                { key: 'href', label: 'Link' }
            ], { icon: 'fab fa-facebook-f', label: 'Facebook', href: '#' }));
        document.getElementById('panel').innerHTML = html;
    },

    /* ============ SETTINGS ============ */
    renderSettings: function () {
        var masked = ghToken ? ghToken.substring(0, 7) + '••••••••••••' : 'not connected';
        var meta = (AdminCMS.live && AdminCMS.live._meta) || {};
        document.getElementById('panel').innerHTML = `
            <div class="settings-card">
                <h4><i class="fas fa-plug-circle-check" style="color:var(--ok)"></i> Website connection</h4>
                <p>Your access key connects this panel to the live website.</p>
                <div class="val">${REPO} &nbsp;•&nbsp; key: ${masked} &nbsp;•&nbsp; signed in as: ${escHtml(USER_LOGIN || '-')}</div>
            </div>
            <div class="settings-card">
                <h4><i class="fas fa-clock-rotate-left" style="color:var(--primary)"></i> Versions</h4>
                <p class="version-line">Current live version: <strong>${meta.version || 0}</strong> · Last pushed: <strong>${meta.lastPushed ? new Date(meta.lastPushed).toLocaleString() : 'never'}</strong> by ${escHtml(meta.pushedBy || '-')}</p>
                <button class="btn-ghost" style="margin-right:10px" onclick="AdminCMS.restore()"><i class="fas fa-clock-rotate-left"></i> Restore previous version</button>
                <button class="danger-btn" onclick="AdminCMS.discardDraft()"><i class="fas fa-rotate-left"></i> Discard unpublished changes</button>
            </div>
            <div class="settings-card">
                <h4><i class="fas fa-image" style="color:var(--primary)"></i> Images</h4>
                <p>Uploaded images are stored with the website today. Later this will switch to a faster image service (Cloudinary) - nothing you need to do.</p>
            </div>
            <div class="settings-card">
                <h4><i class="fas fa-paper-plane" style="color:var(--primary)"></i> Contact form delivery (Formspree)</h4>
                <p>The message box on the Contact page hands messages to a free Formspree account, which emails them to the pharmacy.</p>
                ${this.fld('contactPage.formspreeId', 'Your Formspree form ID', { hint: 'Create a free form at formspree.io, copy the ID it shows you (a short code like "mqkvzzab"), paste it here, then Push to Website. Until a real ID is set, the contact form cannot deliver messages.' })}
                <a class="btn-ghost" href="https://formspree.io" target="_blank" rel="noopener"><i class="fas fa-arrow-up-right-from-square"></i> Open formspree.io (new tab)</a>
            </div>
            <div class="settings-card">
                <h4><i class="fas fa-shield-halved" style="color:var(--warn)"></i> Danger zone</h4>
                <p>Sign out and remove the access key from this browser.</p>
                <button class="danger-btn" onclick="AdminAuth.logout()"><i class="fas fa-right-from-bracket"></i> Sign out</button>
            </div>`;
    },

    /* ============ COMING SOON ============ */
    renderComingSoon: function (tab) {
        var title = this.TAB_TITLES[tab] || 'This section';
        document.getElementById('panel').innerHTML = `
            <div class="empty-state">
                <i class="fas fa-screwdriver-wrench"></i>
                <h4>${title} is almost ready</h4>
                <p>This section gets its editing tools in a later update. Contact, Location &amp; hours and the Footer are ready now - more sections are coming.</p>
            </div>`;
    },

    /* ============ SEARCH ============ */
    search: function (q) {
        q = (q || '').trim().toLowerCase();

        /* filter sidebar as before */
        document.querySelectorAll('#sidebar-nav .nav-item').forEach(function (btn) {
            var label = btn.textContent.toLowerCase();
            btn.style.display = !q || label.indexOf(q) !== -1 ? 'flex' : 'none';
        });
        document.querySelectorAll('#sidebar-nav .nav-group-label').forEach(function (label) {
            label.style.display = q ? 'none' : 'block';
        });

        if (!q) {
            if (this.searchView) this.switchTab(this.currentTab);
            return;
        }
        this.renderSearch(q);
    },

    renderSearch: function (q) {
        this.searchView = true;
        this._lastQuery = q;
        document.getElementById('topbar-title').textContent = 'Search results';
        document.querySelectorAll('.nav-item').forEach(function (b) { b.classList.remove('active'); });

        var results = [];
        var self = this;

        (function walk(node, path) {
            if (results.length >= 40 || node === null || node === undefined) return;
            if (Array.isArray(node)) {
                node.forEach(function (v, i) { walk(v, path + '.' + i); });
            } else if (typeof node === 'object') {
                Object.keys(node).forEach(function (k) {
                    if (k.charAt(0) !== '_') walk(node[k], path ? path + '.' + k : k);
                });
            } else {
                var value = String(node == null ? '' : node);
                var pretty = self.prettyPath(path);
                if (pretty.toLowerCase().indexOf(q) !== -1 || value.toLowerCase().indexOf(q) !== -1) {
                    results.push({ path: path, label: pretty, value: value, section: self.sectionForPath(path) });
                }
            }
        })(AdminCMS.draft, '');

        var html = '<h4 class="section-heading">' + results.length + ' result' + (results.length === 1 ? '' : 's') + ' for "' + escHtml(q) + '"</h4>';
        if (results.length === 0) {
            html += '<div class="empty-state"><i class="fas fa-magnifying-glass"></i><h4>Nothing found</h4><p>Try a different word - search looks at every editable heading, text and link on the website.</p></div>';
        } else {
            html += results.map(function (r) {
                return '<button class="sr-item" onclick="AdminUI.goto(\'' + r.section + '\',\'' + escAttr(r.path) + '\')">' +
                    '<span class="sr-path">' + escHtml(r.label) + ' · ' + escHtml(self.TAB_TITLES[r.section] || '') + '</span>' +
                    '<span class="sr-val">' + (escHtml(r.value).slice(0, 90) || '<em style="color:#aaa">(empty)</em>') + '</span>' +
                    '</button>';
            }).join('');
        }
        document.getElementById('panel').innerHTML = html;
    },

    prettyPath: function (path) {
        var words = { store: 'Store', phone: 'Phone', badge: 'Badge', email: 'Email', name: 'Name', addressLine1: 'Street address', addressLine2: 'City & postal', plusCode: 'Plus code', mapsUrl: 'Maps link', lat: 'Latitude', lng: 'Longitude', zoom: 'Zoom', hours: 'Hours', day: 'Day', time: 'Time', contactPage: 'Contact page', locationPage: 'Where Are We', bannerTitle: 'Banner title', bannerSub: 'Banner subtitle', formHeading: 'Form heading', formIntro: 'Form intro', formNote: 'Form note', formspreeId: 'Formspree ID', topics: 'Topics', footer: 'Footer', columns: 'Column', links: 'Links', heading: 'Heading', label: 'Text', href: 'Link', icon: 'Icon', social: 'Social', socialHeading: 'Follow us heading', bottomText: 'Copyright line', slides: 'Slides', title: 'Title', text: 'Text', image: 'Image URL', btnLabel: 'Button text', btnHref: 'Button link', quality: 'Quality banner', sub: 'Subtitle', services: 'Services section', cards: 'Cards', subheading: 'Subtitle', moreLabel: 'More-link text', moreHref: 'More-link target', linkLabel: 'Link text', linkHref: 'Link', subscription: 'Email signup', placeholder: 'Placeholder', whoWeAre: 'Who We Are', servicesPages: 'Services', blocks: 'Photo sections', img: 'Photo link', suggestedHeading: 'Suggested heading', suggestedSub: 'Suggested subtitle', suggestedCards: 'Suggested cards', vaccines: 'Vaccine list', vaccinesHeading: 'Vaccine section heading', vaccinesIntro: 'Vaccine section intro', vaccinesNote: 'Vaccine note', familyHeading: 'Family section heading', familyIntro: 'Family section intro', familyCards: 'Family cards', infoBoxes: 'Good-to-know boxes', prescriptions: 'Prescriptions', vaccinations: 'Vaccinations', assessments_monitoring: 'Assessments & Monitoring', medication_customization: 'Medication Customization', wellness_consultation: 'Wellness Consultation', introHeading: 'Intro heading', introPara1: 'Paragraph 1', introPara2: 'Paragraph 2', introPara3: 'Paragraph 3', introImg: 'Intro image', ctaCallLabel: 'Call button text', ctaWhereLabel: 'Where button text', localHeading: 'Local heading', localPara1: 'Local paragraph 1', localPara2: 'Local paragraph 2', localImg: 'Local image', historyTitle: 'History heading', timeline: 'Timeline', year: 'Year', mckessonHeading: 'McKesson heading', mckessonText: 'McKesson text', bannerTitle: 'Banner title', bannerSub: 'Banner subtitle' };
        return path.split('.').map(function (seg) {
            if (/^\d+$/.test(seg)) return '#' + (parseInt(seg, 10) + 1);
            return words[seg] || seg;
        }).join(' → ');
    },

    goto: function (section, path) {
        if (path.indexOf('servicesPages.') === 0) this._svcHub = path.split('.')[1];
        this.switchTab(section);
        requestAnimationFrame(function () {
            requestAnimationFrame(function () {
                var el = document.querySelector('[data-path="' + path + '"]');
                if (el) {
                    el.focus();
                    el.classList.add('flash');
                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    setTimeout(function () { el.classList.remove('flash'); }, 1500);
                }
            });
        });
    },

    /* ============ BADGE / MODAL / TOAST ============ */
    updateDraftBadge: function () {
        var badge = document.getElementById('draft-badge');
        var text = document.getElementById('draft-text');
        var changes = AdminCMS.changes();

        if (changes > 0) {
            badge.classList.add('dirty');
            text.textContent = changes + ' unpublished change' + (changes > 1 ? 's' : '');
        } else {
            badge.classList.remove('dirty');
            text.textContent = 'No unpublished changes';
        }
    },

    confirm: function (title, body, okLabel, cb) {
        var overlay = document.getElementById('modal-overlay');
        document.getElementById('modal-title').textContent = title;
        document.getElementById('modal-body').textContent = body;
        var ok = document.getElementById('modal-ok');
        ok.textContent = okLabel || 'Confirm';
        ok.onclick = function () {
            overlay.classList.remove('show');
            cb();
        };
        overlay.classList.add('show');
    },

    closeModal: function () {
        document.getElementById('modal-overlay').classList.remove('show');
    },

    toast: function (message) {
        var t = document.getElementById('toast');
        t.textContent = message;
        t.classList.add('show');
        clearTimeout(this._toastTimer);
        this._toastTimer = setTimeout(function () { t.classList.remove('show'); }, 3600);
    }
};

var SOCIAL_ICONS = [
    ['fab fa-facebook-f', 'Facebook'],
    ['fab fa-x-twitter', 'X (Twitter)'],
    ['fab fa-twitter', 'Twitter (old)'],
    ['fab fa-instagram', 'Instagram'],
    ['fab fa-linkedin-in', 'LinkedIn'],
    ['fab fa-youtube', 'YouTube'],
    ['fab fa-tiktok', 'TikTok'],
    ['fab fa-whatsapp', 'WhatsApp']
];

/* ======================== BOOT ======================== */
document.getElementById('token-input').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') AdminAuth.login();
});

AdminAuth.init();
