/**
 * 光学测验管理器
 *
 * 功能：
 * - 随机选择测验题目
 * - 验证用户答案（透镜类型、参数、光线模式等）
 * - 评分并给出详细解释
 * - 提供提示功能
 * - 记录答题历史（答对 / 答错 / 跳过分开统计）
 * - 统计口径固定：整套题目满分 = 题数 × 每题满分
 * - 会话持久化：中途退出再进来可恢复，统计不重复累计
 */
class QuizManager {
    // 每题得分口径（固定，不随已答题数变化）
    static POINTS_FULL = 10;       // 未用提示答对
    static POINTS_WITH_HINT = 5;   // 使用提示后答对

    constructor(canvasManager) {
        this.canvasManager = canvasManager;
        this.renderer = canvasManager.getRenderer();
        this.currentQuestion = null;
        this.questionHistory = [];
        this.score = 0;
        this.hintUsed = false;
        this.isQuizMode = false;
        this.completed = false;
        // 本轮已经出过的题目（含答对、答错、跳过）
        this.seenQuestionIds = new Set();
        // 当前题是否已经作答（防止重复提交导致重复累计）
        this.currentAnswered = false;
        // 本轮开始时间
        this.sessionStartedAt = null;
    }

    /**
     * 整套题目的固定满分（不随已答题数变化）
     */
    getTotalScoreMax() {
        return CONFIG.QUIZ_QUESTIONS.length * QuizManager.POINTS_FULL;
    }

    /**
     * 开启一轮全新的测验
     */
    startQuizMode() {
        this.isQuizMode = true;
        this.completed = false;
        this.score = 0;
        this.questionHistory = [];
        this.seenQuestionIds = new Set();
        this.sessionStartedAt = Date.now();
        this.nextQuestion();
        this.saveSession();
    }

    /**
     * 从本地存储恢复未完成的测验
     * @returns {boolean} 是否成功恢复
     */
    resumeQuizMode() {
        const snapshot = Storage.loadQuizSession();
        if (!snapshot) return false;

        this.isQuizMode = true;
        this.completed = !!snapshot.completed;
        this.questionHistory = Array.isArray(snapshot.questionHistory)
            ? snapshot.questionHistory : [];
        this.seenQuestionIds = new Set(
            Array.isArray(snapshot.seenQuestionIds) ? snapshot.seenQuestionIds : []
        );
        // 历史中答过/跳过的题同样视为已出过，保证不重复抽题、不丢记录
        this.questionHistory.forEach(q => this.seenQuestionIds.add(q.questionId));
        // 以答题明细为准重算总分，保证统计口径唯一、不重复累计
        this.score = this.questionHistory.reduce((sum, q) => sum + (q.score || 0), 0);
        this.sessionStartedAt = snapshot.sessionStartedAt || Date.now();

        if (this.completed) {
            // 已完成的一轮：恢复统计，但不自动出题
            this.currentQuestion = null;
            this.hintUsed = false;
            this.currentAnswered = false;
            return true;
        }

        // 未完成：恢复到退出时正在作答的那道题（已答过的题不丢）
        const question = CONFIG.QUIZ_QUESTIONS.find(q => q.id === snapshot.currentQuestionId);
        if (!question) {
            // 快照异常：清除坏数据并通知调用方开新一轮（恢复失败）
            this.clearSession();
            this.isQuizMode = false;
            this.completed = false;
            this.questionHistory = [];
            this.seenQuestionIds = new Set();
            this.score = 0;
            this.currentQuestion = null;
            return false;
        }
        this.currentQuestion = question;
        this.hintUsed = !!snapshot.hintUsed;
        this.currentAnswered = !!snapshot.currentAnswered;

        window.dispatchEvent(new CustomEvent('questionChanged', {
            detail: this.currentQuestion
        }));

        return true;
    }

    /**
     * 关闭测验模式（统计保留在本地存储中，下次可恢复）
     */
    stopQuizMode() {
        this.isQuizMode = false;
        this.currentQuestion = null;
        this.hintUsed = false;
        this.currentAnswered = false;
        window.dispatchEvent(new CustomEvent('quizStopped'));
    }

    /**
     * 保存当前会话快照
     */
    saveSession() {
        if (!this.isQuizMode) return;
        Storage.saveQuizSession({
            version: 1,
            score: this.score,
            questionHistory: this.questionHistory,
            seenQuestionIds: Array.from(this.seenQuestionIds),
            currentQuestionId: this.currentQuestion ? this.currentQuestion.id : null,
            hintUsed: this.hintUsed,
            currentAnswered: this.currentAnswered,
            completed: this.completed,
            sessionStartedAt: this.sessionStartedAt
        });
    }

    /**
     * 清除本轮会话（开始新一轮或彻底结束时调用）
     */
    clearSession() {
        Storage.clearQuizSession();
    }

    /**
     * 获取下一道随机题目
     * @returns {Object|null} 本轮所有题目都出过时返回 null
     */
    nextQuestion() {
        const questions = CONFIG.QUIZ_QUESTIONS;
        const seenIds = this.getSeenIds();
        const availableQuestions = questions.filter(q => !seenIds.has(q.id));

        if (availableQuestions.length === 0) {
            // 整套题目已做完，本轮结束（不循环出题、不重复计分）
            this.currentQuestion = null;
            this.hintUsed = false;
            this.currentAnswered = false;
            this.completed = true;
            this.saveSession();

            window.dispatchEvent(new CustomEvent('quizCompleted'));
            return null;
        }

        const randomIndex = Math.floor(Math.random() * availableQuestions.length);
        this.currentQuestion = availableQuestions[randomIndex];
        this.hintUsed = false;
        this.currentAnswered = false;

        this.seenQuestionIds.add(this.currentQuestion.id);

        window.dispatchEvent(new CustomEvent('questionChanged', {
            detail: this.currentQuestion
        }));

        this.saveSession();
        return this.currentQuestion;
    }

    /**
     * 获取提示
     */
    getHint() {
        if (!this.currentQuestion) return null;

        this.hintUsed = true;
        const hints = this.currentQuestion.hints;
        const randomIndex = Math.floor(Math.random() * hints.length);

        this.saveSession();
        return hints[randomIndex];
    }

    /**
     * 跳过当前题目（与答错分开统计：不得分，也不计入答错）
     */
    skipCurrentQuestion() {
        if (!this.currentQuestion || this.currentAnswered) return null;

        const question = this.currentQuestion;

        this.questionHistory.push({
            questionId: question.id,
            title: question.title,
            status: 'skipped',
            isCorrect: false,
            score: 0,
            hintUsed: this.hintUsed,
            timestamp: Date.now()
        });

        this.currentAnswered = true;
        this.saveSession();

        return this.questionHistory[this.questionHistory.length - 1];
    }

    /**
     * 验证用户答案
     */
    submitAnswer() {
        if (!this.currentQuestion) {
            return {
                isCorrect: false,
                score: 0,
                explanation: '请先选择一道题目',
                details: []
            };
        }

        // 已作答/已跳过的题不允许重复提交，避免统计重复累计
        if (this.currentAnswered) {
            return {
                isCorrect: false,
                score: 0,
                explanation: '本题已经作答，请进入下一题。',
                details: []
            };
        }

        const question = this.currentQuestion;
        const validation = question.validation;
        const requirements = question.requirements;
        const lenses = this.canvasManager.lenses;
        const lightMode = this.renderer.lightMode;

        const results = [];
        let isCorrect = true;
        let explanationKey = 'correct';

        if (lenses.length === 0) {
            return {
                isCorrect: false,
                score: 0,
                explanation: '请先在画布上添加一个透镜，然后再提交答案。',
                details: []
            };
        }

        const lens = lenses[0];

        if (validation.checkType) {
            const typeCorrect = lens.type === requirements.lensType;
            results.push({
                name: '透镜类型',
                expected: this.getLensTypeName(requirements.lensType),
                actual: lens.getTypeName(),
                correct: typeCorrect
            });

            if (!typeCorrect) {
                isCorrect = false;
                explanationKey = 'wrongType';
            }
        }

        if (validation.checkLightMode && isCorrect) {
            const lightCorrect = lightMode === requirements.lightMode;
            results.push({
                name: '光源模式',
                expected: requirements.lightMode === 'parallel' ? '平行光' : '点光源',
                actual: lightMode === 'parallel' ? '平行光' : '点光源',
                correct: lightCorrect
            });

            if (!lightCorrect) {
                isCorrect = false;
                explanationKey = 'wrongLightMode';
            }
        }

        if (validation.checkMaterial && isCorrect) {
            const materialCorrect = lens.material === requirements.material;
            results.push({
                name: '材料类型',
                expected: this.getMaterialName(requirements.material),
                actual: lens.getMaterialName(),
                correct: materialCorrect
            });

            if (!materialCorrect) {
                isCorrect = false;
                explanationKey = 'wrongMaterial';
            }
        }

        if (validation.checkRefractiveIndex && isCorrect) {
            const ri = lens.refractiveIndex;
            const minRI = requirements.minRefractiveIndex || 1.0;
            const maxRI = requirements.maxRefractiveIndex || 2.0;
            const riCorrect = ri >= minRI && ri <= maxRI;

            results.push({
                name: '折射率',
                expected: `${minRI} - ${maxRI}`,
                actual: ri.toFixed(2),
                correct: riCorrect
            });

            if (!riCorrect) {
                isCorrect = false;
                explanationKey = 'wrongRI';
            }
        }

        if (validation.checkCurvature && isCorrect) {
            const curvature = lens.curvature;
            const minCurv = requirements.minCurvature || 0;
            const maxCurv = requirements.maxCurvature || 100;
            const curvCorrect = curvature >= minCurv && curvature <= maxCurv;

            results.push({
                name: '曲率',
                expected: `${minCurv}% - ${maxCurv}%`,
                actual: `${curvature}%`,
                correct: curvCorrect
            });

            if (!curvCorrect) {
                isCorrect = false;
                explanationKey = 'wrongCurvature';
            }
        }

        if (validation.checkConvergence && isCorrect) {
            const convergenceResult = this.checkConvergence(lens);
            results.push({
                name: '光线会聚',
                expected: '光线会聚到一点',
                actual: convergenceResult.message,
                correct: convergenceResult.converging
            });

            if (!convergenceResult.converging) {
                isCorrect = false;
                explanationKey = 'noConvergence';
            }
        }

        if (validation.checkDivergence && isCorrect) {
            const divergenceResult = this.checkDivergence(lens);
            results.push({
                name: '光线发散',
                expected: '光线向外发散',
                actual: divergenceResult.message,
                correct: divergenceResult.diverging
            });

            if (!divergenceResult.diverging) {
                isCorrect = false;
                explanationKey = 'noDivergence';
            }
        }

        if (validation.checkNoDeflection && isCorrect) {
            const noDeflectionResult = this.checkNoDeflection(lens);
            results.push({
                name: '光线偏折',
                expected: '光线方向不变',
                actual: noDeflectionResult.message,
                correct: noDeflectionResult.noDeflection
            });

            if (!noDeflectionResult.noDeflection) {
                isCorrect = false;
                explanationKey = 'hasDeflection';
            }
        }

        if (validation.checkDispersion && isCorrect) {
            const dispersionResult = this.checkDispersion(lens);
            results.push({
                name: '色散效果',
                expected: '色散现象明显',
                actual: dispersionResult.message,
                correct: dispersionResult.hasDispersion
            });

            if (!dispersionResult.hasDispersion) {
                isCorrect = false;
                explanationKey = 'noDispersion';
            }
        }

        if (validation.checkLowDispersion && isCorrect) {
            const lowDispersionResult = this.checkLowDispersion(lens);
            results.push({
                name: '低色散效果',
                expected: '色散很小',
                actual: lowDispersionResult.message,
                correct: lowDispersionResult.lowDispersion
            });

            if (!lowDispersionResult.lowDispersion) {
                isCorrect = false;
                explanationKey = 'highDispersion';
            }
        }

        if (validation.checkSphericalAberration && isCorrect) {
            const aberrationResult = this.checkSphericalAberration(lens);
            results.push({
                name: '球差现象',
                expected: '存在明显球差',
                actual: aberrationResult.message,
                correct: aberrationResult.hasAberration
            });

            if (!aberrationResult.hasAberration) {
                isCorrect = false;
                explanationKey = 'noAberration';
            }
        }

        if (validation.checkNoSphericalAberration && isCorrect) {
            const noAberrationResult = this.checkNoSphericalAberration(lens);
            results.push({
                name: '消球差效果',
                expected: '球差被消除',
                actual: noAberrationResult.message,
                correct: noAberrationResult.noAberration
            });

            if (!noAberrationResult.noAberration) {
                isCorrect = false;
                explanationKey = 'hasAberration';
            }
        }

        let earnedScore = 0;
        if (isCorrect) {
            earnedScore = this.hintUsed
                ? QuizManager.POINTS_WITH_HINT
                : QuizManager.POINTS_FULL;
            this.score += earnedScore;
        }

        const explanation = question.explanation[explanationKey] || question.explanation.correct;

        this.questionHistory.push({
            questionId: question.id,
            title: question.title,
            status: isCorrect ? 'correct' : 'wrong',
            isCorrect: isCorrect,
            score: earnedScore,
            hintUsed: this.hintUsed,
            timestamp: Date.now()
        });

        this.currentAnswered = true;
        this.saveSession();

        return {
            isCorrect: isCorrect,
            score: earnedScore,
            totalScore: this.score,
            explanation: explanation,
            details: results,
            hintUsed: this.hintUsed
        };
    }

    /**
     * 检查光线会聚情况
     */
    checkConvergence(lens) {
        if (lens.type !== CONFIG.LENS_TYPES.CONVEX) {
            return { converging: false, message: '需要使用凸透镜' };
        }

        const focalLength = lens.getFocalLength();
        const minFocal = this.currentQuestion.requirements.minFocalLength || 50;
        const maxFocal = this.currentQuestion.requirements.maxFocalLength || 500;

        if (focalLength < minFocal || focalLength > maxFocal) {
            return {
                converging: false,
                message: `焦距 ${Math.round(focalLength)}px 不在合适范围内 (${minFocal}-${maxFocal}px)`
            };
        }

        const strength = (lens.refractiveIndex - 1) * (lens.curvature / 100);
        if (strength < 0.15) {
            return { converging: false, message: '会聚能力太弱，请增大折射率或曲率' };
        }

        return { converging: true, message: `光线会聚良好，焦距约 ${Math.round(focalLength)}px` };
    }

    /**
     * 检查光线发散情况
     */
    checkDivergence(lens) {
        if (lens.type !== CONFIG.LENS_TYPES.CONCAVE) {
            return { diverging: false, message: '需要使用凹透镜' };
        }

        const strength = (lens.refractiveIndex - 1) * (lens.curvature / 100);
        if (strength < 0.1) {
            return { diverging: false, message: '发散能力太弱，请增大折射率或曲率' };
        }

        return { diverging: true, message: '光线发散效果明显' };
    }

    /**
     * 检查光线是否无偏折
     */
    checkNoDeflection(lens) {
        if (lens.type !== CONFIG.LENS_TYPES.PLANO) {
            return { noDeflection: false, message: '需要使用平面透镜' };
        }

        if (Math.abs(this.renderer.incidentAngle) > 5) {
            return { noDeflection: false, message: '请让光线垂直入射（入射角为0）' };
        }

        return { noDeflection: true, message: '光线沿直线传播，方向不变' };
    }

    /**
     * 检查色散效果
     */
    checkDispersion(lens) {
        if (lens.dispersion < 0.2) {
            return { hasDispersion: false, message: '材料色散太小，请使用普通玻璃' };
        }

        if (Math.abs(this.renderer.incidentAngle) < 5) {
            return { hasDispersion: false, message: '请增大入射角，让光线斜入射' };
        }

        const strength = (lens.refractiveIndex - 1) * (lens.curvature / 100);
        if (strength < 0.2) {
            return { hasDispersion: false, message: '偏折太弱，色散不明显' };
        }

        return { hasDispersion: true, message: '色散现象明显，不同颜色光分离' };
    }

    /**
     * 检查低色散效果
     */
    checkLowDispersion(lens) {
        if (lens.dispersion > 0.15) {
            return { lowDispersion: false, message: '材料色散较大，请使用低色散镜片' };
        }

        return { lowDispersion: true, message: '色散很小，不同颜色光几乎重合' };
    }

    /**
     * 检查球差现象
     */
    checkSphericalAberration(lens) {
        if (lens.type !== CONFIG.LENS_TYPES.CONVEX) {
            return { hasAberration: false, message: '需要使用球面凸透镜' };
        }

        if (lens.curvature < 50) {
            return { hasAberration: false, message: '曲率太小，球差不明显' };
        }

        return { hasAberration: true, message: '球差明显，边缘光线会聚点与中心不同' };
    }

    /**
     * 检查无球差效果
     */
    checkNoSphericalAberration(lens) {
        if (lens.type !== CONFIG.LENS_TYPES.ASPHERIC) {
            return { noAberration: false, message: '需要使用非球面透镜' };
        }

        return { noAberration: true, message: '球差被消除，所有光线会聚到同一点' };
    }

    /**
     * 获取透镜类型中文名称
     */
    getLensTypeName(type) {
        const names = {
            [CONFIG.LENS_TYPES.CONVEX]: '凸透镜',
            [CONFIG.LENS_TYPES.CONCAVE]: '凹透镜',
            [CONFIG.LENS_TYPES.PLANO]: '平面透镜',
            [CONFIG.LENS_TYPES.ASPHERIC]: '非球面透镜'
        };
        return names[type] || type;
    }

    /**
     * 获取材料中文名称
     */
    getMaterialName(material) {
        const names = {
            normal: '普通玻璃',
            highIndex: '高折射率镜片',
            lowDispersion: '低色散镜片'
        };
        return names[material] || material;
    }

    /**
     * 统一的统计口径（面板与结果弹窗共用这一份数据）
     *
     * - 得分 / 满分：满分按整套题目固定（题数 × 10）
     * - 正确率：答对数 / 已作答数（跳过不计入分母，也不计入答错）
     */
    getStats() {
        const correctCount = this.questionHistory.filter(q => q.status === 'correct').length;
        const wrongCount = this.questionHistory.filter(q => q.status === 'wrong').length;
        const skippedCount = this.questionHistory.filter(q => q.status === 'skipped').length;
        const answeredCount = correctCount + wrongCount;

        return {
            score: this.score,
            maxScore: this.getTotalScoreMax(),
            totalQuestions: CONFIG.QUIZ_QUESTIONS.length,
            seenCount: this.getSeenIds().size,
            correctCount,
            wrongCount,
            skippedCount,
            answeredCount,
            accuracy: answeredCount > 0
                ? Math.round((correctCount / answeredCount) * 100)
                : 0
        };
    }

    /**
     * 本轮已经出过的题目 ID（出题记录与答题记录取并集，防止重复抽题）
     */
    getSeenIds() {
        const ids = new Set(this.seenQuestionIds);
        this.questionHistory.forEach(q => ids.add(q.questionId));
        return ids;
    }

    /**
     * 兼容旧调用
     */
    getScore() {
        const stats = this.getStats();
        return {
            score: stats.score,
            totalQuestions: stats.answeredCount,
            accuracy: stats.accuracy
        };
    }

    /**
     * 生成本轮答题明细的导出文本（CSV，供发给老师核对）
     *
     * 表头汇总信息与明细行使用同一份统计口径，
     * 保证文件中的题数、得分与面板/结果弹窗完全一致。
     * @returns {string} CSV 文本
     */
    buildExportCSV() {
        const stats = this.getStats();
        // 加 UTF-8 BOM，保证 Excel 打开时中文不乱码
        const BOM = '﻿';
        const lines = [];

        lines.push(['光学测验成绩单']);
        lines.push(['导出时间', Utils.formatDate(new Date())]);
        lines.push(['开始时间', this.sessionStartedAt ? Utils.formatDate(this.sessionStartedAt) : '']);
        lines.push([]);
        lines.push(['总题数', stats.totalQuestions]);
        lines.push(['已作答', stats.answeredCount]);
        lines.push(['答对', stats.correctCount]);
        lines.push(['答错', stats.wrongCount]);
        lines.push(['跳过', stats.skippedCount]);
        lines.push(['正确率(%)', stats.accuracy]);
        lines.push(['得分', stats.score]);
        lines.push(['满分', stats.maxScore]);
        lines.push([]);
        lines.push(['序号', '题目', '结果', '得分', '使用提示', '作答时间']);

        this.questionHistory.forEach((record, index) => {
            const resultName = {
                correct: '答对',
                wrong: '答错',
                skipped: '跳过'
            }[record.status] || record.status;
            lines.push([
                index + 1,
                record.title,
                resultName,
                record.score,
                record.hintUsed ? '是' : '否',
                Utils.formatDate(record.timestamp)
            ]);
        });

        return BOM + lines.map(row => row.map(QuizManager.csvEscape).join(',')).join('\r\n');
    }

    /**
     * CSV 字段转义
     */
    static csvEscape(value) {
        const str = String(value);
        if (/[",\r\n]/.test(str)) {
            return '"' + str.replace(/"/g, '""') + '"';
        }
        return str;
    }
}
