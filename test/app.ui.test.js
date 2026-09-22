/**
 * App 层 UI 集成冒烟测试：用极简 DOM 桩模拟页面交互
 * 运行：node test/app.ui.test.js
 */
const vm = require('vm');
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const TYPE_NAMES = { convex: '凸透镜', concave: '凹透镜', plano: '平面透镜', aspheric: '非球面透镜' };
const MAT_NAMES = { normal: '普通玻璃', highIndex: '高折射率镜片', lowDispersion: '低色散镜片' };

function makeLens(type, opts = {}) {
    return {
        type,
        material: opts.material || 'normal',
        refractiveIndex: opts.ri || 1.5,
        curvature: opts.curvature ?? 70,
        dispersion: opts.dispersion ?? 0.4,
        size: 100,
        getTypeName: () => TYPE_NAMES[type],
        getMaterialName: () => MAT_NAMES[opts.material || 'normal'],
        getFocalLength: () => 150
    };
}

function correctLensFor(q) {
    const r = q.requirements;
    const opts = {};
    if (q.id === 'dispersion_demo') { opts.material = 'normal'; opts.curvature = 70; opts.ri = 1.6; opts.dispersion = 0.4; }
    if (q.id === 'low_dispersion_lens') { opts.material = 'lowDispersion'; opts.dispersion = 0.08; }
    if (r.material) opts.material = r.material;
    if (r.minRefractiveIndex) opts.ri = (r.minRefractiveIndex + r.maxRefractiveIndex) / 2;
    if (r.minCurvature) opts.curvature = (r.minCurvature + (r.maxCurvature || 100)) / 2;
    return makeLens(r.lensType, opts);
}

function createElementStub() {
    const classList = {
        _set: new Set(),
        add(c) { this._set.add(c); },
        remove(c) { this._set.delete(c); },
        toggle(c, force) { force ? this._set.add(c) : this._set.delete(c); },
        contains(c) { return this._set.has(c); }
    };
    // 浏览器里 textContent 始终为字符串，这里用 getter/setter 模拟自动转型
    const span = {};
    Object.defineProperty(span, 'textContent', { get: () => span._t || '', set: v => { span._t = String(v); }, configurable: true });
    const svg = { innerHTML: '' };
    const el = {
        _t: '',
        innerHTML: '',
        disabled: false,
        hidden: false,
        style: {},
        classList,
        _handlers: {},
        addEventListener(ev, fn) { this._handlers[ev] = fn; },
        querySelector(sel) {
            if (sel === 'span') return span;
            if (sel === 'svg') return svg;
            const other = { textContent: '', innerHTML: '' };
            Object.defineProperty(other, 'textContent', { get: () => other._t || '', set: v => { other._t = String(v); }, configurable: true });
            return other;
        },
        click() { if (this._handlers.click) this._handlers.click({ target: this }); }
    };
    Object.defineProperty(el, 'textContent', { get: () => el._t, set: v => { el._t = String(v); }, configurable: true });
    return el;
}

function createEnv() {
    const store = new Map();
    const localStorage = {
        getItem: k => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => store.set(k, String(v)),
        removeItem: k => store.delete(k),
        clear: () => store.clear()
    };

    const listeners = {};
    const windowStub = {
        addEventListener(ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); },
        dispatchEvent(e) { (listeners[e.name] || []).forEach(fn => fn(e)); }
    };

    const elements = new Map();
    const documentStub = {
        readyState: 'complete',
        getElementById(id) {
            if (!elements.has(id)) elements.set(id, createElementStub());
            return elements.get(id);
        },
        querySelectorAll() { return []; },
        querySelector(sel) {
            if (sel === '.tip-text') return null;
            return createElementStub();
        },
        createElement() {
            return { click() {}, href: '', download: '', style: {} };
        },
        body: { appendChild() {}, removeChild() {} }
    };

    const toasts = [];
    const downloads = [];

    const renderer = { lightMode: 'parallel', incidentAngle: 0, isRunning: true };
    const canvasManager = {
        lenses: [],
        getRenderer: () => renderer,
        clear() { canvasManager.lenses = []; }
    };

    const ctx = {
        console, Math, Date, JSON, Object, Array, String, Number, parseInt, parseFloat,
        setTimeout: (fn) => fn && fn(),
        localStorage,
        window: windowStub,
        document: documentStub,
        CustomEvent: class { constructor(name, opts) { this.name = name; this.detail = opts && opts.detail; } },
        Blob: class { constructor(parts) { this.parts = parts; downloads.push(parts.join('')); } },
        URL: { createObjectURL: () => 'blob:mock', revokeObjectURL() {} },
        CanvasManager: class { constructor() { return canvasManager; } },
        InteractionManager: class { constructor() {} },
        GuideManager: class { constructor() {} },
        Utils: {
            showToast: (msg, type) => toasts.push({ msg, type }),
            isTouchDevice: () => false,
            formatDate: d => 'T'
        }
    };
    ctx.globalThis = ctx;
    vm.createContext(ctx);

    const jsDir = path.join(__dirname, '..', 'frontend-user', 'js');
    ['config.js', 'storage.js', 'quiz.js'].forEach(file => {
        vm.runInContext(fs.readFileSync(path.join(jsDir, file), 'utf-8'), ctx, { filename: file });
    });
    const appCode = fs.readFileSync(path.join(jsDir, 'app.js'), 'utf-8') + '\nglobalThis.__app = app;';
    vm.runInContext(appCode, ctx, { filename: 'app.js' });

    return { ctx, app: ctx.__app, el: id => documentStub.getElementById(id), toasts, downloads, canvasManager, renderer, store };
}

let passed = 0;
function test(name, fn) {
    try { fn(); console.log(`  ✓ ${name}`); passed++; }
    catch (e) { console.error(`  ✗ ${name}`); console.error(e && e.stack ? e.stack : e); process.exitCode = 1; }
}

function click(env, id) { env.el(id).click(); }

test('面板与结果弹窗同源：跳过不算错，满分固定100', () => {
    const env = createEnv();
    const app = env.app;

    // 开启测验
    click(env, 'btn-quiz-mode');
    assert.strictEqual(String(env.el('quiz-score-total').textContent), '100', '面板满分一开始就是100');
    assert.ok(env.el('quiz-progress').textContent.startsWith('第 1/10 题'));

    // 第1题答错（放一个平面透镜、斜入射提交，对任何题都判错）
    env.canvasManager.lenses = [makeLens('plano')];
    env.renderer.lightMode = 'parallel';
    env.renderer.incidentAngle = 10;
    click(env, 'btn-quiz-submit');
    assert.strictEqual(env.el('quiz-total-score').textContent, '0');
    assert.strictEqual(env.el('quiz-wrong').textContent, '1');
    assert.strictEqual(env.el('quiz-correct').textContent, '0');
    assert.strictEqual(env.el('quiz-skipped').textContent, '0');
    assert.strictEqual(env.el('quiz-accuracy').textContent, '0%');
    // 弹窗关闭后下一题
    click(env, 'btn-quiz-next');

    // 第2题跳过
    click(env, 'btn-quiz-skip');
    // 跳过不弹窗，直接进下一题；面板应显示 跳过1 且分数仍为0/100
    assert.strictEqual(env.el('quiz-score-value').textContent, '0');
    assert.strictEqual(env.el('quiz-score-total').textContent, '100');
    assert.ok(env.el('quiz-progress').textContent.includes('跳过1'));
    assert.ok(env.el('quiz-progress').textContent.startsWith('第 3/10 题'));

    // 第3题答对
    const q3 = app.quizManager.currentQuestion;
    env.canvasManager.lenses = [correctLensFor(q3)];
    env.renderer.lightMode = q3.requirements.lightMode || 'parallel';
    env.renderer.incidentAngle = q3.id === 'dispersion_demo' ? 15 : 0;
    click(env, 'btn-quiz-submit');
    assert.strictEqual(env.el('quiz-correct').textContent, '1');
    assert.strictEqual(env.el('quiz-wrong').textContent, '1');
    assert.strictEqual(env.el('quiz-skipped').textContent, '1');
    assert.strictEqual(env.el('quiz-accuracy').textContent, '50%', '1对1错=50%，跳过不进分母');
    assert.strictEqual(env.el('quiz-total-score').textContent, '10');
    // 面板同步
    assert.strictEqual(env.el('quiz-score-value').textContent, '10');
    assert.strictEqual(env.el('quiz-score-total').textContent, '100');

    // 光路未启动时提交应被拦截且不记录
    click(env, 'btn-quiz-next');
    env.renderer.isRunning = false;
    click(env, 'btn-quiz-submit');
    assert.ok(env.toasts.some(t => t.msg.includes('启动光路')));
    assert.strictEqual(app.quizManager.getStats().processedCount, 3, '被拦截的提交不能计分');
    env.renderer.isRunning = true;
});

test('中途退出再进入：面板数字与退出前一致，继续作答不重复累计', () => {
    const env = createEnv();
    const app = env.app;

    click(env, 'btn-quiz-mode');
    // 对一题
    const q = app.quizManager.currentQuestion;
    env.canvasManager.lenses = [correctLensFor(q)];
    env.renderer.lightMode = q.requirements.lightMode || 'parallel';
    env.renderer.incidentAngle = q.id === 'dispersion_demo' ? 15 : 0;
    click(env, 'btn-quiz-submit');
    click(env, 'btn-quiz-next');
    // 跳过一题
    click(env, 'btn-quiz-skip');
    assert.strictEqual(env.el('quiz-score-value').textContent, '10');
    const beforeId = app.quizManager.currentQuestion.id;

    // 中途退出（X 按钮）
    click(env, 'btn-quiz-close');
    assert.ok(env.store.has('optics_quiz_session'), '会话应被持久化');
    assert.ok(env.toasts.some(t => t.msg.includes('进度已保存')));

    // 再次进入：恢复
    click(env, 'btn-quiz-mode');
    const stats = app.quizManager.getStats();
    assert.strictEqual(stats.processedCount, 2);
    assert.strictEqual(stats.score, 10);
    assert.strictEqual(stats.skippedCount, 1);
    assert.strictEqual(env.el('quiz-score-value').textContent, '10');
    assert.strictEqual(env.el('quiz-score-total').textContent, '100');
    assert.ok(env.toasts.some(t => t.msg.includes('恢复上次测验进度')));
    assert.strictEqual(app.quizManager.currentQuestion.id, beforeId, '应回到退出时的当前题');

    // 答完剩余8题
    let guard = 0;
    while (!app.quizManager.roundCompleted && guard++ < 15) {
        const cq = app.quizManager.currentQuestion;
        env.canvasManager.lenses = [correctLensFor(cq)];
        env.renderer.lightMode = cq.requirements.lightMode || 'parallel';
        env.renderer.incidentAngle = cq.id === 'dispersion_demo' ? 15 : 0;
        click(env, 'btn-quiz-submit');
        if (!app.quizManager.roundCompleted) click(env, 'btn-quiz-next');
    }
    const finalStats = app.quizManager.getStats();
    assert.strictEqual(finalStats.processedCount, 10);
    assert.strictEqual(finalStats.correctCount, 9);
    assert.strictEqual(finalStats.skippedCount, 1);
    assert.strictEqual(finalStats.wrongCount, 0);
    assert.strictEqual(finalStats.score, 90, '恢复后继续作答应累计为90分');
    assert.strictEqual(finalStats.accuracy, 100, '9对0错=100%，跳过不影响');

    // 完成弹窗出现
    assert.strictEqual(env.el('quiz-result-title').textContent, '整套测验已完成！');
    assert.ok(env.el('quiz-result-explanation').textContent.includes('答对 9 题'));
    assert.ok(env.el('quiz-result-explanation').textContent.includes('跳过 1 题'));

    // 点“完成测验”退出后会话被清除
    click(env, 'btn-quiz-next');
    assert.ok(!env.store.has('optics_quiz_session'), '完成退出后应清除会话');
});

test('导出成绩文件：触发下载，CSV 数字与界面一致', () => {
    const env = createEnv();
    const app = env.app;
    click(env, 'btn-quiz-mode');

    const q = app.quizManager.currentQuestion;
    env.canvasManager.lenses = [correctLensFor(q)];
    env.renderer.lightMode = q.requirements.lightMode || 'parallel';
    env.renderer.incidentAngle = q.id === 'dispersion_demo' ? 15 : 0;
    click(env, 'btn-quiz-submit');

    // 从结果弹窗导出
    click(env, 'btn-quiz-export-result');
    assert.strictEqual(env.downloads.length, 1);
    const csv = env.downloads[0];
    assert.ok(csv.charCodeAt(0) === 0xFEFF);
    assert.ok(csv.includes('10分'));
    assert.ok(csv.includes('100分'));
    assert.ok(csv.includes('答对'));

    // 面板头部也有导出入口
    click(env, 'btn-quiz-next');
    click(env, 'btn-quiz-export');
    assert.strictEqual(env.downloads.length, 2);
});

test('没答题时导出给出提示，不产生文件', () => {
    const env = createEnv();
    click(env, 'btn-quiz-mode');
    click(env, 'btn-quiz-export');
    assert.strictEqual(env.downloads.length, 0);
    assert.ok(env.toasts.some(t => t.msg.includes('还没有答题记录')));
});

console.log(`\n${passed} 个测试通过`);
if (process.exitCode) console.error('存在失败用例');
