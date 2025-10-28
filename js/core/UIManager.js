export class UIManager {
    constructor(elements) {
        this.elements = elements;
        this.currentView = 'front';
    }

    showScreen(screenName) {
        this.elements.titleScreen.classList.add('hidden');
        this.elements.gameContainer.classList.add('hidden');

        if (screenName === 'title') {
            this.elements.titleScreen.classList.remove('hidden');
        } else if (screenName === 'game') {
            this.elements.gameContainer.classList.remove('hidden');
        }
    }

    changeView(direction) {
        const viewOrder = ['left', 'front', 'right'];
        const currentIndex = viewOrder.indexOf(this.currentView);
        let nextIndex;

        if (direction === 'left') {
            nextIndex = (currentIndex - 1 + viewOrder.length) % viewOrder.length;
        } else if (direction === 'right') {
            nextIndex = (currentIndex + 1) % viewOrder.length;
        } else {
            return;
        }

        const nextView = viewOrder[nextIndex];

        this.elements.views[this.currentView].classList.add('hidden');
        this.elements.views[nextView].classList.remove('hidden');

        this.currentView = nextView;
        this.updateStatus(`部屋を回転し、${this.currentView}画面を見ました。`);
    }

    updateTitleScreen(hasSaveData) {
        if (hasSaveData) {
            this.elements.continueButton.disabled = false;
            this.elements.continueButton.classList.remove('opacity-50', 'cursor-not-allowed', 'bg-gray-500');
            this.elements.continueButton.classList.add('bg-blue-600', 'hover:bg-blue-700');
            this.elements.continueButton.textContent = '続きからプレイ';
        } else {
            this.elements.continueButton.disabled = true;
            this.elements.continueButton.classList.add('opacity-50', 'cursor-not-allowed', 'bg-gray-500');
            this.elements.continueButton.classList.remove('bg-blue-600', 'hover:bg-blue-700');
            this.elements.continueButton.textContent = '続きからプレイ (セーブデータなし)';
        }

        if (this.elements.gameContainer.classList.contains('hidden')) {
            this.showScreen('title');
        }
    }

    updateGameUI(isUnlocked) {
        // escapeDoor の見た目更新（テキストではなくアイコン表示）
        const btn = this.elements.escapeDoor;
        if (btn) {
            // 一旦クラスをリセット
            btn.classList.remove('cursor-not-allowed', 'bg-green-600', 'hover:bg-green-500', 'bg-red-700', 'opacity-50');
            btn.disabled = false;

            if (isUnlocked) {
                // 開錠済み: 緑色 + unlock アイコン
                btn.classList.add('bg-green-600', 'hover:bg-green-500');
                btn.innerHTML = '<i data-lucide="unlock" class="w-16 h-16 text-white"></i>';
            } else {
                // ロック中: 赤色 + 鍵アイコン（グレー）
                btn.classList.add('bg-red-700', 'opacity-50');
                btn.innerHTML = '<i data-lucide="key" class="w-16 h-16 text-gray-200"></i>';
            }

            // Lucide アイコンを再描画（存在する場合）
            try {
                if (window && window.lucide && typeof window.lucide.createIcons === 'function') {
                    window.lucide.createIcons();
                }
            } catch (_) { /* noop */ }
        }
    }

    startGame(message) {
         this.currentView = 'front';
         this.elements.views.front.classList.remove('hidden');
         this.elements.views.left.classList.add('hidden');
         this.elements.views.right.classList.add('hidden');
         this.showScreen('game');
         this.updateStatus(message);
    }

    updateStatus(message, isError = false) {
        const el = this.elements.statusMessage;
        el.textContent = message;
        el.classList.remove('hidden', 'bg-blue-500', 'bg-red-500');
        el.classList.add(isError ? 'bg-red-500' : 'bg-blue-500');

        setTimeout(() => {
            el.classList.add('hidden');
        }, 5000);
    }

    showEscapeMessage(title, text) {
        this.elements.modalOverlay.classList.remove('hidden');
        this.elements.modalTitle.textContent = title;
        this.elements.modalText.textContent = text;
    }

    hideEscapeMessage() {
        this.elements.modalOverlay.classList.add('hidden');
    }

    // --- Puzzle modal controls ---
    showPuzzle(contentHtml, options = {}) {
        // options: { onSolve: function(values)->bool|Promise<bool>, showSolveButton: bool, solveLabel: string }
        const overlay = document.getElementById('puzzle-modal-overlay');
        const content = document.getElementById('puzzle-modal-content');
        if (!overlay || !content) return;
        content.innerHTML = contentHtml;
        overlay.classList.remove('hidden');
        overlay.classList.add('puzzle-visible');

        // オーバーレイ外側クリックで閉じる
        if (this._overlayHandler) {
            overlay.removeEventListener('click', this._overlayHandler);
        }
        this._overlayHandler = (e) => { if (e.target === overlay) this.hidePuzzle(); };
        overlay.addEventListener('click', this._overlayHandler);

        // クローズボタンのバインド
        const closeBtn = document.getElementById('puzzle-modal-close-btn');
        if (closeBtn) {
            if (this._puzzleCloseHandler) closeBtn.removeEventListener('click', this._puzzleCloseHandler);
            this._puzzleCloseHandler = () => this.hidePuzzle();
            closeBtn.addEventListener('click', this._puzzleCloseHandler);
        }

        // Solve ボタンをオプションで追加する
        // 既に存在する solve ボタンがあれば削除してから追加
        const closeContainer = document.getElementById('puzzle-modal-close');
        if (this._puzzleSolveBtn && this._puzzleSolveBtn.parentNode) {
            this._puzzleSolveBtn.parentNode.removeChild(this._puzzleSolveBtn);
            this._puzzleSolveBtn = null;
        }

        if (options.onSolve && closeContainer) {
            const showSolve = options.showSolveButton !== false;
            if (showSolve) {
                const solveLabel = options.solveLabel || '解く';
                const solveBtn = document.createElement('button');
                solveBtn.className = 'mt-3 mr-2 inline-block bg-green-600 text-white p-2 rounded-lg hover:bg-green-700';
                solveBtn.textContent = solveLabel;
                // ハンドラを設定
                this._puzzleSolveHandler = async () => {
                    try {
                        // モーダル内の input/select/textarea を収集して値オブジェクトを作る
                        const inputs = {};
                        const nodes = content.querySelectorAll('input, select, textarea');
                        nodes.forEach(n => {
                            const key = n.name || n.id || null;
                            if (key) inputs[key] = n.value;
                        });
                        const result = options.onSolve(inputs);
                        if (result && typeof result.then === 'function') {
                            const ok = await result;
                            if (ok) this.hidePuzzle();
                        } else {
                            if (result) this.hidePuzzle();
                        }
                    } catch (e) {
                        console.error('puzzle onSolve error:', e);
                    }
                };
                solveBtn.addEventListener('click', this._puzzleSolveHandler);
                closeContainer.insertBefore(solveBtn, closeBtn);
                this._puzzleSolveBtn = solveBtn;
            }
        }
    }

    hidePuzzle() {
        const overlay = document.getElementById('puzzle-modal-overlay');
        if (!overlay) return;
        overlay.classList.add('hidden');
        overlay.classList.remove('puzzle-visible');

        // remove event handlers we added in showPuzzle
        if (this._overlayHandler) {
            overlay.removeEventListener('click', this._overlayHandler);
            this._overlayHandler = null;
        }
        const closeBtn = document.getElementById('puzzle-modal-close-btn');
        if (closeBtn && this._puzzleCloseHandler) {
            closeBtn.removeEventListener('click', this._puzzleCloseHandler);
            this._puzzleCloseHandler = null;
        }
        // remove solve button/handler if added
        if (this._puzzleSolveBtn) {
            if (this._puzzleSolveHandler) {
                this._puzzleSolveBtn.removeEventListener('click', this._puzzleSolveHandler);
                this._puzzleSolveHandler = null;
            }
            if (this._puzzleSolveBtn.parentNode) this._puzzleSolveBtn.parentNode.removeChild(this._puzzleSolveBtn);
            this._puzzleSolveBtn = null;
        }
    }
}
