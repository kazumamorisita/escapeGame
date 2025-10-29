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
    this.rightRoomState = null; // 右部屋の状態: 'sun', 'moon', null
    this.leftRoomState = null;  // 左部屋の状態: 'sun', 'moon', null
    this.rightSunlightReflected = false; // 右で日光が反射済みか
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
                rightRoomState: this.rightRoomState, // 右部屋の状態
                leftRoomState: this.leftRoomState,   // 左部屋の状態
                rightSunlightReflected: this.rightSunlightReflected, // 右の日光反射状態
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

            // 部屋とパズルの状態を復元
            this.rightRoomState = data.rightRoomState || null;
            this.leftRoomState = data.leftRoomState || null;
            this.rightSunlightReflected = !!data.rightSunlightReflected;

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
                    // numeric-safe が解決済みで、未収集の報酬（kottsun, paper）を再配置
                    if (this.objectUsageCounts.get('numeric-safe') >= 1) {
                        const hasKottsun = Array.isArray(data.collectedItems) && data.collectedItems.some(item => item && item.id === 'kottsun');
                        const hasPaper   = Array.isArray(data.collectedItems) && data.collectedItems.some(item => item && item.id === 'paper');

                        if (!hasKottsun && !this.objectsManager.objects.has('kottsun')) {
                            this.objectsManager.addObject({
                                id: 'kottsun', view: 'front', x: 80, y: 30, width: 48, height: 48,
                                imgSrc: './images/nazo.png',
                                description: 'カワウソのこっつん．お腹がすいているようだ．',
                                isCollectible: true, maxUsageCount: 1
                            });
                        }
                        if (!hasPaper && !this.objectsManager.objects.has('paper')) {
                            this.objectsManager.addObject({
                                id: 'paper', view: 'front', x: 70, y: 30, width: 48, height: 48,
                                imgSrc: './images/nazo.png',
                                description: '謎の申込用紙．名前を書くと太陽シールがもらえるらしい．',
                                isCollectible: true, maxUsageCount: 1
                            });
                        }
                    }

                    // 右のサンライト反射ギミックの復元
                    if (this.rightSunlightReflected) {
                        const hasEscapeKey = Array.isArray(data.collectedItems) && data.collectedItems.some(item => item && item.id === 'escape-key');
                        if (!hasEscapeKey && !this.objectsManager.objects.has('escape-key')) {
                            this.objectsManager.addObject({
                                id: 'escape-key', view: 'right', x: 30, y: 30, width: 48, height: 48,
                                imgSrc: './images/nazo.png',
                                description: '氷の壁から取り出せるようになった鍵。',
                                isCollectible: true, maxUsageCount: 1
                            });
                        }
                        // 反射ビームを常時表示（right 入室時に見た目はスタイルで適用）
                        if (!this.objectsManager.objects.has('sun-reflect-beam')) {
                            this.objectsManager.addObject({
                                id: 'sun-reflect-beam', view: 'right', x: 40, y: 45, width: 180, height: 10,
                                imgSrc: './images/nazo.png', description: '反射した光が氷壁に当たっている。',
                                isCollectible: false, maxUsageCount: Infinity
                            });
                        }
                        // 元のサンライトは right が太陽状態なら残す
                        if (this.rightRoomState === 'sun' && !this.objectsManager.objects.has('sunlight-to-daiza')) {
                            this.objectsManager.addObject({
                                id: 'sunlight-to-daiza', view: 'right', x: 85, y: 20, width: 360, height: 10,
                                imgSrc: './images/nazo.png', description: '太陽光が台座に差し込んでいる。',
                                isCollectible: false, maxUsageCount: Infinity
                            });
                        }
                    }

                    // 使用済みアイテムを画面から削除
                    this.usedItems.forEach(itemId => {
                        this.objectsManager.removeObject(itemId);
                    });
                    
                    // 左部屋のおじさんを状態に応じて更新
                    this.updateLeftRoomOzisan();

                    // 右ビュー表示中であれば、ビームの見た目を即時再適用（Snapshot再生成で水平＆nazo.pngに戻るのを防ぐ）
                    try {
                        if (this.uiManager && this.uiManager.currentView === 'right' && typeof window !== 'undefined' && window.styleSunBeam) {
                            const gom = this.objectsManager;
                            if (this.rightSunlightReflected) {
                                if (gom && gom.objects.has('sun-reflect-beam')) {
                                    window.styleSunBeam('sun-reflect-beam', null, 'reflect', false);
                                }
                                if (this.rightRoomState === 'sun' && gom && gom.objects.has('sunlight-to-daiza')) {
                                    window.styleSunBeam('sunlight-to-daiza', null, 'sun', false);
                                }
                            } else {
                                if (this.rightRoomState === 'sun' && gom && gom.objects.has('sunlight-to-daiza')) {
                                    window.styleSunBeam('sunlight-to-daiza', null, 'sun', false);
                                }
                            }
                        }
                    } catch (e) {
                        console.error('beam restyle after snapshot error', e);
                    }
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
        if (!this.isDoorUnlocked && selectedItem && selectedItem.id === 'escape-key') {
            this.isDoorUnlocked = true;
            this.uiManager.updateGameUI(true);
            this.uiManager.updateStatus('鍵を使ってドアのロックを解除しました！');
            // アイテムを消費（インベントリから削除）
            this.inventoryManager.removeItemById('escape-key');
            // オブジェクトも画面から消す
            if (this.objectsManager) {
                this.objectsManager.removeObject('escape-key');
            }
            // 使用済みアイテムとして記録
            this.usedItems.add('escape-key');
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
    async unlockTaiyouOzisan() {
        const selectedItem = this.inventoryManager.getSelectedItem();
        if (selectedItem && selectedItem.id === 'paper-filled') {
            // paper-filled選択時: taiyou-si-ruを取得
            if (this.inventoryManager.hasItem('taiyou-si-ru')) {
                this.uiManager.updateStatus('すでに太陽シールを所持しています。');
                return;
            }
            
            this.uiManager.updateStatus('太陽おじさんに申込書を渡しました！');
            // アイテムを消費（インベントリから削除）
            this.inventoryManager.removeItemById('paper-filled');
            this.usedItems.add('paper-filled');
            this.inventoryManager.clearSelection();
            
            // taiyou-si-ruを追加
            const newItem = {
                id: 'taiyou-si-ru',
                imgSrc: './images/nazo.png',
                description: '太陽おじさんからもらった太陽シール。何かに使えそうだ。'
            };
            
            const ok = this.inventoryManager.addItem(newItem);
            if (ok) {
                this.uiManager.updateStatus('太陽シールを取得しました。');
                
                // taiyou-si-ruの説明ウィンドウを表示
                const newSlotIndex = this.inventoryManager.slots.findIndex(item => item && item.id === 'taiyou-si-ru');
                if (newSlotIndex !== -1) {
                    setTimeout(() => {
                        this.inventoryManager.showItemDescription(newSlotIndex);
                    }, 100);
                }
                
                await this.saveGameState();
            } else {
                this.uiManager.updateStatus('インベントリがいっぱいです。', true);
            }
        } else {
            // 何も選択していない、または別のアイテムを選択している場合: 説明ウィンドウを表示
            const content = `
                <div class="p-4">
                    <h3 class="text-xl font-bold mb-4">太陽おじさん</h3>
                    <img src="./images/nazo.png" alt="太陽おじさん" class="w-48 h-48 mx-auto mb-4 rounded">
                    <p class="text-gray-700">記入済みの申込書をくれれば、太陽シールをあげよう。</p>
                </div>
            `;
            this.uiManager.showPuzzle(content);
        }
    }

    async unlockTukiOzisan() {
        const selectedItem = this.inventoryManager.getSelectedItem();
        
        if (selectedItem && selectedItem.id === 'tuki-osaihu') {
            // tuki-osaihuが選択されている場合: 月の鍵を取得
            if (this.inventoryManager.hasItem('tuki-kagi')) {
                this.uiManager.updateStatus('既に月の鍵を持っています。');
                return;
            }
            
            this.uiManager.updateStatus('月おじさんに月の財布を渡しました！');
            // アイテムを消費（インベントリから削除）
            this.inventoryManager.removeItemById('tuki-osaihu');
            this.usedItems.add('tuki-osaihu');
            this.inventoryManager.clearSelection();
            
            // tuki-kagiを追加
            const newItem = {
                id: 'tuki-kagi',
                imgSrc: './images/nazo.png',
                description: '月おじさんからもらった月の鍵。何かに使えそうだ。'
            };
            
            const ok = this.inventoryManager.addItem(newItem);
            if (ok) {
                this.uiManager.updateStatus('月の鍵を取得しました。');
                
                // tuki-kagiの説明ウィンドウを表示
                const newSlotIndex = this.inventoryManager.slots.findIndex(item => item && item.id === 'tuki-kagi');
                if (newSlotIndex !== -1) {
                    setTimeout(() => {
                        this.inventoryManager.showItemDescription(newSlotIndex);
                    }, 100);
                }
                
                await this.saveGameState();
            } else {
                this.uiManager.updateStatus('インベントリがいっぱいです。', true);
            }
        } else {
            // 何も選択していない、または別のアイテムを選択している場合: 説明ウィンドウを表示
            const content = `
                <div class="p-4">
                    <h3 class="text-xl font-bold mb-4">月おじさん</h3>
                    <img src="./images/nazo.png" alt="月おじさん" class="w-48 h-48 mx-auto mb-4 rounded">
                    <p class="text-gray-700">月の財布をくれれば、月の鍵をあげよう。</p>
                </div>
            `;
            this.uiManager.showPuzzle(content);
        }
    }

    checkDoor() {
        if (this.isDoorUnlocked) {
            this.uiManager.showEscapeMessage('脱出成功！', 'おめでとうございます。進行状況の保存機能も確認できました！');
        } else {
            this.uiManager.updateStatus('ドアはロックされています。どこかに鍵があるはずです...');
        }
    }

    // 左の部屋のおじさんを状態に応じて更新する
    updateLeftRoomOzisan() {
        if (!this.objectsManager) return;
        
        // 既存のおじさんを削除
        this.objectsManager.removeObject('taiyou-ozisan');
        this.objectsManager.removeObject('tuki-ozisan');
        
        // 状態に応じて適切なおじさんを配置
        if (this.leftRoomState === null || this.leftRoomState === 'sun') {
            // 太陽おじさんを配置（まだ使用されていない場合のみ）
            const usageCount = this.objectUsageCounts.get('taiyou-ozisan') || 0;
            if (usageCount === 0) {
                this.objectsManager.addObject({
                    id: 'taiyou-ozisan',
                    view: 'left',
                    x: 60,
                    y: 30,
                    width: 160,
                    height: 160,
                    imgSrc: './images/nazo.png',
                    description: '記入済みの申込書をくれれば，太陽シールをあげよう．',
                    isCollectible: false,
                    maxUsageCount: 1,
                    onClick: () => this.unlockTaiyouOzisan(),
                });
            }
        } else if (this.leftRoomState === 'moon') {
            // 月おじさんを配置
            this.objectsManager.addObject({
                id: 'tuki-ozisan',
                view: 'left',
                x: 60,
                y: 30,
                width: 160,
                height: 160,
                imgSrc: './images/nazo.png',
                description: '月の財布をくれれば、月の鍵をあげよう。',
                isCollectible: false,
                maxUsageCount: 1,
                onClick: () => this.unlockTukiOzisan(),
            });
        }
    }

    startNewGame() {
        this.isDoorUnlocked = false;
        // 使用済みアイテムリストをクリア
        this.usedItems.clear();
        // オブジェクト使用回数をクリア
        this.objectUsageCounts.clear();
        // 部屋の状態をリセット
        this.rightRoomState = null;
        this.leftRoomState = null;
    this.rightSunlightReflected = false;
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
