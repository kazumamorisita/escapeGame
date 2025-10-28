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
            maxUsageCount = Infinity, // デフォルトは無限回使用可能
            onClick = null 
        } = options;

        if (!this.views[view]) throw new Error(`view "${view}" not found`);
        if (this.objects.has(id)) {
            return;
        }

        // 使用回数チェック: maxUsageCountに達していたら配置しない
        if (this.gameManager && this.gameManager.objectUsageCounts) {
            const currentCount = this.gameManager.objectUsageCounts.get(id) || 0;
            if (currentCount >= maxUsageCount) {
                // console.log(`オブジェクト ${id} は既に ${currentCount} 回使用されているため配置しません（最大: ${maxUsageCount}）`);
                return;
            }
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
                    
                    // 使用回数をインクリメント
                    if (this.gameManager && this.gameManager.objectUsageCounts) {
                        const currentCount = this.gameManager.objectUsageCounts.get(id) || 0;
                        this.gameManager.objectUsageCounts.set(id, currentCount + 1);
                    }
                    
                    // 取得直後に説明を表示（UI競合を避けるため遅延実行）
                    if (typeof this.inventoryManager.showItemDescription === 'function') {
                        const slotIndex = this.inventoryManager.slots.findIndex(item => item && item.id === id);
                        if (slotIndex !== -1) {
                            setTimeout(() => {
                                this.inventoryManager.showItemDescription(slotIndex);
                            }, 100);
                        }
                    }
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
            // 謎解き用オブジェクト
            if (options.isPuzzle) {
                const puzzleContent = options.puzzleContent || `\n                    <div class="p-4">\n                        <h3 class=\"text-xl font-bold mb-2\">謎解き：${id}</h3>\n                        <p>ここに謎解きUIを配置してください。</p>\n                    </div>\n                `;
                const puzzleOptions = options.puzzleOptions || {};
                // onSolve は puzzleOptions.solveFunc(values) を呼ぶ。成功したらオブジェクトを削除し spawnObjects を配置
                this.uiManager.showPuzzle(puzzleContent, {
                    onSolve: async (values) => {
                        try {
                            let solved = false;
                            if (typeof puzzleOptions.solveFunc === 'function') {
                                const res = puzzleOptions.solveFunc(values);
                                solved = (res && typeof res.then === 'function') ? await res : !!res;
                            }
                            if (solved) {
                                // 解けたら現在のオブジェクトを消す
                                this.removeObject(id);
                                
                                // 使用回数をインクリメント
                                if (this.gameManager && this.gameManager.objectUsageCounts) {
                                    const currentCount = this.gameManager.objectUsageCounts.get(id) || 0;
                                    this.gameManager.objectUsageCounts.set(id, currentCount + 1);
                                }
                                
                                // 事前に設定された spawnObjects を追加
                                if (Array.isArray(puzzleOptions.spawnObjects)) {
                                    for (const objDef of puzzleOptions.spawnObjects) {
                                        // 少し遅延して追加するとDOM競合を避けられる
                                        setTimeout(() => {
                                            try { this.addObject(objDef); } catch (e) { console.error('spawn addObject error', e); }
                                        }, 50);
                                    }
                                }
                                
                                // パズル解決後は状態を保存
                                try {
                                    if (this.gameManager && typeof this.gameManager.saveGameState === 'function') {
                                        await this.gameManager.saveGameState();
                                    }
                                } catch (e) {
                                    console.error('パズル解決後の保存エラー:', e);
                                }
                                
                                return true;
                            }
                            return false;
                        } catch (e) {
                            console.error('puzzle onSolve handler error', e);
                            return false;
                        }
                    }
                });
                
                // パズル表示直後に追加のセットアップを実行（カスタムイベントリスナーなど）
                if (typeof puzzleOptions.onShow === 'function') {
                    setTimeout(() => {
                        try {
                            puzzleOptions.onShow();
                        } catch (e) {
                            console.error('puzzle onShow error', e);
                        }
                    }, 50);
                }
                
                return;
            }
            if (typeof onClick === 'function') {
                onClick({ id, view });
                return;
            }
            if (this.uiManager && this.uiManager.showPuzzle) {
                const content = `
            <div class="p-4" id="${id}">
                <h3 class="text-xl font-bold mb-4">${id}</h3>
                <img src="${imgSrc}" alt="${id}" class="w-48 h-48 mx-auto mb-4 rounded">
                <p class="text-gray-700">${description || 'アイテムの説明がありません。'}</p>
            </div>
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
