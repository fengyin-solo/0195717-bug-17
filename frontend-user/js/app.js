/**
 * 应用入口
 */
class App {
    constructor() {
        this.canvasManager = null;
        this.interactionManager = null;
        this.guideManager = null;
        this.quizManager = null;
        
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

        // 导出成绩（面板与结果弹窗两处入口）
        const btnQuizExport = document.getElementById('btn-quiz-export');
        if (btnQuizExport) {
            btnQuizExport.addEventListener('click', () => this.exportQuizReport());
        }
        const btnQuizExportResult = document.getElementById('btn-quiz-export-result');
        if (btnQuizExportResult) {
            btnQuizExportResult.addEventListener('click', () => this.exportQuizReport());
        }

        // 结果模态框 - 下一题
        const btnQuizNext = document.getElementById('btn-quiz-next');
        if (btnQuizNext) {
            btnQuizNext.addEventListener('click', () => this.nextQuizQuestion());
        }

        // 结果模态框 - 退出测验
        const btnQuizExit = document.getElementById('btn-quiz-exit');
        if (btnQuizExit) {
            btnQuizExit.addEventListener('click', () => this.exitQuizFromResult());
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
            this.startQuizMode();
        }
    }
    
    /**
     * 开始测验模式（有未结束的会话时恢复进度）
     */
    startQuizMode() {
        // 启动测验：恢复中途退出的会话，或开始全新一轮
        const mode = this.quizManager.startQuizMode();

        // 更新UI
        const btnQuizMode = document.getElementById('btn-quiz-mode');
        if (btnQuizMode) {
            btnQuizMode.classList.add('active');
            btnQuizMode.querySelector('span').textContent = '退出测验';
        }

        // 显示测验面板
        const quizPanel = document.getElementById('quiz-panel');
        if (quizPanel) {
            quizPanel.classList.remove('hidden');
        }

        // 添加测验模式类
        const appContainer = document.getElementById('app');
        if (appContainer) {
            appContainer.classList.add('quiz-mode');
        }

        if (mode === 'resumed') {
            const stats = this.quizManager.getStats();
            this.updateScoreDisplay();
            this.setQuizPanelEnabled(true);
            Utils.showToast(
                `已恢复上次测验进度：${stats.processedCount}/${stats.totalQuestions} 题，得分 ${stats.score} 分`,
                'info',
                3000
            );
        } else if (mode === 'completed') {
            this.setQuizPanelEnabled(false);
            this.showRoundCompleted(this.quizManager.getStats());
        } else {
            this.setQuizPanelEnabled(true);
            Utils.showToast('测验模式已开启，祝你好运！', 'success');
        }
    }
    
    /**
     * 停止测验模式
     * 本轮未完成时会保留会话进度，再次进入可恢复
     */
    stopQuizMode() {
        if (!this.quizManager.isQuizMode) return;

        const stats = this.quizManager.getStats();
        const completed = this.quizManager.roundCompleted;
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

        // 清空画布
        this.canvasManager.clear();

        if (completed) {
            Utils.showToast(
                `测验完成！得分：${stats.score}/${stats.maxScore} 分，正确率：${stats.accuracy}%（跳过 ${stats.skippedCount} 题）`,
                stats.accuracy >= 60 ? 'success' : 'warning',
                3000
            );
        } else {
            Utils.showToast(
                `测验进度已保存（${stats.processedCount}/${stats.totalQuestions} 题，${stats.score} 分），下次进入可继续`,
                'info',
                3000
            );
        }
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
        if (hintText) {
            hintText.classList.add('hidden');
            hintText.textContent = '';
        }
        
        // 启用提示按钮
        const btnHint = document.getElementById('btn-quiz-hint');
        if (btnHint) {
            btnHint.disabled = false;
        }
        
        // 更新得分显示
        this.updateScoreDisplay();
    }
    
    /**
     * 更新得分显示（与结果弹窗共用 quizManager.getStats 同一统计口径）
     */
    updateScoreDisplay() {
        const stats = this.quizManager.getStats();

        const scoreValue = document.getElementById('quiz-score-value');
        const scoreTotal = document.getElementById('quiz-score-total');
        const progress = document.getElementById('quiz-progress');

        if (scoreValue) scoreValue.textContent = stats.score;
        // 固定按整套题目满分显示，不随已答题数变化
        if (scoreTotal) scoreTotal.textContent = stats.maxScore;
        if (progress) {
            progress.textContent = this.quizManager.currentQuestion
                ? `第 ${stats.processedCount + 1}/${stats.totalQuestions} 题 · 答对${stats.correctCount} 答错${stats.wrongCount} 跳过${stats.skippedCount}`
                : `已完成 ${stats.processedCount}/${stats.totalQuestions} 题`;
        }
    }

    /**
     * 本轮答题结束后禁用面板上的提交/跳过/提示按钮
     */
    setQuizPanelEnabled(enabled) {
        ['btn-quiz-submit', 'btn-quiz-skip', 'btn-quiz-hint'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.disabled = !enabled;
        });
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
        
        // 确保光路已启动，以便检查效果
        const renderer = this.canvasManager.getRenderer();
        if (!renderer.isRunning) {
            Utils.showToast('请先启动光路，观察光线效果后再提交', 'warning');
            return;
        }
        
        const result = this.quizManager.submitAnswer();

        // 整套题目恰好随本次提交完成时，直接展示整轮总结
        if (result.roundCompleted || this.quizManager.roundCompleted) {
            this.showRoundCompleted(this.quizManager.getStats());
        } else {
            this.showQuizResult(result);
        }
    }
    
    /**
     * 显示测验结果（单题提交后）
     */
    showQuizResult(result) {
        const modal = document.getElementById('quiz-result-modal');
        if (!modal) return;

        // 更新图标
        const iconEl = document.getElementById('quiz-result-icon');
        if (iconEl) {
            iconEl.textContent = result.isCorrect ? '🎉' : '😅';
            iconEl.style.display = '';
        }

        // 更新标题
        const titleEl = document.getElementById('quiz-result-title');
        if (titleEl) {
            titleEl.textContent = result.isCorrect ? '回答正确！' : '再想想...';
        }

        // 更新得分
        const scoreEl = document.getElementById('quiz-result-score');
        if (scoreEl) {
            scoreEl.textContent = result.isCorrect ? `+${result.score}` : '+0';
        }

        // 更新解释
        const explanationEl = document.getElementById('quiz-result-explanation');
        if (explanationEl) {
            explanationEl.textContent = result.explanation;
        }

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

        // 单题结果不显示整轮总结条
        const summaryEl = document.getElementById('quiz-round-summary');
        if (summaryEl) {
            summaryEl.classList.add('hidden');
            summaryEl.textContent = '';
        }

        this.updateResultStats(result.stats || this.quizManager.getStats());

        // 整套题目已做完时，下一题按钮变为“完成”入口
        const btnNext = document.getElementById('btn-quiz-next');
        if (btnNext) {
            const done = result.roundCompleted || this.quizManager.roundCompleted;
            btnNext.querySelector('span').textContent = done ? '完成测验' : '下一题';
        }

        // 面板分数同步刷新
        this.updateScoreDisplay();

        // 显示模态框
        modal.classList.remove('hidden');
    }

    /**
     * 渲染结果弹窗统计区（数据与面板同源于 getStats）
     */
    updateResultStats(stats) {
        const setText = (id, text) => {
            const el = document.getElementById(id);
            if (el) el.textContent = text;
        };

        setText('quiz-total-score', stats.score);
        setText('quiz-accuracy', `${stats.accuracy}%`);
        setText('quiz-correct', stats.correctCount);
        setText('quiz-wrong', stats.wrongCount);
        setText('quiz-skipped', stats.skippedCount);
    }

    /**
     * 显示整套题目完成总结（最后一题提交/跳过，或恢复已完成会话时）
     */
    showRoundCompleted(stats) {
        stats = stats || this.quizManager.getStats();

        // 同步面板
        this.updateScoreDisplay();
        this.setQuizPanelEnabled(false);

        const modal = document.getElementById('quiz-result-modal');
        if (!modal) return;

        const iconEl = document.getElementById('quiz-result-icon');
        if (iconEl) {
            iconEl.textContent = stats.accuracy >= 60 ? '🏆' : '📚';
            iconEl.style.display = '';
        }

        const titleEl = document.getElementById('quiz-result-title');
        if (titleEl) {
            titleEl.textContent = '整套测验已完成！';
        }

        const scoreEl = document.getElementById('quiz-result-score');
        if (scoreEl) {
            scoreEl.textContent = `${stats.score}/${stats.maxScore}`;
        }

        const explanationEl = document.getElementById('quiz-result-explanation');
        if (explanationEl) {
            explanationEl.textContent = `本轮共 ${stats.totalQuestions} 题：答对 ${stats.correctCount} 题、答错 ${stats.wrongCount} 题、跳过 ${stats.skippedCount} 题。正确率 ${stats.accuracy}%（跳过不计入正确率）。可点击“导出成绩”下载成绩单发给老师核对。`;
        }

        const detailsEl = document.getElementById('quiz-result-details');
        if (detailsEl) {
            detailsEl.style.display = 'none';
            detailsEl.innerHTML = '';
        }

        const summaryEl = document.getElementById('quiz-round-summary');
        if (summaryEl) {
            summaryEl.textContent = `本轮成绩 ${stats.score} 分（满分固定 ${stats.maxScore} 分）`;
            summaryEl.classList.remove('hidden');
        }

        this.updateResultStats(stats);

        const btnNext = document.getElementById('btn-quiz-next');
        if (btnNext) {
            btnNext.querySelector('span').textContent = '完成测验';
        }

        modal.classList.remove('hidden');
    }
    
    /**
     * 跳过当前题目（跳过与答错分开统计，不计入正确率）
     */
    skipQuizQuestion() {
        if (!this.quizManager.isQuizMode || !this.quizManager.currentQuestion) {
            Utils.showToast('请先开始测验', 'warning');
            return;
        }

        const { roundCompleted } = this.quizManager.skipQuestion();

        // 同步面板得分/进度
        this.updateScoreDisplay();

        // 清空画布
        this.canvasManager.clear();

        if (roundCompleted) {
            this.showRoundCompleted(this.quizManager.getStats());
        } else {
            Utils.showToast('已跳过本题（不计入正确率）', 'info');
        }
    }

    /**
     * 下一题（结果弹窗按钮）
     * 整套题目已做完时，该按钮显示为“完成测验”，点击退出并结束本轮
     */
    nextQuizQuestion() {
        // 隐藏结果模态框
        const resultModal = document.getElementById('quiz-result-modal');
        if (resultModal) {
            resultModal.classList.add('hidden');
        }

        if (this.quizManager.roundCompleted) {
            this.stopQuizMode();
            return;
        }

        // 清空画布
        this.canvasManager.clear();

        // 下一题（当前题在提交/跳过时已预先抽取好，这里无需再抽）
        this.updateQuizPanel(this.quizManager.currentQuestion);
    }

    /**
     * 导出本轮答题明细成绩文件（CSV）
     */
    exportQuizReport() {
        if (!this.quizManager.isQuizMode) {
            Utils.showToast('请先开始测验', 'warning');
            return;
        }

        const stats = this.quizManager.getStats();
        if (stats.processedCount === 0) {
            Utils.showToast('还没有答题记录，答几道题后再导出吧', 'warning');
            return;
        }

        const csv = this.quizManager.exportReportCSV();
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
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

        Utils.showToast(
            `成绩文件已导出：${stats.processedCount} 题，${stats.score}/${stats.maxScore} 分`,
            'success',
            3000
        );
    }
    
    /**
     * 从结果模态框退出测验
     */
    exitQuizFromResult() {
        // 隐藏结果模态框
        const resultModal = document.getElementById('quiz-result-modal');
        if (resultModal) {
            resultModal.classList.add('hidden');
        }
        
        // 停止测验
        this.stopQuizMode();
    }
}

// 启动应用
const app = new App();
