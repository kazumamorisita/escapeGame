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
    }

    async saveGameState() {
        const ref = this.getDocRef && this.getDocRef();
        if (!ref) return;
        try {
            const state = {
                isDoorUnlocked: this.isDoorUnlocked,
                // inventoryManager があればスロット配列を保存
                collectedItems: this.inventoryManager ? this.inventoryManager.toArray() : [],
                updatedAt: new Date().toISOString()
            };
            await setDoc(ref, state);
            console.log('ゲーム状態をFirestoreに保存しました。', state);
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
            const wasUnlocked = data.isDoorUnlocked;
            this.isDoorUnlocked = wasUnlocked;
            // collectedItems が全て null かつ isDoorUnlocked=false のときのみ初期化扱い
            if (!data.collectedItems || (data.collectedItems.every(v => v === null) && !data.isDoorUnlocked)) {
                shouldInitObjects = true;
            }
            // collectedItems があればインベントリを復元し、画面のオブジェクトを削除
            if (data.collectedItems && this.inventoryManager) {
                try {
                    this.inventoryManager.loadFromArray(data.collectedItems);
                } catch (e) {
                    console.error('インベントリ復元中にエラー:', e);
                }
                // --- ここから消費済みアイテムも画面から消す ---
                if (this.objectsManager) {
                    const idsToRemove = [];
                    if (Array.isArray(data.collectedItems)) {
                        for (const it of data.collectedItems) {
                            if (it && it.id) idsToRemove.push(it.id);
                        }
                    }
                    // mysterious-boxがcollectedItemsにもインベントリにもなければremoveObject
                    const allKnownIds = ['mysterious-box'];
                    for (const id of allKnownIds) {
                        const inInventory = idsToRemove.includes(id);
                        if (!inInventory) {
                            try { this.objectsManager.removeObject(id); } catch(e) {}
                        }
                    }
                    for (const id of idsToRemove) {
                        try { this.objectsManager.removeObject(id); } catch(e) {}
                    }
                    // mysterious-boxがcollectedItemsにもなければ初期化時以外は絶対に再配置しない
                    hasAnyItem = idsToRemove.includes('mysterious-box');
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
            this.inventoryManager.clearSelection();
            await this.saveGameState();
        } else if (!this.isDoorUnlocked) {
            this.uiManager.updateStatus('ドアはロックされています。鍵を選択して使ってください。');
        } else {
            // 既にロック解除済みならそのまま脱出可能
            this.checkDoor();
        }
    }

    checkDoor() {
        if (this.isDoorUnlocked) {
            this.uiManager.showEscapeMessage('脱出成功～おはよう！', 'おめでとうございます。進行状況の保存機能も確認できました！');
        } else {
            this.uiManager.updateStatus('ドアはロックされています。どこかに鍵があるはずです...');
        }
    }

    startNewGame() {
        this.isDoorUnlocked = false;
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
