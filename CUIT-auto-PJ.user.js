// ==UserScript==
// @name         自动评教脚本（CUIT 成都信息工程大学）
// @namespace    http://tampermonkey.net/
// @version      1.2
// @description  成都信息工程大学教务系统自动评教脚本 — Apple 风格界面，支持自动/手动提交、自定义评教内容、速度调节、快速模式
// @author       轻舟行
// @match        https://jwc.cuit.edu.cn/eams/quality/stdEvaluate*
// @match        http://jwc.cuit.edu.cn/eams/quality/stdEvaluate*
// @match        https://jwgl.cuit.edu.cn/eams/quality/stdEvaluate*
// @match        http://jwgl.cuit.edu.cn/eams/quality/stdEvaluate*
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_notification
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    let autoSubmit = GM_getValue('autoSubmit', false);
    let isProcessing = GM_getValue('isProcessing', false);
    let countdownInterval = null;
    let shouldStop = false;
    let allTimers = [];

    let q14Text = GM_getValue('q14Text', '无');
    let q15Text = GM_getValue('q15Text', '老师教学认真负责，课程内容充实，讲解清晰易懂。');

    let completedCount = 0;
    let totalCount = 0;
    let errorLogs = GM_getValue('errorLogs', []);
    let settingsClickCount = 0;
    let settingsClickTimer = null;
    let isMinimized = true;

    let countdownTime = GM_getValue('countdownTime', 3);
    let fastMode = GM_getValue('fastMode', false);

    // 自定义题目选项配置：{ "engName": 选项索引 }
    // 选项索引：0=第一个, 1=第二个, 2=第三个, 3=第四个, 4=第五个
    let questionSelectors = GM_getValue('questionSelectors', {
        'sy13': 2,   // 批改作业次数 → 2-3次
        'sy14': 1,   // 每周课外学习时间 → 1小时以内
        'sy16': 2,   // 需要非常努力才能达到课程要求 → 一般
    });

    const COLORS = {
        blue: '#007AFF',
        blueLight: '#E8F1FF',
        blueDark: '#0056CC',
        text: '#1C1C1E',
        textSecondary: '#8E8E93',
        textTertiary: '#C7C7CC',
        bg: '#F2F2F7',
        white: 'rgba(255,255,255,0.75)',
        border: 'rgba(0,0,0,0.05)',
        green: '#34C759',
        red: '#FF3B30',
    };

    GM_addStyle(`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');

        .ae-apple-blur {
            background: ${COLORS.white};
            backdrop-filter: saturate(200%) blur(30px);
            -webkit-backdrop-filter: saturate(200%) blur(30px);
            border: 0.5px solid ${COLORS.border};
        }

        .ae-no-scrollbar::-webkit-scrollbar { display: none; }

        .ae-progress-transition { transition: width 0.6s cubic-bezier(0.33, 1, 0.68, 1); }

        .ae-active-pulse { animation: aePulse 2s infinite; }
        @keyframes aePulse {
            0% { box-shadow: 0 0 0 0 rgba(0,122,255,0.25); }
            70% { box-shadow: 0 0 0 14px rgba(0,122,255,0); }
            100% { box-shadow: 0 0 0 0 rgba(0,122,255,0); }
        }

        @keyframes aeFadeIn {
            from { opacity: 0; transform: scale(0.94) translateY(8px); }
            to { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes aeFadeOut {
            from { opacity: 1; transform: scale(1) translateY(0); }
            to { opacity: 0; transform: scale(0.94) translateY(8px); }
        }
        @keyframes aeSlideUp {
            from { opacity: 0; transform: translateY(12px); }
            to { opacity: 1; transform: translateY(0); }
        }
        @keyframes aeSlideRight {
            from { opacity: 0; transform: translateX(16px); }
            to { opacity: 1; transform: translateX(0); }
        }

        /* ===== 悬浮球 ===== */
        #ae-ball {
            position: fixed;
            bottom: 32px;
            right: 32px;
            z-index: 99999;
            cursor: pointer;
            transition: transform 0.35s cubic-bezier(0.33, 1, 0.68, 1);
            -webkit-user-select: none;
            user-select: none;
        }
        #ae-ball:hover { transform: scale(1.06); }
        #ae-ball:active { transform: scale(0.94); }

        #ae-ball-inner {
            width: 60px;
            height: 60px;
            border-radius: 50%;
            background: ${COLORS.blue};
            box-shadow: 0 6px 24px rgba(0,122,255,0.35), 0 2px 6px rgba(0,122,255,0.2);
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            position: relative;
            transition: box-shadow 0.3s ease;
        }
        #ae-ball:hover #ae-ball-inner {
            box-shadow: 0 8px 32px rgba(0,122,255,0.45), 0 2px 8px rgba(0,122,255,0.25);
        }

        #ae-ball-icon {
            font-size: 16px;
            line-height: 1;
            margin-bottom: 1px;
            filter: drop-shadow(0 1px 2px rgba(0,0,0,0.1));
        }
        #ae-ball-text {
            font-size: 10px;
            font-weight: 700;
            color: #fff;
            letter-spacing: 0.3px;
            line-height: 1;
        }

        #ae-ball-ring {
            position: absolute;
            top: -3px;
            left: -3px;
            width: 66px;
            height: 66px;
            transform: rotate(-90deg);
        }
        #ae-ball-ring-bg {
            fill: none;
            stroke: rgba(255,255,255,0.2);
            stroke-width: 3;
        }
        #ae-ball-ring-fill {
            fill: none;
            stroke: #fff;
            stroke-width: 3;
            stroke-linecap: round;
            stroke-dasharray: 197.92;
            stroke-dashoffset: 197.92;
            transition: stroke-dashoffset 0.6s cubic-bezier(0.33, 1, 0.68, 1);
            filter: drop-shadow(0 0 4px rgba(255,255,255,0.4));
        }

        /* ===== 主面板 ===== */
        #ae-panel {
            position: fixed;
            bottom: 32px;
            right: 32px;
            z-index: 99999;
            width: 320px;
            background: ${COLORS.white};
            backdrop-filter: saturate(200%) blur(30px);
            -webkit-backdrop-filter: saturate(200%) blur(30px);
            border: 0.5px solid ${COLORS.border};
            border-radius: 2rem;
            box-shadow: 0 20px 50px rgba(0,0,0,0.1), 0 0 0 0.5px rgba(0,0,0,0.03);
            overflow: hidden;
            transition: opacity 0.35s cubic-bezier(0.33, 1, 0.68, 1), transform 0.35s cubic-bezier(0.33, 1, 0.68, 1);
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
            -webkit-user-select: none;
            user-select: none;
            will-change: transform;
        }
        #ae-panel.ae-hidden {
            opacity: 0;
            transform: scale(0.92) translateY(12px);
            pointer-events: none;
        }
        #ae-panel.ae-dragging {
            transition: opacity 0.35s cubic-bezier(0.33, 1, 0.68, 1);
        }

        /* ===== 面板头部 ===== */
        #ae-header {
            padding: 24px 28px 12px 28px;
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            cursor: move;
        }
        #ae-header-left {
            display: flex;
            flex-direction: column;
            gap: 2px;
        }
        #ae-header-suptitle {
            font-size: 10px;
            font-weight: 700;
            letter-spacing: 0.15em;
            color: ${COLORS.blue};
            text-transform: uppercase;
        }
        #ae-header-title {
            font-size: 22px;
            font-weight: 600;
            color: ${COLORS.text};
            line-height: 1.2;
        }
        #ae-header-actions {
            display: flex;
            gap: 6px;
            flex-shrink: 0;
        }
        .ae-header-btn {
            width: 36px;
            height: 36px;
            border-radius: 50%;
            background: rgba(142,142,147,0.08);
            border: none;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s ease;
            color: ${COLORS.textSecondary};
            padding: 0;
        }
        .ae-header-btn:hover {
            background: rgba(142,142,147,0.15);
            color: ${COLORS.text};
        }
        .ae-header-btn:active {
            transform: scale(0.88);
        }
        .ae-header-btn svg {
            width: 18px;
            height: 18px;
        }

        /* ===== 状态卡片 ===== */
        #ae-status-card {
            margin: 8px 20px 4px 20px;
            background: rgba(255,255,255,0.5);
            border-radius: 1.6rem;
            padding: 18px 20px;
            border: 0.5px solid rgba(255,255,255,0.6);
            box-shadow: 0 1px 4px rgba(0,0,0,0.02);
        }
        #ae-status-card-top {
            display: flex;
            justify-content: space-between;
            align-items: flex-end;
            margin-bottom: 10px;
        }
        #ae-status-label {
            font-size: 11px;
            font-weight: 500;
            color: ${COLORS.textSecondary};
        }
        #ae-status-percent {
            font-size: 26px;
            font-weight: 300;
            color: ${COLORS.text};
            line-height: 1;
        }
        #ae-status-percent span {
            font-size: 13px;
            margin-left: 1px;
            font-weight: 400;
        }
        #ae-progress-track {
            height: 5px;
            width: 100%;
            background: rgba(142,142,147,0.15);
            border-radius: 3px;
            overflow: hidden;
        }
        #ae-progress-fill {
            height: 100%;
            background: ${COLORS.blue};
            border-radius: 3px;
            width: 0%;
            box-shadow: 0 0 10px rgba(0,122,255,0.4);
            transition: width 0.6s cubic-bezier(0.33, 1, 0.68, 1);
        }
        #ae-status-current {
            margin-top: 10px;
            display: flex;
            align-items: center;
            gap: 7px;
        }
        #ae-status-dot {
            width: 7px;
            height: 7px;
            border-radius: 50%;
            background: ${COLORS.green};
            flex-shrink: 0;
        }
        #ae-status-dot.idle {
            background: ${COLORS.textTertiary};
        }
        #ae-status-dot.error {
            background: ${COLORS.red};
        }
        #ae-status-dot.working {
            animation: aePulse 1.5s infinite;
        }
        #ae-status-msg {
            font-size: 11px;
            font-weight: 500;
            color: ${COLORS.textSecondary};
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        /* ===== 主体内容 ===== */
        #ae-body {
            padding: 12px 24px 20px 24px;
        }
        .ae-body-section {
            margin-bottom: 16px;
        }
        .ae-body-section:last-child {
            margin-bottom: 0;
        }

        .ae-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
        }
        .ae-row-left {
            display: flex;
            flex-direction: column;
            gap: 1px;
        }
        .ae-row-label {
            font-size: 14px;
            font-weight: 500;
            color: ${COLORS.text};
        }
        .ae-row-hint {
            font-size: 10px;
            color: ${COLORS.textSecondary};
        }

        .ae-toggle {
            position: relative;
            display: inline-block;
            width: 44px;
            height: 24px;
            flex-shrink: 0;
        }
        .ae-toggle input {
            opacity: 0;
            width: 0;
            height: 0;
        }
        .ae-toggle-track {
            position: absolute;
            inset: 0;
            background: #e9e9ea;
            border-radius: 12px;
            transition: background 0.25s ease;
            cursor: pointer;
        }
        .ae-toggle-track::after {
            content: '';
            position: absolute;
            top: 2px;
            left: 2px;
            width: 20px;
            height: 20px;
            background: #fff;
            border-radius: 50%;
            transition: transform 0.25s cubic-bezier(0.33, 1, 0.68, 1);
            box-shadow: 0 1px 3px rgba(0,0,0,0.15);
        }
        .ae-toggle input:checked + .ae-toggle-track {
            background: ${COLORS.blue};
        }
        .ae-toggle input:checked + .ae-toggle-track::after {
            transform: translateX(20px);
        }

        .ae-btn-row {
            display: flex;
            gap: 10px;
        }
        .ae-btn {
            flex: 1;
            height: 52px;
            border: none;
            border-radius: 14px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s cubic-bezier(0.33, 1, 0.68, 1);
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            padding: 0 16px;
        }
        .ae-btn:active {
            transform: scale(0.96);
        }
        .ae-btn-primary {
            background: ${COLORS.text};
            color: #fff;
            box-shadow: 0 4px 14px rgba(0,0,0,0.12);
        }
        .ae-btn-primary:hover {
            background: #000;
            box-shadow: 0 6px 20px rgba(0,0,0,0.16);
        }
        .ae-btn-primary:disabled {
            background: #d1d1d6;
            box-shadow: none;
            cursor: not-allowed;
            transform: none;
        }
        .ae-btn-secondary {
            background: ${COLORS.blueLight};
            color: ${COLORS.blue};
        }
        .ae-btn-secondary:hover {
            background: #d6e8ff;
        }
        .ae-btn-secondary:disabled {
            background: #f2f2f7;
            color: #c7c7cc;
            cursor: not-allowed;
            transform: none;
        }
        .ae-btn-danger {
            background: rgba(255,59,48,0.1);
            color: ${COLORS.red};
        }
        .ae-btn-danger:hover {
            background: rgba(255,59,48,0.15);
        }

        #ae-countdown {
            display: none;
            align-items: center;
            justify-content: space-between;
            padding: 10px 14px;
            background: ${COLORS.blueLight};
            border-radius: 12px;
            animation: aeSlideUp 0.25s ease;
        }
        #ae-countdown-text {
            font-size: 13px;
            font-weight: 600;
            color: ${COLORS.blueDark};
        }
        #ae-countdown-cancel {
            font-size: 12px;
            font-weight: 500;
            color: ${COLORS.blue};
            background: none;
            border: none;
            cursor: pointer;
            padding: 4px 10px;
            border-radius: 8px;
            transition: background 0.2s ease;
        }
        #ae-countdown-cancel:hover {
            background: rgba(0,122,255,0.1);
        }

        #ae-footer {
            padding: 12px 24px 18px 24px;
            background: rgba(142,142,147,0.04);
            border-top: 0.5px solid rgba(0,0,0,0.04);
        }
        #ae-footer-top {
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        #ae-footer-label {
            font-size: 10px;
            font-weight: 700;
            letter-spacing: 0.12em;
            color: ${COLORS.textTertiary};
            text-transform: uppercase;
        }
        #ae-footer-detail {
            font-size: 10px;
            font-weight: 600;
            color: ${COLORS.blue};
            cursor: pointer;
            background: none;
            border: none;
            padding: 2px 4px;
            transition: opacity 0.2s ease;
        }
        #ae-footer-detail:hover {
            opacity: 0.7;
        }

        /* ===== 设置弹窗 ===== */
        #ae-overlay {
            position: fixed;
            inset: 0;
            background: rgba(0,0,0,0.3);
            backdrop-filter: blur(8px);
            -webkit-backdrop-filter: blur(8px);
            z-index: 100000;
            display: none;
            align-items: center;
            justify-content: center;
            animation: aeFadeIn 0.3s ease;
        }
        #ae-overlay.ae-show {
            display: flex;
        }
        #ae-overlay.ae-hiding {
            animation: aeFadeOut 0.2s ease forwards;
        }

        #ae-modal {
            width: 380px;
            max-height: 85vh;
            background: #fff;
            border-radius: 1.8rem;
            box-shadow: 0 20px 60px rgba(0,0,0,0.2);
            overflow: hidden;
            display: flex;
            flex-direction: column;
            animation: aeFadeIn 0.35s ease;
        }
        #ae-modal.ae-hiding {
            animation: aeFadeOut 0.2s ease forwards;
        }
        #ae-modal-header {
            padding: 20px 22px 14px 22px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        #ae-modal-title {
            font-size: 17px;
            font-weight: 600;
            color: ${COLORS.text};
        }
        #ae-modal-close {
            width: 30px;
            height: 30px;
            border-radius: 50%;
            background: rgba(142,142,147,0.1);
            border: none;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 18px;
            color: ${COLORS.textSecondary};
            transition: all 0.2s ease;
            padding: 0;
            line-height: 1;
        }
        #ae-modal-close:hover {
            background: rgba(142,142,147,0.2);
        }
        #ae-modal-body {
            padding: 4px 22px 16px 22px;
            overflow-y: auto;
            flex: 1;
        }
        #ae-modal-body::-webkit-scrollbar { width: 4px; }
        #ae-modal-body::-webkit-scrollbar-track { background: transparent; }
        #ae-modal-body::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.1); border-radius: 2px; }
        #ae-modal-footer {
            padding: 12px 22px 18px 22px;
            border-top: 0.5px solid rgba(0,0,0,0.06);
            display: flex;
            gap: 10px;
            justify-content: flex-end;
        }
        #ae-modal-footer .ae-btn {
            flex: none;
            min-width: 90px;
            height: 40px;
            font-size: 13px;
        }

        .ae-field-group {
            margin-bottom: 18px;
        }
        .ae-field-group:last-child {
            margin-bottom: 0;
        }
        .ae-field-label {
            display: block;
            font-size: 13px;
            font-weight: 600;
            color: ${COLORS.text};
            margin-bottom: 6px;
        }
        .ae-field-textarea {
            width: 100%;
            padding: 10px 12px;
            border: 1.5px solid #e5e5ea;
            border-radius: 12px;
            font-size: 13px;
            font-family: 'Inter', -apple-system, sans-serif;
            color: ${COLORS.text};
            background: #fafafa;
            resize: vertical;
            outline: none;
            transition: border-color 0.2s ease, box-shadow 0.2s ease;
            box-sizing: border-box;
        }
        .ae-field-textarea:focus {
            border-color: ${COLORS.blue};
            box-shadow: 0 0 0 3px rgba(0,122,255,0.12);
            background: #fff;
        }
        .ae-field-textarea::placeholder {
            color: ${COLORS.textTertiary};
        }

        .ae-slider-row {
            display: flex;
            align-items: center;
            gap: 14px;
        }
        .ae-slider-row input[type="range"] {
            flex: 1;
            -webkit-appearance: none;
            appearance: none;
            height: 4px;
            background: #e5e5ea;
            border-radius: 2px;
            outline: none;
        }
        .ae-slider-row input[type="range"]::-webkit-slider-thumb {
            -webkit-appearance: none;
            width: 20px;
            height: 20px;
            border-radius: 50%;
            background: #fff;
            border: 0.5px solid rgba(0,0,0,0.08);
            box-shadow: 0 2px 8px rgba(0,0,0,0.12);
            cursor: pointer;
            transition: box-shadow 0.2s ease;
        }
        .ae-slider-row input[type="range"]::-webkit-slider-thumb:hover {
            box-shadow: 0 2px 12px rgba(0,0,0,0.18);
        }
        .ae-slider-row input[type="range"]::-moz-range-thumb {
            width: 20px;
            height: 20px;
            border-radius: 50%;
            background: #fff;
            border: 0.5px solid rgba(0,0,0,0.08);
            box-shadow: 0 2px 8px rgba(0,0,0,0.12);
            cursor: pointer;
        }
        .ae-slider-value {
            font-size: 15px;
            font-weight: 600;
            color: ${COLORS.text};
            min-width: 32px;
            text-align: center;
        }
        .ae-slider-labels {
            display: flex;
            justify-content: space-between;
            font-size: 10px;
            color: ${COLORS.textTertiary};
            margin-top: 4px;
        }

        .ae-switch-field {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 8px 0;
        }
        .ae-switch-field-label {
            font-size: 14px;
            font-weight: 500;
            color: ${COLORS.text};
        }

        /* ===== Toast ===== */
        #ae-toast {
            position: fixed;
            bottom: 40px;
            left: 50%;
            transform: translateX(-50%) translateY(16px);
            padding: 10px 22px;
            background: rgba(0,0,0,0.78);
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            color: #fff;
            font-size: 13px;
            font-weight: 500;
            font-family: 'Inter', -apple-system, sans-serif;
            border-radius: 999px;
            box-shadow: 0 8px 30px rgba(0,0,0,0.2);
            z-index: 100001;
            opacity: 0;
            transition: opacity 0.35s ease, transform 0.35s cubic-bezier(0.33, 1, 0.68, 1);
            pointer-events: none;
            white-space: nowrap;
        }
        #ae-toast.ae-show {
            opacity: 1;
            transform: translateX(-50%) translateY(0);
        }

        /* ===== 庆祝动画 ===== */
        #ae-celebration {
            position: fixed;
            inset: 0;
            z-index: 1000000;
            pointer-events: none;
            overflow: hidden;
        }
        #ae-celebration-bg {
            position: absolute;
            inset: 0;
            background: radial-gradient(ellipse at center, rgba(0,122,255,0.08) 0%, transparent 60%);
            animation: aeBgPulse 3s ease-in-out infinite;
        }
        @keyframes aeBgPulse {
            0%, 100% { opacity: 0.5; transform: scale(1); }
            50% { opacity: 1; transform: scale(1.08); }
        }
        #ae-celebration-content {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            text-align: center;
            z-index: 2;
            padding: 40px 60px;
        }
        #ae-celebration-icon {
            font-size: 72px;
            line-height: 1;
            margin-bottom: 20px;
            animation: aeIconBounce 2s ease-in-out infinite;
            filter: drop-shadow(0 8px 24px rgba(0,122,255,0.3));
        }
        @keyframes aeIconBounce {
            0%, 100% { transform: translateY(0) scale(1); }
            50% { transform: translateY(-8px) scale(1.05); }
        }
        #ae-celebration-title {
            font-size: 48px;
            font-weight: 800;
            letter-spacing: 2px;
            color: ${COLORS.text};
            margin-bottom: 6px;
        }
        #ae-celebration-title .ae-char {
            display: inline-block;
            opacity: 0;
            animation: aeCharReveal 0.5s ease-out forwards;
        }
        @keyframes aeCharReveal {
            0% { opacity: 0; transform: translateY(16px) scale(0.9); }
            100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        #ae-celebration-sub {
            font-size: 14px;
            font-weight: 500;
            color: ${COLORS.textSecondary};
            letter-spacing: 4px;
            text-transform: uppercase;
            margin-bottom: 28px;
            opacity: 0;
            animation: aeSlideUp 0.6s ease 1s forwards;
        }
        #ae-celebration-stats {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 40px;
            opacity: 0;
            animation: aeSlideUp 0.6s ease 1.3s forwards;
        }
        .ae-cele-stat-val {
            font-size: 36px;
            font-weight: 700;
            color: ${COLORS.blue};
            line-height: 1;
        }
        .ae-cele-stat-lbl {
            font-size: 11px;
            color: ${COLORS.textSecondary};
            font-weight: 500;
            letter-spacing: 1px;
            margin-top: 4px;
        }
        .ae-cele-stat-div {
            width: 1px;
            height: 36px;
            background: rgba(0,0,0,0.08);
        }
        #ae-celebration-canvas {
            position: absolute;
            inset: 0;
            z-index: 1;
        }

        .ae-log-content {
            max-height: 280px;
            overflow-y: auto;
        }
        .ae-log-content::-webkit-scrollbar { width: 4px; }
        .ae-log-content::-webkit-scrollbar-track { background: transparent; }
        .ae-log-content::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.1); border-radius: 2px; }

        .ae-log-empty {
            text-align: center;
            padding: 30px 0;
            color: ${COLORS.textTertiary};
            font-size: 13px;
        }
        .ae-log-item {
            background: #f8f8fa;
            border-radius: 10px;
            padding: 10px 12px;
            margin-bottom: 8px;
            border: 0.5px solid rgba(0,0,0,0.04);
        }
        .ae-log-time {
            font-size: 10px;
            color: ${COLORS.textTertiary};
            margin-bottom: 2px;
        }
        .ae-log-msg {
            font-size: 12px;
            font-weight: 500;
            color: ${COLORS.text};
            margin-bottom: 4px;
            line-height: 1.4;
            word-break: break-word;
        }
        .ae-log-url {
            font-size: 10px;
            color: ${COLORS.textSecondary};
            word-break: break-all;
            font-family: 'SF Mono', monospace;
        }

        .ae-from-btn {
            width: 100%;
            height: 44px;
            border: none;
            border-radius: 12px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s ease;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            margin-bottom: 10px;
        }
        .ae-from-btn:active { transform: scale(0.97); }

        /* ===== 题目配置 ===== */
        .ae-qconf-container {
            max-height: 280px;
            overflow-y: auto;
            border: 1px solid #e5e5ea;
            border-radius: 12px;
            background: #fafafa;
            padding: 6px;
        }
        .ae-qconf-container::-webkit-scrollbar { width: 4px; }
        .ae-qconf-container::-webkit-scrollbar-track { background: transparent; }
        .ae-qconf-container::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.1); border-radius: 2px; }
        .ae-qconf-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 8px 10px;
            border-radius: 8px;
            transition: background 0.15s ease;
            gap: 10px;
        }
        .ae-qconf-row:hover {
            background: rgba(0,122,255,0.04);
        }
        .ae-qconf-name {
            font-size: 12px;
            font-weight: 500;
            color: #1C1C1E;
            flex: 1;
            min-width: 0;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .ae-qconf-select {
            flex-shrink: 0;
            padding: 4px 8px;
            border: 1.5px solid #e5e5ea;
            border-radius: 8px;
            font-size: 12px;
            font-family: 'Inter', -apple-system, sans-serif;
            color: #1C1C1E;
            background: #fff;
            outline: none;
            cursor: pointer;
            transition: border-color 0.2s ease;
            min-width: 120px;
        }
        .ae-qconf-select:focus {
            border-color: #007AFF;
            box-shadow: 0 0 0 2px rgba(0,122,255,0.1);
        }

        .ae-promo {
            padding: 10px 24px 4px 24px;
            text-align: center;
        }
        .ae-promo-btn {
            font-size: 11px;
            font-weight: 600;
            color: ${COLORS.blue};
            cursor: pointer;
            background: none;
            border: none;
            padding: 6px 14px;
            border-radius: 8px;
            transition: all 0.25s ease;
            letter-spacing: 0.3px;
            display: inline-flex;
            align-items: center;
            gap: 4px;
        }
        .ae-promo-btn:hover {
            background: ${COLORS.blueLight};
        }
        .ae-promo-btn:active { transform: scale(0.95); }
    `);

    /* ===== Toast ===== */
    function showToast(msg) {
        let el = document.getElementById('ae-toast');
        if (!el) {
            el = document.createElement('div');
            el.id = 'ae-toast';
            document.body.appendChild(el);
        }
        el.textContent = msg;
        el.classList.add('ae-show');
        clearTimeout(el._hide);
        el._hide = setTimeout(() => el.classList.remove('ae-show'), 2200);
    }

    /* ===== 庆祝动画 ===== */
    function showCelebration() {
        const wrap = document.createElement('div');
        wrap.id = 'ae-celebration';
        wrap.innerHTML = `
            <div id="ae-celebration-bg"></div>
            <canvas id="ae-celebration-canvas"></canvas>
            <div id="ae-celebration-content">
                <div id="ae-celebration-icon">🎯</div>
                <div id="ae-celebration-title">
                    ${'评教完成'.split('').map((c,i) => `<span class="ae-char" style="animation-delay:${i*0.12}s">${c}</span>`).join('')}
                </div>
                <div id="ae-celebration-sub">All Done</div>
                <div id="ae-celebration-stats">
                    <div><div class="ae-cele-stat-val">${completedCount}</div><div class="ae-cele-stat-lbl">已评教</div></div>
                    <div class="ae-cele-stat-div"></div>
                    <div><div class="ae-cele-stat-val">100%</div><div class="ae-cele-stat-lbl">完成度</div></div>
                </div>
            </div>
        `;
        document.body.appendChild(wrap);

        const canvas = wrap.querySelector('#ae-celebration-canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;

        const colors = ['#007AFF', '#34C759', '#FF9500', '#FF3B30', '#AF52DE', '#5856D6', '#FF2D55', '#5AC8FA'];
        const particles = [];
        for (let i = 0; i < 180; i++) {
            particles.push({
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height - canvas.height,
                s: Math.random() * 10 + 3,
                c: colors[Math.floor(Math.random() * colors.length)],
                vy: Math.random() * 3.5 + 1.8,
                vx: Math.random() * 2.5 - 1.25,
                r: Math.random() * 360,
                rs: Math.random() * 10 - 5,
                o: Math.random() * 0.4 + 0.4
            });
        }

        let frame;
        function draw() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            particles.forEach(p => {
                p.y += p.vy;
                p.x += p.vx + Math.sin(p.y * 0.008) * 0.4;
                p.r += p.rs;
                if (p.y > canvas.height) { p.y = -12; p.x = Math.random() * canvas.width; }
                ctx.save();
                ctx.globalAlpha = p.o;
                ctx.translate(p.x, p.y);
                ctx.rotate(p.r * Math.PI / 180);
                ctx.fillStyle = p.c;
                if (p.s > 7) {
                    ctx.beginPath();
                    ctx.moveTo(0, -p.s/2);
                    ctx.lineTo(p.s/2, 0);
                    ctx.lineTo(0, p.s/2);
                    ctx.lineTo(-p.s/2, 0);
                    ctx.closePath();
                    ctx.fill();
                } else {
                    ctx.fillRect(-p.s/2, -p.s/2, p.s, p.s * 0.6);
                }
                ctx.restore();
            });
            frame = requestAnimationFrame(draw);
        }
        draw();

        setTimeout(() => {
            cancelAnimationFrame(frame);
            wrap.remove();
        }, 5000);
    }

    /* ===== 创建控制面板 ===== */
    function createControlPanel() {
        const root = document.createElement('div');
        root.id = 'ae-root';
        root.innerHTML = `
            <div id="ae-ball">
                <svg id="ae-ball-ring" viewBox="0 0 66 66">
                    <circle id="ae-ball-ring-bg" cx="33" cy="33" r="31.5"/>
                    <circle id="ae-ball-ring-fill" cx="33" cy="33" r="31.5"/>
                </svg>
                <div id="ae-ball-inner">
                    <span id="ae-ball-icon">📋</span>
                    <span id="ae-ball-text">0/0</span>
                </div>
            </div>

            <div id="ae-panel" class="ae-hidden">
                <div id="ae-header">
                    <div id="ae-header-left">
                        <span id="ae-header-suptitle">Automated System</span>
                        <h1 id="ae-header-title">评教控制台</h1>
                    </div>
                    <div id="ae-header-actions">
                        <button class="ae-header-btn" id="ae-btn-minimize" title="最小化">
                            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 12H4"/></svg>
                        </button>
                        <button class="ae-header-btn" id="ae-btn-settings" title="设置">
                            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                        </button>
                    </div>
                </div>

                <div id="ae-status-card">
                    <div id="ae-status-card-top">
                        <span id="ae-status-label">总体进度</span>
                        <div id="ae-status-percent">0<span>%</span></div>
                    </div>
                    <div id="ae-progress-track">
                        <div id="ae-progress-fill" style="width:0%"></div>
                    </div>
                    <div id="ae-status-current">
                        <span id="ae-status-dot" class="idle"></span>
                        <span id="ae-status-msg">就绪</span>
                    </div>
                </div>

                <div id="ae-body">
                    <div class="ae-body-section">
                        <div class="ae-row">
                            <div class="ae-row-left">
                                <span class="ae-row-label">自动提交</span>
                                <span class="ae-row-hint">完成后自动跳转下一位</span>
                            </div>
                            <label class="ae-toggle">
                                <input type="checkbox" id="ae-toggle-auto" ${autoSubmit ? 'checked' : ''}>
                                <span class="ae-toggle-track"></span>
                            </label>
                        </div>
                    </div>

                    <div class="ae-body-section">
                        <div class="ae-btn-row">
                            <button class="ae-btn ae-btn-primary" id="ae-btn-start">
                                <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/><path stroke-linecap="round" stroke-linejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                                开始评教
                            </button>
                            <button class="ae-btn ae-btn-secondary" id="ae-btn-stop" disabled>
                                <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                                停止
                            </button>
                        </div>
                    </div>

                    <div class="ae-body-section" id="ae-countdown">
                        <span id="ae-countdown-text">提交倒计时: 3秒</span>
                        <button id="ae-countdown-cancel">取消</button>
                    </div>
                </div>

                <div class="ae-promo">
                    <button class="ae-promo-btn" id="ae-promo-trigger">✨ 云端评教平台已上线 →</button>
                </div>

                <div id="ae-footer">
                    <div id="ae-footer-top">
                        <span id="ae-footer-label">系统日志</span>
                        <button id="ae-footer-detail">查看详情</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(root);

        /* ===== 事件绑定 ===== */
        const ball = document.getElementById('ae-ball');
        const panel = document.getElementById('ae-panel');
        const toggle = document.getElementById('ae-toggle-auto');
        const btnStart = document.getElementById('ae-btn-start');
        const btnStop = document.getElementById('ae-btn-stop');

        function showPanel() {
            panel.classList.remove('ae-hidden');
            ball.style.display = 'none';
            isMinimized = false;
        }
        function hidePanel() {
            panel.classList.add('ae-hidden');
            ball.style.display = 'block';
            isMinimized = true;
        }

        ball.addEventListener('click', showPanel);
        document.getElementById('ae-btn-minimize').addEventListener('click', hidePanel);

        document.getElementById('ae-btn-settings').addEventListener('click', function() {
            settingsClickCount++;
            if (settingsClickCount === 1) {
                settingsClickTimer = setTimeout(() => {
                    settingsClickCount = 0;
                    openSettingsPopup();
                }, 300);
            } else if (settingsClickCount === 2) {
                clearTimeout(settingsClickTimer);
                settingsClickCount = 0;
                openTestBackdoor();
            }
        });

        document.getElementById('ae-footer-detail').addEventListener('click', openLogPopup);

        document.getElementById('ae-promo-trigger').addEventListener('click', function() {
            window.open('http://b.xxiaomai.cn', '_blank');
        });

        toggle.addEventListener('change', function() {
            if (isProcessing) {
                this.checked = !this.checked;
                showToast('评教运行中，请先停止');
                return;
            }
            autoSubmit = this.checked;
            GM_setValue('autoSubmit', autoSubmit);
            appendLog(autoSubmit ? '自动提交已开启' : '自动提交已关闭');
            updateUIStatus();
        });

        btnStart.addEventListener('click', startEvaluation);
        btnStop.addEventListener('click', stopEvaluation);

        makeDraggable(panel);
    }

    /* ===== 拖拽 ===== */
    function makeDraggable(el) {
        const header = document.getElementById('ae-header');
        let isDragging = false;
        let startX, startY, origX = 0, origY = 0;

        function getTransform() {
            const m = el.style.transform;
            if (!m || m === 'none') return { x: 0, y: 0 };
            const match = m.match(/translate\(([-\d.]+)px,\s*([-\d.]+)px\)/);
            return match ? { x: parseFloat(match[1]), y: parseFloat(match[2]) } : { x: 0, y: 0 };
        }

        header.addEventListener('mousedown', e => {
            if (e.target.closest('.ae-header-btn')) return;
            const t = getTransform();
            origX = t.x; origY = t.y;
            startX = e.clientX;
            startY = e.clientY;
            isDragging = true;
            el.classList.add('ae-dragging');
        });

        document.addEventListener('mousemove', e => {
            if (!isDragging) return;
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            el.style.transform = `translate(${origX + dx}px, ${origY + dy}px)`;
        });

        document.addEventListener('mouseup', () => {
            if (isDragging) el.classList.remove('ae-dragging');
            isDragging = false;
        });
    }

    /* ===== 日志 & UI ===== */
    function appendLog(msg) {
        console.log(`[评教] ${msg}`);
    }

    function updateUIStatus(msg) {
        const dot = document.getElementById('ae-status-dot');
        const label = document.getElementById('ae-status-msg');
        if (!dot || !label) return;
        if (msg) {
            label.textContent = msg;
            if (msg.includes('完成') || msg.includes('就绪')) {
                dot.className = 'idle';
            } else if (msg.includes('错误') || msg.includes('失败') || msg.includes('⚠️')) {
                dot.className = 'error';
            } else {
                dot.className = 'working';
            }
        }
        updateProgress();
    }

    function updateProgress() {
        const fill = document.getElementById('ae-progress-fill');
        const pct = document.getElementById('ae-status-percent');
        const ballText = document.getElementById('ae-ball-text');
        const ringFill = document.getElementById('ae-ball-ring-fill');

        const percent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

        if (fill) fill.style.width = `${percent}%`;
        if (pct) pct.innerHTML = `${percent}<span>%</span>`;
        if (ballText) ballText.textContent = `${completedCount}/${totalCount}`;

        if (ringFill) {
            const circ = 197.92;
            ringFill.style.strokeDashoffset = circ - (percent / 100) * circ;
        }
    }

    /* ===== 设置弹窗 ===== */
    // 题目选项名称映射（用于设置界面显示）
    const OPTION_NAMES = {
        0: '第1个（最高分）',
        1: '第2个',
        2: '第3个',
        3: '第4个',
        4: '第5个（最低分）'
    };

    // 已知题目的中文名称（用于设置界面显示）
    const QUESTION_CN_NAMES = {
        'sy1': '总体教学表现',
        'sy2': '课前备课充分',
        'sy3': '内容充实，操作过程明确',
        'sy4': '普通话表达清楚',
        'sy5': '实践教学过程设计合理',
        'sy6': '上课巡回指导',
        'sy7': '引导学生运用知识',
        'sy8': '及时批改实践报告',
        'sy9': '课程考核评价方式',
        'sy10': '学习收获大',
        'js19': '思想政治素质高',
        'sy12': '实践教学设备完好',
        'sy13': '批改作业次数',
        'sy14': '每周课外学习时间',
        'SY15.1': '网络教学平台资源',
        'sy16': '需要非常努力',
        'js1': '总体教学表现（讲授）',
        'js2': '课前备课充分（讲授）',
        'js3': '内容充实（讲授）',
        'js4': '普通话表达清楚（讲授）',
        'js5': '教学过程设计合理（讲授）',
        'js6': '善于引导学生思考（讲授）',
        'js7': '课后作业批改（讲授）',
        'js8': '课程考核评价方式（讲授）',
        'js9': '学习收获大（讲授）',
        'js10': '教师思想政治素质（讲授）',
        'ty1': '总体教学表现（体育）',
        'ty2': '课前备课充分（体育）',
        'ty3': '教学内容充实（体育）',
        'ty4': '普通话表达清楚（体育）',
        'ty5': '教学过程设计合理（体育）',
        'ty6': '善于引导学生（体育）',
        'ty7': '课后作业批改（体育）',
        'ty8': '课程考核评价方式（体育）',
        'ty9': '学习收获大（体育）',
        'ty10': '教师思想政治素质（体育）',
    };

    function openSettingsPopup() {
        const existing = document.getElementById('ae-overlay');
        if (existing) existing.remove();

        // 获取当前页面的题目信息（如果在评教页面）
        let questionsInfo = [];
        if (typeof QUESTIONS !== 'undefined' && QUESTIONS.models) {
            questionsInfo = QUESTIONS.models.filter(q => {
                const d = q.attributes || q;
                return d.type === 'question' && d.objective === true;
            }).map(q => {
                const d = q.attributes || q;
                return { engName: d.engName, name: d.name, options: d.options || [] };
            });
        }

        // 生成题目配置行
        let questionConfigHTML = '';
        if (questionsInfo.length > 0) {
            questionsInfo.forEach(q => {
                const currentIdx = questionSelectors[q.engName] !== undefined ? questionSelectors[q.engName] : 0;
                const cnName = QUESTION_CN_NAMES[q.engName] || q.name;
                const displayName = cnName.length > 18 ? cnName.substring(0, 18) + '...' : cnName;

                let optionsHTML = '';
                q.options.forEach((opt, i) => {
                    optionsHTML += `<option value="${i}" ${i === currentIdx ? 'selected' : ''}>${opt.name}</option>`;
                });

                questionConfigHTML += `
                    <div class="ae-qconf-row" data-eng="${q.engName}">
                        <span class="ae-qconf-name" title="${q.name}">${displayName}</span>
                        <select class="ae-qconf-select" data-eng="${q.engName}">
                            ${optionsHTML}
                        </select>
                    </div>
                `;
            });
        } else {
            questionConfigHTML = '<div style="font-size:12px;color:#8E8E93;text-align:center;padding:16px 0;">请先进入评教页面以加载题目配置</div>';
        }

        const overlay = document.createElement('div');
        overlay.id = 'ae-overlay';
        overlay.className = 'ae-show';
        overlay.innerHTML = `
            <div id="ae-modal" style="max-height:90vh">
                <div id="ae-modal-header">
                    <span id="ae-modal-title">评教设置</span>
                    <button id="ae-modal-close">✕</button>
                </div>
                <div id="ae-modal-body" style="max-height:calc(90vh - 140px)">
                    <div class="ae-field-group">
                        <label class="ae-field-label">📝 题目选项配置</label>
                        <div class="ae-qconf-container" id="ae-qconf-list">
                            ${questionConfigHTML}
                        </div>
                    </div>
                    <div class="ae-field-group">
                        <label class="ae-field-label">意见或建议（主观题文本）</label>
                        <textarea class="ae-field-textarea" id="ae-f-q14" rows="2" placeholder="填写主观题文本（如无则填"无"）">${q14Text}</textarea>
                    </div>
                    <div class="ae-field-group">
                        <label class="ae-field-label" id="ae-speed-label">评教速度（${countdownTime}秒）</label>
                        <div class="ae-slider-row">
                            <input type="range" id="ae-f-speed" min="1" max="10" value="${countdownTime}">
                            <span class="ae-slider-value" id="ae-speed-val">${countdownTime}</span>
                        </div>
                        <div class="ae-slider-labels"><span>1秒</span><span>10秒</span></div>
                    </div>
                    <div class="ae-field-group">
                        <div class="ae-switch-field">
                            <span class="ae-switch-field-label">快速模式（跳过倒计时）</span>
                            <label class="ae-toggle">
                                <input type="checkbox" id="ae-f-fast" ${fastMode ? 'checked' : ''}>
                                <span class="ae-toggle-track"></span>
                            </label>
                        </div>
                    </div>
                </div>
                <div id="ae-modal-footer">
                    <button class="ae-btn ae-btn-danger" id="ae-f-reset">恢复默认</button>
                    <button class="ae-btn ae-btn-primary" id="ae-f-save" style="background:${COLORS.blue};color:#fff">保存设置</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        const close = () => { overlay.remove(); };
        overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
        document.getElementById('ae-modal-close').addEventListener('click', close);

        const speedInput = document.getElementById('ae-f-speed');
        const speedVal = document.getElementById('ae-speed-val');
        const speedLabel = document.getElementById('ae-speed-label');
        speedInput.addEventListener('input', function() {
            speedVal.textContent = this.value;
            speedLabel.textContent = `评教速度（${this.value}秒）`;
        });

        document.getElementById('ae-f-save').addEventListener('click', function() {
            q14Text = document.getElementById('ae-f-q14').value.trim();
            countdownTime = parseInt(document.getElementById('ae-f-speed').value);
            fastMode = document.getElementById('ae-f-fast').checked;

            // 收集题目选项配置
            const newSelectors = {};
            document.querySelectorAll('.ae-qconf-select').forEach(sel => {
                const eng = sel.getAttribute('data-eng');
                const idx = parseInt(sel.value);
                if (eng && idx >= 0) {
                    newSelectors[eng] = idx;
                }
            });
            questionSelectors = newSelectors;

            GM_setValue('q14Text', q14Text);
            GM_setValue('countdownTime', countdownTime);
            GM_setValue('fastMode', fastMode);
            GM_setValue('questionSelectors', questionSelectors);

            showToast('设置已保存');
            appendLog('设置已更新');
            close();
            setTimeout(() => updateUIStatus('就绪'), 2000);
        });

        document.getElementById('ae-f-reset').addEventListener('click', function() {
            q14Text = '无';
            countdownTime = 3;
            fastMode = false;
            questionSelectors = {
                'sy13': 2,
                'sy14': 1,
                'sy16': 2,
            };

            document.getElementById('ae-f-q14').value = q14Text;
            document.getElementById('ae-f-speed').value = countdownTime;
            document.getElementById('ae-f-fast').checked = false;
            speedVal.textContent = countdownTime;
            speedLabel.textContent = `评教速度（${countdownTime}秒）`;

            // 重置题目下拉框
            document.querySelectorAll('.ae-qconf-select').forEach(sel => {
                const eng = sel.getAttribute('data-eng');
                sel.value = questionSelectors[eng] !== undefined ? questionSelectors[eng] : 0;
            });

            GM_setValue('q14Text', q14Text);
            GM_setValue('countdownTime', countdownTime);
            GM_setValue('fastMode', fastMode);
            GM_setValue('questionSelectors', questionSelectors);

            showToast('已恢复默认设置');
        });
    }

    /* ===== 测试后门（双击设置按钮进入） ===== */
    function openTestBackdoor() {
        const overlay = document.createElement('div');
        overlay.id = 'ae-overlay';
        overlay.className = 'ae-show';
        overlay.innerHTML = `
            <div id="ae-modal" style="max-width:360px">
                <div id="ae-modal-header">
                    <span id="ae-modal-title">🔧 测试后门</span>
                    <button id="ae-modal-close">✕</button>
                </div>
                <div id="ae-modal-body">
                    <p style="font-size:12px;color:#8E8E93;margin-bottom:16px;line-height:1.6">开发者调试工具 — 双击设置按钮进入</p>
                    <button class="ae-from-btn" style="background:${COLORS.blueLight};color:${COLORS.blue}" id="ae-test-notify">🔔 测试通知</button>
                    <button class="ae-from-btn" style="background:${COLORS.blueLight};color:${COLORS.blue}" id="ae-test-celeb">🎉 测试庆祝特效</button>
                    <button class="ae-from-btn" style="background:rgba(255,59,48,0.08);color:${COLORS.red}" id="ae-test-log">📋 查看错误日志</button>
                    <button class="ae-from-btn" style="background:rgba(52,199,89,0.08);color:${COLORS.green}" id="ae-test-inspect">🔍 检查页面结构</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
        overlay.querySelector('#ae-modal-close').addEventListener('click', () => overlay.remove());

        overlay.querySelector('#ae-test-notify').addEventListener('click', () => {
            showToast('通知功能正常工作 ✓');
            GM_notification({ title: '测试通知', text: '通知功能正常工作！', timeout: 3000 });
        });
        overlay.querySelector('#ae-test-celeb').addEventListener('click', () => {
            overlay.remove();
            showCelebration();
        });
        overlay.querySelector('#ae-test-log').addEventListener('click', () => {
            overlay.remove();
            openLogPopup();
        });
        overlay.querySelector('#ae-test-inspect').addEventListener('click', () => {
            overlay.remove();
            inspectPageStructure();
        });
    }

    /* ===== 页面结构检测工具 ===== */
    function inspectPageStructure() {
        const info = [];
        info.push(`URL: ${window.location.href}`);
        info.push(`isListPage: ${isListPage()}`);
        info.push(`isEvaluationPage: ${isEvaluationPage()}`);

        if (isListPage()) {
            const table = document.getElementById('grid8124814181');
            const evalLinks = document.querySelectorAll('a[href*="stdEvaluate!answer"]');
            info.push(`评教表格: ${table ? '✓' : '✗'}`);
            info.push(`评教链接数: ${evalLinks.length}`);
        }

        if (isEvaluationPage()) {
            const questionList = document.getElementById('question-list');
            const radioGroups = getAllRadioGroups();
            const textarea = findTextarea();
            const submitBtn = document.getElementById('sub');
            info.push(`question-list: ${questionList ? '✓' : '✗'}`);
            info.push(`question-list 子元素: ${questionList ? questionList.children.length : 0}`);
            info.push(`单选题组数: ${radioGroups.length}`);
            info.push(`文本域: ${textarea ? '✓' : '✗'}`);
            info.push(`提交按钮: ${submitBtn ? '✓' : '✗'}`);

            if (radioGroups.length > 0) {
                const firstGroup = radioGroups[0];
                info.push(`第一组选项数: ${firstGroup.options.length}`);
                info.push(`第一组name: ${firstGroup.options[0].name}`);
                info.push(`第一组父元素: ${firstGroup.container.tagName}.${firstGroup.container.className}`);
            }

            if (typeof Backbone !== 'undefined') info.push('Backbone: ✓');
            if (typeof QUESTIONS !== 'undefined') info.push(`QUESTIONS 题目数: ${QUESTIONS.length}`);
        }

        alert('页面结构检测:\n\n' + info.join('\n'));
        appendLog('页面结构检测完成');
    }

    /* ===== 日志弹窗 ===== */
    function openLogPopup() {
        const overlay = document.createElement('div');
        overlay.id = 'ae-overlay';
        overlay.className = 'ae-show';
        overlay.innerHTML = `
            <div id="ae-modal" style="max-width:400px">
                <div id="ae-modal-header">
                    <span id="ae-modal-title">错误日志</span>
                    <button id="ae-modal-close">✕</button>
                </div>
                <div id="ae-modal-body">
                    <div class="ae-log-content" id="ae-log-list">
                        ${errorLogs.length === 0 ? '<div class="ae-log-empty">暂无错误日志</div>' : ''}
                    </div>
                </div>
                <div id="ae-modal-footer">
                    <button class="ae-btn ae-btn-danger" id="ae-log-clear">清空日志</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        const list = document.getElementById('ae-log-list');
        errorLogs.forEach(log => {
            const item = document.createElement('div');
            item.className = 'ae-log-item';
            item.innerHTML = `<div class="ae-log-time">${log.time}</div><div class="ae-log-msg">${log.message}</div><div class="ae-log-url">${log.url}</div>`;
            list.appendChild(item);
        });

        overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
        overlay.querySelector('#ae-modal-close').addEventListener('click', () => overlay.remove());
        overlay.querySelector('#ae-log-clear').addEventListener('click', function() {
            errorLogs = [];
            GM_setValue('errorLogs', errorLogs);
            document.getElementById('ae-log-list').innerHTML = '<div class="ae-log-empty">暂无错误日志</div>';
            showToast('日志已清空');
        });
    }

    /* ================================================================
       CUIT 正方教务系统适配 — 核心评教逻辑
       ================================================================ */

    /* --- 页面检测 --- */
    function isEvaluationPage() {
        // CUIT 评教表单页: URL 包含 stdEvaluate!answer
        // 不再强制检查 #app-main，因为 Backbone 可能还没渲染
        return window.location.href.indexOf('stdEvaluate!answer') !== -1;
    }

    function isListPage() {
        // CUIT 评教列表页: URL 包含 stdEvaluate.action（不含 !answer）
        // 只要 URL 匹配就认为是列表页，不强制要求特定 DOM 元素
        return window.location.href.indexOf('stdEvaluate.action') !== -1
            && window.location.href.indexOf('stdEvaluate!answer') === -1;
    }

    /* --- 列表页操作 --- */
    function getPendingTeacherCount() {
        return document.querySelectorAll('a[href*="stdEvaluate!answer.action"]').length;
    }

    function clickNextTeacher() {
        const evalLink = document.querySelector('a[href*="stdEvaluate!answer.action"]');
        if (evalLink) {
            evalLink.click();
            return true;
        }
        return false;
    }

    /* --- 评教表单操作 --- */

    // 获取所有单选题组：遍历 question-list 内的 radio，按 name 分组
    function getAllRadioGroups() {
        const questionList = document.getElementById('question-list');
        if (!questionList) return [];

        const radios = questionList.querySelectorAll('input[type="radio"]');
        const groups = {};

        radios.forEach(radio => {
            if (!groups[radio.name]) {
                groups[radio.name] = [];
            }
            groups[radio.name].push(radio);
        });

        return Object.keys(groups).map(name => {
            const options = groups[name];
            // 向上找到包含整组选项的容器
            let container = options[0].parentElement;
            while (container && container.id !== 'question-list') {
                const radiosInContainer = container.querySelectorAll('input[type="radio"]');
                if (radiosInContainer.length === options.length) break;
                container = container.parentElement;
            }
            return { name, options, container: container || options[0].parentElement };
        });
    }

    // 获取所有文本域
    function getTextareas() {
        const questionList = document.getElementById('question-list');
        if (!questionList) return [];
        return Array.from(questionList.querySelectorAll('textarea'));
    }

    // 获取最后一个文本域（通常对应"意见或建议"）
    function findTextarea() {
        const textareas = getTextareas();
        return textareas.length > 0 ? textareas[textareas.length - 1] : null;
    }

    // 等待 Backbone 渲染完成
    function waitForQuestionsRender(timeout) {
        timeout = timeout || 10000;
        return new Promise((resolve) => {
            const questionList = document.getElementById('question-list');
            if (!questionList) { resolve(false); return; }

            // 已渲染？
            if (questionList.querySelector('input[type="radio"]') || questionList.querySelector('textarea')) {
                resolve(true);
                return;
            }

            // 等待 DOM 变化
            const startTime = Date.now();
            const observer = new MutationObserver(() => {
                if (questionList.querySelector('input[type="radio"]') || questionList.querySelector('textarea')) {
                    observer.disconnect();
                    resolve(true);
                } else if (Date.now() - startTime > timeout) {
                    observer.disconnect();
                    resolve(false);
                }
            });
            observer.observe(questionList, { childList: true, subtree: true });

            setTimeout(() => {
                observer.disconnect();
                resolve(questionList.querySelector('input[type="radio"]') !== null || questionList.querySelector('textarea') !== null);
            }, timeout);
        });
    }

    function fillEvaluationForm() {
        appendLog('正在填写评教表单...');

        const radioGroups = getAllRadioGroups();
        const textarea = findTextarea();

        appendLog(`检测到 ${radioGroups.length} 道单选题，${getTextareas().length} 道主观题`);

        // 尝试从页面的 QUESTIONS 全局变量获取题目元数据（engName）
        let questionsMeta = null;
        if (typeof QUESTIONS !== 'undefined' && QUESTIONS.models) {
            questionsMeta = QUESTIONS.models.filter(q => {
                const data = q.attributes || q;
                return data.type === 'question' && data.objective === true;
            });
        }

        // 填写所有单选题
        let filledRadios = 0;
        radioGroups.forEach((group, index) => {
            if (group.options.length === 0) return;

            // 默认选第一个（最高分）
            let selectedIndex = 0;

            // 尝试匹配自定义配置
            if (questionsMeta && index < questionsMeta.length) {
                const qData = questionsMeta[index].attributes || questionsMeta[index];
                const engName = qData.engName;
                if (engName && questionSelectors.hasOwnProperty(engName)) {
                    const customIdx = questionSelectors[engName];
                    if (customIdx >= 0 && customIdx < group.options.length) {
                        selectedIndex = customIdx;
                        appendLog(`题目 "${engName}" 使用自定义选项 ${selectedIndex}`);
                    }
                }
            }

            const targetOption = group.options[selectedIndex];
            targetOption.checked = true;
            targetOption.dispatchEvent(new Event('change', { bubbles: true }));
            targetOption.dispatchEvent(new Event('click', { bubbles: true }));
            // jQuery 事件（Backbone 可能用 jQuery 绑定）
            if (typeof jQuery !== 'undefined') {
                jQuery(targetOption).trigger('change').trigger('click');
            }
            filledRadios++;
        });

        // 填写文本域（主观题）
        if (textarea) {
            textarea.value = q14Text;
            textarea.dispatchEvent(new Event('input', { bubbles: true }));
            textarea.dispatchEvent(new Event('change', { bubbles: true }));
            if (typeof jQuery !== 'undefined') {
                jQuery(textarea).trigger('input').trigger('change');
            }
            appendLog(`已填写主观题: "${q14Text}"`);
        }

        appendLog(`表单填写完成: ${filledRadios} 道单选题已选择`);
        return true;
    }

    function submitEvaluation() {
        const submitBtn = document.getElementById('sub');
        if (submitBtn) {
            submitBtn.click();
            return true;
        }
        return false;
    }

    // 检测页面是否正在跳转（表单提交后跨域跳转）
    function isPageNavigating() {
        return document.querySelector('form[action*="finishAnswer"]') !== null
            && window.location.href.indexOf('stdEvaluate!answer') !== -1;
    }

    function returnToList() {
        window.history.back();
        return true;
    }

    /* --- 错误日志 --- */
    function logError(message) {
        const errorLog = {
            time: new Date().toLocaleString(),
            message: message,
            url: window.location.href
        };
        errorLogs.push(errorLog);
        GM_setValue('errorLogs', errorLogs);
        GM_notification({ title: '评教错误', text: message, timeout: 5000 });
    }

    /* ================================================================
       主流程控制
       ================================================================ */

    async function startEvaluation() {
        if (isProcessing) return;

        if (!isListPage()) {
            appendLog('⚠️ 请先前往待评教老师列表页面');
            updateUIStatus('⚠️ 请前往列表页面');
            showToast('请先前往待评教列表页面');
            return;
        }

        shouldStop = false;
        isProcessing = true;
        GM_setValue('isProcessing', true);
        completedCount = 0;
        totalCount = 0;
        GM_setValue('completedCount', 0);
        document.getElementById('ae-btn-start').disabled = true;
        document.getElementById('ae-btn-stop').disabled = false;

        try {
            if (isEvaluationPage()) {
                await processEvaluationPage();
            } else if (isListPage()) {
                await processListPage();
            } else {
                appendLog('当前页面不是评教页面或列表页面');
                stopEvaluation();
            }
        } catch (error) {
            appendLog(`错误: ${error.message}`);
            stopEvaluation();
        }
    }

    async function processEvaluationPage() {
        if (shouldStop) return;

        appendLog('正在处理评教页面...');

        try {
            // 等待 Backbone 渲染完成
            const rendered = await waitForQuestionsRender(10000);
            if (!rendered) {
                appendLog('⚠️ 等待题目渲染超时，尝试继续...');
            }

            fillEvaluationForm();

            if (autoSubmit) {
                await startCountdownAndSubmit();
            } else {
                updateUIStatus('表单已填写，请手动提交');
            }
        } catch (error) {
            logError(`评教页面处理失败: ${error.message}`);
            stopEvaluation();
        }
    }

    async function processListPage() {
        if (shouldStop) return;

        const count = getPendingTeacherCount();

        if (totalCount === 0) {
            totalCount = count;
            updateProgress();
        }

        if (count === 0) {
            appendLog('所有评教已完成！');
            updateUIStatus('评教完成 🎉');
            showCelebration();
            GM_notification({ title: '评教完成', text: '所有老师评教已完成', timeout: 5000 });
            stopEvaluation();
            return;
        }

        appendLog(`发现 ${count} 位待评教老师，正在进入第一位...`);

        try {
            await sleep(1000);
            if (shouldStop) return;

            if (clickNextTeacher()) {
                // CUIT 使用 bg.Go() 可能 AJAX 加载内容，需要等待
                await sleep(3000);
                if (shouldStop) return;

                if (isEvaluationPage()) {
                    await processEvaluationPage();
                } else {
                    appendLog('等待评教页面加载...');
                    await sleep(3000);
                    if (isEvaluationPage()) {
                        await processEvaluationPage();
                    } else {
                        logError('无法进入评教页面，请检查页面是否正确加载');
                        stopEvaluation();
                    }
                }
            } else {
                appendLog('所有评教已完成！');
                updateUIStatus('评教完成 🎉');
                showCelebration();
                GM_notification({ title: '评教完成', text: '所有老师评教已完成', timeout: 5000 });
                stopEvaluation();
            }
        } catch (error) {
            logError(`列表页面处理失败: ${error.message}`);
            stopEvaluation();
        }
    }

    /* ===== 提交流程 ===== */
    async function startCountdownAndSubmit() {
        if (fastMode) {
            appendLog('快速模式：直接提交...');
            submitWithConfirm();
            return;
        }

        return new Promise((resolve) => {
            const countdownRow = document.getElementById('ae-countdown');
            const countdownText = document.getElementById('ae-countdown-text');
            const cancelBtn = document.getElementById('ae-countdown-cancel');
            let seconds = countdownTime;
            shouldStop = false;

            countdownRow.style.display = 'flex';
            countdownText.textContent = `提交倒计时: ${seconds}秒`;

            countdownInterval = setInterval(() => {
                seconds--;
                countdownText.textContent = `提交倒计时: ${seconds}秒`;

                if (shouldStop) {
                    clearInterval(countdownInterval);
                    countdownRow.style.display = 'none';
                    appendLog('已取消提交');
                    stopEvaluation();
                    resolve();
                    return;
                }

                if (seconds <= 0) {
                    clearInterval(countdownInterval);
                    countdownRow.style.display = 'none';
                    submitWithConfirm();
                    resolve();
                }
            }, 1000);

            cancelBtn.onclick = function() { shouldStop = true; };
        });
    }

    async function submitWithConfirm() {
        appendLog('正在提交评教...');

        if (submitEvaluation()) {
            updateUIStatus('等待提交完成...');
            await waitForSubmitComplete();
        } else {
            logError('提交失败，无法找到提交按钮');
            appendLog('提交失败，请手动提交');
        }
    }

    // CUIT 提交后页面会跳转回列表页（可能跨域 jwgl → jwc）
    async function waitForSubmitComplete() {
        return new Promise((resolve) => {
            let resolved = false;

            // 监听页面卸载（表单提交导致的跳转）
            function onBeforeUnload() {
                if (!resolved) {
                    resolved = true;
                    completedCount++;
                    // 持久化进度，供跳转后的新页面恢复
                    GM_setValue('completedCount', completedCount);
                    GM_setValue('totalCount', totalCount);
                    appendLog(`提交成功 (${completedCount}/${totalCount})，页面正在跳转...`);
                }
            }
            window.addEventListener('beforeunload', onBeforeUnload);

            let attempts = 0;
            const maxAttempts = 60;

            const checkInterval = setInterval(() => {
                if (resolved || shouldStop) {
                    clearInterval(checkInterval);
                    window.removeEventListener('beforeunload', onBeforeUnload);
                    resolve();
                    return;
                }

                attempts++;

                // 同域情况下，检测是否已回到列表页
                if (isListPage()) {
                    clearInterval(checkInterval);
                    window.removeEventListener('beforeunload', onBeforeUnload);
                    resolved = true;
                    appendLog('提交成功，已返回列表页');
                    completedCount++;
                    updateProgress();

                    const timer = setTimeout(() => {
                        if (!shouldStop) processListPage();
                    }, 1500);
                    allTimers.push(timer);
                    resolve();
                    return;
                }

                if (attempts >= maxAttempts) {
                    clearInterval(checkInterval);
                    window.removeEventListener('beforeunload', onBeforeUnload);
                    resolved = true;
                    logError('等待提交完成超时，请检查是否已提交成功');
                    stopEvaluation();
                    resolve();
                }
            }, 500);
            allTimers.push(checkInterval);
        });
    }

    /* ===== 停止 ===== */
    function stopEvaluation() {
        isProcessing = false;
        shouldStop = true;
        GM_setValue('isProcessing', false);
        GM_setValue('completedCount', 0);
        GM_setValue('totalCount', 0);

        clearInterval(countdownInterval);
        countdownInterval = null;

        allTimers.forEach(timer => {
            clearTimeout(timer);
            clearInterval(timer);
        });
        allTimers = [];

        const countdownRow = document.getElementById('ae-countdown');
        if (countdownRow) countdownRow.style.display = 'none';

        const btnStart = document.getElementById('ae-btn-start');
        const btnStop = document.getElementById('ae-btn-stop');
        if (btnStart) btnStart.disabled = false;
        if (btnStop) btnStop.disabled = true;

        appendLog('已停止');
        updateUIStatus('已停止');
    }

    function sleep(ms) {
        return new Promise(resolve => {
            const timer = setTimeout(() => {
                allTimers = allTimers.filter(t => t !== timer);
                if (!shouldStop) resolve();
            }, ms);
            allTimers.push(timer);
        });
    }

    /* ===== 初始化 ===== */
    function init() {
        console.log('[评教脚本] v1.2 初始化中...', window.location.href);

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', function() {
                console.log('[评教脚本] DOM 已加载，创建控制面板');
                createControlPanel();
            });
        } else {
            createControlPanel();
        }

        // 恢复跨域跳转前的进度
        const savedCompleted = GM_getValue('completedCount', 0);
        const savedTotal = GM_getValue('totalCount', 0);
        if (savedCompleted > 0) {
            completedCount = savedCompleted;
        }

        if (isEvaluationPage()) {
            appendLog('检测到评教页面');
            totalCount = savedTotal || 1;
            updateProgress();
            waitForQuestionsRender(10000).then(rendered => {
                if (rendered) {
                    appendLog('题目已渲染');
                    updateUIStatus('评教表单已就绪');
                    // 如果是从列表页跳转过来的（isProcessing 为 true），自动开始处理
                    if (isProcessing) {
                        appendLog('自动继续评教流程...');
                        processEvaluationPage();
                    }
                } else {
                    appendLog('⚠️ 未检测到题目，请刷新页面');
                    updateUIStatus('⚠️ 未检测到题目');
                }
            });
        } else if (isListPage()) {
            const count = getPendingTeacherCount();
            totalCount = (savedCompleted > 0 ? savedCompleted : 0) + count;
            updateProgress();
            appendLog(`检测到 ${count} 位待评教老师`);
            if (count > 0) {
                updateUIStatus(`待评教: ${count} 位`);
                // 如果是从评教页提交后跳转回来的，自动继续
                if (isProcessing && savedCompleted > 0) {
                    appendLog(`已完成 ${savedCompleted} 位，继续下一位...`);
                    setTimeout(() => processListPage(), 1500);
                }
            } else {
                updateUIStatus('所有评教已完成 ✓');
                appendLog('所有评教已完成！');
                showCelebration();
                GM_notification({ title: '评教完成', text: '所有老师评教已完成', timeout: 5000 });
                GM_setValue('completedCount', 0);
                GM_setValue('totalCount', 0);
                GM_setValue('isProcessing', false);
            }
        } else {
            appendLog('⚠️ 请前往待评教列表页面');
            updateUIStatus('⚠️ 请前往列表页面');
        }
    }

    init();
})();
