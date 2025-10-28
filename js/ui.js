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
        // keyButton（鍵ボタン）は削除されたので escapeDoor のみ制御
        if (this.elements.escapeDoor) {
            // まず一旦すべての状態をリセット
            this.elements.escapeDoor.classList.remove('cursor-not-allowed', 'bg-green-600', 'hover:bg-green-500', 'bg-red-700', 'opacity-50');
            this.elements.escapeDoor.disabled = false;
            if (isUnlocked) {
                this.elements.escapeDoor.classList.add('bg-green-600', 'hover:bg-green-500');
                this.elements.escapeDoor.textContent = '脱出ドア (開錠済み)';
            } else {
                this.elements.escapeDoor.classList.add('bg-red-700', 'opacity-50');
                this.elements.escapeDoor.textContent = '脱出ドア (ロック中)';
            }
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
    showPuzzle(contentHtml) {
        const overlay = document.getElementById('puzzle-modal-overlay');
        const content = document.getElementById('puzzle-modal-content');
        if (!overlay || !content) return;
        content.innerHTML = contentHtml;
        overlay.classList.remove('hidden');
        overlay.classList.add('puzzle-visible');

        // バインドを確実に行う（再描画や再配置でハンドラが失われないよう）
        // オーバーレイのクリック（外側クリックで閉じる）
        if (this._overlayHandler) {
            overlay.removeEventListener('click', this._overlayHandler);
        }
        this._overlayHandler = (e) => { if (e.target === overlay) this.hidePuzzle(); };
        overlay.addEventListener('click', this._overlayHandler);

        // クローズボタンのバインド（毎回設定して既存のハンドラ不一致を避ける）
        const closeBtn = document.getElementById('puzzle-modal-close-btn');
        if (closeBtn) {
            if (this._puzzleCloseHandler) closeBtn.removeEventListener('click', this._puzzleCloseHandler);
            this._puzzleCloseHandler = () => this.hidePuzzle();
            closeBtn.addEventListener('click', this._puzzleCloseHandler);
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
    }
}
