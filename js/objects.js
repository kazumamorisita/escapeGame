export class GameObjectManager {
    constructor(views, uiManager, inventoryManager) {
        this.views = views;
        this.uiManager = uiManager;
        this.inventoryManager = inventoryManager;
        this.objects = new Map();
        // 初期状態（最初に追加されたオブジェクト定義）を保持しておく
        this.initialDefinitions = new Map();
    }

    addObject(options) {
        const { 
            id, view = 'front', x = 50, y = 50, 
            width = 80, height = 80, imgSrc = '',
            description = '',
            isCollectible = false,
            onClick = null 
        } = options;

        if (!this.views[view]) throw new Error(`view "${view}" not found`);
        if (this.objects.has(id)) {
            return;
        }

        const container = document.createElement('div');
        container.className = 'game-object absolute z-30';
        container.style.left = typeof x === 'number' ? `${x}%` : x;
        container.style.top = typeof y === 'number' ? `${y}%` : y;
        container.style.width = typeof width === 'number' ? `${width}px` : width;
        container.style.height = typeof height === 'number' ? `${height}px` : height;
        container.style.transform = 'translate(-50%, -50%)';

        const img = document.createElement('img');
        img.src = imgSrc;
        img.alt = id;
        img.className = 'w-full h-full object-cover rounded-md';

        container.appendChild(img);

        container.addEventListener('click', (e) => {
            e.stopPropagation();
            if (isCollectible) {
                if (this.inventoryManager.addItem({ id, imgSrc, description })) {
                    this.removeObject(id);
                    this.uiManager.updateStatus(`${id}を取得しました。`);
                    // 収集時にゲーム状態を保存するため、可能なら GameManager の save を呼ぶ
                    try {
                        if (this.gameManager && typeof this.gameManager.saveGameState === 'function') {
                            // 非同期保存をトリガー（await は不要）
                            this.gameManager.saveGameState().catch(e => console.error('saveGameState error:', e));
                        }
                    } catch (e) {
                        console.error('収集時の保存呼び出し中にエラー:', e);
                    }
                }
                return;
            }
            if (typeof onClick === 'function') {
                onClick({ id, view });
                return;
            }
            if (this.uiManager && this.uiManager.showPuzzle) {
                const content = `
                    <h3 class="text-xl font-bold mb-2">謎解き：${id}</h3>
                    <p>ここに任意の謎解きコンテンツを配置します。</p>
                `;
                this.uiManager.showPuzzle(content);
            }
        });

        this.views[view].appendChild(container);
        this.objects.set(id, { container, options });
        // 初期定義がまだ登録されていなければ保存しておく
        if (!this.initialDefinitions.has(id)) {
            try {
                // 深いコピーして後から安全に再作成できるようにする
                const copy = JSON.parse(JSON.stringify(options));
                this.initialDefinitions.set(id, copy);
            } catch (e) {
                // JSON シリアライズできないケースはオブジェクトをそのまま保存
                this.initialDefinitions.set(id, options);
            }
        }
    }

    // 追加: オブジェクトを削除するメソッド
    removeObject(id) {
        const entry = this.objects.get(id);
        if (!entry) {
            return;
        }
        entry.container.remove();  // DOM から要素を削除
        this.objects.delete(id);   // Map から削除
    }

    // 追加: すべてのオブジェクトを削除
    clear() {
        for (const [id, entry] of this.objects) {
            entry.container.remove();
        }
        this.objects.clear();
        // 初期定義もクリア（初期化時に再登録するため）
        this.initialDefinitions.clear();
    }

    // 初期定義からシーンを復元する（main.jsから明示的にaddObjectを呼ぶ設計に統一）
    resetToInitial() {
        this.clear();
    }
}