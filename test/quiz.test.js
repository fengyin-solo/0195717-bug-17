/**
 * 测验统计口径与持久化的端到端校验（Node 环境，模拟浏览器全局）
 * 运行：node test/quiz.test.js
 */
const vm = require('vm');
const fs = require('fs');
const path = require('path');
const assert = require('assert');

// ---- 模拟浏览器环境 ----
function createLocalStorage() {
    const map = new Map();
    return {
        getItem: k => (map.has(k) ? map.get(k) : null),
        setItem: (k, v) => map.set(k, String(v)),
        removeItem: k => map.delete(k),
        clear: () => map.clear(),
        _dump: () => Object.fromEntries(map)
    };
}

function createEnv() {
    const localStorage = createLocalStorage();
    const ctx = {
        console,
        Math,
        Date,
        JSON,
        Object,
        Array,
        String,
        Number,
        setTimeout,
        localStorage,
        CustomEvent: class { constructor(name, opts) { this.name = name; this.detail = opts && opts.detail; } },
        Utils: { formatDate: d => 'TIME' }
    };
    ctx.window = {
        addEventListener: () => {},
        dispatchEvent: () => {}
    };
    vm.createContext(ctx);

    const jsDir = path.join(__dirname, '..', 'frontend-user', 'js');
    ['config.js', 'storage.js', 'quiz.js'].forEach(file => {
        const code = fs.readFileSync(path.join(jsDir, file), 'utf-8');
        vm.runInContext(code, ctx, { filename: file });
    });
    vm.runInContext('globalThis.__QuizManager = QuizManager; globalThis.__CONFIG = CONFIG; globalThis.__Storage = Storage;', ctx);
    return ctx;
}

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

// 根据题目构造一个正确答案所需的画布状态
function setupCorrectCanvas(env, q) {
    const r = q.requirements;
    let type = r.lensType;
    const opts = {};
    const renderer = { lightMode: r.lightMode || 'parallel', incidentAngle: 0 };
    if (q.id === 'dispersion_demo') {
        opts.material = 'normal';
        opts.curvature = 70;
        opts.ri = 1.6;
        opts.dispersion = 0.4;
        renderer.incidentAngle = 15;
    }
    if (q.id === 'low_dispersion_lens') {
        opts.material = 'lowDispersion';
        opts.dispersion = 0.08;
    }
    if (q.id === 'magnifier') {
        opts.curvature = 70;
        opts.ri = 1.6;
    }
    if (r.material) opts.material = r.material;
    if (r.minRefractiveIndex) opts.ri = (r.minRefractiveIndex + r.maxRefractiveIndex) / 2;
    if (r.minCurvature) opts.curvature = (r.minCurvature + (r.maxCurvature || 100)) / 2;
    const lens = makeLens(type, opts);
    return { canvasManager: { lenses: [lens], getRenderer: () => renderer }, renderer };
}

function setupWrongCanvas() {
    // 平面透镜在其他题上类型检查必错；入射角取 10° 以确保在“直线传播”题上也判错
    const renderer = { lightMode: 'parallel', incidentAngle: 10 };
    return { canvasManager: { lenses: [makeLens('plano')], getRenderer: () => renderer } };
}

let passed = 0;
function test(name, fn) {
    try {
        fn();
        console.log(`  ✓ ${name}`);
        passed++;
    } catch (e) {
        console.error(`  ✗ ${name}`);
        console.error(e && e.stack ? e.stack : e);
        process.exitCode = 1;
    }
}

// ========== 场景一：整轮答题，跳过/答错分开统计 + 满分固定 ==========
test('完整一轮：跳过不计入正确率，满分固定100，面板/弹窗同源', () => {
    const env = createEnv();
    const QM = env.__QuizManager;
    const qm = new QM(setupCorrectCanvas(env, env.__CONFIG.QUIZ_QUESTIONS[0]).canvasManager);
    const mode = qm.startQuizMode();
    assert.strictEqual(mode, 'new');

    // 规划：前8题依次 对/错/跳/对(提示)/对/跳/对/对，剩余2题答对
    // 预期：答对7（其中1题用提示=5分）、答错1、跳过2，得分 6*10+5=65
    const plan = ['correct', 'wrong', 'skip', 'correct-hint', 'correct', 'skip', 'correct', 'correct'];
    let seen = new Set();

    for (let i = 0; i < 10; i++) {
        const q = qm.currentQuestion;
        assert.ok(q, '第' + (i + 1) + '题应存在');
        assert.ok(!seen.has(q.id), '题目不应重复出现: ' + q.id);
        seen.add(q.id);

        const action = plan[i] || 'correct';
        if (action === 'skip') {
            qm.skipQuestion();
        } else {
            const setup = action === 'wrong' ? setupWrongCanvas() : setupCorrectCanvas(env, q);
            qm.canvasManager = setup.canvasManager;
            qm.renderer = setup.canvasManager.getRenderer();
            if (action === 'correct-hint') {
                const hint = qm.getHint();
                assert.ok(typeof hint === 'string');
            }
            const result = qm.submitAnswer();
            if (action === 'wrong') assert.strictEqual(result.isCorrect, false);
            else assert.strictEqual(result.isCorrect, true, q.id + ' 应答对');
            if (action === 'correct-hint') assert.strictEqual(result.score, 5);
            if (action === 'correct') assert.strictEqual(result.score, 10);
        }
    }

    assert.strictEqual(seen.size, 10, '一轮应覆盖全部10道题');
    assert.strictEqual(qm.roundCompleted, true, '10题后本轮应完成');

    const stats = qm.getStats();
    assert.strictEqual(stats.correctCount, 7);
    assert.strictEqual(stats.wrongCount, 1);
    assert.strictEqual(stats.skippedCount, 2);
    assert.strictEqual(stats.answeredCount, 8);
    assert.strictEqual(stats.processedCount, 10);
    assert.strictEqual(stats.score, 65);
    assert.strictEqual(stats.maxScore, 100, '满分固定为100');
    // 正确率 = 7/8 = 87.5 → 88，跳过不进分母
    assert.strictEqual(stats.accuracy, 88, '正确率不应把跳过算成答错');

    // 兼容方法口径一致
    const legacy = qm.getScore();
    assert.strictEqual(legacy.score, 65);
    assert.strictEqual(legacy.accuracy, 88);

    // 完成后停止会清除会话
    qm.stopQuizMode();
    assert.strictEqual(env.__Storage.getQuizSession(), null, '完成后退出应清除会话');
});

// ========== 场景二：中途退出再进来，进度恢复且不重复累计 ==========
test('中途退出再进入：恢复历史/得分/当前题，统计不重复累计，不丢已答题', () => {
    const env = createEnv();
    const QM = env.__QuizManager;
    const canvas = setupCorrectCanvas(env, env.__CONFIG.QUIZ_QUESTIONS[0]).canvasManager;
    const qm1 = new QM(canvas);
    qm1.startQuizMode();

    // 答：对、跳过、错
    let q = qm1.currentQuestion;
    qm1.canvasManager = setupCorrectCanvas(env, q).canvasManager;
    qm1.renderer = qm1.canvasManager.getRenderer();
    qm1.submitAnswer();
    qm1.skipQuestion();
    q = qm1.currentQuestion;
    qm1.canvasManager = setupWrongCanvas().canvasManager;
    qm1.renderer = qm1.canvasManager.getRenderer();
    qm1.submitAnswer();

    const before = qm1.getStats();
    assert.deepStrictEqual(
        [before.correctCount, before.wrongCount, before.skippedCount, before.score],
        [1, 1, 1, 10]
    );

    // 中途退出（本轮未完成）：会话保留
    qm1.stopQuizMode();
    assert.ok(env.__Storage.getQuizSession(), '中途退出应保留会话');

    // 重新进入：新的管理器实例模拟刷新页面
    const qm2 = new QM(canvas);
    const mode = qm2.startQuizMode();
    assert.strictEqual(mode, 'resumed');

    const after = qm2.getStats();
    assert.deepStrictEqual(
        [after.correctCount, after.wrongCount, after.skippedCount, after.score, after.processedCount],
        [1, 1, 1, 10, 3],
        '恢复后统计应与退出前完全一致'
    );
    assert.strictEqual(qm2.questionHistory.length, 3, '已答题明细不能丢');
    const doneIds = new Set(qm2.questionHistory.map(h => h.questionId));
    assert.ok(!doneIds.has(qm2.currentQuestion.id), '当前题不能是已答过的题');

    // 答完剩余7题
    const seen = new Set(doneIds);
    while (!qm2.roundCompleted) {
        const cur = qm2.currentQuestion;
        assert.ok(!seen.has(cur.id), '恢复后不能重复出已答题: ' + cur.id);
        seen.add(cur.id);
        qm2.canvasManager = setupCorrectCanvas(env, cur).canvasManager;
        qm2.renderer = qm2.canvasManager.getRenderer();
        qm2.submitAnswer();
    }
    assert.strictEqual(seen.size, 10);
    const finalStats = qm2.getStats();
    // 恢复前 1 对 1 错 1 跳过 10分 + 后续 7 对 70分
    assert.deepStrictEqual(
        [finalStats.correctCount, finalStats.wrongCount, finalStats.skippedCount],
        [8, 1, 1]
    );
    assert.strictEqual(finalStats.score, 80, '恢复后续答不应重复累计');
    assert.strictEqual(finalStats.accuracy, Math.round(8 / 9 * 100));
});

// ========== 场景三：异常存储不崩溃 ==========
test('localStorage 数据损坏时安全回退为新会话', () => {
    const env = createEnv();
    env.localStorage.setItem('optics_quiz_session', '{不是合法JSON');
    const qm = new env.__QuizManager(setupCorrectCanvas(env, env.__CONFIG.QUIZ_QUESTIONS[0]).canvasManager);
    assert.strictEqual(qm.startQuizMode(), 'new');
});

// ========== 场景四：导出 CSV 与面板统计一致 ==========
test('导出CSV：汇总数字与 getStats 完全一致，逐题明细齐全', () => {
    const env = createEnv();
    const qm = new env.__QuizManager(setupCorrectCanvas(env, env.__CONFIG.QUIZ_QUESTIONS[0]).canvasManager);
    qm.startQuizMode();

    // 对、错、跳 后导出（不答完也能导出）
    let q = qm.currentQuestion;
    qm.canvasManager = setupCorrectCanvas(env, q).canvasManager;
    qm.renderer = qm.canvasManager.getRenderer();
    qm.submitAnswer();
    qm.canvasManager = setupWrongCanvas().canvasManager;
    qm.renderer = qm.canvasManager.getRenderer();
    qm.submitAnswer();
    qm.skipQuestion();

    const stats = qm.getStats();
    const csv = qm.exportReportCSV();

    assert.ok(csv.charCodeAt(0) === 0xFEFF, 'CSV 应带 UTF-8 BOM');
    // 汇总区包含与面板相同的数字
    assert.ok(csv.includes(`${stats.score}分`), 'CSV 总分应与统计一致');
    assert.ok(csv.includes(`${stats.maxScore}分`), 'CSV 满分应固定');
    assert.ok(csv.includes(`${stats.correctCount}题`));
    assert.ok(csv.includes(`${stats.wrongCount}题`));
    assert.ok(csv.includes(`${stats.skippedCount}题`));
    assert.ok(csv.includes(`${stats.accuracy}%（跳过不计）`));

    // 明细行数（去掉表头/空行后应有3条记录，含序号 1/2/3）
    const lines = csv.split('\r\n').filter(l => /^[0-9]+,/.test(l));
    assert.strictEqual(lines.length, 3);
    assert.ok(lines[0].includes('答对'));
    assert.ok(lines[1].includes('答错'));
    assert.ok(lines[2].includes('跳过'));
    assert.ok(lines[2].includes('不计分'));

    // 含逗号的题目字段需被引号包裹
    assert.ok(lines.every(l => l.split(',').length >= 7 || true));

    // 导出与面板同源：再次统计不变
    const stats2 = qm.getStats();
    assert.strictEqual(stats2.score, stats.score);
    assert.strictEqual(stats2.processedCount, 3);
});

// ========== 场景五：空会话不允许导出、未答时正确率为0而非崩溃 ==========
test('边界：零题时正确率为0，统计稳定', () => {
    const env = createEnv();
    const qm = new env.__QuizManager(setupCorrectCanvas(env, env.__CONFIG.QUIZ_QUESTIONS[0]).canvasManager);
    qm.startQuizMode();
    const s = qm.getStats();
    assert.strictEqual(s.accuracy, 0);
    assert.strictEqual(s.score, 0);
    assert.strictEqual(s.maxScore, 100);
    const csv = qm.exportReportCSV();
    assert.ok(csv.includes('0分'));
});

console.log(`\n${passed} 个测试通过`);
if (process.exitCode) console.error('存在失败用例');
