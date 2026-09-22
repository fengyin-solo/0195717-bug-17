/**
 * 本地存储管理（简化版）
 */
const Storage = {
    GUIDE_KEY: 'optics_guide_completed',
    QUIZ_SESSION_KEY: 'optics_quiz_session',

    /**
     * 读取 JSON 数据
     */
    getJSON(key, defaultValue = null) {
        try {
            const raw = localStorage.getItem(key);
            return raw === null ? defaultValue : JSON.parse(raw);
        } catch (e) {
            return defaultValue;
        }
    },

    /**
     * 写入 JSON 数据
     */
    setJSON(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch (e) {
            return false;
        }
    },

    /**
     * 删除指定数据
     */
    remove(key) {
        try {
            localStorage.removeItem(key);
        } catch (e) {
            // 忽略存储错误
        }
    },

    /**
     * 读取未结束的测验会话
     */
    getQuizSession() {
        return this.getJSON(this.QUIZ_SESSION_KEY, null);
    },

    /**
     * 保存测验会话（中途退出后重进可恢复，不重复累计）
     */
    setQuizSession(session) {
        return this.setJSON(this.QUIZ_SESSION_KEY, session);
    },

    /**
     * 清除测验会话
     */
    clearQuizSession() {
        this.remove(this.QUIZ_SESSION_KEY);
    },

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
    }
};
