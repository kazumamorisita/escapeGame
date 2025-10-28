import { setDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

export class GameManager {
    // getDocRef should be a function returning a DocumentReference (or null)
    constructor(uiManager, getDocRef, inventoryManager, objectsManager) {
        this.uiManager = uiManager;
        this.getDocRef = getDocRef;
        this.inventoryManager = inventoryManager || null;  // injected InventoryManager
        this.objectsManager = objectsManager || null; // injected GameObjectManager
        this.isDoorUnlocked = false;
        this.hasSaveData = false;
        this.usedItems = new Set(); // 使用済みアイテムを追跡
        this.objectUsageCounts = new Map(); // オブジェクトIDごとの使用回数を追跡
    }

    async saveGameState() {
        const ref = this.getDocRef && this.getDocRef();
        if (!ref) return;
        try {
            // MapをオブジェクトリテラルまたはArray形式に変換
            const usageCounts = {};
            for (const [key, value] of this.objectUsageCounts) {
                usageCounts[key] = value;
            }
            
            const state = {
                isDoorUnlocked: this.isDoorUnlocked,
                // inventoryManager があればスロット配列を保存
                collectedItems: this.inventoryManager ? this.inventoryManager.toArray() : [],
                usedItems: Array.from(this.usedItems), // 使用済みアイテムリストを保存
                objectUsageCounts: usageCounts, // オブジェクトごとの使用回数を保存
                updatedAt: new Date().toISOString()
            };
            await setDoc(ref, state);
            // console.log('ゲーム状態をFirestoreに保存しました。', state);
        } catch (e) {
            console.error('ゲーム状態の保存中にエラーが発生しました:', e);
            this.uiManager.updateStatus('エラー: 進行状況の保存に失敗しました。', true);
        }
    }

    handleSnapshot(snapshot) {
        this.hasSaveData = snapshot.exists();
        let shouldInitObjects = false;
        let hasAnyItem = false;

        if (this.hasSaveData) {
            const data = snapshot.data();
            this.isDoorUnlocked = data.isDoorUnlocked || false;

            // 使用済みアイテムリストを復元
            if (Array.isArray(data.usedItems)) {
                this.usedItems = new Set(data.usedItems);
            }

            // オブジェクト使用回数を復元
            if (data.objectUsageCounts && typeof data.objectUsageCounts === 'object') {
                this.objectUsageCounts = new Map(Object.entries(data.objectUsageCounts));
            }

            // オブジェクトの状態を管理
            if (this.objectsManager) {
                // まず全てのオブジェクトをクリア
                this.objectsManager.clear();

                // セーブデータが完全に空の場合のみ初期化
                if (!data.collectedItems && !data.isDoorUnlocked && !data.usedItems) {
                    shouldInitObjects = true;
                } else {
                    // インベントリの復元
                    if (data.collectedItems && this.inventoryManager) {
                        try {
                            this.inventoryManager.loadFromArray(data.collectedItems);
                        } catch (e) {
                            console.error('インベントリ復元中にエラー:', e);
                        }
                    }

                    // 初期オブジェクトを配置
                    if (typeof window !== 'undefined' && typeof window.registerInitialObjects === 'function') {
                        window.registerInitialObjects();
                    }

                    // 収集済みアイテムと解決済みパズルの処理
                    if (Array.isArray(data.collectedItems)) {
                        // 収集済みアイテムの処理
                        data.collectedItems.forEach(item => {
                            if (item && item.id) {
                                this.objectsManager.removeObject(item.id);
                                // gold-keyが存在する場合はnumeric-safeも削除
                                if (item.id === 'gold-key') {
                                    this.objectsManager.removeObject('numeric-safe');
                                }
                            }
                        });

                        // mysterious-boxの状態を記録
                        hasAnyItem = data.collectedItems.some(item => item && item.id === 'mysterious-box');
                    }

                    // 解決済みパズルから出現したオブジェクトを復元
                    // numeric-safe が解決済みで、kottsun が未収集なら配置
                    if (this.objectUsageCounts.get('numeric-safe') >= 1) {
                        const hasKottsun = data.collectedItems && data.collectedItems.some(item => item && item.id === 'kottsun');
                        if (!hasKottsun && !this.objectsManager.objects.has('kottsun')) {
                            // kottsun を再配置
                            this.objectsManager.addObject({
                                id: 'kottsun',
                                view: 'front',
                                x: 80,
                                y: 30,
                                width: 48,
                                height: 48,
                                imgSrc: '/images/nazo.png',
                                description: 'カワウソのこっつん．お腹がすいているようだ．',
                                isCollectible: true,
                                maxUsageCount: 1
                            });
                        }
                    }

                    // 使用済みアイテムを画面から削除
                    this.usedItems.forEach(itemId => {
                        this.objectsManager.removeObject(itemId);
                    });
                }
            }
        } else {
            this.isDoorUnlocked = false;
            shouldInitObjects = true;
        }

        // 初期化が必要な場合のみ初期オブジェクトを配置（それ以外は絶対に再配置しない）
        if (shouldInitObjects && this.objectsManager && typeof window !== 'undefined' && typeof window.registerInitialObjects === 'function') {
            this.objectsManager.clear();
            window.registerInitialObjects();
        }

        this.uiManager.updateTitleScreen(this.hasSaveData);
        this.uiManager.updateGameUI(this.isDoorUnlocked);
    }

    // 脱出ドアクリック時の処理: mysterious-box選択時のみロック解除
    async unlockDoor() {
        const selectedItem = this.inventoryManager.getSelectedItem();
        if (!this.isDoorUnlocked && selectedItem && selectedItem.id === 'mysterious-box') {
            this.isDoorUnlocked = true;
            this.uiManager.updateGameUI(true);
            this.uiManager.updateStatus('鍵を使ってドアのロックを解除しました！');
            // アイテムを消費（インベントリから削除）
            this.inventoryManager.removeItemById('mysterious-box');
            // オブジェクトも画面から消す
            if (this.objectsManager) {
                this.objectsManager.removeObject('mysterious-box');
            }
            // 使用済みアイテムとして記録
            this.usedItems.add('mysterious-box');
            this.inventoryManager.clearSelection();
            await this.saveGameState();
        } else if (!this.isDoorUnlocked) {
            this.uiManager.updateStatus('ドアはロックされています。鍵を選択して使ってください。');
        } else {
            // 既にロック解除済みならそのまま脱出可能
            this.checkDoor();
        }
    }
    async unlockSuisou(){
        const selectedItem = this.inventoryManager.getSelectedItem();
        if (selectedItem && selectedItem.id === 'kottsun') {
            this.uiManager.updateStatus('こっつんが魚を食べてくれました！');
            // アイテムを消費（インベントリから削除）
            this.inventoryManager.removeItemById('kottsun');
            // オブジェクトも画面から消す
            if (this.objectsManager) {
                this.objectsManager.removeObject('suisou');
            }
            this.usedItems.add('kottsun');
            this.usedItems.add('suisou');
            this.inventoryManager.clearSelection();
            await this.saveGameState();
        } else if (!this.isDoorUnlocked) {
            this.uiManager.updateStatus('魚が邪魔をしている');
        } 
	}

    checkDoor() {
        if (this.isDoorUnlocked) {
            this.uiManager.showEscapeMessage('脱出成功！', 'おめでとうございます。進行状況の保存機能も確認できました！');
        } else {
            this.uiManager.updateStatus('ドアはロックされています。どこかに鍵があるはずです...');
        }
    }

    startNewGame() {
        this.isDoorUnlocked = false;
        // 使用済みアイテムリストをクリア
        this.usedItems.clear();
        // オブジェクト使用回数をクリア
        this.objectUsageCounts.clear();
        // インベントリを初期化
        if (this.inventoryManager) {
            try {
                this.inventoryManager.loadFromArray(new Array(this.inventoryManager.slots.length).fill(null));
            } catch (e) {
                console.error('インベントリ初期化中にエラー:', e);
            }
        }
        // シーン上のオブジェクトを初期状態に戻す
        if (this.objectsManager) {
            try {
                this.objectsManager.clear();
            } catch (e) {
                console.error('オブジェクト初期化中にエラー:', e);
            }
        }
        // main.js で定義した初期オブジェクト登録関数を呼ぶ
        if (typeof window !== 'undefined' && typeof window.registerInitialObjects === 'function') {
            window.registerInitialObjects();
        }

        // 空の状態を保存しておく
        this.saveGameState();
        this.uiManager.updateGameUI(false);
        this.uiManager.startGame('新しいゲームを開始します。');
    }

    continueGame() {
        if (!this.hasSaveData) {
            this.uiManager.updateStatus('続きからプレイできるデータがありません。', true);
            return;
        }
        this.uiManager.updateGameUI(this.isDoorUnlocked);
        this.uiManager.startGame('続きからプレイを再開します。');
    }
}
