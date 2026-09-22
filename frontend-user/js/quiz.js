/**
 * 光学测验管理器
 *
 * 功能：
 * - 随机选择测验题目
 * - 验证用户答案（透镜类型、参数、光线模式等）
 * - 评分并给出详细解释
 * - 提供提示功能
 * - 记录答题历史（答对 / 答错 / 跳过 分开统计）
 *
 * 统计口径（面板与结果弹窗、导出成绩文件共用同一份数据）：
 * - 跳过与答错分开计数；正确率 = 答对数 /（答对数 + 答错数），跳过不计入分母
 * - 总分固定按整套题目满分 CONFIG.QUIZ_SCORING.MAX_SCORE 显示
 * - 一轮覆盖整套题库（每题只出现一次），答题结果写入 questionHistory
 * - 会话持久化到 localStorage：中途退出再进来时恢复进度，不重复累计
 */
class QuizManager {
    constructor(canvasManager) {
        this.canvasManager = canvasManager;
        this.renderer = canvasManager.getRenderer();
        this.currentQuestion = null;
        this.questionHistory = [];
        this.hintUsed = false;
        this.isQuizMode = false;
        // 本轮已经处理过（答对/答错/跳过）的题目 ID，保证不重复出题、不重复计分
        this.answeredQuestions = new Set();
        // 本轮是否已答完整套题目
        this.roundCompleted = false;
    }

    /**
     * 开启测验模式
     * 若存在未结束的会话则恢复之前的进度，否则开始全新一轮
     * 返回：'resumed' 恢复了进行中的会话 | 'completed' 恢复了已完成的轮次 | 'new' 新开始
     */
    startQuizMode() {
        const restored = this.loadSession();
        if (restored === 'resumed' || restored === 'completed') {
            return restored;
        }

        this.resetSessionState();
        this.isQuizMode = true;
        this._selectNextQuestion();
        this.persistSession();
        return 'new';
    }

    /**
     * 重置一轮测验的内存状态
     */
    resetSessionState() {
        this.questionHistory = [];
        this.answeredQuestions.clear();
        this.currentQuestion = null;
        this.hintUsed = false;
        this.roundCompleted = false;
    }

    /**
     * 关闭测验模式
     * 本轮已完成时清除持久化会话（下一次进入重新开始）；
     * 未完成时保留会话，以便中途退出再进来时恢复进度
     */
    stopQuizMode() {
        if (this.roundCompleted) {
            this.clearSavedSession();
        }
        this.isQuizMode = false;
        this.currentQuestion = null;
        this.hintUsed = false;
        window.dispatchEvent(new CustomEvent('quizStopped'));
    }

    /**
     * 获取下一道随机题目（从本轮尚未处理的题目中抽取）
     * 整套题目都已处理时结束本轮
     */
    nextQuestion() {
        this._selectNextQuestion();
        this.persistSession();
        return this.currentQuestion;
    }

    /**
     * 内部：从剩余题目中抽题，或在题目用尽时结束本轮
     */
    _selectNextQuestion() {
        const questions = CONFIG.QUIZ_QUESTIONS;
        const availableQuestions = questions.filter(q => !this.answeredQuestions.has(q.id));

        if (availableQuestions.length === 0) {
            this._completeRound();
            return;
        }

        const randomIndex = Math.floor(Math.random() * availableQuestions.length);
        this.currentQuestion = availableQuestions[randomIndex];
        this.hintUsed = false;

        window.dispatchEvent(new CustomEvent('questionChanged', {
            detail: this.currentQuestion
        }));
    }

    /**
     * 结束本轮答题
     */
    _completeRound() {
        this.currentQuestion = null;
        this.hintUsed = false;
        this.roundCompleted = true;
        window.dispatchEvent(new CustomEvent('quizRoundCompleted', {
            detail: this.getStats()
        }));
    }
    
    /**
     * 获取提示
     */
    getHint() {
        if (!this.currentQuestion) return null;
        
        this.hintUsed = true;
        const hints = this.currentQuestion.hints;
        const randomIndex = Math.floor(Math.random() * hints.length);
        
        return hints[randomIndex];
    }
    
    /**
     * 验证用户答案
     */
    submitAnswer() {
        if (!this.currentQuestion) {
            return {
                isCorrect: false,
                outcome: 'wrong',
                score: 0,
                explanation: '请先选择一道题目',
                details: [],
                stats: this.getStats(),
                roundCompleted: this.roundCompleted
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
                outcome: 'wrong',
                score: 0,
                explanation: '请先在画布上添加一个透镜，然后再提交答案。',
                details: [],
                stats: this.getStats(),
                roundCompleted: this.roundCompleted
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
                ? CONFIG.QUIZ_SCORING.SCORE_WITH_HINT
                : CONFIG.QUIZ_SCORING.SCORE_PER_QUESTION;
        }

        const explanation = question.explanation[explanationKey] || question.explanation.correct;

        this._record({
            questionId: question.id,
            title: question.title,
            outcome: isCorrect ? 'correct' : 'wrong',
            isCorrect: isCorrect,
            score: earnedScore,
            hintUsed: this.hintUsed,
            details: results,
            explanation: explanation,
            timestamp: Date.now()
        });

        return {
            isCorrect: isCorrect,
            outcome: isCorrect ? 'correct' : 'wrong',
            score: earnedScore,
            totalScore: this.getStats().score,
            stats: this.getStats(),
            roundCompleted: this.roundCompleted,
            explanation: explanation,
            details: results,
            hintUsed: this.hintUsed
        };
    }

    /**
     * 跳过当前题目（不计分、不算答错，单独计入跳过数）
     * 返回是否已答完整套题目
     */
    skipQuestion() {
        if (!this.currentQuestion) {
            return { roundCompleted: this.roundCompleted };
        }

        const question = this.currentQuestion;
        this._record({
            questionId: question.id,
            title: question.title,
            outcome: 'skipped',
            isCorrect: false,
            score: 0,
            hintUsed: false,
            details: [],
            explanation: '已跳过本题，本题不计入正确率。',
            timestamp: Date.now()
        });

        return { roundCompleted: this.roundCompleted };
    }

    /**
     * 记录一道题的处理结果（答对 / 答错 / 跳过统一入口，避免重复累计）
     * 记录完成后立即抽取下一题或结束本轮，并持久化会话
     */
    _record(entry) {
        // 防御性检查：同一题只记录一次
        if (this.answeredQuestions.has(entry.questionId)) {
            return;
        }

        this.answeredQuestions.add(entry.questionId);
        this.questionHistory.push(entry);
        this._selectNextQuestion();
        this.persistSession();
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
     * 统一的测验统计口径（面板、结果弹窗、导出文件共用此方法）
     *
     * - correctCount / wrongCount / skippedCount 三类分开统计
     * - accuracy：正确率只按“答对 / 答错”计算，跳过不计入分母
     * - maxScore：整套题目固定满分，不随已答题数变化
     */
    getStats() {
        const totalQuestions = CONFIG.QUIZ_QUESTIONS.length;
        const maxScore = CONFIG.QUIZ_SCORING.MAX_SCORE;

        let correctCount = 0;
        let wrongCount = 0;
        let skippedCount = 0;
        let score = 0;
        let hintCount = 0;

        this.questionHistory.forEach(entry => {
            if (entry.outcome === 'skipped') {
                skippedCount++;
                return;
            }
            if (entry.isCorrect) {
                correctCount++;
            } else {
                wrongCount++;
            }
            score += entry.score || 0;
            if (entry.hintUsed) hintCount++;
        });

        const answeredCount = correctCount + wrongCount;
        const processedCount = correctCount + wrongCount + skippedCount;
        const accuracy = answeredCount > 0
            ? Math.round((correctCount / answeredCount) * 100)
            : 0;

        return {
            score: score,
            maxScore: maxScore,
            correctCount: correctCount,
            wrongCount: wrongCount,
            skippedCount: skippedCount,
            answeredCount: answeredCount,
            processedCount: processedCount,
            totalQuestions: totalQuestions,
            remainingCount: totalQuestions - processedCount,
            hintCount: hintCount,
            accuracy: accuracy,
            roundCompleted: this.roundCompleted
        };
    }

    /**
     * 兼容旧调用：获取当前得分
     */
    getScore() {
        const stats = this.getStats();
        return {
            score: stats.score,
            totalQuestions: stats.processedCount,
            accuracy: stats.accuracy
        };
    }

    /**
     * 持久化当前会话（每次答题/跳过后调用）
     */
    persistSession() {
        if (!this.isQuizMode) return;

        Storage.setQuizSession({
            questionHistory: this.questionHistory,
            answeredIds: Array.from(this.answeredQuestions),
            currentQuestionId: this.currentQuestion ? this.currentQuestion.id : null,
            roundCompleted: this.roundCompleted,
            savedAt: Date.now()
        });
    }

    /**
     * 清除已保存的会话
     */
    clearSavedSession() {
        Storage.clearQuizSession();
    }

    /**
     * 从本地存储恢复会话
     * 返回：'resumed' | 'completed' | null（无可恢复会话）
     */
    loadSession() {
        const saved = Storage.getQuizSession();
        if (!saved || !Array.isArray(saved.questionHistory) || !Array.isArray(saved.answeredIds)) {
            return null;
        }

        this.resetSessionState();
        this.isQuizMode = true;
        this.questionHistory = saved.questionHistory;
        saved.answeredIds.forEach(id => this.answeredQuestions.add(id));
        this.roundCompleted = saved.roundCompleted === true;

        if (this.roundCompleted) {
            this.currentQuestion = null;
            return 'completed';
        }

        // 恢复当前题（保存的 ID 必然是尚未处理的题）；若找不到则重新抽一道
        let question = null;
        if (saved.currentQuestionId) {
            question = CONFIG.QUIZ_QUESTIONS.find(
                q => q.id === saved.currentQuestionId && !this.answeredQuestions.has(q.id)
            ) || null;
        }
        if (!question) {
            const available = CONFIG.QUIZ_QUESTIONS.filter(q => !this.answeredQuestions.has(q.id));
            if (available.length === 0) {
                this._completeRound();
                return 'completed';
            }
            question = available[0];
        }

        this.currentQuestion = question;
        this.hintUsed = false;

        window.dispatchEvent(new CustomEvent('questionChanged', {
            detail: this.currentQuestion
        }));

        return 'resumed';
    }

    /**
     * 导出本轮答题明细为 CSV 文本（带 UTF-8 BOM，Excel 可直接打开）
     */
    exportReportCSV() {
        const stats = this.getStats();
        const BOM = '\uFEFF'; // UTF-8 BOM，确保 Excel 正确识别中文编码
        const newline = '\r\n';
        const esc = value => `"${String(value == null ? '' : value).replace(/"/g, '""')}"`;
        const rows = [];

        // —— 汇总区（与面板、结果弹窗同源，保证发给老师核对时一致）——
        rows.push([esc('光学测验成绩单'), '', '', '', '', '']);
        rows.push([esc('导出时间'), esc(Utils.formatDate(new Date())), '', '', '', '']);
        rows.push(['']);
        rows.push([esc('总分'), esc('固定满分'), esc('答对'), esc('答错'), esc('跳过'), esc('正确率')]);
        rows.push([
            esc(`${stats.score}分`),
            esc(`${stats.maxScore}分`),
            esc(`${stats.correctCount}题`),
            esc(`${stats.wrongCount}题`),
            esc(`${stats.skippedCount}题`),
            esc(`${stats.accuracy}%（跳过不计）`)
        ]);
        rows.push([
            esc('已答题数'),
            esc('跳过题数'),
            esc('总题数'),
            esc('剩余题数'),
            esc('使用提示题数'),
            ''
        ]);
        rows.push([
            esc(`${stats.answeredCount}题`),
            esc(`${stats.skippedCount}题`),
            esc(`${stats.totalQuestions}题`),
            esc(`${stats.remainingCount}题`),
            esc(`${stats.hintCount}题`),
            ''
        ]);
        rows.push(['']);

        // —— 逐题明细区 ——
        rows.push([esc('序号'), esc('题目'), esc('结果'), esc('得分'), esc('使用提示'), esc('判分明细'), esc('时间')]);
        this.questionHistory.forEach((entry, index) => {
            const outcomeNames = { correct: '答对', wrong: '答错', skipped: '跳过' };
            rows.push([
                index + 1,
                esc(entry.title),
                esc(outcomeNames[entry.outcome] || entry.outcome),
                esc(entry.outcome === 'skipped' ? '不计分' : `${entry.score}分`),
                esc(entry.hintUsed ? '是' : '否'),
                esc(this._formatDetailsForReport(entry)),
                esc(Utils.formatDate(entry.timestamp))
            ]);
        });

        return BOM + rows.map(row => row.join(',')).join(newline);
    }

    /**
     * 整理单题判分明细为导出文本
     */
    _formatDetailsForReport(entry) {
        if (entry.outcome === 'skipped') return '学生跳过';
        if (entry.isCorrect) return '全部检查项通过';
        if (!entry.details || entry.details.length === 0) {
            return entry.explanation || '未作答完整';
        }
        return entry.details
            .filter(d => !d.correct)
            .map(d => `${d.name}（期望：${d.expected}，实际：${d.actual}）`)
            .join('；');
    }
}
