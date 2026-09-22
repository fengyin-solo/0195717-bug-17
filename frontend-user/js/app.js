/**
 * 应用入口
 */
class App {
    constructor() {
        this.canvasManager = null;
        this.interactionManager = null;
        this.guideManager = null;
        this.quizManager = null;
        // 结果弹窗是否处于"本轮完成"汇总状态（此时按钮行为为开始新一轮）
        this.quizCompleteModalOpen = false;

        this.init();
    }

    /**
     * 初始化应用
     */
    init() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.setup());
        } else {
            this.setup();
        }
    }

    /**
     * 设置应用
     */
    setup() {
        console.log('光学设计实验室 v' + CONFIG.VERSION);

        // 初始化画布管理器
        this.canvasManager = new CanvasManager();

        // 初始化交互管理器
        this.interactionManager = new InteractionManager(this.canvasManager);

        // 初始化引导系统
        this.guideManager = new GuideManager();

        // 初始化测验管理器
        this.quizManager = new QuizManager(this.canvasManager);

        // 初始化知识点提示
        this.initKnowledgeTips();

        // 初始化测验模式事件
        this.initQuizMode();

        console.log('应用初始化完成');
    }

    /**
     * 初始化知识点提示
     */
    initKnowledgeTips() {
        const tipText = document.querySelector('.tip-text');
        if (!tipText) return;

        const showRandomTip = () => {
            tipText.textContent = Utils.getRandomTip();
        };

        showRandomTip();
        setInterval(showRandomTip, 30000);

        const knowledgeTip = document.getElementById('knowledge-tip');
        if (knowledgeTip) {
            knowledgeTip.addEventListener('click', showRandomTip);
        }
    }

    /**
     * 初始化测验模式
     */
    initQuizMode() {
        // 测验模式按钮
        const btnQuizMode = document.getElementById('btn-quiz-mode');
        if (btnQuizMode) {
            btnQuizMode.addEventListener('click', () => this.toggleQuizMode());
        }

        // 关闭测验面板
        const btnQuizClose = document.getElementById('btn-quiz-close');
        if (btnQuizClose) {
            btnQuizClose.addEventListener('click', () => this.stopQuizMode());
        }

        // 提示按钮
        const btnQuizHint = document.getElementById('btn-quiz-hint');
        if (btnQuizHint) {
            btnQuizHint.addEventListener('click', () => this.showQuizHint());
        }

        // 提交答案
        const btnQuizSubmit = document.getElementById('btn-quiz-submit');
        if (btnQuizSubmit) {
            btnQuizSubmit.addEventListener('click', () => this.submitQuizAnswer());
        }

        // 跳过题目
        const btnQuizSkip = document.getElementById('btn-quiz-skip');
        if (btnQuizSkip) {
            btnQuizSkip.addEventListener('click', () => this.skipQuizQuestion());
        }

        // 结果模态框 - 下一题 / 再来一轮
        const btnQuizNext = document.getElementById('btn-quiz-next');
        if (btnQuizNext) {
            btnQuizNext.addEventListener('click', () => this.nextQuizQuestion());
        }

        // 结果模态框 - 退出测验
        const btnQuizExit = document.getElementById('btn-quiz-exit');
        if (btnQuizExit) {
            btnQuizExit.addEventListener('click', () => this.exitQuizFromResult());
        }

        // 结果模态框 - 导出成绩单
        const btnQuizExport = document.getElementById('btn-quiz-export');
        if (btnQuizExport) {
            btnQuizExport.addEventListener('click', () => this.exportQuizResult());
        }

        // 监听题目变化事件
        window.addEventListener('questionChanged', (e) => {
            this.updateQuizPanel(e.detail);
        });

        // 监听测验停止事件
        window.addEventListener('quizStopped', () => {
            this.hideQuizPanel();
        });
    }

    /**
     * 切换测验模式
     */
    toggleQuizMode() {
        if (this.quizManager.isQuizMode) {
            this.stopQuizMode();
        } else {
            this.openQuizMode();
        }
    }

    /**
     * 进入测验模式：优先恢复未完成的一轮，统计不重复累计、答过的题不丢
     */
    openQuizMode() {
        const resumed = this.quizManager.resumeQuizMode();

        if (resumed) {
            this.enterQuizUI();
            this.updateScoreDisplay();

            const stats = this.quizManager.getStats();
            if (this.quizManager.completed) {
                // 上次已完成整套题目：展示汇总，可导出或开始新一轮
                this.showQuizCompleteModal();
                Utils.showToast('已恢复上次的测验记录', 'info');
            } else if (this.quizManager.currentAnswered) {
                // 退出时正停在某题的结果弹窗上：恢复该题结果
                this.showLastAnswerModal();
                Utils.showToast(
                    `已恢复上次进度（第 ${stats.seenCount}/${stats.totalQuestions} 题）`,
                    'info'
                );
            } else {
                Utils.showToast(
                    `已恢复上次进度（第 ${stats.seenCount}/${stats.totalQuestions} 题）`,
                    'info'
                );
            }
            return;
        }

        // 没有可恢复的会话：清空画布，开启全新一轮
        this.canvasManager.clear();
        this.quizManager.startQuizMode();
        this.enterQuizUI();
        Utils.showToast('测验模式已开启，祝你好运！', 'success');
    }

    /**
     * 进入测验模式的界面切换
     */
    enterQuizUI() {
        const btnQuizMode = document.getElementById('btn-quiz-mode');
        if (btnQuizMode) {
            btnQuizMode.classList.add('active');
            btnQuizMode.querySelector('span').textContent = '退出测验';
        }

        const quizPanel = document.getElementById('quiz-panel');
        if (quizPanel) {
            quizPanel.classList.remove('hidden');
        }

        const appContainer = document.getElementById('app');
        if (appContainer) {
            appContainer.classList.add('quiz-mode');
        }
    }

    /**
     * 开始全新一轮（清除上一轮的会话）
     */
    startQuizMode() {
        this.canvasManager.clear();
        this.quizManager.clearSession();
        this.quizManager.startQuizMode();
        this.enterQuizUI();
        Utils.showToast('新一轮测验开始，祝你好运！', 'success');
    }

    /**
     * 停止测验模式（会话保留在本地存储，下次可恢复）
     */
    stopQuizMode() {
        if (!this.quizManager.isQuizMode) return;

        const stats = this.quizManager.getStats();
        this.quizManager.stopQuizMode();

        // 更新UI
        const btnQuizMode = document.getElementById('btn-quiz-mode');
        if (btnQuizMode) {
            btnQuizMode.classList.remove('active');
            btnQuizMode.querySelector('span').textContent = '测验模式';
        }

        // 隐藏测验面板
        const quizPanel = document.getElementById('quiz-panel');
        if (quizPanel) {
            quizPanel.classList.add('hidden');
        }

        // 移除测验模式类
        const appContainer = document.getElementById('app');
        if (appContainer) {
            appContainer.classList.remove('quiz-mode');
        }

        // 隐藏结果模态框
        const resultModal = document.getElementById('quiz-result-modal');
        if (resultModal) {
            resultModal.classList.add('hidden');
        }

        this.quizCompleteModalOpen = false;

        // 清空画布
        this.canvasManager.clear();

        Utils.showToast(
            `测验已保存！得分：${stats.score}/${stats.maxScore}，正确率：${stats.accuracy}%`,
            stats.accuracy >= 60 ? 'success' : 'warning'
        );
    }

    /**
     * 隐藏测验面板
     */
    hideQuizPanel() {
        const quizPanel = document.getElementById('quiz-panel');
        if (quizPanel) {
            quizPanel.classList.add('hidden');
        }

        const appContainer = document.getElementById('app');
        if (appContainer) {
            appContainer.classList.remove('quiz-mode');
        }
    }

    /**
     * 更新测验面板内容
     */
    updateQuizPanel(question) {
        // 更新题目标题和描述
        const titleEl = document.getElementById('quiz-question-title');
        const descEl = document.getElementById('quiz-question-desc');

        if (titleEl) titleEl.textContent = question.title;
        if (descEl) descEl.textContent = question.description;

        // 隐藏提示
        const hintText = document.getElementById('quiz-hint-text');
        const btnHint = document.getElementById('btn-quiz-hint');
        if (this.quizManager.hintUsed) {
            // 恢复会话时保留"已用提示"状态
            if (btnHint) btnHint.disabled = true;
            if (hintText) {
                hintText.textContent = '💡 本题已使用提示，答对只得5分';
                hintText.classList.remove('hidden');
            }
        } else {
            if (hintText) {
                hintText.classList.add('hidden');
                hintText.textContent = '';
            }
            if (btnHint) {
                btnHint.disabled = false;
            }
        }

        // 更新得分显示
        this.updateScoreDisplay();
        this.updateQuizActionState();
    }

    /**
     * 同步面板操作按钮状态：本题已作答或本轮完成时禁用提交/跳过/提示
     */
    updateQuizActionState() {
        const locked = !this.quizManager.currentQuestion || this.quizManager.currentAnswered;
        const btnSubmit = document.getElementById('btn-quiz-submit');
        const btnSkip = document.getElementById('btn-quiz-skip');
        const btnHint = document.getElementById('btn-quiz-hint');

        if (btnSubmit) btnSubmit.disabled = locked;
        if (btnSkip) btnSkip.disabled = locked;
        if (btnHint) btnHint.disabled = locked || this.quizManager.hintUsed;

        // 本轮完成后题目区给出提示
        const titleEl = document.getElementById('quiz-question-title');
        const descEl = document.getElementById('quiz-question-desc');
        if (!this.quizManager.currentQuestion) {
            if (titleEl) titleEl.textContent = '本轮测验已完成';
            if (descEl) descEl.textContent = '可导出成绩单，或在结果弹窗中开始新一轮。';
        }
    }

    /**
     * 更新得分显示（与结果弹窗使用同一份统计口径）
     */
    updateScoreDisplay() {        const stats = this.quizManager.getStats();

        const scoreValue = document.getElementById('quiz-score-value');
        const scoreTotal = document.getElementById('quiz-score-total');

        if (scoreValue) scoreValue.textContent = stats.score;
        if (scoreTotal) scoreTotal.textContent = stats.maxScore;

        const metaAccuracy = document.getElementById('quiz-meta-accuracy');
        const metaCorrect = document.getElementById('quiz-meta-correct');
        const metaWrong = document.getElementById('quiz-meta-wrong');
        const metaSkipped = document.getElementById('quiz-meta-skipped');
        const metaProgress = document.getElementById('quiz-meta-progress');

        if (metaAccuracy) metaAccuracy.textContent = `${stats.accuracy}%`;
        if (metaCorrect) metaCorrect.textContent = stats.correctCount;
        if (metaWrong) metaWrong.textContent = stats.wrongCount;
        if (metaSkipped) metaSkipped.textContent = stats.skippedCount;
        if (metaProgress) metaProgress.textContent = `${stats.seenCount}/${stats.totalQuestions}`;
    }

    /**
     * 显示测验提示
     */
    showQuizHint() {
        const hint = this.quizManager.getHint();
        if (!hint) return;

        const hintText = document.getElementById('quiz-hint-text');
        if (hintText) {
            hintText.textContent = '💡 ' + hint;
            hintText.classList.remove('hidden');
        }

        // 禁用提示按钮
        const btnHint = document.getElementById('btn-quiz-hint');
        if (btnHint) {
            btnHint.disabled = true;
        }

        Utils.showToast('已使用提示，本题正确只得5分', 'warning');
    }

    /**
     * 提交测验答案
     */
    submitQuizAnswer() {
        if (!this.quizManager.isQuizMode || !this.quizManager.currentQuestion) {
            Utils.showToast('请先开始测验', 'warning');
            return;
        }

        // 本题已作答时不允许重复提交
        if (this.quizManager.currentAnswered) {
            Utils.showToast('本题已作答，请进入下一题', 'warning');
            return;
        }

        // 确保光路已启动，以便检查效果
        const renderer = this.canvasManager.getRenderer();
        if (!renderer.isRunning) {
            Utils.showToast('请先启动光路，观察光线效果后再提交', 'warning');
            return;
        }

        const result = this.quizManager.submitAnswer();
        if (result.details.length === 0 && result.score === 0 && !result.isCorrect) {
            // 画布为空等无法评分的情况：给出提示，不计入统计
            Utils.showToast(result.explanation, 'warning');
            return;
        }
        this.showQuizResult(result);
    }

    /**
     * 填充弹窗中的统一统计数据
     */
    updateResultStats() {
        const stats = this.quizManager.getStats();

        const totalScoreEl = document.getElementById('quiz-total-score');
        const maxScoreEl = document.getElementById('quiz-max-score');
        const accuracyEl = document.getElementById('quiz-accuracy');
        const answeredEl = document.getElementById('quiz-answered');
        const correctEl = document.getElementById('quiz-answered-correct');
        const wrongEl = document.getElementById('quiz-answered-wrong');
        const skippedEl = document.getElementById('quiz-answered-skipped');

        if (totalScoreEl) totalScoreEl.textContent = stats.score;
        if (maxScoreEl) maxScoreEl.textContent = stats.maxScore;
        if (accuracyEl) accuracyEl.textContent = `${stats.accuracy}%`;
        if (answeredEl) answeredEl.textContent = `${stats.seenCount}/${stats.totalQuestions}`;
        if (correctEl) correctEl.textContent = stats.correctCount;
        if (wrongEl) wrongEl.textContent = stats.wrongCount;
        if (skippedEl) skippedEl.textContent = stats.skippedCount;

        // 同步面板，保证两处始终一致
        this.updateScoreDisplay();
        this.updateQuizActionState();
    }

    /**
     * 显示测验结果
     */
    showQuizResult(result) {
        this.quizCompleteModalOpen = false;

        const modal = document.getElementById('quiz-result-modal');
        if (!modal) return;

        // 更新图标
        const iconEl = document.getElementById('quiz-result-icon');
        if (iconEl) {
            iconEl.textContent = result.isCorrect ? '🎉' : '😅';
        }

        // 更新标题
        const titleEl = document.getElementById('quiz-result-title');
        if (titleEl) {
            titleEl.textContent = result.isCorrect ? '回答正确！' : '再想想...';
        }

        // 更新本题得分
        const scoreEl = document.getElementById('quiz-result-score');
        if (scoreEl) {
            scoreEl.textContent = result.isCorrect ? `+${result.score}` : '+0';
        }
        const scoreLabel = scoreEl ? scoreEl.nextElementSibling : null;
        if (scoreLabel) scoreLabel.textContent = '分';

        // 更新解释
        const explanationEl = document.getElementById('quiz-result-explanation');
        if (explanationEl) {
            explanationEl.textContent = result.explanation;
        }
        explanationEl.style.display = '';

        // 更新详细检查项
        const detailsEl = document.getElementById('quiz-result-details');
        if (detailsEl) {
            if (result.details && result.details.length > 0) {
                detailsEl.innerHTML = result.details.map(detail => `
                    <div class="result-detail-item">
                        <span class="result-detail-name">${detail.name}</span>
                        <div class="result-detail-values">
                            <span class="result-detail-expected">期望：${detail.expected}</span>
                            <span class="result-detail-arrow">→</span>
                            <span class="result-detail-actual">实际：${detail.actual}</span>
                            <span class="result-detail-status ${detail.correct ? 'correct' : 'incorrect'}">
                                ${detail.correct ? '✓' : '✗'}
                            </span>
                        </div>
                    </div>
                `).join('');
                detailsEl.style.display = 'flex';
            } else {
                detailsEl.style.display = 'none';
            }
        }

        // 填充统一统计数据
        this.updateResultStats();

        // 最后一题：按钮引导到本轮汇总
        const stats = this.quizManager.getStats();
        const btnNext = document.getElementById('btn-quiz-next');
        const btnNextLabel = btnNext ? btnNext.querySelector('span') : null;
        if (btnNextLabel) {
            btnNextLabel.textContent = stats.seenCount >= stats.totalQuestions ? '查看本轮成绩' : '下一题';
        }

        this.updateQuizActionState();
        // 显示模态框
        modal.classList.remove('hidden');
    }

    /**
     * 恢复会话时，按最后一条答题记录展示结果弹窗
     */
    showLastAnswerModal() {
        const history = this.quizManager.questionHistory;
        const last = history[history.length - 1];
        if (!last) return;

        this.quizCompleteModalOpen = false;

        const modal = document.getElementById('quiz-result-modal');
        if (!modal) return;

        const iconEl = document.getElementById('quiz-result-icon');
        const titleEl = document.getElementById('quiz-result-title');
        const scoreEl = document.getElementById('quiz-result-score');
        const explanationEl = document.getElementById('quiz-result-explanation');
        const detailsEl = document.getElementById('quiz-result-details');

        const statusMap = {
            correct: { icon: '🎉', title: '回答正确！' },
            wrong: { icon: '😅', title: '再想想...' },
            skipped: { icon: '⏭️', title: '已跳过本题' }
        };
        const meta = statusMap[last.status] || statusMap.wrong;

        if (iconEl) iconEl.textContent = meta.icon;
        if (titleEl) titleEl.textContent = meta.title;
        if (scoreEl) scoreEl.textContent = `+${last.score}`;
        if (explanationEl) {
            explanationEl.textContent = '这是退出前最后作答的题目，请继续下一题。';
            explanationEl.style.display = '';
        }
        if (detailsEl) detailsEl.style.display = 'none';

        this.updateResultStats();

        const btnNext = document.getElementById('btn-quiz-next');
        const btnNextLabel = btnNext ? btnNext.querySelector('span') : null;
        const stats = this.quizManager.getStats();
        if (btnNextLabel) {
            btnNextLabel.textContent = stats.seenCount >= stats.totalQuestions ? '查看本轮成绩' : '下一题';
        }

        this.updateQuizActionState();
        modal.classList.remove('hidden');
    }

    /**
     * 显示本轮测验完成的汇总弹窗
     */
    showQuizCompleteModal() {
        this.quizCompleteModalOpen = true;

        const modal = document.getElementById('quiz-result-modal');
        if (!modal) return;

        const stats = this.quizManager.getStats();

        const iconEl = document.getElementById('quiz-result-icon');
        if (iconEl) iconEl.textContent = '🏁';

        const titleEl = document.getElementById('quiz-result-title');
        if (titleEl) titleEl.textContent = '本轮测验完成！';

        const scoreEl = document.getElementById('quiz-result-score');
        if (scoreEl) scoreEl.textContent = `${stats.score}/${stats.maxScore}`;
        const scoreLabel = scoreEl ? scoreEl.nextElementSibling : null;
        if (scoreLabel) scoreLabel.textContent = '分';

        const explanationEl = document.getElementById('quiz-result-explanation');
        if (explanationEl) {
            explanationEl.textContent = `答对 ${stats.correctCount} 题、答错 ${stats.wrongCount} 题、跳过 ${stats.skippedCount} 题。可导出成绩单发给老师核对，或开始新一轮测验。`;
            explanationEl.style.display = '';
        }

        const detailsEl = document.getElementById('quiz-result-details');
        if (detailsEl) detailsEl.style.display = 'none';

        this.updateResultStats();

        const btnNext = document.getElementById('btn-quiz-next');
        const btnNextLabel = btnNext ? btnNext.querySelector('span') : null;
        if (btnNextLabel) btnNextLabel.textContent = '再来一轮';

        this.updateQuizActionState();
        modal.classList.remove('hidden');
    }

    /**
     * 跳过当前题目（跳过与答错分开统计：不得分、不计答错、不进正确率分母）
     */
    skipQuizQuestion() {
        if (!this.quizManager.isQuizMode || !this.quizManager.currentQuestion) return;
        if (this.quizManager.currentAnswered) {
            Utils.showToast('本题已作答，请进入下一题', 'warning');
            return;
        }

        this.quizManager.skipCurrentQuestion();
        this.updateScoreDisplay();
        this.updateQuizActionState();

        const nextQuestion = this.quizManager.nextQuestion();

        // 清空画布
        this.canvasManager.clear();

        if (!nextQuestion) {
            // 跳过的是最后一题，整套题目完成
            this.showQuizCompleteModal();
        } else {
            Utils.showToast('已跳过本题', 'info');
        }
    }

    /**
     * 下一题；整套题目完成后按钮变为"再来一轮"
     */
    nextQuizQuestion() {
        // 本轮完成汇总弹窗：开始全新一轮
        if (this.quizCompleteModalOpen) {
            const resultModal = document.getElementById('quiz-result-modal');
            if (resultModal) resultModal.classList.add('hidden');
            this.startQuizMode();
            return;
        }

        // 隐藏结果模态框
        const resultModal = document.getElementById('quiz-result-modal');
        if (resultModal) {
            resultModal.classList.add('hidden');
        }

        // 清空画布
        this.canvasManager.clear();

        // 下一题；若整套题目已出完则展示本轮汇总
        const nextQuestion = this.quizManager.nextQuestion();
        if (!nextQuestion) {
            this.showQuizCompleteModal();
        }
    }

    /**
     * 导出本轮答题明细为 CSV 成绩单
     */
    exportQuizResult() {
        if (this.quizManager.questionHistory.length === 0) {
            Utils.showToast('暂无答题记录可导出', 'warning');
            return;
        }

        const csv = this.quizManager.buildExportCSV();
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);

        const now = new Date();
        const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;

        const link = document.createElement('a');
        link.href = url;
        link.download = `光学测验成绩_${stamp}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        Utils.showToast('成绩单已导出', 'success');
    }

    /**
     * 从结果模态框退出测验
     */
    exitQuizFromResult() {
        // 停止测验
        this.stopQuizMode();
    }
}

// 启动应用
const app = new App();
