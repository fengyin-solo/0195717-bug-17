/**
 * 本地存储管理（简化版）
 */
const Storage = {
    GUIDE_KEY: 'optics_guide_completed',
    QUIZ_SESSION_KEY: 'optics_quiz_session',

    /**
     * 检查引导是否完成
     */
    isGuideCompleted() {
        try {
            return localStorage.getItem(this.GUIDE_KEY) === 'true';
        } catch (e) {
            return false;
        }
    },

    /**
     * 标记引导完成
     */
    setGuideCompleted() {
        try {
            localStorage.setItem(this.GUIDE_KEY, 'true');
        } catch (e) {
            // 忽略存储错误
        }
    },

    /**
     * 重置引导状态
     */
    resetGuide() {
        try {
            localStorage.removeItem(this.GUIDE_KEY);
        } catch (e) {
            // 忽略存储错误
        }
    },

    /**
     * 读取未完成的测验会话快照
     * @returns {Object|null}
     */
    loadQuizSession() {
        try {
            const raw = localStorage.getItem(this.QUIZ_SESSION_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch (e) {
            return null;
        }
    },

    /**
     * 保存测验会话快照（中途退出后可恢复，统计不重复累计）
     * @param {Object} snapshot
     */
    saveQuizSession(snapshot) {
        try {
            localStorage.setItem(this.QUIZ_SESSION_KEY, JSON.stringify(snapshot));
        } catch (e) {
            // 忽略存储错误
        }
    },

    /**
     * 清除测验会话快照
     */
    clearQuizSession() {
        try {
            localStorage.removeItem(this.QUIZ_SESSION_KEY);
        } catch (e) {
            // 忽略存储错误
        }
    }
};
